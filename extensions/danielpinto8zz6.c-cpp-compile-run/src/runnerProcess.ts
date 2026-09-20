/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';

import type { BeCoderSource, RunnerSettings } from './compiler';
import { buildCompilerArguments, privateRunnerEnvironment } from './compilation';
export { buildCompilerArguments, privateRunnerEnvironment } from './compilation';
import { RunnerPhase } from './runnerLifecycle';
import { Osc633Filter } from './terminalVisuals';
import { RunnerPtyProcess } from './runnerPtyProcess';
import { RunnerInputControl } from './runnerInputControl';

export type RunnerTimings = {
	readonly panelReadyMs: number;
	readonly saveMs: number;
	readonly compilerSpawnMs: number;
	readonly compileMs: number;
	readonly processStartMs?: number;
	readonly compileToRunStartMs?: number;
	readonly programRuntimeMs?: number;
	readonly cleanupMs: number;
	readonly totalMs: number;
};

export type RunnerExecutionResult = {
	readonly status: 'completed' | 'compile-error' | 'executable-creation-error' | 'runtime-error' | 'cancelled' | 'unable-to-start' | 'runner-error';
	readonly exitCode?: number;
	readonly message?: string;
	readonly publishedExecutable: boolean;
	readonly publishedExecutableIdentity?: RunnerExecutableIdentity;
	readonly executableRemoved: boolean;
	readonly cleanupFailed: boolean;
	readonly timings: RunnerTimings;
};

export type RunnerExecutableIdentity = {
	readonly device: string;
	readonly inode: string;
	readonly size: string;
	readonly modified: string;
	readonly changed: string;
	readonly created: string;
	readonly sha256: string;
};

export type RunnerExecutionRequest = {
	readonly source: BeCoderSource;
	readonly compilerPath: string;
	readonly settings: RunnerSettings;
	readonly inputPath?: string;
	readonly inputHelperPath?: string;
	readonly ptyDimensions?: { readonly cols: number; readonly rows: number };
	readonly requestStartedAt: number;
	readonly panelReadyMs: number;
	readonly saveMs: number;
};

export type RunnerExecutionCallbacks = {
	readonly write: (text: string) => void;
	readonly setPhase: (phase: Extract<RunnerPhase, 'compiling' | 'running'>) => void;
};

type ChildResult = {
	readonly exitCode: number;
	readonly spawnAt: number;
	readonly closeAt: number;
};

type RemovalResult = 'absent' | 'removed' | 'failed';

class RunnerProcessCancellationError extends Error { }
class RunnerUnableToStartError extends Error { }

class ExecutablePublicationError extends Error {
	constructor(
		readonly cause: unknown,
		readonly cleanupFailed: boolean
	) {
		super(cause instanceof Error ? cause.message : String(cause));
	}
}

export type RunnerProcessDependencies = {
	readonly spawn: typeof spawn;
	readonly terminate: (child: ChildProcessWithoutNullStreams) => Promise<void>;
	readonly copyFile: typeof fs.promises.copyFile;
	readonly rename: typeof fs.promises.rename;
	readonly rm: typeof fs.promises.rm;
};

const defaultProcessDependencies: RunnerProcessDependencies = {
	spawn,
	terminate: terminateProcessTree,
	copyFile: fs.promises.copyFile,
	rename: fs.promises.rename,
	rm: fs.promises.rm
};

export class RunnerExecutor {
	private activeChild: ChildProcessWithoutNullStreams | undefined;
	private activeProgram: ChildProcessWithoutNullStreams | undefined;
	private activePty: RunnerPtyProcess | undefined;
	private cancellationRequested = false;
	private executing = false;
	private readonly dependencies: RunnerProcessDependencies;

	constructor(
		private readonly sessionRoot: string,
		dependencies: Partial<RunnerProcessDependencies> = {}
	) {
		this.dependencies = { ...defaultProcessDependencies, ...dependencies };
	}

	async execute(request: RunnerExecutionRequest, callbacks: RunnerExecutionCallbacks): Promise<RunnerExecutionResult> {
		if (this.executing) {
			throw new Error('RunnerExecutor accepts only one active request.');
		}
		this.executing = true;
		this.cancellationRequested = false;
		const requestRoot = path.join(this.sessionRoot, 'runner-sessions', crypto.randomUUID());
		const temporaryExecutable = path.join(requestRoot, `program-${process.pid}-${crypto.randomUUID()}.exe`);
		let publishedExecutable = false;
		let publishedExecutableIdentity: RunnerExecutableIdentity | undefined;
		let taskArtifactsCreated = false;
		let publicationCleanupFailed = false;
		let compilerSpawnMs = 0;
		let compileMs = 0;
		let processStartMs: number | undefined;
		let compileToRunStartMs: number | undefined;
		let programRuntimeMs: number | undefined;
		let status: RunnerExecutionResult['status'] = 'runner-error';
		let exitCode: number | undefined;
		let message: string | undefined;
		let cleanupMs = 0;
		const executableRemoved = false;
		let cleanupFailed = false;

		try {
			if (await removePath(request.source.executablePath, false, this.dependencies.rm) === 'failed') {
				throw new RunnerUnableToStartError();
			}
			taskArtifactsCreated = true;
			const environment = privateRunnerEnvironment(requestRoot, request.compilerPath);
			await preparePrivateEnvironment(environment);
			this.throwIfCancellationRequested();
			if (!await isOrdinaryFile(request.compilerPath)) {
				throw new Error(`BeCoder's bundled compiler was not found: ${request.compilerPath}`);
			}
			this.throwIfCancellationRequested();
			const inputData = request.inputPath ? await fs.promises.readFile(request.inputPath) : undefined;
			let inputSnapshot: string | undefined;
			if (request.inputPath && request.ptyDimensions) {
				if (!request.inputHelperPath || !await isOrdinaryFile(request.inputHelperPath)) {
					throw new Error('BeCoder Runner input helper is unavailable.');
				}
				inputSnapshot = path.join(requestRoot, 'input.snapshot');
				await fs.promises.writeFile(inputSnapshot, inputData!, { flag: 'wx' });
			}
			this.throwIfCancellationRequested();
			const compilerArguments = buildCompilerArguments(request.source, request.settings, temporaryExecutable);
			callbacks.setPhase('compiling');
			const compileRequestedAt = Date.now();
			const compilerResult = await this.runChild(
				request.compilerPath,
				compilerArguments,
				request.source.directory,
				environment,
				callbacks.write
			);
			compilerSpawnMs = compilerResult.spawnAt - compileRequestedAt;
			compileMs = compilerResult.closeAt - compilerResult.spawnAt;
			this.throwIfCancellationRequested();
			if (compilerResult.exitCode !== 0) {
				status = 'compile-error';
				exitCode = compilerResult.exitCode;
			} else if (!await isOrdinaryFile(temporaryExecutable)) {
				status = 'executable-creation-error';
				exitCode = 1;
				message = 'BeCoder bundled compiler did not produce an executable.';
			} else {
				this.throwIfCancellationRequested();
				publishedExecutableIdentity = await publishExecutable(temporaryExecutable, request.source.executablePath, this.dependencies);
				publishedExecutable = true;
				this.throwIfCancellationRequested();
				const processRequestedAt = Date.now();
				const programResult = request.ptyDimensions
					? await this.runPty(request, environment, callbacks, inputSnapshot)
					: await this.runChild(
						request.source.executablePath,
						[],
						request.source.directory,
						environment,
						callbacks.write,
						child => {
							if (inputData) {
								child.stdin.end(inputData);
							} else {
								this.activeProgram = child;
							}
							callbacks.setPhase('running');
						}
					);
				processStartMs = programResult.spawnAt - processRequestedAt;
				compileToRunStartMs = programResult.spawnAt - compilerResult.spawnAt;
				programRuntimeMs = programResult.closeAt - programResult.spawnAt;
				exitCode = programResult.exitCode;
				status = this.cancellationRequested ? 'cancelled' : programResult.exitCode === 0 ? 'completed' : 'runtime-error';
			}
		} catch (error) {
			if (this.cancellationRequested || error instanceof RunnerProcessCancellationError) {
				status = 'cancelled';
			} else if (error instanceof RunnerUnableToStartError) {
				status = 'unable-to-start';
			} else if (error instanceof ExecutablePublicationError) {
				status = 'executable-creation-error';
				exitCode = 1;
				message = error.message;
				publicationCleanupFailed = error.cleanupFailed;
			} else {
				status = 'runner-error';
				message = error instanceof Error ? error.message : String(error);
			}
		} finally {
			const cleanupStartedAt = Date.now();
			this.activeProgram = undefined;
			this.activeChild = undefined;
			let cleanupComplete = !publicationCleanupFailed;
			if (taskArtifactsCreated) {
				cleanupComplete = await removePath(requestRoot, true, this.dependencies.rm) !== 'failed' && cleanupComplete;
			}
			if (this.cancellationRequested) {
				status = 'cancelled';
			}
			cleanupFailed = !cleanupComplete;
			cleanupMs = Date.now() - cleanupStartedAt;
			this.executing = false;
		}

		return {
			status,
			exitCode,
			message,
			publishedExecutable,
			publishedExecutableIdentity,
			executableRemoved,
			cleanupFailed,
			timings: {
				panelReadyMs: request.panelReadyMs,
				saveMs: request.saveMs,
				compilerSpawnMs,
				compileMs,
				processStartMs,
				compileToRunStartMs,
				programRuntimeMs,
				cleanupMs,
				totalMs: Date.now() - request.requestStartedAt
			}
		};
	}

	async cancel(): Promise<boolean> {
		if (!this.executing) {
			return false;
		}
		this.cancellationRequested = true;
		if (this.activePty) {
			this.activePty.kill();
		}
		const child = this.activeChild;
		if (child) {
			await this.dependencies.terminate(child);
		}
		return true;
	}

	writeProgramInput(text: string): boolean {
		if (this.activePty) {
			return this.activePty.write(text);
		}
		const child = this.activeProgram;
		if (!child || child.stdin.destroyed || !child.stdin.writable) {
			return false;
		}
		child.stdin.write(text);
		return true;
	}

	resizeProgram(cols: number, rows: number): void {
		this.activePty?.resize(cols, rows);
	}

	private async runPty(request: RunnerExecutionRequest, environment: Record<string, string>, callbacks: RunnerExecutionCallbacks, inputSnapshot?: string): Promise<ChildResult> {
		let control: RunnerInputControl | undefined;
		let startedAt = Date.now();
		if (inputSnapshot) {
			control = new RunnerInputControl(() => {
				this.throwIfCancellationRequested();
				startedAt = Date.now();
				callbacks.setPhase('running');
			}, () => this.activePty?.kill());
		}
		try {
			await control?.listen();
			this.throwIfCancellationRequested();
			return await new Promise<ChildResult>((resolve, reject) => {
				const spawnAt = Date.now();
				const filter = new Osc633Filter();
				let callbackError: unknown;
				const session = new RunnerPtyProcess({
					file: inputSnapshot ? request.inputHelperPath! : request.source.executablePath,
					args: inputSnapshot ? [request.source.executablePath, inputSnapshot, control!.pipe] : [],
					cwd: request.source.directory,
					env: environment,
					inheritCursor: true,
					...request.ptyDimensions!
				}, {
					onData: data => {
						if (callbackError) {
							return;
						}
						try {
							callbacks.write(filter.write(data));
						} catch (error) {
							callbackError = error;
							session.kill();
						}
					},
					onExit: async exit => {
						try {
							session.dispose();
							if (callbackError) {
								reject(callbackError);
								return;
							}
							callbacks.write(filter.end());
							const exitCode = control ? await control.result() : exit.exitCode;
							resolve({ exitCode, spawnAt: control ? startedAt : spawnAt, closeAt: Date.now() });
						} catch (error) {
							reject(error);
						} finally {
							if (this.activePty === session) {
								this.activePty = undefined;
							}
						}
					}
				});
				this.activePty = session;
				try {
					if (control) {
						control.armStartupTimeout();
					} else {
						callbacks.setPhase('running');
					}
				} catch (error) {
					callbackError = error;
					session.kill();
				}
			});
		} finally {
			await control?.dispose();
		}
	}

	private runChild(
		file: string,
		arguments_: readonly string[],
		cwd: string,
		environment: Record<string, string>,
		write: (text: string) => void,
		onSpawn?: (child: ChildProcessWithoutNullStreams) => void
	): Promise<ChildResult> {
		return new Promise((resolve, reject) => {
			let spawnAt = Date.now();
			let settled = false;
			let spawnCallbackError: unknown;
			const child = this.dependencies.spawn(file, [...arguments_], {
				cwd,
				env: environment,
				windowsHide: true,
				shell: false
			});
			this.activeChild = child;
			const stdoutDecoder = new StringDecoder('utf8');
			const stderrDecoder = new StringDecoder('utf8');
			const stdoutFilter = new Osc633Filter();
			const stderrFilter = new Osc633Filter();
			child.stdin.on('error', () => undefined);
			child.stdout.on('data', (chunk: Buffer) => write(toTerminalText(stdoutFilter.write(stdoutDecoder.write(chunk)))));
			child.stderr.on('data', (chunk: Buffer) => write(toTerminalText(stderrFilter.write(stderrDecoder.write(chunk)))));
			child.once('spawn', () => {
				spawnAt = Date.now();
				if (this.cancellationRequested) {
					void this.dependencies.terminate(child);
					return;
				}
				try {
					onSpawn?.(child);
				} catch (error) {
					spawnCallbackError = error;
				}
				if (spawnCallbackError) {
					void this.dependencies.terminate(child);
				}
			});
			child.once('error', error => {
				if (settled) {
					return;
				}
				settled = true;
				if (this.activeChild === child) {
					this.activeChild = undefined;
				}
				reject(error);
			});
			child.once('close', exitCode => {
				write(toTerminalText(stdoutFilter.write(stdoutDecoder.end()) + stdoutFilter.end()));
				write(toTerminalText(stderrFilter.write(stderrDecoder.end()) + stderrFilter.end()));
				if (settled) {
					return;
				}
				settled = true;
				if (this.activeChild === child) {
					this.activeChild = undefined;
				}
				if (this.activeProgram === child) {
					this.activeProgram = undefined;
				}
				if (spawnCallbackError) {
					reject(spawnCallbackError);
					return;
				}
				resolve({
					exitCode: exitCode ?? 1,
					spawnAt,
					closeAt: Date.now()
				});
			});
		});
	}

	private throwIfCancellationRequested(): void {
		if (this.cancellationRequested) {
			throw new RunnerProcessCancellationError();
		}
	}
}

async function preparePrivateEnvironment(environment: Record<string, string>): Promise<void> {
	for (const name of ['TEMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) {
		await fs.promises.mkdir(environment[name], { recursive: true });
	}
}

async function isOrdinaryFile(candidate: string): Promise<boolean> {
	try {
		return (await fs.promises.stat(candidate)).isFile();
	} catch {
		return false;
	}
}

async function isPathAbsent(candidate: string): Promise<boolean> {
	try {
		await fs.promises.lstat(candidate);
		return false;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'ENOENT';
	}
}

async function removePath(
	candidate: string,
	recursive: boolean,
	rm: typeof fs.promises.rm
): Promise<RemovalResult> {
	try {
		await fs.promises.lstat(candidate);
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'failed';
	}
	try {
		await rm(candidate, { recursive, force: true });
		return await isPathAbsent(candidate) ? 'removed' : 'failed';
	} catch {
		return 'failed';
	}
}

export function finalizePublishedExecutable(result: RunnerExecutionResult, executablePath: string): RunnerExecutionResult {
	if (!result.publishedExecutable || result.cleanupFailed || result.status === 'cancelled') {
		return result;
	}
	if (!result.publishedExecutableIdentity) {
		return { ...result, cleanupFailed: true };
	}
	try {
		const currentIdentity = readExecutableIdentitySync(executablePath);
		if (!sameExecutableIdentity(currentIdentity, result.publishedExecutableIdentity)) {
			return { ...result, cleanupFailed: true };
		}
		fs.rmSync(executablePath, { force: true });
		if (fs.existsSync(executablePath)) {
			return { ...result, cleanupFailed: true };
		}
		return { ...result, executableRemoved: true };
	} catch {
		return { ...result, cleanupFailed: true };
	}
}

export async function publishExecutable(
	source: string,
	destination: string,
	dependencies: Pick<RunnerProcessDependencies, 'copyFile' | 'rename' | 'rm'> = defaultProcessDependencies
): Promise<RunnerExecutableIdentity> {
	const stagingPath = path.join(
		path.dirname(destination),
		`.${path.basename(destination)}.${process.pid}-${crypto.randomUUID()}.tmp`
	);
	let publicationError: unknown;
	let stagingIdentity: RunnerExecutableIdentity | undefined;
	try {
		await dependencies.copyFile(source, stagingPath, fs.constants.COPYFILE_EXCL);
		stagingIdentity = await readExecutableIdentity(stagingPath);
		await dependencies.rename(stagingPath, destination);
	} catch (error) {
		publicationError = error;
	}
	const stagingRemoval = await removePath(stagingPath, false, dependencies.rm);
	if (publicationError !== undefined || stagingRemoval === 'failed') {
		throw new ExecutablePublicationError(
			publicationError ?? new Error('Executable publication staging cleanup failed.'),
			stagingRemoval === 'failed'
		);
	}
	try {
		const destinationIdentity = await readExecutableIdentity(destination);
		if (!stagingIdentity || !samePublishedFileIdentity(stagingIdentity, destinationIdentity)) {
			throw new Error('Published executable identity differs from the request-owned staging file.');
		}
		return destinationIdentity;
	} catch (error) {
		throw new ExecutablePublicationError(error, true);
	}
}

async function readExecutableIdentity(candidate: string): Promise<RunnerExecutableIdentity> {
	const before = await fs.promises.lstat(candidate, { bigint: true });
	if (!before.isFile() || before.isSymbolicLink()) {
		throw new Error('Published executable is not an ordinary file.');
	}
	const sha256 = crypto.createHash('sha256').update(await fs.promises.readFile(candidate)).digest('hex');
	const after = await fs.promises.lstat(candidate, { bigint: true });
	const beforeIdentity = executableIdentityFromStat(before, sha256);
	const afterIdentity = executableIdentityFromStat(after, sha256);
	if (!after.isFile() || after.isSymbolicLink() || !sameExecutableIdentity(beforeIdentity, afterIdentity)) {
		throw new Error('Published executable changed while its identity was captured.');
	}
	return afterIdentity;
}

function readExecutableIdentitySync(candidate: string): RunnerExecutableIdentity {
	const before = fs.lstatSync(candidate, { bigint: true });
	if (!before.isFile() || before.isSymbolicLink()) {
		throw new Error('Published executable is not an ordinary file.');
	}
	const sha256 = crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
	const after = fs.lstatSync(candidate, { bigint: true });
	const beforeIdentity = executableIdentityFromStat(before, sha256);
	const afterIdentity = executableIdentityFromStat(after, sha256);
	if (!after.isFile() || after.isSymbolicLink() || !sameExecutableIdentity(beforeIdentity, afterIdentity)) {
		throw new Error('Published executable changed while its identity was captured.');
	}
	return afterIdentity;
}

function executableIdentityFromStat(stat: fs.BigIntStats, sha256: string): RunnerExecutableIdentity {
	return {
		device: stat.dev.toString(),
		inode: stat.ino.toString(),
		size: stat.size.toString(),
		modified: stat.mtimeNs.toString(),
		changed: stat.ctimeNs.toString(),
		created: stat.birthtimeNs.toString(),
		sha256
	};
}

function sameExecutableIdentity(first: RunnerExecutableIdentity, second: RunnerExecutableIdentity): boolean {
	return first.device === second.device
		&& first.inode === second.inode
		&& first.size === second.size
		&& first.modified === second.modified
		&& first.changed === second.changed
		&& first.created === second.created
		&& first.sha256 === second.sha256;
}

function samePublishedFileIdentity(first: RunnerExecutableIdentity, second: RunnerExecutableIdentity): boolean {
	return first.device === second.device
		&& first.size === second.size
		&& first.sha256 === second.sha256;
}

function toTerminalText(text: string): string {
	return text.replace(/(^|[^\r])\n/g, '$1\r\n');
}

async function terminateProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
	if (!child.pid || child.exitCode !== null) {
		return;
	}
	if (process.platform !== 'win32') {
		child.kill('SIGKILL');
		return;
	}
	const systemRoot = process.env['SystemRoot'] ?? process.env['windir'];
	if (!systemRoot) {
		child.kill();
		return;
	}
	await new Promise<void>(resolve => {
		const killer = spawn(path.join(systemRoot, 'System32', 'taskkill.exe'), [
			'/pid', String(child.pid), '/t', '/f'
		], { windowsHide: true, stdio: 'ignore', shell: false });
		killer.once('error', () => resolve());
		killer.once('close', () => resolve());
	});
	if (child.exitCode === null) {
		child.kill();
	}
}

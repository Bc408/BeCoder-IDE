/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';

import { ParsedGccError, parseGccDiagnostics } from './diagnosticModel';
import { RequestResult } from './latestCoordinator';
import { GccLanguage, bundledCompiler, privateCompilerEnvironment } from './toolchain';

const maximumOutputBytes = 8 * 1024 * 1024;
const compilerTimeoutMs = 15_000;

export interface DiagnosticTarget {
	readonly uri: string;
	readonly version: number;
	readonly filePath: string;
	readonly language: GccLanguage;
	readonly text: string;
}

export interface CompilerMetrics {
	readonly debounceWaitMs: number;
	readonly compilerSpawnMs: number;
	readonly gccMs: number;
	readonly parseMs: number;
}

export interface CompilerRun {
	readonly errors: readonly ParsedGccError[];
	readonly metrics: CompilerMetrics;
}

export function diagnosticArguments(
	target: DiagnosticTarget,
	mirrorPath: string,
	requestDirectory: string,
	debuggerIncludeRoot: string = path.join(requestDirectory, 'diagnostic-include')
): string[] {
	const sourceDirectory = path.dirname(target.filePath);
	const debuggerIsolation = target.language === 'cpp'
		? ['-DDEBUGER_H', '-I', debuggerIncludeRoot, '-include', path.join(debuggerIncludeRoot, 'bits', 'debugger.h')]
		: [];
	return [
		'-fsyntax-only',
		'-O2',
		'-x',
		target.language === 'c' ? 'c' : 'c++',
		target.language === 'c' ? '-std=c17' : '-std=c++20',
		'-DDEBUG',
		...debuggerIsolation,
		'-finput-charset=UTF-8',
		'-fexec-charset=UTF-8',
		'-fdiagnostics-format=sarif-stderr',
		'-fdiagnostics-color=never',
		'-fdiagnostics-column-origin=1',
		'-fdiagnostics-column-unit=byte',
		'-iquote',
		sourceDirectory,
		`-fmacro-prefix-map=${requestDirectory}=${sourceDirectory}`,
		mirrorPath
	];
}

interface ProcessOutput {
	readonly exitCode: number | null;
	readonly stderr: string;
	readonly compilerSpawnMs: number;
	readonly gccMs: number;
	readonly overflowed: boolean;
	readonly timedOut: boolean;
}

export class CompilerRunner implements vscode.Disposable {
	private readonly sessionRoot: string;
	private readonly activeChildren = new Set<ChildProcessWithoutNullStreams>();
	private readonly terminationPromises = new WeakMap<ChildProcessWithoutNullStreams, Promise<void>>();
	private disposed = false;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.sessionRoot = path.join(context.globalStorageUri.fsPath, 'sessions', crypto.randomUUID());
	}

	async run(target: DiagnosticTarget, signal: AbortSignal, debounceWaitMs: number): Promise<RequestResult<CompilerRun>> {
		if (this.disposed || signal.aborted) {
			return { kind: 'failure', reason: 'Request was canceled before compilation.' };
		}
		const compilerPath = bundledCompiler(this.context, target.language);
		if (!fs.existsSync(compilerPath)) {
			return { kind: 'failure', reason: `Bundled compiler is unavailable: ${compilerPath}` };
		}

		const requestDirectory = path.join(this.sessionRoot, crypto.randomUUID());
		const mirrorPath = path.join(requestDirectory, path.basename(target.filePath));
		try {
			await fs.promises.mkdir(requestDirectory, { recursive: true });
			await fs.promises.writeFile(mirrorPath, target.text, 'utf8');
			if (signal.aborted) {
				return { kind: 'failure', reason: 'Request was canceled before compiler start.' };
			}
			const environment = privateCompilerEnvironment(this.sessionRoot, compilerPath);
			for (const directory of [environment['TEMP'], environment['USERPROFILE'], environment['LOCALAPPDATA'], environment['APPDATA']]) {
				await fs.promises.mkdir(directory, { recursive: true });
			}
			const processOutput = await this.runCompilerProcess(
				compilerPath,
				diagnosticArguments(
					target,
					mirrorPath,
					requestDirectory,
					path.join(this.context.extensionPath, 'resources', 'diagnostic-include')
				),
				path.dirname(target.filePath),
				environment,
				signal
			);
			if (signal.aborted) {
				return { kind: 'failure', reason: 'Request was canceled during compilation.' };
			}
			if (processOutput.overflowed) {
				return { kind: 'failure', reason: 'GCC diagnostic output exceeded the 8 MB safety limit.' };
			}
			if (processOutput.timedOut) {
				return { kind: 'failure', reason: `GCC diagnostics exceeded the ${compilerTimeoutMs / 1000} second safety limit.` };
			}
			const parseStarted = Date.now();
			let errors: ParsedGccError[];
			try {
				errors = parseGccDiagnostics(processOutput.stderr, mirrorPath, target.filePath);
			} catch (error) {
				return { kind: 'failure', reason: error instanceof Error ? error.message : String(error) };
			}
			if (processOutput.exitCode !== 0 && errors.length === 0) {
				return { kind: 'failure', reason: `GCC exited with code ${processOutput.exitCode} without a structured source error.` };
			}
			return {
				kind: 'success',
				value: {
					errors,
					metrics: {
						debounceWaitMs,
						compilerSpawnMs: processOutput.compilerSpawnMs,
						gccMs: processOutput.gccMs,
						parseMs: Date.now() - parseStarted
					}
				}
			};
		} catch (error) {
			return { kind: 'failure', reason: error instanceof Error ? error.message : String(error) };
		} finally {
			await fs.promises.rm(requestDirectory, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	dispose(): void {
		this.disposed = true;
		const activeChildren = [...this.activeChildren];
		void (async () => {
			await Promise.all(activeChildren.map(child => this.terminateProcessTree(child)));
			await fs.promises.rm(this.sessionRoot, { recursive: true, force: true }).catch(() => undefined);
		})();
	}

	runCompilerProcess(
		compilerPath: string,
		arguments_: readonly string[],
		cwd: string,
		environment: Record<string, string>,
		signal: AbortSignal,
		outputLimitBytes = maximumOutputBytes,
		timeoutMs = compilerTimeoutMs
	): Promise<ProcessOutput> {
		return new Promise((resolve, reject) => {
			const startedAt = Date.now();
			let spawnedAt = startedAt;
			let stderrBytes = 0;
			let stdoutBytes = 0;
			let overflowed = false;
			let timedOut = false;
			let settled = false;
			const stderr: Buffer[] = [];
			const child = spawn(compilerPath, [...arguments_], {
				cwd,
				env: environment,
				windowsHide: true,
				shell: false
			});
			this.activeChildren.add(child);
			const abort = () => void this.terminateProcessTree(child);
			if (signal.aborted) {
				abort();
			} else {
				signal.addEventListener('abort', abort, { once: true });
			}
			const timeout = setTimeout(() => {
				timedOut = true;
				void this.terminateProcessTree(child);
			}, timeoutMs);
			child.once('spawn', () => {
				spawnedAt = Date.now();
			});
			child.stdout.on('data', (chunk: Buffer) => {
				stdoutBytes += chunk.length;
				if (stdoutBytes + stderrBytes > outputLimitBytes && !overflowed) {
					overflowed = true;
					void this.terminateProcessTree(child);
				}
			});
			child.stderr.on('data', (chunk: Buffer) => {
				stderrBytes += chunk.length;
				if (stdoutBytes + stderrBytes <= outputLimitBytes) {
					stderr.push(chunk);
				} else if (!overflowed) {
					overflowed = true;
					void this.terminateProcessTree(child);
				}
			});
			child.once('error', error => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeout);
				signal.removeEventListener('abort', abort);
				this.activeChildren.delete(child);
				reject(error);
			});
			child.once('close', exitCode => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeout);
				signal.removeEventListener('abort', abort);
				this.activeChildren.delete(child);
				resolve({
					exitCode,
					stderr: Buffer.concat(stderr).toString('utf8'),
					compilerSpawnMs: Math.max(0, spawnedAt - startedAt),
					gccMs: Math.max(0, Date.now() - spawnedAt),
					overflowed,
					timedOut
				});
			});
		});
	}

	private terminateProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
		let termination = this.terminationPromises.get(child);
		if (!termination) {
			termination = terminateProcessTree(child);
			this.terminationPromises.set(child, termination);
		}
		return termination;
	}
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { compilerArguments, createCphToolchain } from './toolchain';
import { ImportedProblem } from './problem';
import { judgeSample, SampleExecution, SampleVerdict } from './judge';

const outputLimit = 16 * 1024 * 1024;

export interface ExecutionPreferences {
	timeOut: number;
	ignoreSTDERROR: boolean;
	pythonCommand: string;
	compilerArgs?: string;
}

export interface CheckerRun extends SampleExecution { readonly command: string }

export interface CphExecutionOptions {
	readonly extensionPath: string;
	readonly dataRoot: string;
	/** Build-time helper; its inherited stdout/stderr stay separate pipes here. */
	readonly inputHelper: string;
	readonly onSampleStarted?: (index: number) => void;
	readonly onCheckerStarted?: () => void;
	readonly onCompileStarted?: () => void;
	readonly onCompileFinished?: () => void;
	readonly onSampleFinished?: (index: number, sample: JudgeRun['samples'][number]) => void;
	readonly preferences?: (source: string) => ExecutionPreferences;
}

export interface JudgeRun {
	readonly compile: SampleExecution;
	readonly samples: readonly { readonly result: SampleExecution; readonly verdict: SampleVerdict; readonly checkerRun?: CheckerRun }[];
}

/** One request owns one private binary; source-adjacent Runner artifacts are never read. */
export class CphExecutor {
	private controller: AbortController | undefined;
	private disposed = false;

	constructor(private readonly options: CphExecutionOptions) { }

	async judge(problem: ImportedProblem & { customCheckerPath?: string }, sourcePath: string, compileOnly = false): Promise<JudgeRun> {
		if (this.controller || this.disposed) { throw new Error('CPH is busy or disposed.'); }
		if (!compileOnly && !problem.tests.length) { throw new Error('There are no sample tests.'); }
		const controller = new AbortController();
		this.controller = controller;
		let session: string | undefined;
		try {
			const preferences = this.options.preferences?.(sourcePath);
			const timeout = preferences?.timeOut ?? problem.timeLimit;
			if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) { throw new Error('Invalid CPH timeout.'); }
			fs.mkdirSync(this.options.dataRoot, { recursive: true });
			if (fs.lstatSync(this.options.dataRoot).isSymbolicLink()) { throw new Error('Linked CPH session root.'); }
			session = fs.mkdtempSync(path.join(fs.realpathSync(this.options.dataRoot), 'request-'));
			fs.mkdirSync(path.join(session, 'tmp'));
			fs.mkdirSync(path.join(session, 'user'));
			const toolchain = createCphToolchain(this.options.extensionPath, session, /\.c$/i.test(sourcePath) ? 'c' : 'cpp');
			const executable = path.join(session, 'program.exe');
			this.options.onCompileStarted?.();
			const compile = await runProcess(toolchain.compiler, compilerArguments(problem, sourcePath, executable, preferences?.compilerArgs), session, toolchain.environment, 120000, controller.signal, true);
			this.options.onCompileFinished?.();
			const samples: { result: SampleExecution; verdict: SampleVerdict; checkerRun?: CheckerRun }[] = [];
			if (compile.exitCode !== 0 || compile.launchError || compile.cancelled || compile.timedOut || compile.outputLimitExceeded) {
				return { compile, samples };
			}
			if (!fs.statSync(executable).isFile()) { throw new Error('Compiler produced no executable.'); }
			if (compileOnly) { return { compile, samples }; }
			for (const [index, sample] of problem.tests.entries()) {
				if (controller.signal.aborted) { break; }
				const input = path.join(session, 'input');
				fs.writeFileSync(input, sample.input, 'utf8');
				const result = await runWithInput(this.options.inputHelper, executable, input, session, toolchain.environment, timeout, controller.signal, () => this.options.onSampleStarted?.(index));
				let verdict = judgeSample(sample.output, result);
				let checkerRun: CheckerRun | undefined;
				if (preferences?.ignoreSTDERROR === false && result.stderr && (verdict === 'passed' || verdict === 'wrong-answer')) { verdict = 'runtime-error'; }
				if (problem.customCheckerPath?.trim() && (verdict === 'passed' || verdict === 'wrong-answer')) {
					const checker = path.resolve(path.dirname(sourcePath), problem.customCheckerPath.trim());
					if (!fs.statSync(checker).isFile()) { throw new Error(`Custom checker script not found: ${checker}`); }
					const output = path.join(session, 'output');
					fs.writeFileSync(output, result.stdout, 'utf8');
					const configured = preferences?.pythonCommand || 'python3';
					const python = process.platform === 'win32' && configured === 'python3' ? 'python' : configured;
					const args = [checker, input, output];
					// Owner-approved exception: CPH Python checkers use the user's Python environment.
					const pending = runProcess(python, args, path.dirname(checker), { ...process.env, DEBUG: 'true', CPH: 'true' }, timeout, controller.signal, true);
					this.options.onCheckerStarted?.();
					const checked = await pending;
					checkerRun = { ...checked, command: [python, ...args].map(value => JSON.stringify(value)).join(' ') };
					verdict = checked.cancelled ? 'cancelled' : checked.timedOut ? 'time-limit' : checked.outputLimitExceeded ? 'output-limit'
						: checked.launchError || checked.signal ? 'runtime-error' : checked.exitCode === 0 ? 'passed' : 'wrong-answer';
				}
				samples.push({ result, verdict, checkerRun });
				this.options.onSampleFinished?.(index, { result, verdict, checkerRun });
			}
			return { compile, samples };
		} finally {
			try {
				// Private random request directory; never published to the user project.
				if (session) { fs.rmSync(session, { recursive: true }); }
			} finally { this.controller = undefined; }
		}
	}

	cancel(): void { this.controller?.abort(); }
	dispose(): void { this.disposed = true; this.cancel(); }
}

async function runProcess(file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, signal: AbortSignal, compiler = false, clockReady?: (reset: (milliseconds: number) => void) => void): Promise<SampleExecution> {
	return new Promise(resolve => {
		let startedAt = Date.now();
		const child = spawn(file, args, { cwd, env, windowsHide: true, shell: false, stdio: 'pipe' });
		const output: Buffer[][] = [[], []];
		const sizes = [0, 0];
		let timedOut = false;
		let cancelled = false;
		let outputLimitExceeded = false;
		let launchError: string | undefined;
		let stopping: Promise<void> | undefined;
		const stop = () => {
			if (stopping) { return; }
			stopping = new Promise<void>(done => {
				if (compiler && child.pid && child.exitCode === null) {
					const killer = spawn(path.join(env.SystemRoot!, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
					killer.once('error', () => { child.kill(); done(); });
					killer.once('close', () => { child.kill(); done(); });
				} else {
					// Helper owns a KILL_ON_JOB_CLOSE job, including program descendants.
					child.kill();
					done();
				}
			});
		};
		const abort = () => { cancelled = true; stop(); };
		let timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
		clockReady?.(milliseconds => {
			startedAt = Date.now();
			clearTimeout(timer);
			timer = setTimeout(() => { timedOut = true; stop(); }, milliseconds);
		});
		for (const [index, stream] of [child.stdout, child.stderr].entries()) {
			stream.on('data', (chunk: Buffer) => {
				const remaining = outputLimit - sizes[index];
				if (chunk.length > remaining) { outputLimitExceeded = true; stop(); }
				if (remaining > 0) {
					const accepted = chunk.subarray(0, remaining);
					output[index].push(accepted);
					sizes[index] += accepted.length;
				}
			});
		}
		child.stdin.on('error', () => undefined);
		child.stdin.end();
		child.once('error', error => { launchError = error.message; });
		child.once('close', async (exitCode, exitSignal) => {
			clearTimeout(timer);
			signal.removeEventListener('abort', abort);
			await stopping;
			resolve({ durationMs: Date.now() - startedAt, stdout: Buffer.concat(output[0]).toString('utf8'), stderr: Buffer.concat(output[1]).toString('utf8'), exitCode,
				signal: exitSignal, timedOut, cancelled, outputLimitExceeded, launchError });
		});
		signal.addEventListener('abort', abort, { once: true });
		if (signal.aborted) { abort(); }
	});
}

async function runWithInput(helper: string, executable: string, input: string, cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, signal: AbortSignal, onStarted: () => void): Promise<SampleExecution> {
	const pipe = `\\\\.\\pipe\\becoder-cph-${process.pid}-${randomUUID()}`;
	let socket: net.Socket | undefined;
	let code: number | undefined;
	let failure: string | undefined;
	let started = false;
	let resetClock: (milliseconds: number) => void = () => undefined;
	let settle: () => void = () => undefined;
	const drained = new Promise<void>(resolve => { settle = resolve; });
	const server = net.createServer(connection => {
		if (socket) { connection.destroy(); return; }
		socket = connection;
		let buffer = '';
		connection.setEncoding('utf8');
		connection.on('close', settle);
		connection.on('error', error => { failure = error.message; });
		connection.on('data', text => {
			buffer += text;
			if (buffer.length > 4096) { failure = 'Oversized helper message.'; connection.destroy(); return; }
			let newline: number;
			while ((newline = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				try {
					const message = JSON.parse(line);
					if (message.type === 'started' && !started && Number.isSafeInteger(message.pid) && message.pid > 0) {
						started = true;
						resetClock(timeoutMs);
						connection.write('G');
						onStarted();
					} else if (message.type === 'exit' && started && code === undefined && Number.isInteger(message.code) && message.code >= 0 && message.code <= 0xFFFFFFFF) {
						code = message.code;
					} else { throw new Error(`Helper failure: ${line}`); }
				} catch (error) { failure = String(error); connection.destroy(); }
			}
		});
	});
	try {
		await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve); });
		const result = await runProcess(helper, [executable, input, pipe], cwd, env, 15000, signal, false, reset => { resetClock = reset; });
		if (socket) {
			let timer: NodeJS.Timeout | undefined;
			try {
				await Promise.race([drained, new Promise<void>(resolve => { timer = setTimeout(resolve, 1000); })]);
			} finally {
				if (timer) { clearTimeout(timer); }
			}
		}
		return { ...result, timedOut: result.timedOut && started, exitCode: code ?? result.exitCode,
			launchError: result.launchError ?? failure ?? (!started && !result.cancelled ? 'Helper failed to start the program.' : code === undefined && !result.cancelled && !result.timedOut && !result.outputLimitExceeded ? 'Helper returned no result.' : undefined) };
	} finally {
		socket?.destroy();
		await new Promise<void>(resolve => server.close(() => resolve()));
	}
}

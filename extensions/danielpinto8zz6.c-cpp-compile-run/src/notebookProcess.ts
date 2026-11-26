/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CompilationSourceSnapshot } from './compilationSnapshot';
import { safeExecutionObserver, type ExecutionObserver as RuntimeEvidence } from './executionResults';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { RunnerInputControl } from './runnerInputControl';
import { terminateProcessTree } from './runnerProcess';
export interface NotebookRunRequest { code: string; language: 'c' | 'cpp'; input: string; inputName: string; cellId: string; codeNumber: number; codeCellNumber?: number; inputCellId?: string; cwd: string; notebookPath?: string; notebookName?: string }
export interface NotebookRunCallbacks { phase(phase: 'compiling' | 'running'): void; output(phase: 'compiling' | 'running', stream: 'stdout' | 'stderr' | 'merged', text: string): void; evidence?: RuntimeEvidence }
export interface NotebookRunResult { status: 'completed' | 'compile-error' | 'runtime-error' | 'timed-out' | 'output-limit' | 'cancelled' | 'unable-to-start'; code: string; input: string; inputName: string; compileStdout: string; compileStderr: string; output: string; helperStderr: string; compileMs?: number; compileShared?: boolean; runMs?: number; runtimeLimitMs: number; outputLimitBytes: number; exitCode?: number; error?: string; truncated: boolean; omittedBytes: number; startedAt: number; endedAt: number; sourceSnapshot?: CompilationSourceSnapshot; cleanupError?: string }
export interface NotebookRunLimits { maxRuntimeMs: number; maxOutputBytes: number }
const defaultLimits: NotebookRunLimits = { maxRuntimeMs: 2000, maxOutputBytes: 262144 };
export interface NotebookPlan { compiler: string; args: readonly string[]; environment: Record<string, string> }
type PrepareNotebook = (source: string, output: string, session: string, language: 'c' | 'cpp', cwd: string) => NotebookPlan;
type CompiledNotebook = { code: number | null; stdout: string; stderr: string; error?: string; duration?: number };
interface NotebookCompilationSession { directory: string; plan?: NotebookPlan; compiled?: CompiledNotebook }
export interface NotebookProgramGroupRequest extends Omit<NotebookRunRequest, 'input' | 'inputName' | 'inputCellId'> { inputs: { text: string; name: string; cellNumber: number; cellId?: string }[] }
export interface NotebookProgramCallbacks { phase(index: number, phase: 'compiling' | 'running'): void; output(index: number, phase: 'compiling' | 'running', stream: 'stdout' | 'stderr' | 'merged', text: string): void; finished(index: number, result: NotebookRunResult): void; evidence?: RuntimeEvidence }
export interface IExecutionProgramResult { results: NotebookRunResult[]; status: 'completed' | 'compile-error' | 'cancelled' | 'failed'; cleanupError?: string }
export async function runNotebookProgram(request: NotebookRunRequest, signal: AbortSignal, callbacks: NotebookRunCallbacks, helper: string, prepare: PrepareNotebook, limits: NotebookRunLimits = defaultLimits, reuse?: NotebookCompilationSession): Promise<NotebookRunResult> {
	const captured = structuredClone(request);
	callbacks = { ...callbacks, evidence: safeExecutionObserver(callbacks.evidence) };
	const result: NotebookRunResult = { status: 'unable-to-start', code: captured.code, input: captured.input, inputName: captured.inputName, compileStdout: '', compileStderr: '', output: '', helperStderr: '', runtimeLimitMs: limits.maxRuntimeMs, outputLimitBytes: limits.maxOutputBytes, truncated: false, omittedBytes: 0, startedAt: Date.now(), endedAt: Date.now() };
	const session = reuse?.directory ?? await fs.mkdtemp(path.join(tmpdir(), 'bcnb-'));
	const identity = await fs.lstat(session);
	try {
		signal.throwIfAborted();
		if (!['c', 'cpp'].includes(captured.language) || !path.isAbsolute(captured.cwd) || !(await fs.stat(captured.cwd)).isDirectory()) { throw new Error('Invalid Notebook execution base or language.'); }
		if (!Number.isSafeInteger(captured.codeNumber) || captured.codeNumber < 1) { throw new Error('Invalid Notebook code block number.'); }
		// The random parent isolates concurrent runs; the basename identifies the captured program.
		const name = path.basename(captured.notebookPath ?? captured.notebookName ?? 'Untitled').replace(/\.bcnb$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 64).replace(/[. ]+$/, '') || 'Untitled';
		const source = path.join(session, `${name}-code${captured.codeNumber}.${captured.language === 'c' ? 'c' : 'cpp'}`);
		const program = path.join(session, 'program.exe'); const input = path.join(session, 'input.snapshot');
		const bytes = Buffer.from(captured.code, 'utf8');
		if (!reuse?.compiled) { await fs.writeFile(source, bytes, { flag: 'wx' }); }
		await fs.writeFile(input, Buffer.from(captured.input, 'utf8'), { flag: reuse ? 'w' : 'wx' });
		const originalPath = captured.notebookPath ?? path.join(captured.cwd, path.basename(source));
		let canonicalPath = originalPath;
		if (captured.notebookPath) { try { canonicalPath = await fs.realpath(captured.notebookPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } } }
		result.sourceSnapshot = { originalPath, canonicalPath, path: source, capturedAt: result.startedAt, byteLength: bytes.length, bytesBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') };
		const plan = reuse?.plan ?? prepare(source, program, session, captured.language, captured.cwd);
		if (reuse) { reuse.plan = plan; }
		// GCC reports this short relative filename. Local includes still use the original -iquote directory.
		const compilerArgs = plan.args.map(argument => argument === source ? '.' + path.sep + path.basename(source) : argument);
		for (const name of ['TEMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) { if (plan.environment[name]) { await fs.mkdir(plan.environment[name], { recursive: true }); } }
		const child = async (file: string, args: readonly string[], phase: 'compiling' | 'running', operationSignal = signal, outputLimit?: number, onOutputLimit?: () => void): Promise<{ code: number | null; stdout: string; stderr: string; error?: string; duration?: number }> => {
			operationSignal.throwIfAborted();
			return new Promise(resolve => {
				const process = spawn(file, [...args], { cwd: phase === 'compiling' ? session : captured.cwd, env: plan.environment, windowsHide: true, shell: false, stdio: 'pipe' });
				const buffers: Buffer[][] = [[], []]; const sizes = [0, 0]; const decoders = [new StringDecoder('utf8'), new StringDecoder('utf8')];
				let failure: string | undefined; let stopping: Promise<void> | undefined; let total = 0; let outputLimitReached = false;
				let started: number | undefined;
				process.once('spawn', () => { started = performance.now(); });
				const abort = () => { stopping ??= phase === 'compiling' ? terminateProcessTree(process) : Promise.resolve().then(() => { process.kill(); }); };
				for (const [index, stream] of [process.stdout, process.stderr].entries()) {
					stream.on('data', (chunk: Buffer) => {
						const name = phase === 'running' && index === 0 ? 'merged' : index === 0 ? 'stdout' : 'stderr';
						const limitedProgramOutput = outputLimit !== undefined && phase === 'running' && index === 0;
						const remaining = limitedProgramOutput ? outputLimit - total : 8 * 1024 * 1024 - sizes[index];
						const accepted = chunk.subarray(0, Math.max(0, remaining));
						if (accepted.length !== chunk.length) {
							result.truncated = true; result.omittedBytes += chunk.length - accepted.length;
							if (limitedProgramOutput && !outputLimitReached) { outputLimitReached = true; onOutputLimit?.(); }
						}
						if (accepted.length) {
							callbacks.evidence?.event({ type: 'stream', phase, stream: name, blockId: captured.cellId, inputId: captured.inputCellId, bytesBase64: accepted.toString('base64') });
							buffers[index].push(accepted); sizes[index] += accepted.length; if (limitedProgramOutput) { total += accepted.length; } callbacks.output(phase, name, decoders[index].write(accepted));
						}
						if (accepted.length !== chunk.length) {
							callbacks.evidence?.event({ type: 'stream', phase, stream: name, blockId: captured.cellId, inputId: captured.inputCellId, bytesBase64: '', sourceOmittedBytes: chunk.length - accepted.length });
						}
					});
				}
				process.stdin.on('error', () => { }); process.stdin.end();
				process.once('error', error => { failure = error.message; });
				process.once('close', async code => {
					operationSignal.removeEventListener('abort', abort); await stopping;
					for (const [index, decoder] of decoders.entries()) { const text = decoder.end(); if (text) { callbacks.output(phase, phase === 'running' && index === 0 ? 'merged' : index === 0 ? 'stdout' : 'stderr', text); } }
					resolve({ code, stdout: Buffer.concat(buffers[0]).toString('utf8'), stderr: Buffer.concat(buffers[1]).toString('utf8'), error: failure, duration: started === undefined ? undefined : performance.now() - started });
				});
				operationSignal.addEventListener('abort', abort, { once: true }); if (operationSignal.aborted) { abort(); }
			});
		};
		const reused = !!reuse?.compiled;
		if (!reused) { callbacks.phase('compiling'); }
		callbacks.evidence?.start(result.sourceSnapshot, { notebook: captured.notebookPath, cellId: captured.cellId, codeNumber: captured.codeNumber, codeCellNumber: captured.codeCellNumber, language: captured.language, inputCellId: captured.inputCellId, outputMode: 'merged', compiler: plan.compiler, args: compilerArgs, compilerCwd: session, runtimeCwd: captured.cwd, input: { name: captured.inputName, text: captured.input }, sourceRepresentation: 'UTF-8 captured cell source; named private C/C++ file; external dependencies are not snapshotted' });
		const compiled = reuse?.compiled ?? await child(plan.compiler, compilerArgs, 'compiling');
		if (reuse) { reuse.compiled = compiled; }
		result.compileStdout = compiled.stdout; result.compileStderr = compiled.stderr;
		result.compileMs = compiled.duration;
		result.compileShared = reused;
		if (!reused) { callbacks.evidence?.event({ type: 'compiled', exitCode: compiled.code, error: compiled.error, compileMs: compiled.duration, cancelled: signal.aborted }); }
		if (signal.aborted) { result.status = 'cancelled'; }
		else if (compiled.error) { result.error = compiled.error; }
		else if (compiled.code !== 0) { result.status = 'compile-error'; result.exitCode = compiled.code ?? undefined; }
		else {
			const internal = new AbortController();
			let runStarted: number | undefined; let timedOut = false; let outputLimitReached = false; let runtimeTimer: NodeJS.Timeout | undefined;
			const control = new RunnerInputControl(() => { runStarted = performance.now(); runtimeTimer = setTimeout(() => { timedOut = true; internal.abort(); }, limits.maxRuntimeMs); callbacks.phase('running'); }, () => { internal.abort(); });
			const failureSignal = () => internal.abort(); signal.addEventListener('abort', failureSignal, { once: true });
			try {
				await control.listen(); control.armStartupTimeout();
				// The helper owns the Windows Job; closing it terminates program descendants.
				const output = await child(helper, [program, input, control.pipe, '--merge-output'], 'running', AbortSignal.any([signal, internal.signal]), limits.maxOutputBytes, () => { outputLimitReached = true; internal.abort(); });
				if (runtimeTimer) { clearTimeout(runtimeTimer); runtimeTimer = undefined; }
				result.output = output.stdout;
				result.helperStderr = output.stderr;
				if (runStarted !== undefined) { result.runMs = performance.now() - runStarted; }
				if (signal.aborted) { result.status = 'cancelled'; }
				else if (timedOut) { result.status = 'timed-out'; }
				else if (outputLimitReached) { result.status = 'output-limit'; }
				else if (output.error) { result.status = 'unable-to-start'; result.error = output.error; }
				else { result.exitCode = await control.result(); result.runMs = control.runMs ?? result.runMs; result.status = result.exitCode === 0 ? 'completed' : 'runtime-error'; }
			} finally { if (runtimeTimer) { clearTimeout(runtimeTimer); } signal.removeEventListener('abort', failureSignal); await control.dispose(); }
		}
	} catch (error) { result.status = signal.aborted ? 'cancelled' : 'unable-to-start'; result.error = error instanceof Error ? error.message : String(error); }
	finally {
		result.endedAt = Date.now();
		try { const current = await fs.lstat(session); if (current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino) { result.cleanupError = 'Notebook private directory identity changed.'; } else if (!reuse) { await fs.rm(session, { recursive: true }); } }
		catch (error) { result.cleanupError = error instanceof Error ? error.message : String(error); }
		await callbacks.evidence?.finish({ status: result.status, exitCode: result.exitCode, compileMs: result.compileMs, runMs: result.runMs, error: result.error, truncated: result.truncated, omittedBytes: result.omittedBytes, cleanupError: result.cleanupError });
	}
	return result;
}

export async function runNotebookProgramGroup(request: NotebookProgramGroupRequest, signal: AbortSignal, callbacks: NotebookProgramCallbacks, helper: string, prepare: PrepareNotebook, limits: NotebookRunLimits = defaultLimits): Promise<IExecutionProgramResult> {
	const captured = structuredClone(request), results: NotebookRunResult[] = [];
	const directory = await fs.mkdtemp(path.join(tmpdir(), 'bcnb-')), identity = await fs.lstat(directory);
	const reuse: NotebookCompilationSession = { directory }, observer = safeExecutionObserver(callbacks.evidence);
	let status: IExecutionProgramResult['status'] = 'completed', cleanupError: string | undefined;
	try {
		for (const [index, input] of captured.inputs.entries()) {
			if (signal.aborted) { status = 'cancelled'; break; }
			const result = await runNotebookProgram({ ...captured, input: input.text, inputName: input.name, inputCellId: input.cellId }, signal, {
				phase: phase => { if (phase === 'running') { observer?.event({ type: 'input-started', index }); } callbacks.phase(index, phase); },
				output: (phase, stream, text) => callbacks.output(index, phase, stream, text),
				evidence: observer ? { start: (snapshot, metadata) => observer.start(snapshot, { ...(metadata as object), inputs: captured.inputs }), event: value => observer.event({ ...(value as object), index }), finish: () => { } } : undefined
			}, helper, prepare, limits, reuse);
			results.push(result);
			if (result.status !== 'compile-error' && reuse.compiled?.code === 0) { observer?.event({ type: 'input-finished', index, result }); }
			callbacks.finished(index, result);
			if (result.status === 'cancelled') { status = 'cancelled'; break; }
			if (result.status === 'compile-error') { status = 'compile-error'; break; }
			if (result.status === 'unable-to-start') { status = 'failed'; if (reuse.compiled?.code !== 0) { break; } }
		}
	} finally {
		try { const current = await fs.lstat(directory); if (current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino) { cleanupError = 'Notebook private directory identity changed.'; } else { await fs.rm(directory, { recursive: true }); } }
		catch (error) { cleanupError = String(error); }
		observer?.finish({ status: status === 'compile-error' ? 'compile-error' : status, compileMs: reuse.compiled?.duration, cleanupError });
	}
	return { results, status, ...(cleanupError ? { cleanupError } : {}) };
}

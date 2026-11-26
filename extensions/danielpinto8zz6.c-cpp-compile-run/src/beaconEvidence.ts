/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import type { CompilationSourceSnapshot } from './compilationSnapshot';
import type { ExecutionObserver } from './executionResults';
import type { IBeaconOutput, IBeaconRecordWrite, IBeaconRunInput } from 'becoder-beacon';
import { ObservedOutput, type OutputTarget } from './runRecordAdapter';
import { normalizeRunRecord } from '../../../src/vs/platform/beacon/common/beaconRunRecord';
export type RuntimeEvidence = ExecutionObserver;

interface Facts {
	type?: string; status?: string; phase?: string; stream?: string; index?: number;
	compileOnly?: boolean; input?: { text?: string; bytesBase64?: string; source?: string; name?: string };
	inputs?: { input?: string; text?: string; output?: string; name?: string; cellNumber?: number }[];
	sampleNumbers?: number[]; operation?: IBeaconRecordWrite<'run'>['operation']; language?: 'c' | 'cpp'; codeCellNumber?: number;
	compiler?: string; args?: string[]; compilerCwd?: string; runtimeCwd?: string; cwd?: string; command?: string;
	text?: string; bytesBase64?: string; sourceOmittedBytes?: number;
	cancelled?: boolean; timedOut?: boolean; outputLimitExceeded?: boolean; launchError?: string; error?: string; message?: string;
	exitCode?: number; signal?: string; compileMs?: number; durationMs?: number; runMs?: number; programRuntimeMs?: number;
	stdout?: string; stderr?: string; output?: string; result?: Facts; verdict?: IBeaconRunInput['check'];
}
const facts = (value: unknown): Facts => value && typeof value === 'object' ? value as Facts : {};
const iso = (value = Date.now()) => new Date(value).toISOString();
const runtimeStatus = (value: Facts): IBeaconRunInput['status'] => value.cancelled || value.status === 'cancelled' ? 'cancelled'
	: value.timedOut || value.status === 'timed-out' ? 'timed-out' : value.outputLimitExceeded || value.status === 'output-limit' ? 'output-limit'
		: value.launchError || ['unable-to-start', 'runner-error', 'executable-creation-error', 'failed'].includes(value.status ?? '') ? 'start-failed' : value.signal || value.exitCode !== undefined && value.exitCode !== null && value.exitCode !== 0 || value.status === 'runtime-error' ? 'runtime-error' : 'completed';

/** Collects only actual execution facts; publishes one semantic record after retirement. */
export class BeaconEvidence implements ExecutionObserver {
	private record: IBeaconRecordWrite<'run'> | undefined;
	private readonly channels = new Map<string, OutputTarget>();
	private done = false;
	constructor(private readonly handle: string | undefined, private readonly producer: 'runner' | 'cph' | 'notebook', private readonly invoke: (operation: string, input: unknown) => PromiseLike<unknown>, private readonly failed: (error: unknown) => void) { }
	start(snapshot: CompilationSourceSnapshot, value: unknown): void {
		if (!this.handle || this.record || this.done) { return; }
		try {
			const meta = structuredClone(facts(value));
			if (meta.compileOnly) { this.done = true; return; }
			const input = meta.input ?? {}, tests = meta.inputs;
			const inputText = typeof input.text === 'string' ? input.text : typeof input.bytesBase64 === 'string' ? Buffer.from(input.bytesBase64, 'base64').toString('utf8') : null;
			const fileInput = this.producer === 'runner' && input.source && input.source !== 'interactive';
			const code = Buffer.from(snapshot.bytesBase64, 'base64').toString('utf8');
			const codeHash = createHash('sha256').update(code.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
			const runs: IBeaconRunInput[] = tests ? tests.map((test, index) => ({ input: { mode: 'text', text: String(test.input ?? test.text ?? '') }, status: 'not-run', skipReason: 'failed', ...(this.producer === 'cph' ? { testCaseNumber: Number(meta.sampleNumbers?.[index] ?? index + 1), expectedOutput: String(test.output ?? '') } : { inputName: test.name ?? '', inputCellNumber: test.cellNumber }) }))
				: [{ input: { mode: fileInput ? 'file' : this.producer === 'runner' ? 'interactive' : 'text', text: inputText, ...(fileInput ? { filePath: input.source } : {}) }, status: 'not-run', skipReason: 'failed', ...(this.producer === 'notebook' ? { inputName: input.name ?? '' } : {}) }];
			this.record = normalizeRunRecord({
				source: this.producer, operation: this.producer === 'runner' ? fileInput ? 'run-with-input' : 'run' : this.producer === 'cph' ? meta.operation ?? (tests?.length === 1 ? 'test-one' : 'test-all') : 'run-inputs',
				startedAt: iso(), endedAt: iso(), status: 'failed',
				program: { filePath: snapshot.originalPath, language: meta.language ?? (/\.c$/i.test(snapshot.originalPath) ? 'c' : 'cpp'), code, codeHash, ...(this.producer === 'notebook' && meta.codeCellNumber !== undefined ? { codeCellNumber: meta.codeCellNumber } : {}) },
				compile: { status: 'start-failed', ...(meta.compiler ? { compiler: meta.compiler } : {}), ...(Array.isArray(meta.args) ? { args: [...meta.args] } : {}), ...(meta.compilerCwd ?? meta.cwd ? { workingDirectory: meta.compilerCwd ?? meta.cwd } : {}), output: { stdout: '', stderr: '' } },
				runs, ...(meta.runtimeCwd ?? meta.cwd ? { workingDirectory: meta.runtimeCwd ?? meta.cwd } : {}), ...(meta.command ? { command: meta.command } : {}),
				...(inputText === null && !tests ? { gaps: ['Reliable input text was not available; terminal echo is not stdin.'] } : {})
			});
		} catch (error) { this.fail(error); }
	}
	event(value: unknown): void {
		if (!this.record || this.done) { return; }
		try {
			const event = facts(value);
			if (event.type === 'stream') {
				const index = Number(event.index ?? 0), compiling = event.phase === 'compiling';
				if (!compiling && this.producer === 'notebook' && event.stream === 'stderr') { return; }
				const output = compiling ? this.record.compile.output! : this.record.runs[index]?.output ?? (this.record.runs[index] ? this.record.runs[index].output = {} : undefined);
				if (!output) { return; }
				const stream: keyof IBeaconOutput = !compiling && this.producer !== 'cph' ? 'merged' : event.stream === 'stderr' ? 'stderr' : 'stdout';
				const key = `${compiling ? 'compile' : index}:${stream}`;
				let channel = this.channels.get(key);
				if (!channel) { channel = { output, stream, observed: new ObservedOutput() }; this.channels.set(key, channel); }
				channel.observed.append(typeof event.bytesBase64 === 'string' ? Buffer.from(event.bytesBase64, 'base64') : Buffer.from(event.text ?? ''), Number(event.sourceOmittedBytes ?? 0));
			} else if (event.type === 'compiled') {
				const result = this.record.compile;
				result.status = event.cancelled ? 'cancelled' : event.timedOut ? 'timed-out' : event.outputLimitExceeded ? 'output-limit' : event.launchError || event.error ? 'start-failed' : event.exitCode === 0 ? 'succeeded' : 'failed';
				if (Number.isInteger(event.exitCode)) { result.exitCode = event.exitCode; }
				if (Number.isFinite(event.compileMs ?? event.durationMs)) { result.durationMs = event.compileMs ?? event.durationMs; }
				if (event.launchError ?? event.error) { result.error = String(event.launchError ?? event.error); }
			} else if (event.type === 'sample-started' || event.type === 'input-started' || event.type === 'process-spawned' && event.phase === 'running') {
				const item = this.record.runs[Number(event.index ?? 0)]; if (item) { delete item.skipReason; item.status = 'cancelled'; }
			} else if (event.type === 'sample-executed' || event.type === 'sample-finished' || event.type === 'input-finished') {
				const index = Number(event.index ?? 0), item = this.record.runs[index]; if (!item) { return; }
				const result = facts(event.result);
				if (event.type === 'input-finished' && item.status === 'not-run' && runtimeStatus(result) === 'cancelled' && !Number.isFinite(result.runMs)) { return; }
				this.applyResult(item, result);
				if (this.producer === 'cph' && typeof event.verdict === 'string') { item.check = event.verdict as IBeaconRunInput['check']; }
				for (const stream of this.producer === 'cph' ? ['stdout', 'stderr'] as const : ['merged'] as const) {
					if (!this.channels.has(`${index}:${stream}`)) { this.event({ type: 'stream', phase: 'running', index, stream, text: result[stream === 'merged' ? 'output' : stream] ?? '' }); }
				}
			}
		} catch (error) { this.fail(error); }
	}
	private applyResult(item: IBeaconRunInput, result: Facts): void {
		delete item.skipReason; item.status = runtimeStatus(result);
		if (Number.isInteger(result.exitCode)) { item.exitCode = result.exitCode; }
		if (Number.isFinite(result.durationMs ?? result.runMs ?? result.programRuntimeMs)) { item.durationMs = result.durationMs ?? result.runMs ?? result.programRuntimeMs; }
		if (result.signal) { item.signal = String(result.signal); }
		if (result.error ?? result.launchError ?? result.message) { item.error = String(result.error ?? result.launchError ?? result.message); }
	}
	async finish(value: unknown): Promise<void> {
		if (this.done || !this.record) { return; } this.done = true;
		try {
			const outcome = structuredClone(facts(value)), record = this.record;
			record.endedAt = iso();
			if (Number.isFinite(outcome.compileMs)) { record.compile.durationMs = outcome.compileMs; }
			record.status = outcome.status === 'cancelled' ? 'cancelled' : record.compile.status !== 'succeeded' ? 'compile-failed' : ['completed', 'runtime-error', 'timed-out', 'output-limit'].includes(outcome.status ?? '') ? 'completed' : 'failed';
			if (this.producer !== 'cph' && record.runs.length === 1 && record.compile.status === 'succeeded') {
				const item = record.runs[0];
				if (this.producer === 'runner' && item.status === 'cancelled' || item.status === 'not-run' && (outcome.status !== 'cancelled' || Number.isFinite(outcome.programRuntimeMs ?? outcome.runMs))) { this.applyResult(item, outcome); }
			}
			for (const item of record.runs) {
				if (item.status === 'not-run') { delete item.output; item.skipReason = record.status === 'compile-failed' ? 'compile-failed' : record.status === 'cancelled' ? 'cancelled' : 'failed'; }
			}
			for (const channel of this.channels.values()) { channel.observed.finish(); channel.output[channel.stream] = channel.observed.retain(); }
			await this.invoke('captureRun', { handle: this.handle, record: normalizeRunRecord(record) });
		} catch (error) { this.fail(error); }
		finally { this.record = undefined; this.channels.clear(); }
	}
	private fail(error: unknown): void { this.done = true; try { this.failed(error); } catch { /* Observation cannot control execution. */ } }
}

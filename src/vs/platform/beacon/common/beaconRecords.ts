/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal type-only transport shared with bundled extensions.
import type { BeaconRecordKind, IBeaconRecordByKind, IBeaconRecordWrite } from 'becoder-beacon';
import { checkRunRecordSize, normalizeRunRecord } from './beaconRunRecord.js';

type ObjectValue = Record<string, unknown>;
const text = (value: unknown): value is string => typeof value === 'string';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value: unknown) => Number.isSafeInteger(value);
const timestamp = (value: unknown) => text(value) && /^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const identifier = (value: unknown) => text(value) && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
const absolute = (value: unknown) => text(value) && !value.includes('\0') && (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/'));
function requireValue(value: unknown): asserts value { if (!value) { throw new Error('beacon-invalid-record'); } }
function object(value: unknown, required: string[], optional: string[] = []): ObjectValue {
	requireValue(value && typeof value === 'object' && !Array.isArray(value));
	const result = value as ObjectValue;
	requireValue(required.every(key => Object.hasOwn(result, key)) && Object.keys(result).every(key => required.includes(key) || optional.includes(key)));
	return result;
}
function problemIdentity(value: unknown): void {
	const ref = object(value, ['oj', 'problemId']);
	requireValue(['luogu', 'codeforces', 'atcoder', 'nowcoder', 'lanqiao'].includes(String(ref.oj)) && text(ref.problemId) && ref.problemId.trim() && ref.problemId.length <= 256);
}
function runText(value: unknown): boolean {
	if (text(value)) { return true; }
	const part = object(value, ['text', 'truncated']);
	return text(part.text) && part.truncated === true;
}
function optionalFacts(value: ObjectValue, run = false): void {
	for (const key of ['compiler', 'workingDirectory', 'signal', 'error', 'command', 'inputName', 'submittedAt', 'language', 'code', 'codeLength', 'id', 'url', 'score', 'time', 'memory', 'compileMessage']) {
		if (value[key] !== undefined) { requireValue(run && key === 'error' ? runText(value[key]) : text(value[key])); }
	}
	if (value.durationMs !== undefined) { requireValue(finite(value.durationMs)); }
	if (value.exitCode !== undefined) { requireValue(integer(value.exitCode)); }
}
function output(value: unknown): void {
	const streams = object(value, [], ['stdout', 'stderr', 'merged']);
	requireValue(!Object.hasOwn(streams, 'merged') || Object.keys(streams).length === 1);
	for (const stream of Object.values(streams)) {
		if (text(stream)) { continue; }
		else if (stream && typeof stream === 'object' && Object.hasOwn(stream, 'truncated')) { requireValue(runText(stream)); }
		else {
			const piece = object(stream, ['head', 'tail', 'omittedBytes'], ['sourceOmittedBytesAtLeast']);
			requireValue(text(piece.head) && text(piece.tail) && integer(piece.omittedBytes) && finite(piece.omittedBytes));
			if (piece.sourceOmittedBytesAtLeast !== undefined) { requireValue(integer(piece.sourceOmittedBytesAtLeast) && finite(piece.sourceOmittedBytesAtLeast)); }
		}
	}
}

export function validateBeaconRecord<K extends BeaconRecordKind>(kind: K, value: unknown): asserts value is IBeaconRecordByKind[K] {
	let record: ObjectValue;
	if (kind === 'problem') {
		record = object(value, ['id', 'problem', 'filePath', 'viewedAt']);
		problemIdentity(record.problem); requireValue(record.filePath === null || absolute(record.filePath)); requireValue(timestamp(record.viewedAt));
	} else if (kind === 'verdict') {
		record = object(value, ['id', 'problem', 'filePath', 'observedAt', 'submission', 'result']);
		problemIdentity(record.problem); requireValue(record.filePath === null || absolute(record.filePath)); requireValue(timestamp(record.observedAt));
		const submission = object(record.submission, [], ['id', 'url', 'submittedAt', 'language', 'code', 'codeHash', 'codeLength', 'sourceVerification']); optionalFacts(submission);
		if (submission.codeHash !== undefined) { requireValue(text(submission.code) && text(submission.codeHash) && /^[a-f0-9]{64}$/.test(submission.codeHash)); }
		if (submission.sourceVerification !== undefined) { requireValue(['matched', 'mismatch', 'unavailable', 'not-checked'].includes(String(submission.sourceVerification))); }
		const result = object(record.result, ['rawStatus'], ['score', 'time', 'memory', 'compileMessage', 'compileSucceeded', 'testCaseSummary', 'groups']);
		requireValue(text(result.rawStatus)); optionalFacts(result);
		if (result.compileSucceeded !== undefined) { requireValue(typeof result.compileSucceeded === 'boolean'); }
		if (result.testCaseSummary !== undefined) {
			const summary = object(result.testCaseSummary, ['passed', 'total']); requireValue(integer(summary.passed) && finite(summary.passed) && integer(summary.total) && finite(summary.total) && summary.passed <= summary.total);
		}
		if (result.groups !== undefined) {
			requireValue(Array.isArray(result.groups));
			for (const raw of result.groups) { const group = object(raw, ['name', 'rows']); requireValue(text(group.name) && Array.isArray(group.rows) && group.rows.every(row => Array.isArray(row) && row.every(text))); }
		}
	} else {
		requireValue(kind === 'run');
		record = object(value, ['id', 'source', 'operation', 'startedAt', 'endedAt', 'status', 'program', 'compile', 'runs'], ['workingDirectory', 'command', 'error', 'gaps']);
		const operations: Record<string, string[]> = { runner: ['run', 'run-with-input'], cph: ['test-one', 'test-all'], notebook: ['run-inputs'] };
		requireValue(operations[String(record.source)]?.includes(String(record.operation)) && timestamp(record.startedAt) && timestamp(record.endedAt) && Date.parse(String(record.endedAt)) >= Date.parse(String(record.startedAt)));
		requireValue(['completed', 'compile-failed', 'cancelled', 'failed'].includes(String(record.status))); optionalFacts(record, true);
		requireValue(record.command === undefined || record.source === 'runner');
		if (record.gaps !== undefined) { requireValue(Array.isArray(record.gaps) && record.gaps.every(text)); }
		const program = object(record.program, ['filePath', 'language', 'code'], ['codeHash', ...(record.source === 'notebook' ? ['codeBlockNumber', 'codeCellNumber'] : [])]);
		requireValue(absolute(program.filePath) && ['c', 'cpp'].includes(String(program.language)) && runText(program.code));
		if (program.codeHash !== undefined) { requireValue(text(program.codeHash) && /^[a-f0-9]{64}$/.test(program.codeHash)); }
		if (record.source === 'notebook') {
			for (const name of ['codeBlockNumber', 'codeCellNumber']) { if (program[name] !== undefined) { requireValue(integer(program[name]) && finite(program[name]) && program[name] > 0); } }
		}
		const compile = object(record.compile, ['status'], ['compiler', 'args', 'workingDirectory', 'durationMs', 'exitCode', 'signal', 'output', 'error']);
		requireValue(['succeeded', 'failed', 'timed-out', 'output-limit', 'cancelled', 'start-failed'].includes(String(compile.status))); optionalFacts(compile, true);
		if (compile.args !== undefined) { requireValue(Array.isArray(compile.args) && compile.args.every(text)); }
		if (compile.output !== undefined) { output(compile.output); }
		requireValue(Array.isArray(record.runs));
		for (const raw of record.runs) {
			const item = object(raw, ['input', 'status'], ['testCaseNumber', 'inputCellNumber', 'inputName', 'expectedOutput', 'durationMs', 'exitCode', 'signal', 'output', 'check', 'skipReason', 'error']);
			const input = object(item.input, ['mode', 'text'], ['filePath']); requireValue(['interactive', 'file', 'text'].includes(String(input.mode)) && (input.text === null || runText(input.text)));
			requireValue(input.mode !== 'file' || absolute(input.filePath)); requireValue(input.filePath === undefined || input.mode === 'file');
			requireValue(input.text !== null || (Array.isArray(record.gaps) && record.gaps.length > 0));
			requireValue(['completed', 'runtime-error', 'timed-out', 'output-limit', 'cancelled', 'start-failed', 'not-run'].includes(String(item.status))); optionalFacts(item, true);
			for (const key of ['testCaseNumber', 'inputCellNumber']) { if (item[key] !== undefined) { requireValue(integer(item[key]) && finite(item[key]) && item[key] > 0); } }
			requireValue(item.testCaseNumber === undefined || record.source === 'cph'); requireValue(item.inputCellNumber === undefined && item.inputName === undefined || record.source === 'notebook');
			requireValue(item.expectedOutput === undefined || record.source === 'cph' && runText(item.expectedOutput));
			if (item.check !== undefined) { requireValue(record.source === 'cph' && ['passed', 'wrong-answer', 'runtime-error', 'time-limit', 'cancelled', 'output-limit'].includes(String(item.check))); }
			if (item.status === 'not-run') { requireValue(['compile-failed', 'cancelled', 'failed'].includes(String(item.skipReason)) && ['output', 'durationMs', 'exitCode', 'signal', 'check'].every(key => item[key] === undefined)); }
			else { requireValue(item.skipReason === undefined); }
			if (item.output !== undefined) { const streams = item.output as ObjectValue; requireValue(record.source === 'cph' ? !Object.hasOwn(streams, 'merged') : !Object.hasOwn(streams, 'stdout') && !Object.hasOwn(streams, 'stderr')); output(item.output); }
		}
	}
	requireValue(identifier(record.id));
}

export function appendBeaconRecord<K extends BeaconRecordKind>(kind: K, current: readonly IBeaconRecordByKind[K][], input: IBeaconRecordWrite<K>, id: string): IBeaconRecordByKind[K][] {
	let next: unknown = { ...structuredClone(input), id }; validateBeaconRecord(kind, next);
	if (kind === 'verdict' && (next as IBeaconRecordByKind['verdict']).submission.sourceVerification === 'mismatch') { throw new Error('beacon-verdict-source-mismatch'); }
	if (kind === 'run') { next = normalizeRunRecord(next as IBeaconRecordByKind['run']); checkRunRecordSize(next as IBeaconRecordByKind['run']); }
	validateBeaconRecord(kind, next);
	const records = current.filter(record => {
		validateBeaconRecord(kind, record); requireValue(record.id !== id);
		if (kind === 'run') { return true; }
		const previous = record as IBeaconRecordByKind['problem' | 'verdict']; const candidate = next as typeof previous;
		if (previous.problem.oj !== candidate.problem.oj || previous.problem.problemId !== candidate.problem.problemId) { return true; }
		if (kind === 'problem') { return previous.filePath !== candidate.filePath; }
		const before = (previous as IBeaconRecordByKind['verdict']).submission.code, after = (candidate as IBeaconRecordByKind['verdict']).submission.code;
		return before === undefined || after === undefined || before !== after;
	});
	return [...records, next].slice(-({ problem: 13, run: 30, verdict: 20 }[kind]));
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import type { BeaconRecordKind, IBeaconRecordByKind, IBeaconRunRecord, IBeaconVerdictRecord } from 'becoder-beacon';

/** Source identity only. Keep submitted-code deduplication independent and exact. */
export function codeHash(code: string): string { return createHash('sha256').update(code.replace(/\r\n/g, '\n'), 'utf8').digest('hex'); }
const present = <T extends object>(value: T, keys: readonly (keyof T)[]): Record<string, unknown> => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const seconds = (value: string) => value.replace(/\.\d+(?=Z|[+-]\d\d:\d\d$)/, '');

export function availableVerdict(value: IBeaconVerdictRecord): boolean { return value.submission.sourceVerification !== 'mismatch'; }

function testRows(oj: IBeaconVerdictRecord['problem']['oj'], rows: readonly (readonly string[])[]): Record<string, unknown>[] {
	if (oj === 'nowcoder') { return []; }
	return rows.map(row => {
		const fields: Record<string, unknown> = {};
		for (const [index, key] of ['testCase', 'status', 'time', 'memory'].entries()) { if (row[index] !== undefined && row[index] !== '') { fields[key] = row[index]; } }
		if (oj === 'luogu') { for (const [index, key] of ['description', 'score', 'signal', 'exitCode'].entries()) { if (row[index + 4] !== undefined && row[index + 4] !== '') { fields[key] = row[index + 4]; } } }
		if (oj === 'codeforces' && /^Exit with code -?\d+$/.test(row[4] ?? '')) { fields.exitCode = row[4]; }
		if (oj === 'atcoder' && row.length > 4) { fields.extraColumns = row.slice(4); }
		return fields;
	});
}

/** Model-facing projection: no native command, compiler path or verification mechanics. */
export function projectRecord(kind: BeaconRecordKind, record: IBeaconRecordByKind[BeaconRecordKind]): Record<string, unknown> {
	if (kind === 'problem') { return { ...record }; }
	if (kind === 'verdict') {
		const value = record as IBeaconVerdictRecord;
		const submission = present(value.submission, ['id', 'url', 'submittedAt', 'language', 'code', 'codeLength']);
		if (value.submission.code !== undefined) { submission.codeHash = value.submission.codeHash ?? codeHash(value.submission.code); }
		const result = present(value.result, ['rawStatus', 'score', 'time', 'memory', 'compileMessage', 'compileSucceeded', 'testCaseSummary']);
		if (value.result.groups !== undefined) { result.groups = value.result.groups.map(group => ({ name: group.name, rows: testRows(value.problem.oj, group.rows) })); }
		return { id: value.id, problem: value.problem, filePath: value.filePath, observedAt: value.observedAt, submission, result };
	}
	const value = record as IBeaconRunRecord;
	const program = present(value.program, ['filePath', 'language', 'code', 'codeHash', 'codeCellNumber']);
	if (!value.program.codeHash && typeof value.program.code === 'string') { program.codeHash = codeHash(value.program.code); }
	const compile = present(value.compile, ['status', 'exitCode', 'signal', 'output', 'error']);
	for (const argument of value.compile.args ?? []) {
		if (/^-std=(?:c(?:11|17|23)|c\+\+(?:11|14|17|20|23))$/.test(argument)) { compile.standard = argument.slice(5); }
		if (/^-O(?:0|1|2|3|g|s|z|fast)$/.test(argument)) { compile.optimization = argument.slice(1); }
	}
	const gaps = [...value.gaps ?? []];
	if (value.source === 'notebook' && value.program.codeCellNumber === undefined) { gaps.push('The whole-notebook code-cell position is unavailable for this record.'); }
	return {
		...present(value, ['id', 'source', 'operation', 'status', 'workingDirectory', 'error']), startedAt: seconds(value.startedAt), program, compile,
		runs: value.runs.map(run => ({ ...present(run, ['input', 'testCaseNumber', 'inputCellNumber', 'inputName', 'expectedOutput', 'status', 'exitCode', 'signal', 'output', 'check', 'skipReason', 'error']), ...(run.durationMs === undefined ? {} : { durationMs: Math.round(run.durationMs) }) })),
		...(gaps.length ? { gaps } : {})
	};
}

function runSummary(value: IBeaconRunRecord): string {
	const notExecuted = value.runs.filter(run => run.status === 'not-run' || run.status === 'start-failed').length;
	const checks = value.runs.flatMap(run => run.check === undefined ? [] : [run.check]);
	let checking = value.source === 'cph' ? 'no check results available' : 'no automatic answer checking';
	if (checks.length) {
		const outcomes = (['passed', 'wrong-answer', 'runtime-error', 'time-limit', 'cancelled', 'output-limit'] as const).flatMap(outcome => {
			const count = checks.filter(check => check === outcome).length;
			return count ? [`${count} ${outcome}`] : [];
		});
		checking = `Checks: ${outcomes.join(', ')}`;
		const missing = value.runs.length - checks.length;
		if (missing) { checking += `; ${missing} input(s) without check results`; }
	}
	return `Compile: ${value.compile.status}; ${value.runs.length - notExecuted} input(s) executed; ${notExecuted} input(s) not executed; ${checking}.`;
}

export function recordDirectory(kind: BeaconRecordKind, record: IBeaconRecordByKind[BeaconRecordKind]): Record<string, unknown> {
	if (kind === 'problem') { return projectRecord(kind, record); }
	if (kind === 'verdict') {
		const value = record as IBeaconVerdictRecord;
		return { id: value.id, problem: value.problem, filePath: value.filePath, observedAt: value.observedAt, result: present(value.result, ['rawStatus', 'score']) };
	}
	const value = record as IBeaconRunRecord;
	return { id: value.id, source: value.source, operation: value.operation, startedAt: seconds(value.startedAt), status: value.status, program: present(value.program, ['filePath', 'codeCellNumber']), summary: runSummary(value) };
}

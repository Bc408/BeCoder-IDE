/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBeaconRecordWrite } from 'becoder-beacon';
import type { ProblemDocument, RecordSnapshot } from './domain';
import { fileURLToPath } from 'url';

function filePath(uri: string | undefined): string | null {
	if (!uri?.startsWith('file:')) { return null; }
	return fileURLToPath(uri);
}
export function toBeaconProblemRecord(document: ProblemDocument, sourceUri: string, viewedAt: number): IBeaconRecordWrite<'problem'> {
	return { problem: { oj: document.ref.site, problemId: document.ref.nativeId }, filePath: filePath(sourceUri), viewedAt: new Date(viewedAt).toISOString() };
}
export function toBeaconVerdictRecord(record: RecordSnapshot, sourceUri?: string, observedAt = Date.now()): IBeaconRecordWrite<'verdict'> | undefined {
	if (record.phase !== 'finished') { return undefined; }
	const submission: IBeaconRecordWrite<'verdict'>['submission'] = { id: record.ref.id, url: record.ref.url, sourceVerification: record.sourceVerification };
	for (const key of ['submittedAt', 'language', 'codeLength'] as const) { if (record[key] !== undefined) { submission[key] = record[key]; } }
	if (record.source !== undefined) { submission.code = record.source; }
	const result: IBeaconRecordWrite<'verdict'>['result'] = { rawStatus: record.rawStatus };
	for (const key of ['score', 'time', 'memory', 'compileMessage'] as const) { if (record[key] !== undefined) { result[key] = record[key]; } }
	if (record.compileSucceeded !== undefined) { result.compileSucceeded = record.compileSucceeded; }
	if (record.testCaseSummary !== undefined) { result.testCaseSummary = structuredClone(record.testCaseSummary); }
	if (record.groups !== undefined) { result.groups = structuredClone(record.groups); }
	return { problem: { oj: record.ref.problem.site, problemId: record.ref.problem.nativeId }, filePath: filePath(sourceUri), observedAt: new Date(observedAt).toISOString(), submission, result };
}

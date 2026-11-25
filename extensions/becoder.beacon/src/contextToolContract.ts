/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { jsonSchema, type JSONSchema7 } from 'ai';
import type { FileInput, FileOutput } from './fileTools';
import type { WebInput, WebOutput } from './webTools';
import type { IBeaconProblemIdentity, IBeaconCurrentCodeFile, IBeaconRecordByKind, BeaconRecordKind } from 'becoder-beacon';
import type { ProblemDocument } from 'becoder-oj-connect';
import { beCoderInfoTopics, type BeCoderInfoTopic, type BeCoderInfo } from './productInfo';

export const contextToolNames = ['readCurrentCode', 'readProblemRecord', 'readRunRecord', 'readVerdictRecord', 'fetchProblem', 'readPage', 'readMaterial', 'readBeCoderInfo'] as const;
export type BeaconContextToolName = typeof contextToolNames[number];
export type BeaconToolName = BeaconContextToolName | 'inspectFile' | 'browseWeb';
export interface BeaconToolInputs {
	readBeCoderInfo: { topic?: BeCoderInfoTopic };
	readCurrentCode: Record<string, never>;
	readProblemRecord: { id?: string };
	readRunRecord: { id?: string };
	readVerdictRecord: { id?: string };
	fetchProblem: IBeaconProblemIdentity;
	readPage: { id: string; version: string; offset?: number; limit?: number; pageNumber?: number };
	readMaterial: { id: string; offset?: number; limit?: number };
	inspectFile: FileInput;
	browseWeb: WebInput;
}
export interface BeaconToolError { error: { code: 'invalid_arguments' | 'unavailable' | 'not_found' | 'read_failed' | 'network_error' | 'login_required' | 'parse_error'; message: string } }
type RecordOutput<K extends BeaconRecordKind> = { records: readonly Record<string, unknown>[] } | { record: IBeaconRecordByKind[K] } | BeaconToolError;
export interface BeaconToolOutputs {
	readBeCoderInfo: BeCoderInfo | BeaconToolError;
	readCurrentCode: { files: IBeaconCurrentCodeFile[] } | BeaconToolError;
	readProblemRecord: RecordOutput<'problem'>;
	readRunRecord: RecordOutput<'run'>;
	readVerdictRecord: RecordOutput<'verdict'>;
	fetchProblem: { problem: IBeaconProblemIdentity; document: Pick<ProblemDocument, 'title' | 'bodies' | 'samples' | 'limits' | 'interactive' | 'difficulty' | 'tags'>; retrievedAt: string } | BeaconToolError;
	readPage: { ok: true; contents: string; [key: string]: unknown } | BeaconToolError;
	readMaterial: { ok: true; contents: string; [key: string]: unknown } | BeaconToolError;
	inspectFile: FileOutput;
	browseWeb: WebOutput;
}
export const contextToolDescriptions: Record<BeaconContextToolName, string> = {
	readBeCoderInfo: 'Read the running BeCoder version and topic-specific product features, terminology, usage and supported scope.',
	readCurrentCode: 'Read the complete code in all currently visible C/C++ editor panes, including unsaved edits, filenames and paths.',
	readProblemRecord: 'Read recent problems the user obtained or imported in BeCoder: OJ, problem ID, associated code file and observation time. These are identity and activity records; fetchProblem provides the statement text.',
	readRunRecord: 'Read recent Runner, CPH and Notebook runs, including executed code, compilation and each input/output and check. runs[].status is the student process outcome; runs[].check is the independent answer-checking outcome. They describe different stages.',
	readVerdictRecord: 'Read recent final OJ verdicts, including the original status, available submitted code and details. The submitted code belongs to that submission and may differ from the live editor draft.',
	fetchProblem: 'Fetch the statement, samples and constraints from Luogu, Codeforces, AtCoder, Nowcoder or Lanqiao using its OJ and canonical problem ID.',
	readPage: 'Read a non-C/C++ page listed in the current page directory.',
	readMaterial: 'Read content listed in this conversation material directory.'
};
export function contextToolParameters(name: BeaconContextToolName): JSONSchema7 {
	const id = { type: 'string' as const, minLength: 1, maxLength: 256 };
	const recordId = { ...id, description: 'Omit to list recent records; provide an ID from that directory to read its complete record.' };
	const range = { offset: { type: 'integer' as const, minimum: 0, description: 'Zero-based character offset; continue with returned nextOffset.' }, limit: { type: 'integer' as const, minimum: 1, maximum: 131072, description: 'Maximum characters to return; default 32768.' } };
	const properties: NonNullable<JSONSchema7['properties']> = name === 'readBeCoderInfo' ? { topic: { type: 'string', enum: [...beCoderInfoTopics], description: 'overview: product and topic directory (default); problems: obtaining tasks; runner: run/input; cph: local tests; notebook: learning documents; oj-connect: five-site submission; beacon: assistant setup and modes. Direct topic reads are supported.' } } : name === 'readCurrentCode' ? {} : name === 'fetchProblem' ? { oj: { type: 'string', enum: ['luogu', 'codeforces', 'atcoder', 'nowcoder', 'lanqiao'], description: 'Luogu (洛谷), Codeforces, AtCoder, Nowcoder (牛客 ACM), Lanqiao (蓝桥).' }, problemId: { ...id, description: 'Canonical IDs: Luogu P1001 or P1001@12345; Codeforces 2026/A; AtCoder abc300/abc300_a; Nowcoder problem/12345 or contest/12345/A; Lanqiao 12345.' } }
		: name === 'readPage' ? { id: { ...id, description: 'ID from the current page directory.' }, version: { ...id, description: 'Version from the current page directory.' }, ...range, pageNumber: { type: 'integer', minimum: 1, description: 'Required for PDFs only: 1-based physical page. Text extraction is not OCR.' } } : name === 'readMaterial' ? { id: { ...id, description: 'ID from this conversation material directory.' }, ...range } : { id: recordId };
	return { type: 'object', properties, required: name === 'fetchProblem' ? ['oj', 'problemId'] : name === 'readPage' ? ['id', 'version'] : name === 'readMaterial' ? ['id'] : [], additionalProperties: false };
}
export function contextToolSchema(name: BeaconContextToolName) { return jsonSchema<Record<string, unknown>>(contextToolParameters(name)); }
export function contextInputValid(name: BeaconContextToolName, input: unknown): input is Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) { return false; }
	const value = input as Record<string, unknown>, schema = contextToolParameters(name);
	if (Object.keys(value).some(key => !Object.hasOwn(schema.properties!, key)) || schema.required?.some(key => !Object.hasOwn(value, key))) { return false; }
	if (name === 'readBeCoderInfo') { return value.topic === undefined && !Object.hasOwn(value, 'topic') || typeof value.topic === 'string' && (beCoderInfoTopics as readonly string[]).includes(value.topic); }
	for (const [key, item] of Object.entries(value)) {
		if (['id', 'version', 'problemId', 'oj'].includes(key)) { if (typeof item !== 'string' || !item.trim() || item.length > 256) { return false; } }
		else if (!Number.isSafeInteger(item) || Number(item) < (key === 'offset' ? 0 : 1) || key === 'limit' && Number(item) > 131072) { return false; }
	}
	return name !== 'fetchProblem' || ['luogu', 'codeforces', 'atcoder', 'nowcoder', 'lanqiao'].includes(String(value.oj));
}

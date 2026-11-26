/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { jsonSchema, type JSONSchema7 } from 'ai';
import type { FileInput, FileOutput } from './fileTools';
import type { WebInput, WebOutput } from './webTools';
import type { IBeaconProblemIdentity, IBeaconCurrentCodeFile } from 'becoder-beacon';
import type { ProblemDocument } from 'becoder-oj-connect';
import { beCoderInfoTopics, type BeCoderInfoTopic, type BeCoderInfo } from './productInfo';

export const contextToolNames = ['readCurrentCode', 'readProblemRecord', 'readRunRecord', 'readVerdictRecord', 'fetchProblem', 'readPage', 'readBeCoderInfo'] as const;
export type BeaconContextToolName = typeof contextToolNames[number];
export type BeaconToolName = BeaconContextToolName | 'inspectFile' | 'browseWeb';
export interface BeaconToolInputs {
	readBeCoderInfo: { topic?: BeCoderInfoTopic };
	readCurrentCode: Record<string, never>;
	readProblemRecord: { id?: string; latest?: true; filePath?: string };
	readRunRecord: { id?: string; latest?: true; filePath?: string };
	readVerdictRecord: { id?: string; latest?: true; filePath?: string };
	fetchProblem: IBeaconProblemIdentity;
	readPage: { id: string; offset?: number; limit?: number; pageNumber?: number };
	inspectFile: FileInput;
	browseWeb: WebInput;
}
export interface BeaconToolError { error: { code: 'invalid_arguments' | 'unavailable' | 'not_found' | 'read_failed' | 'network_error' | 'login_required' | 'parse_error' | 'too_large'; message: string } }
type RecordOutput = { records: readonly Record<string, unknown>[] } | { record: Record<string, unknown> } | BeaconToolError;
export interface BeaconToolOutputs {
	readBeCoderInfo: BeCoderInfo | BeaconToolError;
	readCurrentCode: { files: IBeaconCurrentCodeFile[] } | BeaconToolError;
	readProblemRecord: RecordOutput;
	readRunRecord: RecordOutput;
	readVerdictRecord: RecordOutput;
	fetchProblem: { problem: IBeaconProblemIdentity; document: Pick<ProblemDocument, 'title' | 'bodies' | 'samples' | 'limits' | 'interactive' | 'difficulty' | 'tags'>; retrievedAt: string } | BeaconToolError;
	readPage: { ok: true; contents: string; [key: string]: unknown } | BeaconToolError;
	inspectFile: FileOutput;
	browseWeb: WebOutput;
}
export const contextToolDescriptions: Record<BeaconContextToolName, string> = {
	readBeCoderInfo: 'Read the running BeCoder version and topic-specific product features, terminology, usage and supported scope.',
	readCurrentCode: 'Read all currently visible C/C++ documents and BeCoder notebooks at call time, including unsaved edits, filenames and paths. Each document appears once. Notebooks include all numbered content cells; C/C++ code has codeHash. Execution results are excluded. Background tabs are excluded.',
	readProblemRecord: 'Read recent problem-viewing activity recorded by BeCoder: OJ, problem ID, associated code-file path and viewing time. Statement text is available through fetchProblem.',
	readRunRecord: 'Read recent execution records: an optional filePath filters the list; id or latest reads one record. Runner and Notebook execute without automatic answer checking; CPH provides local check results when checking completes. runs[].status is the student process outcome; runs[].check is the independent answer-checking outcome. Program output is merged for Runner/Notebook and separate for CPH. Text values with {text,truncated:true} are incomplete prefixes.',
	readVerdictRecord: 'Read recent final OJ verdicts, submitted code when available and named test-case details. A verdict belongs to that submission, not automatically to the live editor draft.',
	fetchProblem: 'Fetch the statement, samples and constraints from Luogu, Codeforces, AtCoder, Nowcoder or Lanqiao using its OJ and canonical problem ID.',
	readPage: 'Read the current content of an eligible page by its ID in the host page directory. Text ranges use character offsets. PDF text extraction is not OCR.'
};
export function contextToolParameters(name: BeaconContextToolName): JSONSchema7 {
	const id = { type: 'string' as const, minLength: 1, maxLength: 256 };
	const recordId = { ...id, description: 'Read this record ID. Cannot be combined with latest or filePath. Omit selectors to list records.' };
	const range = { offset: { type: 'integer' as const, minimum: 0, description: 'Zero-based Unicode character offset; continue with returned nextOffset.' }, limit: { type: 'integer' as const, minimum: 1, maximum: 131072, description: 'Maximum characters to return; default 32768.' } };
	const properties: NonNullable<JSONSchema7['properties']> = name === 'readBeCoderInfo' ? { topic: { type: 'string', enum: [...beCoderInfoTopics], description: 'overview: product and topic directory (default); problems: obtaining tasks; runner: compilation and runs; cph: local tests; notebook: learning documents; oj-connect: five-site submission; beacon: workspaces, modes and recent records. Direct topic reads are supported.' } } : name === 'readCurrentCode' ? {} : name === 'fetchProblem' ? { oj: { type: 'string', enum: ['luogu', 'codeforces', 'atcoder', 'nowcoder', 'lanqiao'], description: 'Luogu (洛谷), Codeforces, AtCoder, Nowcoder (牛客 ACM), Lanqiao (蓝桥).' }, problemId: { ...id, description: 'Canonical IDs: Luogu P1001 or P1001@12345; Codeforces 2026/A; AtCoder abc300/abc300_a; Nowcoder problem/12345 or contest/12345/A; Lanqiao 12345.' } }
		: name === 'readPage' ? { id: { ...id, description: 'Page ID from the host page directory.' }, ...range, pageNumber: { type: 'integer', minimum: 1, description: 'Required for PDFs only: 1-based physical page. Text extraction is not OCR.' } } : { id: recordId, latest: { type: 'boolean', const: true, description: 'Return the latest enqueued matching record in the selected Beacon workspace. Omit to list records.' }, filePath: { type: 'string', minLength: 1, maxLength: 4096, description: 'Filter by the recorded file path, absolute or relative to the selected Beacon root. Notebook runs use the notebook path.' } };
	return { type: 'object', properties, required: name === 'fetchProblem' ? ['oj', 'problemId'] : name === 'readPage' ? ['id'] : [], additionalProperties: false };
}
export function contextToolSchema(name: BeaconContextToolName) { return jsonSchema<Record<string, unknown>>(contextToolParameters(name)); }
export function contextInputValid(name: BeaconContextToolName, input: unknown): input is Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) { return false; }
	const value = input as Record<string, unknown>, schema = contextToolParameters(name);
	if (Object.keys(value).some(key => !Object.hasOwn(schema.properties!, key)) || schema.required?.some(key => !Object.hasOwn(value, key))) { return false; }
	if (name === 'readBeCoderInfo') { return value.topic === undefined && !Object.hasOwn(value, 'topic') || typeof value.topic === 'string' && (beCoderInfoTopics as readonly string[]).includes(value.topic); }
	if (['readProblemRecord', 'readRunRecord', 'readVerdictRecord'].includes(name) && Object.hasOwn(value, 'id') && (Object.hasOwn(value, 'latest') || Object.hasOwn(value, 'filePath'))) { return false; }
	for (const [key, item] of Object.entries(value)) {
		if (key === 'latest') { if (item !== true) { return false; } }
		else if (['id', 'problemId', 'oj', 'filePath'].includes(key)) { if (typeof item !== 'string' || !item.trim() || item.length > (key === 'filePath' ? 4096 : 256)) { return false; } }
		else if (!Number.isSafeInteger(item) || Number(item) < (key === 'offset' ? 0 : 1) || key === 'limit' && Number(item) > 131072) { return false; }
	}
	return name !== 'fetchProblem' || ['luogu', 'codeforces', 'atcoder', 'nowcoder', 'lanqiao'].includes(String(value.oj));
}

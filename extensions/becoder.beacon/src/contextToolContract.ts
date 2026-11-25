/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { jsonSchema, type JSONSchema7 } from 'ai';
import type { FileInput, FileOutput } from './fileTools';
import type { WebInput, WebOutput } from './webTools';
import type { IBeaconProblemIdentity, IBeaconCurrentCodeFile, IBeaconRecordByKind, BeaconRecordKind } from 'becoder-beacon';
import type { ProblemDocument } from 'becoder-oj-connect';

export const contextToolNames = ['readCurrentCode', 'readProblemRecord', 'readRunRecord', 'readVerdictRecord', 'fetchProblem', 'readPage', 'readMaterial'] as const;
export type BeaconContextToolName = typeof contextToolNames[number];
export type BeaconToolName = BeaconContextToolName | 'inspectFile' | 'browseWeb';
export interface BeaconToolInputs {
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
	readCurrentCode: 'Read the complete current code in all visible C/C++ editor panes, including unsaved changes, with filenames and paths.',
	readProblemRecord: 'List recent problem-reading records, or read one complete record by ID.',
	readRunRecord: 'List recent program runs, or read one complete run record by ID.',
	readVerdictRecord: 'List recent final OJ verdicts, or read one complete verdict record by ID.',
	fetchProblem: 'Fetch the problem statement from a supported OJ using its canonical problem ID.',
	readPage: 'Read an authorized open non-C/C++ page by its listed ID and version.',
	readMaterial: 'Read material already available to this conversation by its listed ID.'
};
export function contextToolParameters(name: BeaconContextToolName): JSONSchema7 {
	const id = { type: 'string' as const, minLength: 1, maxLength: 256 };
	const range = { offset: { type: 'integer' as const, minimum: 0 }, limit: { type: 'integer' as const, minimum: 1, maximum: 131072 } };
	const properties: NonNullable<JSONSchema7['properties']> = name === 'readCurrentCode' ? {} : name === 'fetchProblem' ? { oj: { type: 'string', enum: ['luogu', 'codeforces', 'atcoder', 'nowcoder', 'lanqiao'] }, problemId: id }
		: name === 'readPage' ? { id, version: id, ...range, pageNumber: { type: 'integer', minimum: 1 } } : name === 'readMaterial' ? { id, ...range } : { id };
	return { type: 'object', properties, required: name === 'fetchProblem' ? ['oj', 'problemId'] : name === 'readPage' ? ['id', 'version'] : name === 'readMaterial' ? ['id'] : [], additionalProperties: false };
}
export function contextToolSchema(name: BeaconContextToolName) { return jsonSchema<Record<string, unknown>>(contextToolParameters(name)); }
export function contextInputValid(name: BeaconContextToolName, input: unknown): input is Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) { return false; }
	const value = input as Record<string, unknown>, schema = contextToolParameters(name);
	if (Object.keys(value).some(key => !Object.hasOwn(schema.properties!, key)) || schema.required?.some(key => !Object.hasOwn(value, key))) { return false; }
	for (const [key, item] of Object.entries(value)) {
		if (['id', 'version', 'problemId', 'oj'].includes(key)) { if (typeof item !== 'string' || !item.trim() || item.length > 256) { return false; } }
		else if (!Number.isSafeInteger(item) || Number(item) < (key === 'offset' ? 0 : 1) || key === 'limit' && Number(item) > 131072) { return false; }
	}
	return name !== 'fetchProblem' || ['luogu', 'codeforces', 'atcoder', 'nowcoder', 'lanqiao'].includes(String(value.oj));
}

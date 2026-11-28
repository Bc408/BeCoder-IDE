/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { jsonSchema, type JSONSchema7 } from 'ai';
import type { FileInput, FileOutput } from './fileTools';
import type { WebInput, WebOutput } from './webTools';
import type { IBeaconProblemIdentity, IBeaconCurrentCodeFile } from 'becoder-beacon';
import type { ProblemDocument } from 'becoder-oj-connect';
import type { StatementLanguage } from 'becoder-oj-connect';
import { beCoderInfoTopics, type BeCoderInfoTopic, type BeCoderInfo } from './productInfo';
import type { ContextAccess } from './contextTools';

export const contextToolNames = ['readCurrentCode', 'readProblemRecord', 'readRunRecord', 'readVerdictRecord', 'fetchProblem', 'readPage', 'readBeCoderInfo'] as const;
export type BeaconContextToolName = typeof contextToolNames[number];
export type BeaconToolName = BeaconContextToolName | 'inspectFile' | 'browseWeb';
export interface BeaconToolInputs {
	readBeCoderInfo: { topic?: BeCoderInfoTopic };
	readCurrentCode: Record<string, never>;
	readProblemRecord: { id?: string; latest?: true; filePath?: string };
	readRunRecord: { id?: string; latest?: true; filePath?: string };
	readVerdictRecord: { id?: string; latest?: true; filePath?: string };
	fetchProblem: IBeaconProblemIdentity & { language: StatementLanguage };
	readPage: { id: string; offset?: number; limit?: number; pageNumber?: number };
	inspectFile: FileInput;
	browseWeb: WebInput;
}
export interface BeaconToolError { error: { code: string; message: string } }
type RecordOutput = { records: readonly Record<string, unknown>[] } | { record: Record<string, unknown> } | BeaconToolError;
export interface BeaconToolOutputs {
	readBeCoderInfo: BeCoderInfo | BeaconToolError;
	readCurrentCode: { files: IBeaconCurrentCodeFile[] } | BeaconToolError;
	readProblemRecord: RecordOutput;
	readRunRecord: RecordOutput;
	readVerdictRecord: RecordOutput;
	fetchProblem: { problem: IBeaconProblemIdentity; language: StatementLanguage; origin: 'site' | 'translation'; document: Pick<ProblemDocument, 'title' | 'bodies' | 'samples' | 'limits' | 'interactive' | 'difficulty' | 'tags'> } | BeaconToolError;
	readPage: { ok: true; contents: string; [key: string]: unknown } | BeaconToolError;
	inspectFile: FileOutput;
	browseWeb: WebOutput;
}
export const contextToolDescriptions: Record<BeaconContextToolName, string> = {
	readBeCoderInfo: 'Read BeCoder product knowledge by topic, together with the running application\'s release version: features, terminology, usage and supported scope. This reads bundled product knowledge, not personal settings or activity records.',
	readCurrentCode: 'Read the complete contents, at call time, of all C/C++ documents and BeCoder notebooks displayed in this window\'s editor panes. Includes unsaved changes, filenames and paths; each document appears once and notebooks include all numbered content cells.',
	readProblemRecord: 'Read the user\'s recent problem-viewing activity: which OJ problem they viewed, its associated code-file path and viewing time.',
	readRunRecord: 'Read the user\'s recent local run records from Runner (program runs), CPH (local test cases) and Notebook (code-cell runs). Records provide captured code, compilation results, inputs and outputs when available; CPH records may also include answer-check results.',
	readVerdictRecord: 'Read retained final online-judge results for the user\'s submissions, with submitted code, diagnostics and per-test results when available. Each verdict describes its recorded submission.',
	fetchProblem: 'Read the specified problem in zh-CN or en, including its statement, samples and constraints. Uses the application statement cache first, otherwise fetches from Luogu, Codeforces, AtCoder, Nowcoder or Lanqiao. Never translates automatically or changes the cache. Independent of the chat web-search switch.',
	readPage: 'Read the currently loaded content of an eligible text, browser or PDF page using its ID from the host page directory. C/C++ text documents and BeCoder notebooks are excluded from this tool; readCurrentCode reads those displayed in editor panes.'
};
export function contextToolParameters(name: BeaconContextToolName): JSONSchema7 {
	const id = { type: 'string' as const, minLength: 1, maxLength: 256 };
	const recordId = { ...id, description: 'Read one retained record by its ID. Omit latest and filePath when using id.' };
	const range = { offset: { type: 'integer' as const, minimum: 0, description: 'Zero-based Unicode character offset. Use the returned nextOffset to continue.' }, limit: { type: 'integer' as const, minimum: 1, maximum: 131072, description: 'Maximum Unicode characters to return; default 32768, maximum 131072.' } };
	const properties: NonNullable<JSONSchema7['properties']> = name === 'readBeCoderInfo' ? { topic: { type: 'string', enum: [...beCoderInfoTopics], description: 'overview (default): product and topic directory; problems: obtaining tasks; runner: compilation and program runs; cph: local test cases and answer checking; notebook: learning documents and code-cell runs; oj-connect: supported OJs and submissions; beacon: workspace, modes and retained records. Any topic can be read directly.' } } : name === 'readCurrentCode' ? {} : name === 'fetchProblem' ? { oj: { type: 'string', enum: ['luogu', 'codeforces', 'atcoder', 'nowcoder', 'lanqiao'], description: 'Problem source: luogu (洛谷), codeforces, atcoder, nowcoder (牛客 ACM), or lanqiao (蓝桥).' }, problemId: { ...id, description: 'Canonical problem ID: Luogu P1001 or P1001@12345; Codeforces 2026/A; AtCoder abc300/abc300_a; Nowcoder problem/12345 or contest/12345/A; Lanqiao 12345.' } }
		: name === 'readPage' ? { id: { ...id, description: 'ID of an eligible open page from the host page directory.' }, ...range, pageNumber: { type: 'integer', minimum: 1, description: 'For PDFs only: required 1-based physical page number. PDF reads extract text, not OCR.' } } : { id: recordId, latest: { type: 'boolean', const: true, description: 'Return the most recently enqueued record matching filePath, or the latest in this queue if filePath is omitted. Omit both id and latest to list records, newest first.' }, filePath: { type: 'string', minLength: 1, maxLength: 4096, description: 'Filter by the recorded path, absolute or relative to the selected Beacon root. For Notebook runs, use the notebook file path. Applies to listing and latest; omit when using id.' } };
	if (name === 'fetchProblem') { properties.language = { type: 'string', enum: ['zh-CN', 'en'], description: 'Required statement language. If unavailable, this tool reports the available languages without translating.' }; }
	return { type: 'object', properties, required: name === 'fetchProblem' ? ['oj', 'problemId', 'language'] : name === 'readPage' ? ['id'] : [], additionalProperties: false };
}
export function contextToolSchema(name: BeaconContextToolName) {
	return jsonSchema<Record<string, unknown>>(contextToolParameters(name), { validate: value => contextInputValid(name, value) ? { success: true, value } : { success: false, error: new Error('invalid_arguments') } });
}

export interface BeaconContextToolDeclaration { name: BeaconContextToolName; description: string; parameters: JSONSchema7 }
export function compactionToolDeclarations(ids: ReturnType<NonNullable<ContextAccess['fixedRecordIds']>>): readonly BeaconContextToolDeclaration[] {
	return (['readProblemRecord', 'readRunRecord', 'readVerdictRecord'] as const).flatMap(name => {
		const values = [...new Set(ids[name] ?? [])].filter(id => contextInputValid(name, { id }));
		if (!values.length) { return []; }
		const source = name === 'readRunRecord' ? 'local run record' : name === 'readProblemRecord' ? 'problem-viewing record' : 'online-judge result';
		return [{ name, description: `Reread a ${source} using one of the fixed historical IDs listed for this summary.`, parameters: { type: 'object', properties: { id: { type: 'string', enum: values, description: 'One of the fixed historical record IDs available for this summary.' } }, required: ['id'], additionalProperties: false } }];
	});
}
export function contextInputValid(name: BeaconContextToolName, input: unknown): input is Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) { return false; }
	const value = input as Record<string, unknown>, schema = contextToolParameters(name);
	if (Object.keys(value).some(key => !Object.hasOwn(schema.properties!, key)) || schema.required?.some(key => !Object.hasOwn(value, key))) { return false; }
	if (name === 'readBeCoderInfo') { return value.topic === undefined && !Object.hasOwn(value, 'topic') || typeof value.topic === 'string' && (beCoderInfoTopics as readonly string[]).includes(value.topic); }
	if (['readProblemRecord', 'readRunRecord', 'readVerdictRecord'].includes(name) && Object.hasOwn(value, 'id') && (Object.hasOwn(value, 'latest') || Object.hasOwn(value, 'filePath'))) { return false; }
	for (const [key, item] of Object.entries(value)) {
		if (key === 'language') { if (item !== 'zh-CN' && item !== 'en') { return false; } }
		else if (key === 'latest') { if (item !== true) { return false; } }
		else if (['id', 'problemId', 'oj', 'filePath'].includes(key)) { if (typeof item !== 'string' || !item.trim() || item.length > (key === 'filePath' ? 4096 : 256)) { return false; } }
		else if (!Number.isSafeInteger(item) || Number(item) < (key === 'offset' ? 0 : 1) || key === 'limit' && Number(item) > 131072) { return false; }
	}
	return name !== 'fetchProblem' || ['luogu', 'codeforces', 'atcoder', 'nowcoder', 'lanqiao'].includes(String(value.oj));
}

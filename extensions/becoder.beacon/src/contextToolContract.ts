/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { jsonSchema, type JSONSchema7 } from 'ai';
import type { ContextInput } from './contextTools';

export const contextOperations = ['overview', 'pages', 'page', 'currentCode', 'codeSnapshots', 'codeSnapshot', 'records', 'record', 'material', 'problemHints', 'problem'] as const;
const producers = ['runner', 'cph', 'notebook', 'oj', 'problem'];
const parts = ['all', 'code', 'events', 'compile', 'input', 'output', 'expected', 'actual', 'verdict'];
const selectors = ['part', 'sampleIndex', 'blockId', 'inputId', 'stream'];
const ranges = ['offset', 'limit'];
const fields: Record<string, readonly string[]> = {
	overview: [], pages: [], codeSnapshots: [], records: ['producer', ...ranges],
	currentCode: ['id', 'version', ...ranges], codeSnapshot: ['id', ...ranges],
	page: ['id', 'version', 'pageNumber', ...ranges], material: ['id', ...ranges],
	record: ['producer', 'id', 'revision', 'locale', 'sectionIndex', ...selectors, ...ranges],
	problemHints: ['id', 'sourceUri'], problem: ['id', 'revision', 'sourceUri', 'problem', 'refresh', 'locale', 'sectionIndex', 'sampleIndex', 'part', ...ranges]
};
export interface ContextInputIssue { field: string; message: string }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Runtime validation is explicit: JSON Schema alone does not validate SDK tool arguments. */
export function contextInputIssues(value: unknown, operations: readonly string[] = contextOperations): ContextInputIssue[] {
	if (!object(value)) { return [{ field: 'operation', message: 'Provide an object with an operation from the available tools.' }]; }
	if (typeof value.operation !== 'string' || !operations.includes(value.operation) || !Object.hasOwn(fields, value.operation)) { return [{ field: 'operation', message: `Required operation: ${operations.join(', ')}.` }]; }
	const operation = value.operation;
	const issues: ContextInputIssue[] = [];
	const add = (field: string, message: string) => { if (!issues.some(issue => issue.field === field)) { issues.push({ field, message }); } };
	const knownFields = new Set(Object.values(fields).flat());
	for (const field of Object.keys(value)) { if (field !== 'operation' && !fields[operation].includes(field)) { add(knownFields.has(field) ? field : '$input', 'This field is not used by the selected operation. Use only the documented parameters.'); } }
	for (const field of ['id', 'version', 'sourceUri', 'locale', 'blockId', 'inputId', 'stream']) {
		if (value[field] !== undefined && (typeof value[field] !== 'string' || !(value[field] as string).trim() || (value[field] as string).length > (field === 'id' ? 256 : 8192))) { add(field, 'Use a nonempty string copied from the corresponding source.'); }
	}
	for (const [field, minimum, maximum] of [['revision', 1, Number.MAX_SAFE_INTEGER], ['offset', 0, Number.MAX_SAFE_INTEGER], ['limit', 1, 131072], ['pageNumber', 1, Number.MAX_SAFE_INTEGER], ['sectionIndex', 1, Number.MAX_SAFE_INTEGER], ['sampleIndex', 1, Number.MAX_SAFE_INTEGER]] as const) {
		if (value[field] !== undefined && (!Number.isSafeInteger(value[field]) || (value[field] as number) < minimum || (value[field] as number) > maximum)) { add(field, `Use an integer from ${minimum} to ${maximum}.`); }
	}
	if (value.producer !== undefined && !producers.includes(value.producer as string)) { add('producer', 'Copy producer from the records listing.'); }
	if (value.part !== undefined && !parts.includes(value.part as string)) { add('part', `Choose ${parts.join(', ')}.`); }
	if (value.refresh !== undefined && typeof value.refresh !== 'boolean') { add('refresh', 'Use true only for an explicitly requested new network observation.'); }
	if (value.problem !== undefined) {
		const problem = value.problem;
		if (!object(problem) || !['luogu', 'codeforces', 'atcoder', 'nowcoder', 'lanqiao'].includes(problem.site as string) || ['nativeId', 'url'].some(field => typeof problem[field] !== 'string' || !(problem[field] as string).trim()) || Object.keys(problem).some(field => !['site', 'nativeId', 'url'].includes(field))) { add('problem', 'Use the exact site, nativeId and url from a problem candidate.'); }
	}
	const require = (field: string, message: string) => { if (value[field] === undefined) { add(field, message); } };
	if (['record', 'page', 'codeSnapshot', 'material'].includes(operation)) { require('id', 'Copy the exact id from the matching listing.'); }
	if (operation === 'record') { require('producer', 'Copy producer from records.'); require('revision', 'Copy the positive revision from records.'); }
	if (operation === 'page' || operation === 'currentCode' && typeof value.offset === 'number' && value.offset > 0) {
		require('id', 'For continuation use the original page id; do not switch to the active page.');
		require('version', 'For continuation use the original page version.');
	}
	if (value.sampleIndex !== undefined && (value.blockId !== undefined || value.inputId !== undefined)) { add('sampleIndex', 'Sample selection cannot be combined with Notebook block/input selection.'); }
	if (operation === 'record' && value.sampleIndex !== undefined && !['cph', 'problem'].includes(value.producer as string)) { add('sampleIndex', 'Original sample ordinals apply to CPH or problem records.'); }
	if (value.stream !== undefined && !['output', 'actual'].includes(value.part as string)) { add('stream', 'Stream selection requires part output or actual. For all omit stream to read the related fields together.'); }
	if (operation === 'record' && (value.blockId !== undefined || value.inputId !== undefined) && value.producer !== 'notebook') { add('producer', 'Block and input ids select a Notebook execution record.'); }
	if (operation === 'record' && (value.locale !== undefined || value.sectionIndex !== undefined) && value.producer !== 'problem') { add('producer', 'Locale and section selection require a problem record.'); }
	if (operation === 'problem' && (value.id !== undefined || value.revision !== undefined)) { require('id', 'Saved statement reads require its exact id.'); require('revision', 'Saved statement reads require its positive revision.'); }
	if (operation === 'problem' && value.refresh === true) { require('problem', 'A readonly refresh requires the explicit problem reference.'); }
	return issues;
}

export function contextToolParameters(operations: readonly string[], maximum = 131072): JSONSchema7 {
	const descriptions: Record<string, string> = { overview: 'metadata directory', pages: 'open page directory', page: 'listed page body', currentCode: 'latest editor code and same-observation conversation snapshot', codeSnapshots: 'retained conversation code directory', codeSnapshot: 'retained conversation code body', records: 'shared evidence directory', record: 'exact producer/id/revision evidence body', material: 'authorized private material body', problemHints: 'independent problem candidates', problem: 'saved or readonly network statement' };
	const properties: NonNullable<JSONSchema7['properties']> = {
		operation: { type: 'string', enum: [...operations], description: `Always include operation. ${operations.map(operation => `${operation}: ${descriptions[operation]}`).join('; ')}. Directories are not body reads.` },
		id: { type: 'string', maxLength: 256, description: 'Exact listed id for this operation. Page, record and snapshot identities are different.' },
		version: { type: 'string', description: 'Original page version required for currentCode continuation or page reads.' },
		pageNumber: { type: 'integer', minimum: 1, description: 'Physical PDF page number, 1-based.' },
		producer: { type: 'string', enum: producers, description: 'Copy the producer from records.' },
		revision: { type: 'integer', minimum: 1, description: 'Exact positive revision from records, not editor version.' },
		part: { type: 'string', enum: parts, description: 'Read the needed part. CPH sampleIndex + all returns that sample input, expected and observed result. A complete selected part does not imply the entire record was read.' },
		sourceUri: { type: 'string', description: 'The discussed code source URI, not a discussion binding.' }, refresh: { type: 'boolean', description: 'True requests a new readonly OJ observation; does not persist Get Problem.' }, locale: { type: 'string' }, sectionIndex: { type: 'integer', minimum: 1 },
		sampleIndex: { type: 'integer', minimum: 1, description: 'Original 1-based sample ordinal from sampleNumbers, including a run of only sample 2. Retained sample numbers need not be adjacent.' }, blockId: { type: 'string' }, inputId: { type: 'string' }, stream: { type: 'string' },
		problem: { type: 'object', properties: { site: { type: 'string', enum: ['luogu', 'codeforces', 'atcoder', 'lanqiao', 'nowcoder'] }, nativeId: { type: 'string' }, url: { type: 'string' } }, required: ['site', 'nativeId', 'url'], additionalProperties: false },
		offset: { type: 'integer', minimum: 0, description: 'Character offset in this returned representation. Prefer the complete continuation parameters when supplied.' }, limit: { type: 'integer', minimum: 1, maximum }
	};
	const allowed = new Set(['operation', ...operations.flatMap(operation => fields[operation] ?? [])]);
	return { type: 'object', properties: Object.fromEntries(Object.entries(properties).filter(([name]) => allowed.has(name))), required: ['operation'], additionalProperties: false };
}
export function contextToolSchema(operations: readonly string[] = contextOperations, maximum = 131072) { return jsonSchema<ContextInput>(contextToolParameters(operations, maximum)); }

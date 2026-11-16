/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProblemRef, ProblemDocument, RecordRef, RecordSnapshot, Section, SubmissionOutcome } from 'becoder-oj-connect';
import { atCoderProblem } from './adapters/atcoder/task';
import { luoguProblem } from './adapters/luogu/task';
export type { SiteId, ISourceSnapshot, ProblemRef, ProblemDocument, RecordRef, RecordSnapshot, Section, LanguageOption, SubmissionProgress, SubmissionOutcome, LoginSummary } from 'becoder-oj-connect';

export function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('oj-connect-invalid-data'); }
	return value as Record<string, unknown>;
}
export function text(value: unknown, limit = 8192, allowEmpty = false): string {
	if (typeof value !== 'string' || value.length > limit || (!allowEmpty && !value.trim())) { throw new Error('oj-connect-invalid-data'); }
	return value;
}
function array(value: unknown, limit: number): unknown[] {
	if (!Array.isArray(value) || value.length > limit) { throw new Error('oj-connect-invalid-data'); }
	return value;
}
function bounded(value: unknown): void {
	if (new TextEncoder().encode(JSON.stringify(value)).length > 8 * 1024 * 1024) { throw new Error('oj-connect-too-large'); }
}
function metadata(raw: unknown): { label: string; color?: string } {
	const value = object(raw), label = text(value.label, 200);
	if (value.color === undefined) { return { label }; }
	const color = text(value.color, 64);
	if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color) && !/^rgb\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*\)$/.test(color)) { throw new Error('oj-connect-invalid-color'); }
	if (color.startsWith('rgb') && [...color.matchAll(/\d+/g)].some(part => Number(part[0]) > 255)) { throw new Error('oj-connect-invalid-color'); }
	return { label, color };
}
export function validateProblemRef(raw: unknown): ProblemRef {
	const value = object(raw);
	const url = text(value.url);
	const parsed = value.site === 'atcoder' ? atCoderProblem(url) : value.site === 'luogu' ? luoguProblem(url) : undefined;
	if (!parsed || parsed.url !== url || parsed.nativeId !== value.nativeId) { throw new Error('oj-connect-invalid-problem'); }
	return parsed;
}
export function validateRecordRef(raw: unknown): RecordRef {
	const value = object(raw), problem = validateProblemRef(value.problem), id = text(value.id, 100), url = text(value.url);
	if (!/^[1-9]\d*$/.test(id)) { throw new Error('oj-connect-invalid-record'); }
	const expected = problem.site === 'luogu' ? 'https://www.luogu.com.cn/record/' + id
		: 'https://atcoder.jp/contests/' + problem.nativeId.split('/')[0] + '/submissions/' + id;
	if (url !== expected) { throw new Error('oj-connect-invalid-record'); }
	return { problem, id, url };
}
export function validateOutcome(raw: unknown): SubmissionOutcome {
	const value = object(raw);
	if (value.kind === 'record') { return { kind: 'record', record: validateRecordRef(value.record) }; }
	if (value.kind === 'not-sent') { return { kind: 'not-sent', reason: text(value.reason, 2000) }; }
	if (value.kind === 'unconfirmed') { return { kind: 'unconfirmed', problem: validateProblemRef(value.problem), attemptId: text(value.attemptId, 200), message: text(value.message, 2000) }; }
	throw new Error('oj-connect-invalid-receipt');
}
export function validateProblem(raw: unknown): ProblemDocument {
	bounded(raw);
	const value = object(raw), ref = validateProblemRef(value.ref);
	if (typeof value.interactive !== 'boolean') { throw new Error('oj-connect-invalid-problem'); }
	return {
		ref, title: text(value.title, 2048), interactive: value.interactive,
		...(value.difficulty === undefined ? {} : { difficulty: metadata(value.difficulty) }),
		...(value.tags === undefined ? {} : { tags: array(value.tags, 256).map(metadata) }),
		...(value.languages === undefined ? {} : {
			languages: array(value.languages, 100).map(raw => {
				const option = object(raw);
				if (option.family !== 'c' && option.family !== 'cpp') { throw new Error('oj-connect-invalid-language'); }
				return { id: text(option.id, 200), label: text(option.label, 200), family: option.family };
			})
		}),
		bodies: array(value.bodies, 32).map(rawBody => {
			const body = object(rawBody);
			return {
				locale: text(body.locale, 64), sections: array(body.sections, 64).map((rawSection): Section => {
					const section = object(rawSection);
					if (section.format !== 'markdown' && section.format !== 'html') { throw new Error('oj-connect-invalid-content'); }
					if (section.kind !== undefined && section.kind !== 'notes' && section.kind !== 'sample-explanation') { throw new Error('oj-connect-invalid-content'); }
					if (section.kind === 'sample-explanation' && (!Number.isSafeInteger(section.sampleIndex) || Number(section.sampleIndex) < 0 || Number(section.sampleIndex) >= array(value.samples, 100).length)) { throw new Error('oj-connect-invalid-content'); }
					return { format: section.format, content: text(section.content, 8 * 1024 * 1024, true), ...(section.heading === undefined ? {} : { heading: text(section.heading, 1024) }), ...(section.kind === 'notes' ? { kind: 'notes' as const } : section.kind === 'sample-explanation' ? { kind: 'sample-explanation' as const, sampleIndex: Number(section.sampleIndex) } : {}) };
				})
			};
		}),
		samples: array(value.samples, 100).map(rawSample => { const sample = object(rawSample); return { input: text(sample.input, 8 * 1024 * 1024, true), output: text(sample.output, 8 * 1024 * 1024, true) }; }),
		limits: array(value.limits, 32).map(rawLimit => { const limit = object(rawLimit); return { label: text(limit.label, 200), value: text(limit.value, 1000) }; })
	};
}
export function validateRecord(raw: unknown): RecordSnapshot {
	bounded(raw);
	const value = object(raw), ref = validateRecordRef(value.ref);
	if (!['queued', 'judging', 'finished', 'unknown'].includes(String(value.phase)) || !['matched', 'mismatch', 'unavailable', 'not-checked'].includes(String(value.sourceVerification))) { throw new Error('oj-connect-invalid-record'); }
	const optional: Record<string, string> = {};
	for (const name of ['language', 'owner', 'score', 'time', 'memory', 'compileMessage', 'submittedAt', 'codeLength', 'source']) {
		if (value[name] !== undefined) { optional[name] = text(value[name], name === 'compileMessage' || name === 'source' ? 1024 * 1024 : 8192, true); }
	}
	if (value.compileSucceeded !== undefined && typeof value.compileSucceeded !== 'boolean') { throw new Error('oj-connect-invalid-record'); }
	return {
		ref, phase: value.phase as RecordSnapshot['phase'], rawStatus: text(value.rawStatus, 200, true), sourceVerification: value.sourceVerification as RecordSnapshot['sourceVerification'], ...optional,
		...(value.compileSucceeded === undefined ? {} : { compileSucceeded: value.compileSucceeded as boolean }),
		...(value.groups === undefined ? {} : {
			groups: array(value.groups, 128).map(rawGroup => {
				const group = object(rawGroup);
				return { name: text(group.name, 1000, true), rows: array(group.rows, 1024).map(row => array(row, 32).map(cell => text(cell, 8192, true))) };
			})
		})
	};
}

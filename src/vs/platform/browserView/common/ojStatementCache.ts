/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
// eslint-disable-next-line local/code-import-patterns -- Internal statement DTOs shared with bundled extensions.
import type { ProblemRef, Section, StatementContent, StatementLanguage, StatementRead, StatementTranslationTicket, StatementVersion } from 'becoder-oj-connect';

export const statementCacheChannel = 'becoderProblemStatements';
export const statementCacheCommand = '_becoder.ojConnect.statementCache';
export const statementCacheCapacity = 30;
export const IProblemStatementCacheService = createDecorator<IProblemStatementCacheService>('problemStatementCache');
export interface IProblemStatementCacheService {
	readonly _serviceBrand: undefined;
	read(windowId: number, ref: ProblemRef, language: StatementLanguage): Promise<StatementRead | undefined>;
	merge(windowId: number, document: StatementContent): Promise<StatementContent>;
	publishAcquired(windowId: number, document: StatementContent): Promise<StatementContent>;
	acquireTranslation(windowId: number, source: StatementRead, target: StatementLanguage): Promise<StatementTranslationTicket>;
	publishTranslation(windowId: number, ticketId: string, version: StatementVersion): Promise<StatementContent>;
	releaseTranslation(windowId: number, ticketId: string): Promise<void>;
}

export function isStatementLanguage(value: unknown): value is StatementLanguage { return value === 'en' || value === 'zh-CN'; }
export function statementKey(ref: ProblemRef): string { validateStatementRef(ref); return ref.site + ':' + ref.nativeId; }
export function validateStatementRef(ref: ProblemRef): void {
	if (!ref || typeof ref.nativeId !== 'string' || ref.nativeId.length > 256) { throw new Error('oj-connect-invalid-problem'); }
	const id = ref.nativeId;
	let expected: string | undefined;
	if (ref.site === 'luogu' && /^(?:P\d{4,5}|B\d{4}|[UT]\d{1,7}|CF\d{1,5}[A-Z]\d?|SP\d{1,7}|UVA\d{1,7}|AT_[a-zA-Z0-9_]+)(?:@[1-9]\d*)?$/.test(id)) {
		const [pid, contest] = id.split('@'); expected = 'https://www.luogu.com.cn/problem/' + pid + (contest ? '?contestId=' + contest : '');
	} else if (ref.site === 'atcoder' && /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(id)) {
		const [contest, task] = id.split('/'); expected = `https://atcoder.jp/contests/${contest}/tasks/${task}`;
	} else if (ref.site === 'codeforces' && /^[1-9]\d*\/[A-Z][A-Z0-9]*$/.test(id)) {
		const [contest, task] = id.split('/'); expected = `https://codeforces.com/contest/${contest}/problem/${task}`;
	} else if (ref.site === 'nowcoder' && /^(?:problem\/[1-9]\d*|contest\/[1-9]\d*\/[A-Z][A-Z0-9]*)$/.test(id)) {
		expected = 'https://ac.nowcoder.com/acm/' + id;
	} else if (ref.site === 'lanqiao' && /^[1-9]\d{0,7}$/.test(id)) { expected = 'https://www.lanqiao.cn/problems/' + id + '/learning/'; }
	if (!expected || ref.url !== expected) { throw new Error('oj-connect-invalid-problem'); }
}

const text = (value: unknown, maximum: number, empty = false): string => {
	if (typeof value !== 'string' || value.length > maximum || !empty && !value.trim()) { throw new Error('statement-invalid-content'); }
	return value;
};
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('statement-invalid-content'); }
	return value as Record<string, unknown>;
}
function array(value: unknown, maximum: number): unknown[] {
	if (!Array.isArray(value) || value.length > maximum) { throw new Error('statement-invalid-content'); }
	return value;
}
export function validateStatementVersion(raw: unknown, sampleCount: number): StatementVersion {
	const value = object(raw);
	if (!isStatementLanguage(value.language) || value.origin !== 'site' && value.origin !== 'translation') { throw new Error('statement-invalid-content'); }
	const sections = array(value.sections, 64).map((raw): Section => {
		const section = object(raw);
		if (section.format !== 'markdown' && section.format !== 'html' || section.kind !== undefined && section.kind !== 'notes' && section.kind !== 'sample-explanation') { throw new Error('statement-invalid-content'); }
		if (section.kind === 'sample-explanation' && (!Number.isSafeInteger(section.sampleIndex) || Number(section.sampleIndex) < 0 || Number(section.sampleIndex) >= sampleCount)) { throw new Error('statement-invalid-content'); }
		return { format: section.format, content: text(section.content, 8 * 1024 * 1024, true), ...(section.heading === undefined ? {} : { heading: text(section.heading, 1024) }), ...(section.kind === 'notes' ? { kind: 'notes' as const } : section.kind === 'sample-explanation' ? { kind: 'sample-explanation' as const, sampleIndex: Number(section.sampleIndex) } : {}) };
	});
	if (!sections.some(section => section.content.trim())) { throw new Error('statement-invalid-content'); }
	return { language: value.language, title: text(value.title, 2048), origin: value.origin, sections };
}
export function statementContent(raw: unknown): StatementContent {
	const value = object(raw), ref = object(value.ref) as unknown as ProblemRef;
	validateStatementRef(ref);
	if (typeof value.interactive !== 'boolean') { throw new Error('statement-invalid-content'); }
	const samples = array(value.samples, 100).map(raw => { const item = object(raw); return { input: text(item.input, 8 * 1024 * 1024, true), output: text(item.output, 8 * 1024 * 1024, true) }; });
	const title = text(value.title, 2048);
	const languages = new Set<string>();
	const bodies = array(value.bodies, 32).flatMap(raw => {
		const body = object(raw);
		if (!isStatementLanguage(body.locale)) { return []; }
		if (languages.has(body.locale)) { throw new Error('statement-invalid-content'); }
		languages.add(body.locale);
		const version = validateStatementVersion({ language: body.locale, title: body.title ?? title, origin: body.origin ?? 'site', sections: body.sections }, samples.length);
		return [{ locale: version.language, title: version.title, origin: version.origin, sections: version.sections }];
	});
	if (!bodies.length) { throw new Error('statement-language-unavailable'); }
	const metadata = (raw: unknown) => { const item = object(raw); return { label: text(item.label, 200), ...(typeof item.color === 'string' && /^#[a-f0-9]{3,8}$/i.test(item.color) ? { color: item.color } : {}) }; };
	const result: StatementContent = {
		ref: { site: ref.site, nativeId: ref.nativeId, url: ref.url }, title, bodies, samples,
		limits: array(value.limits, 32).map(raw => { const item = object(raw); return { label: text(item.label, 200), value: text(item.value, 1000) }; }), interactive: value.interactive,
		...(value.difficulty === undefined ? {} : { difficulty: metadata(value.difficulty) }), ...(value.tags === undefined ? {} : { tags: array(value.tags, 256).map(metadata) })
	};
	if (new TextEncoder().encode(JSON.stringify(result)).length > 8 * 1024 * 1024) { throw new Error('statement-too-large'); }
	return result;
}

export function selectStatementVersion(document: StatementContent, language: StatementLanguage): StatementRead | undefined {
	if (!isStatementLanguage(language)) { throw new Error('statement-invalid-language'); }
	const body = document.bodies.find(body => body.locale === language);
	if (!body) { return undefined; }
	const { title, bodies, ...facts } = document;
	return { ...facts, version: validateStatementVersion({ language, title: body.title ?? title, sections: body.sections, origin: body.origin ?? 'site' }, facts.samples.length) };
}

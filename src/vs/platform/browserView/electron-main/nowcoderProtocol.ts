/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs.
import type { ProblemRef, ProblemDocument, LanguageOption, RecordRef, RecordSnapshot, Section } from 'becoder-oj-connect';
import type { parse, AnyNode, Property, ObjectExpression, FunctionExpression } from 'acorn';
import { assertNowcoderProblem, nowcoderRecord } from '../common/nowcoderBridge.js';
import { decodeAtCoderHTML } from '../common/atcoderSubmission.js';

export interface NowcoderPage {
	readonly questionId: string;
	readonly tagId: '4';
	readonly subTagId: '0' | '1';
	readonly doneQuestionId: string;
	readonly languageURL: string;
	readonly document: ProblemDocument;
}

function nodes(root: AnyNode): AnyNode[] {
	const stack: unknown[] = [root], result: AnyNode[] = [];
	while (stack.length) {
		const value = stack.pop();
		if (!value || typeof value !== 'object') { continue; }
		if (Array.isArray(value)) { stack.push(...value); continue; }
		const node = value as AnyNode;
		if (typeof node.type !== 'string') { continue; }
		result.push(node);
		if (result.length > 1000000) { throw new Error('nowcoder-script-too-large'); }
		for (const child of Object.values(node)) { if (child && typeof child === 'object') { stack.push(child); } }
	}
	return result;
}
function key(property: Property): string | undefined {
	return !property.computed && property.kind === 'init' && !property.method ? property.key.type === 'Identifier' ? property.key.name : property.key.type === 'Literal' ? String(property.key.value) : undefined : undefined;
}
function field(object: ObjectExpression, name: string): AnyNode | undefined {
	const values = object.properties.filter((property): property is Property => property.type === 'Property' && key(property) === name);
	if (values.length > 1) { throw new Error('nowcoder-duplicate-field'); }
	return values[0]?.value;
}
function literal(node: AnyNode | undefined, depth = 0): unknown {
	if (!node || depth > 16) { throw new Error('nowcoder-nonliteral-data'); }
	if (node.type === 'Literal' && (node.value === null || ['string', 'number', 'boolean'].includes(typeof node.value))) { return node.value; }
	if (node.type === 'ArrayExpression') { return node.elements.map(value => literal(value ?? undefined, depth + 1)); }
	if (node.type === 'ObjectExpression') {
		const result: Record<string, unknown> = Object.create(null);
		for (const property of node.properties) {
			if (property.type !== 'Property') { throw new Error('nowcoder-nonliteral-data'); }
			const name = key(property);
			if (name === undefined || Object.hasOwn(result, name)) { throw new Error('nowcoder-nonliteral-data'); }
			result[name] = literal(property.value, depth + 1);
		}
		return result;
	}
	throw new Error('nowcoder-nonliteral-data');
}
async function syntax(source: string): Promise<ReturnType<typeof parse>> {
	if (source.length > 4 * 1024 * 1024) { throw new Error('nowcoder-script-too-large'); }
	return (await import('acorn')).parse(source, { ecmaVersion: 'latest' });
}
async function staticPageInfo(html: string): Promise<Record<string, unknown>> {
	const values: unknown[] = [];
	for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
		if (!script[1].includes('pageInfo')) { continue; }
		for (const statement of (await syntax(script[1])).body) {
			const expression = statement.type === 'ExpressionStatement' ? statement.expression : undefined;
			if (expression?.type !== 'AssignmentExpression' || expression.operator !== '=' || expression.left.type !== 'MemberExpression' || expression.left.computed || expression.left.object.type !== 'Identifier' || expression.left.object.name !== 'window' || expression.left.property.type !== 'Identifier' || expression.left.property.name !== 'pageInfo') { continue; }
			values.push(literal(expression.right));
		}
	}
	if (values.length !== 1) { throw new Error('nowcoder-metadata-missing'); }
	return nowcoderObject(values[0]);
}

/** Extract bounded static fragments; the existing common content renderer sanitizes their HTML. */
function fragments(html: string, className: string): { start: number; end: number; content: string }[] {
	const result: { start: number; end: number; content: string }[] = [];
	const tags = /<([a-z][a-z0-9]*)\b[^>]*\bclass\s*=\s*(["'])(.*?)\2[^>]*>/gi;
	for (let match; (match = tags.exec(html));) {
		if (!match[3].split(/\s+/).includes(className)) { continue; }
		const closing = new RegExp('</?' + match[1] + '\\b[^>]*>', 'gi');
		closing.lastIndex = tags.lastIndex;
		let depth = 1, end = -1;
		for (let tag; (tag = closing.exec(html));) { depth += tag[0].startsWith('</') ? -1 : 1; if (depth === 0) { end = tag.index; break; } }
		if (end < 0) { throw new Error('nowcoder-incomplete-html'); }
		result.push({ start: match.index, end: closing.lastIndex, content: html.slice(tags.lastIndex, end) });
		tags.lastIndex = closing.lastIndex;
		if (result.length > 100) { throw new Error('nowcoder-too-many-sections'); }
	}
	return result;
}
const plain = (html: string) => decodeAtCoderHTML(html.replace(/<[^>]*>/g, ''));

function statementSections(html: string): Section[] {
	const sections: Section[] = [];
	const description = fragments(html, 'subject-question')[0];
	if (description && !plain(html.slice(0, description.start)).trim()) {
		sections.push({ heading: '\u9898\u76ee\u63cf\u8ff0', format: 'html', content: description.content });
		html = html.slice(description.end);
	}
	const headings = [...html.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre\s*>|<code\b[^>]*>[\s\S]*?<\/code\s*>|(<h2\b[^>]*>)([\s\S]*?)(<\/h2\s*>)/gi)].filter(match => match[1]);
	const prefix = html.slice(0, headings[0]?.index ?? html.length);
	if (prefix.trim()) { sections.push({ heading: sections.length ? undefined : '\u9898\u76ee\u63cf\u8ff0', format: 'html', content: prefix }); }
	const names: Record<string, string> = {
		'\u8f93\u5165\u63cf\u8ff0': '\u8f93\u5165\u683c\u5f0f', '\u8f93\u5165\u683c\u5f0f': '\u8f93\u5165\u683c\u5f0f',
		'\u8f93\u51fa\u63cf\u8ff0': '\u8f93\u51fa\u683c\u5f0f', '\u8f93\u51fa\u683c\u5f0f': '\u8f93\u51fa\u683c\u5f0f',
		'\u5907\u6ce8': '\u8bf4\u660e/\u63d0\u793a', '\u8bf4\u660e/\u63d0\u793a': '\u8bf4\u660e/\u63d0\u793a'
	};
	for (const [index, match] of headings.entries()) {
		const original = plain(match[2]).trim(), name = original.replace(/[:\uFF1A]\s*$/, '');
		let content = html.slice(match.index! + match[0].length, headings[index + 1]?.index ?? html.length);
		if (!content.trim()) { continue; }
		if (names[name]) {
			// These official fields contain prose, even when the site wraps them in pre.
			content = content.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (raw, body: string) => /<code\b/i.test(body) ? raw : '<div class="oj-input-format">' + body + '</div>');
		}
		// Keep anchors and inline heading markup in the same rendered HTML scope.
		sections.push({ format: 'html', content: match[1] + (names[name] ?? match[2]) + match[3] + content, ...(names[name] === '\u8bf4\u660e/\u63d0\u793a' ? { kind: 'notes' as const } : {}) });
	}
	return sections;
}

// Adapted from vscode-luogu v4.20.0 src/utils/stringUtils.ts.
// Copyright (c) 2018 yltx. MIT License; see ThirdPartyNotices.txt.
function formatTime(time: number): string {
	if (time < 1e3) { return `${time}ms`; }
	if (time < 60 * 1e3) { return `${(time / 1e3).toFixed(2)}s`; }
	if (time < 60 * 60 * 1e3) { return `${(time / (60 * 1e3)).toFixed(2)}min`; }
	if (time < 24 * 60 * 60 * 1e3) { return `${(time / (60 * 60 * 1e3)).toFixed(2)}h`; }
	return `${(time / (24 * 60 * 60 * 1e3)).toFixed(2)}d`;
}
function formatMemory(memory: number): string {
	if (memory < 2 ** 10) { return `${memory}B`; }
	if (memory < 2 ** 20) { return `${(memory / 2 ** 10).toFixed(2)}KiB`; }
	if (memory < 2 ** 30) { return `${(memory / 2 ** 20).toFixed(2)}MiB`; }
	return `${(memory / 2 ** 30).toFixed(2)}GiB`;
}
function cppLimit(raw: string, time: boolean): string | undefined {
	const units: Record<string, number> = time
		? { ms: 1, '\u6beb\u79d2': 1, s: 1000, sec: 1000, '\u79d2': 1000, min: 60000, '\u5206\u949f': 60000, h: 3600000, '\u5c0f\u65f6': 3600000 }
		: { b: 1, '\u5b57\u8282': 1, k: 2 ** 10, kb: 2 ** 10, kib: 2 ** 10, m: 2 ** 20, mb: 2 ** 20, mib: 2 ** 20, g: 2 ** 30, gb: 2 ** 30, gib: 2 ** 30 };
	const values = raw.split(/[,\uFF0C;\uFF1B]/).flatMap(part => {
		const match = /^(.*?)\s*(\d+(?:\.\d+)?)\s*([a-z\u4e00-\u9fff]+)$/i.exec(part.trim());
		if (!match || match[1].trim() && !match[1].trim().split(/\s*\/\s*/).some(language => language === 'C' || language === 'C++')) { return []; }
		const value = Number(match[2]) * units[match[3].toLowerCase()];
		return Number.isFinite(value) && value > 0 ? [value] : [];
	});
	if (!values.length) { return undefined; }
	const format = time ? formatTime : formatMemory;
	const min = format(values.reduce((min, value) => Math.min(min, value))), max = format(values.reduce((max, value) => Math.max(max, value)));
	return min === max ? min : `${min}~${max}`;
}

export async function parseNowcoderPage(problem: ProblemRef, html: string): Promise<NowcoderPage> {
	assertNowcoderProblem(problem);
	if (html.length > 4 * 1024 * 1024) { throw new Error('nowcoder-page-too-large'); }
	const info = await staticPageInfo(html), parts = problem.nativeId.split('/'), contest = parts[0] === 'contest';
	const id = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value);
	if (!id(info.questionId) || info.tagId !== '4' || info.codeJudgeType !== '0' || info.isNewJudgeEditor === true || info.isNewJudgeEditor === 'true' || info.subTagId !== (contest ? '1' : '0') || info.doneQuestionId !== parts[1]) { throw new Error('nowcoder-unsupported-problem'); }
	if (contest) {
		const settings = nowcoderObject(info.settingInfo);
		if (info.contestId !== parts[1] || info.isFinished !== true || info.isTeamSignUp !== false || settings.needPassword !== false || settings.needCharge !== false) { throw new Error('nowcoder-unsupported-contest'); }
	} else if (info.problemId !== parts[1]) { throw new Error('nowcoder-problem-mismatch'); }
	const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']((?:https:)?\/\/static\.nowcoder\.com\/acm\/nowcoder\/[\d.]+\/javascripts-acm\/lib\/env\.js)["'][^>]*>/gi)];
	if (scripts.length !== 1) { throw new Error('nowcoder-language-config-missing'); }
	const title = plain(fragments(html, 'terminal-topic-title')[0]?.content ?? '').trim();
	let body = fragments(html, 'subject-describe')[0]?.content;
	if (!title || !body) { throw new Error('nowcoder-statement-missing'); }
	const samples: { input: string; output: string }[] = [], explanations: Section[] = [];
	const blocks = fragments(body, 'question-oi');
	for (const [sampleIndex, sample] of blocks.entries()) {
		const pre = [...sample.content.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi)];
		if (pre.length < 2) { throw new Error('nowcoder-sample-incomplete'); }
		samples.push({ input: plain(pre[0][1]), output: plain(pre[1][1]) });
		if (pre.length > 2) { explanations.push({ kind: 'sample-explanation', sampleIndex, format: 'html', content: pre.slice(2).map(value => '<div class="oj-input-format">' + value[1] + '</div>').join('') }); }
	}
	for (const sample of blocks.reverse()) { body = body.slice(0, sample.start) + body.slice(sample.end); }
	// The site uses pre for prose with equation images; those images must not become code text.
	body = body.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (raw, content: string) => /<img\b/i.test(content) && !/<code\b/i.test(content) ? '<div class="oj-input-format">' + content + '</div>' : raw);
	const limits = [...(fragments(html, 'question-intr')[0]?.content ?? '').matchAll(/<span\b[^>]*>([\s\S]*?)<\/span\s*>/gi)].flatMap(value => {
		const match = /^(\u65f6\u95f4\u9650\u5236|\u7a7a\u95f4\u9650\u5236|\u5185\u5b58\u9650\u5236|Time(?: Limit)?|Memory(?: Limit)?)\s*[:\uFF1A]\s*(.+)$/i.exec(plain(value[1]).trim());
		if (!match) { return []; }
		const time = /^(\u65f6\u95f4|Time)/i.test(match[1]), limit = cppLimit(match[2], time);
		return limit === undefined ? [] : [{ label: time ? 'Time Limit' : 'Memory Limit', value: limit }];
	});
	return { questionId: info.questionId as string, tagId: '4', subTagId: contest ? '1' : '0', doneQuestionId: parts[1], languageURL: new URL(scripts[0][1], problem.url).href, document: { ref: problem, title, bodies: [{ locale: 'zh-CN', sections: [...statementSections(body), ...explanations] }], samples, limits, interactive: false } };
}

/** Read catalogue literals and the ACM host override; never evaluate the downloaded bundle. */
export async function nowcoderLanguages(source: string): Promise<readonly LanguageOption[]> {
	const functions = nodes(await syntax(source)).filter((node): node is FunctionExpression => node.type === 'FunctionExpression');
	const candidates: { owner: FunctionExpression; name: string; items: ObjectExpression[] }[] = [];
	for (const owner of functions) {
		for (const statement of owner.body.body) {
			if (statement.type !== 'VariableDeclaration') { continue; }
			for (const declaration of statement.declarations) {
				if (declaration.id.type !== 'Identifier' || declaration.init?.type !== 'ArrayExpression' || !declaration.init.elements.length) { continue; }
				const items = declaration.init.elements;
				if (items.every((item): item is ObjectExpression => item?.type === 'ObjectExpression' && !!field(item, 'id') && !!field(item, 'lang')) && items.some(item => field(item, 'suffix')?.type === 'Literal' && ['c', 'cpp'].includes(String((field(item, 'suffix') as { value?: unknown }).value)))) { candidates.push({ owner, name: declaration.id.name, items }); }
			}
		}
	}
	if (candidates.length !== 1) { throw new Error('nowcoder-language-config-changed'); }
	const { owner, name, items } = candidates[0];
	const catalogue = items.map(item => ({ id: literal(field(item, 'id')), lang: literal(field(item, 'lang')), suffix: field(item, 'suffix') ? literal(field(item, 'suffix')) : undefined }));
	const branches = nodes(owner.body).filter(node => node.type === 'LogicalExpression' && node.operator === '&&' && nodes(node.left).some(child => child.type === 'Literal' && child.value === 'ac.nowcoder.com'));
	if (branches.length !== 1 || branches[0].type !== 'LogicalExpression' || branches[0].right.type !== 'SequenceExpression') { throw new Error('nowcoder-language-config-changed'); }
	let order: unknown[] | undefined;
	for (const expression of branches[0].right.expressions) {
		if (expression.type !== 'AssignmentExpression' || expression.operator !== '=') { throw new Error('nowcoder-language-config-changed'); }
		if (expression.left.type === 'Identifier' && expression.right.type === 'ArrayExpression') { if (order) { throw new Error('nowcoder-language-config-changed'); } order = literal(expression.right) as unknown[]; continue; }
		const left = expression.left;
		if (left.type !== 'MemberExpression' || left.computed || left.property.type !== 'Identifier' || left.object.type !== 'MemberExpression' || left.object.object.type !== 'Identifier' || left.object.object.name !== name || left.object.property.type !== 'Literal') { throw new Error('nowcoder-language-config-changed'); }
		const index = left.object.property.value;
		if (typeof index !== 'number' || !catalogue[index]) { throw new Error('nowcoder-language-config-changed'); }
		if (left.property.name === 'lang') { catalogue[index].lang = literal(expression.right); }
		else { literal(expression.right); }
	}
	if (!order?.length || new Set(order).size !== order.length) { throw new Error('nowcoder-language-config-changed'); }
	const result: LanguageOption[] = [];
	for (const id of order) {
		const entries = catalogue.filter(item => item.id === id);
		if (entries.length !== 1) { throw new Error('nowcoder-language-config-changed'); }
		const item = entries[0];
		if (item.suffix !== 'c' && item.suffix !== 'cpp') { continue; }
		if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id) || typeof item.lang !== 'string' || !item.lang || item.lang.length > 200) { throw new Error('nowcoder-language-config-changed'); }
		result.push({ id, label: item.lang, family: item.suffix });
	}
	if (!result.length) { throw new Error('nowcoder-languages-unavailable'); }
	return result;
}

export function parseNowcoderStatus(record: RecordRef, raw: unknown): RecordSnapshot {
	if (nowcoderRecord(record.problem, record.id).url !== record.url) { throw new Error('nowcoder-invalid-record'); }
	const value = nowcoderObject(raw);
	if (value.code !== 0 || String(value.id) !== record.id || !Number.isSafeInteger(value.status)) { throw new Error('nowcoder-invalid-status'); }
	const status = value.status as number;
	const names: Record<number, string> = { 0: 'Waiting', 1: 'Compiling', 2: 'Judging', 3: 'RE', 4: 'WA', 5: 'AC', 6: 'TLE', 7: 'MLE', 10: 'OLE', 12: 'CE', 13: 'PE', 14: 'IE', 15: 'Floating Point Exception', 16: 'Segmentation Fault', 20: 'Code Length Exceeded', 21: 'Nonzero Exit Code' };
	const phase = status === 0 || status === 1 ? 'queued' : status === 2 ? 'judging' : names[status] ? 'finished' : 'unknown';
	const resource = (key: string, unit: string) => phase === 'finished' && status !== 12 && typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 ? String(value[key]) + ' ' + unit : undefined;
	const passed = value.rightCaseNum, total = value.allCaseNum;
	const testCaseSummary = phase === 'finished' && status !== 12 && Number.isSafeInteger(passed) && Number.isSafeInteger(total) && Number(passed) >= 0 && Number(total) > 0 && Number(passed) <= Number(total) ? { passed: Number(passed), total: Number(total) } : undefined;
	return {
		...(testCaseSummary ? { testCaseSummary } : {}),
		ref: record, phase, rawStatus: names[status] ?? String(status), groups: [], sourceVerification: 'not-checked',
		...(resource('timeConsumption', 'ms') === undefined ? {} : { time: resource('timeConsumption', 'ms') }),
		...(resource('memoryConsumption', 'KB') === undefined ? {} : { memory: resource('memoryConsumption', 'KB') }),
		...(status === 12 ? { compileSucceeded: false, ...(typeof value.memo === 'string' && value.memo.length <= 1024 * 1024 ? { compileMessage: value.memo } : {}) } : {})
	};
}

export function nowcoderObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('nowcoder-invalid-response'); }
	return value as Record<string, unknown>;
}

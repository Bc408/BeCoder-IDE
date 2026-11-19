/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal type-only OJ record contract.
import type { RecordRef, RecordSnapshot, ProblemRef, LanguageOption } from 'becoder-oj-connect';

/** Inert catalogue extraction from the actual contest form; no source or verification fields are consumed. */
export function parseAtCoderLanguages(problem: ProblemRef, html: string): LanguageOption[] {
	const task = /^https:\/\/atcoder\.jp\/contests\/([a-zA-Z0-9_-]+)\/tasks\/([a-zA-Z0-9_-]+)$/.exec(problem.url);
	if (problem.site !== 'atcoder' || !task || problem.nativeId !== task[1] + '/' + task[2]) { throw new Error('atcoder-task-route'); }
	if (html.length > 4 * 1024 * 1024 || !/<\/html\s*>/i.test(html)) { throw new Error('atcoder-form-incomplete'); }
	const inert = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<textarea\b[^>]*>[\s\S]*?<\/textarea\s*>/gi, '');
	if (/<input\b[^>]*\bname=["']username["']/i.test(inert)) { throw new Error('atcoder-login-required'); }
	const attrs = (source: string): Record<string, string> => {
		const result: Record<string, string> = Object.create(null);
		for (const match of source.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
			const key = match[1].toLowerCase(); if (Object.hasOwn(result, key)) { throw new Error('atcoder-form-invalid'); }
			result[key] = decodeAtCoderHTML(match[2] ?? match[3]);
		}
		return result;
	};
	const forms = [...inert.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)].filter(match => {
		const value = attrs(match[1]);
		try { const action = new URL(value.action ?? '', problem.url); return value.method?.toLowerCase() === 'post' && action.origin === 'https://atcoder.jp' && action.pathname === '/contests/' + task[1] + '/submit' && !action.username && !action.password && !action.search && !action.hash; } catch { return false; }
	});
	if (forms.length !== 1) { throw new Error('atcoder-form-invalid'); }
	const form = forms[0][2], selects = [...form.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select\s*>/gi)];
	const options = (body: string) => [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option\s*>/gi)];
	const targets = selects.filter(match => attrs(match[1]).name === 'data.TaskScreenName');
	const fixed = [...form.matchAll(/<input\b([^>]*)>/gi)].filter(match => attrs(match[1]).name === 'data.TaskScreenName');
	const selected = targets.length === 1 ? options(targets[0][2]).filter(match => /\bselected(?:\s|=|$)/i.test(match[1])) : [];
	const targetValue = selected.length === 1 ? attrs(selected[0][1]).value : fixed.length === 1 ? attrs(fixed[0][1]).value : undefined;
	if (targetValue !== task[2]) { throw new Error('atcoder-task-mismatch'); }
	// Official contest.js activates #select-lang-{task}; other tasks may have different directories.
	const groups = [...form.matchAll(/<div\b([^>]*)>([\s\S]*?)<\/div\s*>/gi)].filter(match => attrs(match[1]).id === 'select-lang-' + task[2]);
	if (groups.length > 1) { throw new Error('atcoder-language-unavailable'); }
	const activeSelects = groups.length === 1 ? [...groups[0][2].matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select\s*>/gi)] : selects.filter(match => attrs(match[1]).name !== 'data.TaskScreenName' && !/\bhidden(?:\s|=|$)/i.test(match[1]));
	const currentSelects = activeSelects.filter(match => (attrs(match[1]).class ?? '').split(/\s+/).includes('current'));
	const catalogues = (currentSelects.length ? currentSelects : activeSelects).map(match => options(match[2]).flatMap(option => {
		const value = attrs(option[1]), label = decodeAtCoderHTML(option[2].replace(/<[^>]*>/g, '')).trim();
		const family = /^C\+\+(?:\d|\s|\()/.test(label) ? 'cpp' as const : /^C(?:\d|\s|\()/.test(label) ? 'c' as const : undefined;
		return family && /^\d+$/.test(value.value) && !/\bdisabled(?:\s|=|$)/i.test(option[1]) ? [{ id: value.value, label, family }] : [];
	})).filter(options => options.length);
	if (!catalogues.length || catalogues.some(options => options.length > 100 || options.some(option => option.label.length > 200) || new Set(options.map(option => option.id)).size !== options.length) || catalogues.some(options => JSON.stringify(options) !== JSON.stringify(catalogues[0]))) { throw new Error('atcoder-language-unavailable'); }
	return catalogues[0];
}

/** AtCoder escapes source as HTML text; decode once, without executing a document. */
export function decodeAtCoderHTML(value: string): string {
	const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\u0027', nbsp: '\u00a0' };
	return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
		if (name[0] !== '#') { return named[name] ?? entity; }
		const number = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
		return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '\ufffd';
	});
}

/** Bounded, non-executing parsing of the official record's tables and escaped pre. */
export function parseAtCoderRecordHTML(record: RecordRef, html: string): RecordSnapshot {
	const route = detailRoute(record.url);
	if (!route || record.problem.site !== 'atcoder' || !new RegExp('^https://atcoder\\.jp/contests/' + route[1] + '/tasks/[a-zA-Z0-9_-]+$').test(record.problem.url) || record.id !== route[2] || html.length > 4 * 1024 * 1024) { throw new Error('atcoder-invalid-record'); }
	const text = (value: string) => decodeAtCoderHTML(value.replace(/<[^>]*>/g, '')).trim();
	const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)].map(match => match[1]);
	const infoHTML = tables.find(table => [...table.matchAll(/href=["']([^"']+)["']/gi)].some(match => {
		try { return new URL(decodeAtCoderHTML(match[1]), record.url).href === record.problem.url; } catch { return false; }
	}));
	if (!infoHTML) { throw new Error('atcoder-record-task-mismatch'); }
	const rows = (table: string) => [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map(cell => text(cell[1])));
	const info = rows(infoHTML);
	const rawStatus = text(/<[^>]+\bid=["']judge-status["'][^>]*>([\s\S]*?)<\//i.exec(html)?.[1] ?? '');
	const ownerLink = /href=["']\/users\/([^/"']+)["']/i.exec(infoHTML)?.[1];
	if (!ownerLink || !rawStatus || info.length > 1024) { throw new Error('atcoder-record-incomplete'); }
	const get = (labels: string[]) => info.find(row => labels.includes(row[0]))?.[1];
	let source: string | undefined;
	try { source = decodeAtCoderHTML(extractAtCoderSourceHTML(html)); } catch { /* A private source may be unavailable. */ }
	// allow-any-unicode-next-line -- Official Japanese compile-output heading.
	const compile = /<h4\b[^>]*>\s*(?:Compile Error|コンパイルエラー)\s*<\/h4>\s*<pre\b[^>]*>([\s\S]*?)<\/pre>/i.exec(html)?.[1];
	const tests = tables.filter(table => table !== infoHTML).flatMap(table => {
		const values = rows(table);
		// allow-any-unicode-next-line -- Official bilingual test-case column names.
		const header = values.findIndex(row => /^(Case Name|テストケース)$/.test(row[0] ?? '') && /^(Status|結果)$/.test(row[1] ?? '') && /^(Exec Time|実行時間)$/.test(row[2] ?? '') && /^(Memory|メモリ)$/.test(row[3] ?? ''));
		return header < 0 ? [] : values.slice(header + 1).filter(row => row.length >= 4);
	});
	if (tests.length > 1024 || [...tests, ...info].some(row => row.length > 16 || row.some(cell => cell.length > 8192)) || (source?.length ?? 0) > 1048576 || (compile?.length ?? 0) > 524288) { throw new Error('atcoder-record-too-large'); }
	return {
		ref: record, rawStatus, phase: /^(AC|WA|CE|RE|TLE|MLE|OLE|IE|QLE)$/.test(rawStatus) ? 'finished' : /^(WJ|Waiting)$/.test(rawStatus) ? 'queued' : /^(WR|Judging|\d+\s*\/\s*\d+.*)$/.test(rawStatus) ? 'judging' : 'unknown',
		// allow-any-unicode-next-line -- Official bilingual submission metadata labels.
		owner: decodeAtCoderHTML(ownerLink), language: get(['Language', '言語']), score: get(['Score', '得点']), time: get(['Exec Time', '実行時間']), memory: get(['Memory', 'メモリ']), submittedAt: get(['Submission Time', '提出日時']), codeLength: get(['Code Size', 'コード長']),
		...(source ? { source } : {}), ...(compile !== undefined ? { compileMessage: decodeAtCoderHTML(compile) } : {}), ...(rawStatus === 'CE' ? { compileSucceeded: false } : {}),
		groups: tests.length ? [{ name: 'Test Cases', rows: tests }] : [], sourceVerification: source ? 'not-checked' : 'unavailable'
	};
}

/** Accept only one plain escaped source pre, never a rendered editor subtree. */
export function extractAtCoderSourceHTML(html: string): string {
	const matches = [...html.matchAll(/<pre\b(?=[^>]*\bid\s*=\s*["']submission-code["'])[^>]*>([\s\S]*?)<\/pre\s*>/gi)];
	if (matches.length !== 1 || !matches[0][1] || /<[!/?a-zA-Z]/.test(matches[0][1])) { throw new Error('atcoder-source-unavailable'); }
	return matches[0][1];
}

/** Electron's main-process Response.url is unreliable; the caller must reject redirects at request time. */
export function checkAtCoderSourceResponse(response: Pick<Response, 'status' | 'headers' | 'body'>): void {
	const html = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'text/html';
	if (response.status !== 200 || !html || !response.body) {
		throw new Error(`atcoder-source-response status=${response.status} html=${html} body=${!!response.body}`);
	}
}

function detailRoute(value: string): RegExpExecArray | null {
	const url = new URL(value);
	if (url.origin !== 'https://atcoder.jp' || url.username || url.password) { return null; }
	return /^\/contests\/([a-zA-Z0-9_-]+)\/submissions\/([1-9][0-9]*)\/?$/.exec(url.pathname);
}

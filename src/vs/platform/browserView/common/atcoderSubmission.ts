/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal type-only OJ record contract.
import type { RecordRef, RecordSnapshot } from 'becoder-oj-connect';

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

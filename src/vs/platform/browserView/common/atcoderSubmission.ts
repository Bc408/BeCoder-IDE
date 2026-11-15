/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IAtCoderSubmissionPage {
	ownerWindowId: number;
	url(): string;
	loading(): boolean;
	closed(): boolean;
	watchChange(listener: () => void): { dispose(): void };
	read(script: string, signal?: AbortSignal): Promise<unknown>;
}

export interface IAtCoderSubmissionSnapshot {
	version: 1;
	url: string;
	capturedAt: string;
	contestId: string;
	taskUrl: string;
	source: string;
	submissionId: string;
	owner: string;
	viewerIdentity: 'unverified';
	status: string;
	info: string[][];
	tests: string[][];
	coverage: 'loaded-detail-only';
	sourceRepresentation: 'same-detail-html-decoded-pre' | 'unavailable';
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

/** Fixed DOM probe; sourceHTML is supplied from the same detail's unexecuted HTML. */
const detailScript = `(() => {
	const route = /^\\/contests\\/([a-zA-Z0-9_-]+)\\/submissions\\/([1-9][0-9]*)\\/?$/.exec(location.pathname);
	if (!route) { throw new Error('atcoder-route'); }
	const sourceHTML = null;
	if (typeof sourceHTML !== 'string') { throw new Error('atcoder-source-unavailable'); }
	const decoder = document.createElement('textarea');
	decoder.innerHTML = sourceHTML;
	const source = decoder.value;
	if (source !== null && source.length > 524288) { throw new Error('atcoder-too-large'); }
	const tables = Array.from(document.querySelectorAll('table'));
	const infoTable = tables.find(table => Array.from(table.querySelectorAll('a[href]')).some(a => new URL(a.getAttribute('href'), location.href).pathname.startsWith('/contests/' + route[1] + '/tasks/')));
	const links = Array.from(infoTable?.querySelectorAll('a[href]') ?? []).map(a => new URL(a.getAttribute('href'), location.href));
	const task = links.find(u => u.origin === location.origin && u.pathname.startsWith('/contests/' + route[1] + '/tasks/'));
	const owner = links.find(u => u.origin === location.origin && /^\\/users\\/[^/]+\\/?$/.test(u.pathname));
	const rows = table => Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table).map(row => Array.from(row.children).filter(cell => cell.tagName === 'TH' || cell.tagName === 'TD').map(cell => cell.innerText.trim()));
	const info = infoTable ? rows(infoTable) : [];
	const tests = tables.filter(table => table !== infoTable && !table.parentElement?.closest('table')).flatMap(rows);
	if (info.length + tests.length > 1024 || [...info, ...tests].some(row => row.length > 16 || row.some(cell => cell.length > 8192))) { throw new Error('atcoder-too-large'); }
	return { url: location.href, contestId: route[1], submissionId: route[2], taskUrl: task?.href ?? null, owner: owner ? decodeURIComponent(owner.pathname.split('/')[2]) : null,
		source, status: document.querySelector('#judge-status')?.innerText.trim() ?? null, info, tests };
})()`;

function detailRoute(value: string): RegExpExecArray | null {
	const url = new URL(value);
	if (url.origin !== 'https://atcoder.jp' || url.username || url.password) { return null; }
	return /^\/contests\/([a-zA-Z0-9_-]+)\/submissions\/([1-9][0-9]*)\/?$/.exec(url.pathname);
}

/** Experimental current-detail snapshot. The adapter owns the fixed-route source request and DOM read. */
export async function readAtCoderSubmission(page: IAtCoderSubmissionPage, windowId: number, expectedURL: string, timeoutMs = 10000, allowMissingSource = false): Promise<IAtCoderSubmissionSnapshot> {
	if (page.ownerWindowId !== windowId) { throw new Error('atcoder-owner'); }
	const route = detailRoute(expectedURL);
	if (!route) { throw new Error('atcoder-route'); }
	if (page.closed() || page.loading() || page.url() !== expectedURL) { throw new Error('atcoder-changed'); }
	let changed = false;
	const controller = new AbortController();
	let rejectChange: (error: Error) => void = () => { };
	const change = new Promise<never>((_, reject) => { rejectChange = reject; });
	const listener = page.watchChange(() => { changed = true; rejectChange(new Error('atcoder-changed')); });
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const raw = await Promise.race([
			page.read(detailScript, controller.signal), change,
			new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('atcoder-timeout')), timeoutMs); })
		]);
		if (changed || page.closed() || page.loading() || page.url() !== expectedURL) { throw new Error('atcoder-changed'); }
		if (!raw || typeof raw !== 'object' || new TextEncoder().encode(JSON.stringify(raw)).byteLength > 2 * 1024 * 1024) { throw new Error('atcoder-too-large'); }
		const value = raw as Record<string, unknown>;
		const rows = (input: unknown): input is string[][] => Array.isArray(input) && input.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string'));
		if (value.url !== expectedURL || value.contestId !== route[1] || value.submissionId !== route[2] ||
			typeof value.source !== 'string' || (!allowMissingSource && !value.source.trim()) || typeof value.owner !== 'string' || !value.owner ||
			typeof value.status !== 'string' || !value.status || typeof value.taskUrl !== 'string' ||
			!new RegExp('^https://atcoder\\.jp/contests/' + route[1] + '/tasks/[a-zA-Z0-9_-]+$').test(value.taskUrl) || !rows(value.info) || !rows(value.tests)) {
			throw new Error('atcoder-incomplete');
		}
		return {
			version: 1, url: expectedURL, capturedAt: new Date().toISOString(), contestId: route[1], submissionId: route[2],
			taskUrl: value.taskUrl, owner: value.owner, viewerIdentity: 'unverified', source: value.source,
			status: value.status, info: value.info, tests: value.tests, coverage: 'loaded-detail-only', sourceRepresentation: value.source.trim() ? 'same-detail-html-decoded-pre' : 'unavailable'
		};
	} finally {
		controller.abort();
		if (timer) { clearTimeout(timer); }
		listener.dispose();
	}
}

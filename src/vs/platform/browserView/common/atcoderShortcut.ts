/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { atCoderTask, atCoderSubmitURL } from './atcoderWorkflow.js';

export interface IAtCoderRecordLink { id: string; taskId: string; owner: string; languageId: string }
// eslint-disable-next-line local/code-import-patterns -- Internal type-only DTO shared with the bundled extension.
export type { IAtCoderShortcutResult } from 'becoder-oj-connect';

/** Only bounded own-list table rows are parsed; HTML is never executed. */
export function parseAtCoderRecords(html: string, contest: string): IAtCoderRecordLink[] {
	const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
	if (!/^[a-zA-Z0-9_-]+$/.test(contest) || !/<table\b/i.test(html) || !/Submission Time|\u63d0\u51fa\u65e5\u6642/.test(text) || !/Code Size|\u30b3\u30fc\u30c9\u9577/.test(text) || /<form[^>]+action=["'][^"']*\/login/i.test(html)) { throw new Error('atcoder-history-unavailable'); }
	const rows: IAtCoderRecordLink[] = [];
	for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
		const links = [...match[1].matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].flatMap(item => {
			try {
				const url = new URL(item[1].replace(/&amp;/g, '&'), 'https://atcoder.jp');
				return url.origin === 'https://atcoder.jp' && !url.username && !url.password ? [url] : [];
			} catch { return []; }
		});
		const id = links.map(url => new RegExp('^/contests/' + contest + '/submissions/([1-9][0-9]*)$').exec(url.pathname)?.[1]).find(Boolean);
		if (!id) { continue; }
		const task = links.map(url => new RegExp('^/contests/' + contest + '/tasks/([a-zA-Z0-9_-]+)$').exec(url.pathname)?.[1]).find(Boolean);
		const owner = links.map(url => /^\/users\/([^/]+)$/.exec(url.pathname)?.[1]).find(Boolean);
		const language = links.map(url => url.searchParams.get('f.Language')).find(value => value && /^\d+$/.test(value));
		if (!task || !owner || !language) { throw new Error('atcoder-history-incomplete'); }
		rows.push({ id, taskId: task, owner, languageId: language });
		if (rows.length > 100) { throw new Error('atcoder-history-too-large'); }
	}
	return rows.filter((row, index) => rows.findIndex(other => other.id === row.id) === index);
}

export function newAtCoderCandidates(rows: IAtCoderRecordLink[], baseline: string, task: string, language: string, owner?: string): IAtCoderRecordLink[] {
	return rows.filter(row => BigInt(row.id) > BigInt(baseline) && row.taskId === task && row.languageId === language && (!owner || row.owner === owner));
}

/** The normal own-list template supplies identity even before the account's first submission. */
export function atCoderHistoryOwner(html: string, rows: IAtCoderRecordLink[]): string {
	const owners = new Set(rows.map(row => row.owner));
	for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
		const match = /\buserScreenName\s*=\s*(["'])([a-zA-Z0-9_]*)\1/.exec(script[1]);
		if (match) { owners.add(match[2]); }
	}
	if (owners.size !== 1 || owners.has('')) { throw new Error('atcoder-account-ambiguous'); }
	return owners.values().next().value!;
}

export type AtCoderSendResult = { kind: 'pending' } | { kind: 'not-sent'; status: string } | { kind: 'unknown' } | { kind: 'response'; url: string; html: string };

/** Both probes and the send recheck the same initialized official form. */
function formGuard(taskURL: string, languageId: string): string {
	const task = atCoderTask(taskURL);
	if (!task || !/^\d+$/.test(languageId)) { throw new Error('atcoder-task-route'); }
	return `
		if (location.href !== ${JSON.stringify(atCoderSubmitURL(taskURL))}) { return 'atcoder-page-changed'; }
		const button = document.querySelector('#submit'), form = button?.form;
		if (!form || document.readyState === 'loading') { return 'atcoder-form-missing'; }
		const action = new URL(form.action);
		if (form.method.toLowerCase() !== 'post' || action.origin !== 'https://atcoder.jp' || action.pathname !== '/contests/' + ${JSON.stringify(task.contestId)} + '/submit' || form.enctype !== 'application/x-www-form-urlencoded') { return 'atcoder-form-mismatch'; }
		if (form.elements.namedItem('data.TaskScreenName')?.value !== ${JSON.stringify(task.taskId)}) { return 'atcoder-task-mismatch'; }
		const language = form.querySelectorAll('#select-lang select.current');
		if (language.length !== 1 || !Array.from(language[0].options).some(option => option.value === ${JSON.stringify(languageId)} && !option.disabled)) { return 'atcoder-language-changed'; }
		if (!form.elements.namedItem('csrf_token')?.value) { return 'atcoder-form-missing'; }
		const captcha = form.elements.namedItem('cf-turnstile-response');
		const verification = captcha || document.querySelector('.cf-turnstile') || Array.from(document.scripts).some(script => { try { return new URL(script.src).hostname === 'challenges.cloudflare.com'; } catch { return false; } });
		if (button.disabled || verification && !captcha?.value) { return false; }
		return true;
	`;
}

/** Does not return credentials, mutate the form, or send. */
export function atCoderReadinessScript(taskURL: string, languageId: string): string {
	return '(() => {' + formGuard(taskURL, languageId) + '})()';
}

/** One in-page request; source is serialized directly, independent of the website editor. */
export function atCoderSendScript(taskURL: string, source: string, languageId: string, requestId: string, expiresAt: number): string {
	const task = atCoderTask(taskURL);
	if (!task || !source.trim() || new TextEncoder().encode(source).byteLength > 1024 * 1024) { throw new Error('atcoder-source-invalid'); }
	return `(async () => {
		if (Date.now() >= ${expiresAt}) { return { kind: 'not-sent', status: 'atcoder-send-expired' }; }
		const ready = (() => { ${formGuard(taskURL, languageId)} })();
		if (ready === false) { return { kind: 'pending' }; }
		if (ready !== true) { return { kind: 'not-sent', status: ready }; }
		if (globalThis.__becoderAtCoderSent === ${JSON.stringify(requestId)}) { return { kind: 'unknown' }; }
		const button = document.querySelector('#submit'), form = button.form;
		const body = new FormData(form, button);
		body.set('data.TaskScreenName', ${JSON.stringify(task.taskId)});
		body.set('data.LanguageId', ${JSON.stringify(languageId)});
		body.set('sourceCode', ${JSON.stringify(source)});
		if (Array.from(body.values()).some(value => typeof value !== 'string')) { return { kind: 'not-sent', status: 'atcoder-form-encoding' }; }
		if (Date.now() >= ${expiresAt}) { return { kind: 'not-sent', status: 'atcoder-send-expired' }; }
		globalThis.__becoderAtCoderSent = ${JSON.stringify(requestId)};
		try {
			const response = await fetch(${JSON.stringify('https://atcoder.jp/contests/' + task.contestId + '/submit')}, { method: 'POST', body: new URLSearchParams(Array.from(body.entries())), credentials: 'same-origin', redirect: 'follow' });
			if (response.status !== 200 || response.url !== ${JSON.stringify('https://atcoder.jp/contests/' + task.contestId + '/submissions/me')} || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/html') { return { kind: 'unknown' }; }
			const html = await response.text();
			if (new TextEncoder().encode(html).byteLength > 4 * 1024 * 1024) { return { kind: 'unknown' }; }
			return { kind: 'response', url: response.url, html };
		} catch { return { kind: 'unknown' }; }
	})()`;
}

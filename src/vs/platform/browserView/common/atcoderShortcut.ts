/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IAtCoderRecordLink { id: string; taskId: string; owner: string; languageId: string }
// eslint-disable-next-line local/code-import-patterns -- Internal type-only DTO shared with the bundled extension.
export type { IAtCoderShortcutResult } from 'becoder-oj-connect';

/** Only bounded own-list table rows are parsed; HTML is never executed. */
export function parseAtCoderRecords(html: string, contest: string): IAtCoderRecordLink[] {
	const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
	if (!/^[a-zA-Z0-9_-]+$/.test(contest) || !/<table\b/i.test(html) || !/Submission Time|提出日時/.test(text) || !/Code Size|コード長/.test(text) || /<form[^>]+action=["'][^"']*\/login/i.test(html)) { throw new Error('atcoder-history-unavailable'); }
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

/** Native requestSubmit respects HTML validation and website handlers; no token is returned to the caller. */
export function atCoderSendScript(url: string, source: string, languageId: string, requestId: string): string {
	return `(() => {
		if (location.href !== ${JSON.stringify(url)}) { throw new Error('atcoder-page-changed'); }
		const requestId = ${JSON.stringify(requestId)};
		let state = globalThis.__becoderAtCoderSubmission;
		if (state?.requestId === requestId && state.sent) { return true; }
		const area = document.querySelector('#plain-textarea');
		const language = document.querySelector('#select-lang select.current');
		const button = document.querySelector('#submit');
		if (!area?.form || area.value !== ${JSON.stringify(source)} || language?.value !== ${JSON.stringify(languageId)} || button?.form !== area.form) { throw new Error('atcoder-submission-changed'); }
		const form = area.form;
		const expected = new URL(${JSON.stringify(url)});
		if (form.method.toLowerCase() !== 'post' || new URL(form.action).origin !== expected.origin || new URL(form.action).pathname !== expected.pathname.replace(/\\/tasks\\/[^/]+$/, '/submit')) { throw new Error('atcoder-form-mismatch'); }
		if (state?.requestId !== requestId) {
			state?.dispose();
			state = { requestId, form, sent: false, prompted: false, dispose: () => document.removeEventListener('submit', onSubmit, true) };
			const onSubmit = event => { if (event.target === form) { state.sent = true; } };
			document.addEventListener('submit', onSubmit, true);
			globalThis.__becoderAtCoderSubmission = state;
		}
		if (state.form !== form) { throw new Error('atcoder-form-changed'); }
		const captcha = form.elements.namedItem('cf-turnstile-response');
		if (button.disabled || (captcha && !captcha.value) || !form.checkValidity()) {
			if (!state.prompted) { button.scrollIntoView({ block: 'center' }); state.prompted = true; }
			return false;
		}
		state.sent = true;
		form.requestSubmit(button);
		return true;
	})()`;
}

/** Removes only this shortcut's passive native-submit observer; never submits. */
export function atCoderSendCleanupScript(requestId: string): string {
	return `(() => {
		const state = globalThis.__becoderAtCoderSubmission;
		if (state?.requestId === ${JSON.stringify(requestId)}) {
			state.dispose();
			delete globalThis.__becoderAtCoderSubmission;
		}
	})()`;
}

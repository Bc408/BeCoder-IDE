/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal type-only DTOs shared with the bundled extension.
import type { IAtCoderSourcePayload } from 'becoder-oj-connect';
// eslint-disable-next-line local/code-import-patterns -- Same canonical type-only contract, no runtime dependency.
export type { IAtCoderTaskForm, IAtCoderSourcePayload } from 'becoder-oj-connect';

export function atCoderTask(value: string): { contestId: string; taskId: string } | undefined {
	try {
		const url = new URL(value);
		const match = /^\/contests\/([a-zA-Z0-9_-]+)\/tasks\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname);
		if (url.origin === 'https://atcoder.jp' && !url.username && !url.password && match) { return { contestId: match[1], taskId: match[2] }; }
	} catch { /* Unsupported input is not a task. */ }
	return undefined;
}

/** The task identity remains logical; each submission owns this official form page. */
export function atCoderSubmitURL(taskURL: string): string {
	const task = atCoderTask(taskURL);
	if (!task) { throw new Error('atcoder-task-route'); }
	return 'https://atcoder.jp/contests/' + task.contestId + '/submit?taskScreenName=' + task.taskId;
}

/** Read the initialized native form without touching Ace, uploads, or the user's source. */
export function atCoderFormScript(url: string, payload?: IAtCoderSourcePayload): string {
	const task = atCoderTask(url);
	if (!task) { throw new Error('atcoder-task-route'); }
	if (payload && (!payload.source.trim() || new TextEncoder().encode(payload.source).byteLength > 1024 * 1024 || !/^[^\\/\x00-\x1f]+\.(cpp|cc|cxx|c)$/i.test(payload.fileName) || !/^\d+$/.test(payload.languageId))) { throw new Error('atcoder-source-invalid'); }
	return `(() => {
		if (location.href !== ${JSON.stringify(atCoderSubmitURL(url))}) { return 'atcoder-page-changed'; }
		const button = document.querySelector('#submit');
		const form = button?.form;
		if (!form) {
			const signedOut = Array.from(document.querySelectorAll('a[href]')).some(link => new URL(link.href).pathname === '/login');
			return signedOut ? 'atcoder-login-required' : 'atcoder-form-missing';
		}
		const action = new URL(form.action);
		if (form.method.toLowerCase() !== 'post' || action.origin !== 'https://atcoder.jp' || action.pathname !== '/contests/' + ${JSON.stringify(task.contestId)} + '/submit') { return 'atcoder-form-mismatch'; }
		if (form.elements.namedItem('data.TaskScreenName')?.value !== ${JSON.stringify(task.taskId)}) { return 'atcoder-task-mismatch'; }
		const selects = form.querySelectorAll('#select-lang select.current');
		if (document.readyState === 'loading' || selects.length !== 1) { return 'atcoder-form-missing'; }
		const language = selects[0];
		const languages = Array.from(language.options).filter(option => /^C(?:\\+\\+)?(?:\\d|\\s|\\()/.test(option.textContent.trim()) && !option.disabled && /^\\d+$/.test(option.value)).map(option => ({ id: option.value, label: option.textContent.trim() }));
		if (${JSON.stringify(payload?.languageId ?? null)} !== null && !languages.some(option => option.id === ${JSON.stringify(payload?.languageId ?? null)})) { return 'atcoder-language-changed'; }
		return { languages, hasDraft: !!form.elements.namedItem('sourceCode')?.value.trim() };
	})()`;
}

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

/** Uses the website's existing file-change handler; never submits the form or accesses credentials. */
export function atCoderFormScript(url: string, payload?: IAtCoderSourcePayload): string {
	const task = atCoderTask(url);
	if (!task) { throw new Error('atcoder-task-route'); }
	if (payload && (!payload.source.trim() || new TextEncoder().encode(payload.source).byteLength > 1024 * 1024 || !/^[^\\/\x00-\x1f]+\.(cpp|cc|cxx|c)$/i.test(payload.fileName) || !/^\d+$/.test(payload.languageId))) { throw new Error('atcoder-source-invalid'); }
	return `(async () => {
		const expectedURL = ${JSON.stringify(url)};
		const task = ${JSON.stringify(task)};
		const payload = ${JSON.stringify(payload ?? null)};
		if (location.href !== expectedURL) { throw new Error('atcoder-page-changed'); }
		const upload = document.querySelector('#input-open-file');
		if (!(upload instanceof HTMLInputElement) || upload.type !== 'file') { throw new Error('atcoder-login-or-form-required'); }
		const area = document.querySelector('#plain-textarea');
		if (!(area instanceof HTMLTextAreaElement)) { throw new Error('atcoder-source-control-missing'); }
		const form = area.form;
		if (!form || form.method.toLowerCase() !== 'post' || new URL(form.action).origin !== 'https://atcoder.jp' || new URL(form.action).pathname !== '/contests/' + task.contestId + '/submit') { throw new Error('atcoder-form-mismatch'); }
		if (!Array.from(form.querySelectorAll('input,select')).some(node => node.value === task.taskId)) { throw new Error('atcoder-task-mismatch'); }
		const selects = form.querySelectorAll('#select-lang select.current');
		if (selects.length !== 1) { throw new Error('atcoder-language-control-missing'); }
		const language = selects[0];
		const languages = Array.from(language.options).filter(option => /^C(?:\\+\\+)?(?:\\d|\\s|\\()/.test(option.textContent.trim()) && !option.disabled).map(option => ({ id: option.value, label: option.textContent.trim() }));
		const hasDraft = !!area.value.trim() || Array.from(document.querySelectorAll('#editor .ace_line')).some(line => !!line.textContent.trim());
		if (!payload) { return { languages, hasDraft }; }
		if (!languages.some(option => option.id === payload.languageId)) { throw new Error('atcoder-language-changed'); }
		if (hasDraft && !payload.replaceDraft) { throw new Error('atcoder-draft-exists'); }
		language.value = payload.languageId;
		language.dispatchEvent(new Event('change', { bubbles: true }));
		const transfer = new DataTransfer();
		transfer.items.add(new File([payload.source], payload.fileName, { type: 'text/plain' }));
		upload.files = transfer.files;
		upload.dispatchEvent(new Event('change', { bubbles: true }));
		const started = Date.now();
		while (area.value !== payload.source) {
			if (location.href !== expectedURL || Date.now() - started > 4000) { throw new Error('atcoder-source-not-confirmed'); }
			await new Promise(resolve => setTimeout(resolve, 25));
		}
		if (language.value !== payload.languageId) { throw new Error('atcoder-language-changed'); }
		area.closest('form').scrollIntoView({ block: 'end' });
		return { languages, hasDraft: true };
	})()`;
}

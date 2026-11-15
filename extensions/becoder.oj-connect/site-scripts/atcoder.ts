/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { type ProblemRef, type ProblemDocument, type LoginSummary, validateProblem } from '../src/domain';
import { atCoderProblem } from '../src/adapters/atcoder/task';
import { withOjRead } from './reads';

export async function readAtCoderProblem(problem: ProblemRef, requestId: string): Promise<ProblemDocument> {
	if (problem.site !== 'atcoder' || atCoderProblem(location.href)?.url !== problem.url) { throw new Error('AtCoder problem changed.'); }
	return withOjRead(requestId, async signal => {
		const response = await fetch(problem.url, { credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal });
		if (!response.ok) { throw new Error('AtCoder problem is unavailable.'); }
		const html = await response.text();
		if (html.length > 8 * 1024 * 1024) { throw new Error('AtCoder problem is too large.'); }
		if (atCoderProblem(location.href)?.url !== problem.url) { throw new Error('AtCoder problem changed.'); }
		const page = new DOMParser().parseFromString(html, 'text/html'), statement = page.querySelector('#task-statement');
		if (!statement) { throw new Error('AtCoder statement is unavailable.'); }
		const bodyHTML = (element: Element) => {
			const clone = element.cloneNode(true) as Element;
			for (const heading of clone.querySelectorAll('h3')) {
				if (/入力例|出力例|Sample Input|Sample Output/.test(heading.textContent ?? '') && heading.parentElement?.tagName === 'SECTION') {
					// Explanations and diagrams can share the sample's section.
					heading.parentElement.querySelector('pre')?.remove(); heading.remove();
				}
			}
			return clone.innerHTML;
		};
		const bodies = (['ja', 'en'] as const).flatMap(locale => {
			const element = statement.querySelector('.lang-' + locale);
			return element ? [{ locale, sections: [{ format: 'html' as const, content: bodyHTML(element) }] }] : [];
		});
		if (!bodies.length) { bodies.push({ locale: 'en', sections: [{ format: 'html', content: bodyHTML(statement) }] }); }
		const sampleRoot = statement.querySelector('.lang-ja') ?? statement.querySelector('.lang-en') ?? statement;
		const samples: { input: string; output: string }[] = [];
		const inputs = [...sampleRoot.querySelectorAll('h3')].filter(node => /入力例|Sample Input/.test(node.textContent ?? ''));
		const outputs = [...sampleRoot.querySelectorAll('h3')].filter(node => /出力例|Sample Output/.test(node.textContent ?? ''));
		if (inputs.length !== outputs.length) { throw new Error('AtCoder sample structure is incomplete.'); }
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i].parentElement?.querySelector('pre'), output = outputs[i].parentElement?.querySelector('pre');
			if (!input || !output) { throw new Error('AtCoder sample structure is incomplete.'); }
			samples.push({ input: input.textContent ?? '', output: output.textContent ?? '' });
		}
		const limitText = statement.previousElementSibling?.textContent ?? '';
		const limits: { label: string; value: string }[] = [];
		const time = /([0-9.]+)\s*sec/.exec(limitText), memory = /(\d+)\s*(Mi?B)/.exec(limitText);
		if (time) { limits.push({ label: 'Time Limit', value: time[1] + ' sec' }); }
		if (memory) { limits.push({ label: 'Memory Limit', value: memory[1] + ' ' + memory[2] }); }
		const heading = page.querySelector('h2, .h2');
		const title = heading ? [...heading.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() : '';
		const languages = [...(page.querySelector<HTMLSelectElement>('select[name="data.LanguageId"]')?.options ?? [])].flatMap(option => {
			const label = option.textContent?.trim() ?? '', family = label.startsWith('C++') ? 'cpp' : /^C(?:\d|\s|$)/.test(label) ? 'c' : undefined;
			return !option.disabled && family && /^\d+$/.test(option.value) ? [{ id: option.value, label, family }] : [];
		});
		return validateProblem({ ref: problem, title: title || problem.nativeId, bodies, samples, limits, languages, interactive: /(?:interactive|reactive) (?:task|problem)/i.test(statement.textContent ?? '') });
	});
}

function loginSummary(page: Document): LoginSummary {
	for (const script of page.scripts) {
		const match = /\buserScreenName\s*=\s*(["'])([a-zA-Z0-9_]*)\1/.exec(script.textContent ?? '');
		if (match) { return match[2] ? { site: 'atcoder', state: 'signed-in', label: match[2] } : { site: 'atcoder', state: 'signed-out' }; }
	}
	return { site: 'atcoder', state: 'unknown' };
}

async function accountPage(signal: AbortSignal): Promise<Document> {
	const response = await fetch('/', { credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal });
	if (!response.ok) { throw new Error('AtCoder account is unavailable.'); }
	const html = await response.text();
	if (html.length > 8 * 1024 * 1024) { throw new Error('AtCoder account page is too large.'); }
	return new DOMParser().parseFromString(html, 'text/html');
}

export async function readAtCoderLogin(_input: unknown, requestId: string): Promise<LoginSummary> {
	if (location.origin !== 'https://atcoder.jp') { throw new Error('AtCoder page changed.'); }
	return withOjRead(requestId, async signal => loginSummary(await accountPage(signal)));
}

export async function logoutAtCoder(_input: unknown, requestId: string): Promise<boolean> {
	if (location.origin !== 'https://atcoder.jp') { throw new Error('AtCoder page changed.'); }
	return withOjRead(requestId, async signal => {
		const page = await accountPage(signal);
		// Verified against the official homepage: POST /logout + hidden csrf_token.
		const form = [...page.forms].find(form => form.method.toLowerCase() === 'post' && new URL(form.getAttribute('action') ?? '', location.origin).href === 'https://atcoder.jp/logout');
		const token = form?.querySelector<HTMLInputElement>('input[type="hidden"][name="csrf_token"]')?.value;
		if (!token) { throw new Error('AtCoder sign out form is unavailable.'); }
		signal.throwIfAborted();
		const response = await fetch('/logout', { method: 'POST', credentials: 'same-origin', redirect: 'follow', signal,
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf_token: token }).toString() });
		if (!response.ok || loginSummary(await accountPage(signal)).state !== 'signed-out') { throw new Error('AtCoder sign out could not be confirmed.'); }
		return true;
	});
}

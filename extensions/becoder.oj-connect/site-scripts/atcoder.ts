/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ProblemRef, type Section, validateProblem } from '../src/domain';
import { atCoderProblem } from '../src/adapters/atcoder/task';
import { formatTime, formatMemory } from './limits';

/** Parses one supplied original document; never fetches or attaches its nodes. */
export function parseAtCoderProblem(problem: ProblemRef, html: string): import('becoder-oj-connect').ProblemDocument {
	if (problem.site !== 'atcoder' || atCoderProblem(problem.url)?.nativeId !== problem.nativeId || html.length > 8 * 1024 * 1024) { throw new Error('oj-connect-problem-route'); }
	const page = new DOMParser().parseFromString(html, 'text/html'), statement = page.querySelector('#task-statement');
	if (!statement) { throw new Error('AtCoder statement is unavailable.'); }
	const bodyHTML = (element: Element) => {
		const clone = element.cloneNode(true) as Element;
		const explanations: Section[] = [];
		for (const heading of clone.querySelectorAll('h3')) {
			const sample = /^(?:\u5165\u529b\u4f8b|\u51fa\u529b\u4f8b|Sample Input|Sample Output)\s*(\d+)/.exec(heading.textContent?.trim() ?? '');
			if (sample && heading.parentElement?.tagName === 'SECTION') {
				const section = heading.parentElement;
				section.querySelector('pre')?.remove(); heading.remove();
				if (section.textContent?.trim() || section.querySelector('img,table')) { explanations.push({ kind: 'sample-explanation', sampleIndex: Number(sample[1]) - 1, format: 'html', content: section.innerHTML }); }
				section.remove();
			}
		}
		// Official top-level task sections share Luogu's hierarchy; prose stays in its selected language.
		const headings: Record<string, string> = {
			'Problem Statement': '\u9898\u76ee\u63cf\u8ff0', '\u554f\u984c\u6587': '\u9898\u76ee\u63cf\u8ff0',
			Input: '\u8f93\u5165\u683c\u5f0f', '\u5165\u529b': '\u8f93\u5165\u683c\u5f0f',
			Output: '\u8f93\u51fa\u683c\u5f0f', '\u51fa\u529b': '\u8f93\u51fa\u683c\u5f0f',
			Notes: '\u8bf4\u660e/\u63d0\u793a'
		};
		const notes: Section[] = [];
		for (const heading of clone.querySelectorAll('section > h3')) {
			if (heading.closest('pre, code')) { continue; }
			const title = heading.textContent?.trim() ?? '';
			const replacement = page.createElement('h2');
			for (const attribute of heading.attributes) { replacement.setAttribute(attribute.name, attribute.value); }
			if (headings[title]) { replacement.textContent = headings[title]; }
			else { replacement.innerHTML = heading.innerHTML; }
			heading.replaceWith(replacement);
			if (title === 'Notes') {
				const section = replacement.parentElement!;
				notes.push({ kind: 'notes', format: 'html', content: section.outerHTML }); section.remove();
			}
		}
		for (const node of [...clone.children]) { if (node.tagName === 'HR' || (!node.textContent?.trim() && !node.querySelector('img,pre,table,var'))) { node.remove(); } }
		return [{ format: 'html' as const, content: clone.innerHTML }, ...explanations, ...notes];
	};
	const bodies = (['ja', 'en'] as const).flatMap(locale => {
		const element = statement.querySelector('.lang-' + locale);
		return element ? [{ locale, sections: bodyHTML(element) }] : [];
	});
	if (!bodies.length) { bodies.push({ locale: 'en', sections: bodyHTML(statement) }); }
	const sampleRoot = statement.querySelector('.lang-ja') ?? statement.querySelector('.lang-en') ?? statement;
	const samples: { input: string; output: string }[] = [];
	const inputs = [...sampleRoot.querySelectorAll('h3')].filter(node => /\u5165\u529b\u4f8b|Sample Input/.test(node.textContent ?? ''));
	const outputs = [...sampleRoot.querySelectorAll('h3')].filter(node => /\u51fa\u529b\u4f8b|Sample Output/.test(node.textContent ?? ''));
	if (inputs.length !== outputs.length) { throw new Error('AtCoder sample structure is incomplete.'); }
	for (let i = 0; i < inputs.length; i++) {
		const input = inputs[i].parentElement?.querySelector('pre'), output = outputs[i].parentElement?.querySelector('pre');
		if (!input || !output) { throw new Error('AtCoder sample structure is incomplete.'); }
		samples.push({ input: input.textContent ?? '', output: output.textContent ?? '' });
	}
	const limitText = statement.previousElementSibling?.textContent ?? '';
	const limits: { label: string; value: string }[] = [];
	const time = /(?:^|[:\uFF1A])\s*(\d+(?:\.\d+)?)\s*sec\b/.exec(limitText), memory = /(?:^|[:\uFF1A])\s*(\d+(?:\.\d+)?)\s*(MiB|MB)\b/.exec(limitText);
	const timeMs = time ? Number(time[1]) * 1000 : NaN, memoryBytes = memory ? Number(memory[1]) * (memory[2] === 'MiB' ? 2 ** 20 : 1e6) : NaN;
	if (Number.isFinite(timeMs) && timeMs > 0) { limits.push({ label: 'Time Limit', value: formatTime(timeMs) }); }
	if (Number.isFinite(memoryBytes) && memoryBytes > 0) { limits.push({ label: 'Memory Limit', value: formatMemory(memoryBytes) }); }
	const heading = page.querySelector('h2, .h2');
	const officialTitle = heading ? [...heading.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() : '';
	const prefix = problem.nativeId.split('_').at(-1)! + ' - ';
	const title = officialTitle.toLowerCase().startsWith(prefix.toLowerCase()) ? officialTitle.slice(prefix.length) : officialTitle;
	const languages = [...(page.querySelector<HTMLSelectElement>('select[name="data.LanguageId"]')?.options ?? [])].flatMap(option => {
		const label = option.textContent?.trim() ?? '', family = label.startsWith('C++') ? 'cpp' : /^C(?:\d|\s|$)/.test(label) ? 'c' : undefined;
		return !option.disabled && family && /^\d+$/.test(option.value) ? [{ id: option.value, label, family }] : [];
	});
	const document = validateProblem({ ref: problem, title: title || problem.nativeId, bodies, samples, limits, languages, interactive: /(?:interactive|reactive) (?:task|problem)/i.test(statement.textContent ?? '') });
	return document;
}

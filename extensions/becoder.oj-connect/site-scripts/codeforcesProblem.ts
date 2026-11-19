/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { codeforcesProblem } from '../src/adapters/codeforces/task';
import { object, text, validateProblem, validateProblemRef, type Section } from '../src/domain';
import { formatTime, formatMemory } from './limits';

function statementMath(root: Element): void {
	for (const rendered of root.querySelectorAll('.MathJax_Preview, .MathJax, .MathJax_Display, .MathJax_SVG, .MathJax_CHTML')) { if (!rendered.closest('pre, code')) { rendered.remove(); } }
	for (const script of root.querySelectorAll('script[type="math/tex"], script[type="math/tex; mode=display"]')) {
		if (script.closest('pre, code')) { continue; }
		const formula = root.ownerDocument.createElement('var');
		formula.textContent = script.textContent;
		if (script.getAttribute('type')?.includes('mode=display')) { formula.className = 'oj-math-display'; }
		script.replaceWith(formula);
	}
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes: Text[] = [];
	while (walker.nextNode()) { nodes.push(walker.currentNode as Text); }
	for (const node of nodes) {
		if (node.parentElement?.closest('pre, code, script, style, var')) { continue; }
		// Official tex2jax uses six dollars for display and three for inline formulas.
		const pattern = /(\${6}|\${3})([\s\S]*?)\1/g, content = node.data;
		let offset = 0;
		const fragment = root.ownerDocument.createDocumentFragment();
		for (const match of content.matchAll(pattern)) {
			fragment.append(root.ownerDocument.createTextNode(content.slice(offset, match.index)));
			const formula = document.createElement('var'); formula.textContent = match[2];
			if (match[1].length === 6) { formula.className = 'oj-math-display'; }
			fragment.append(formula); offset = match.index! + match[0].length;
		}
		if (offset) { fragment.append(root.ownerDocument.createTextNode(content.slice(offset))); node.replaceWith(fragment); }
	}
}

function organizeCodeforcesProblem(problem: import('becoder-oj-connect').ProblemRef, companion: Record<string, unknown>, page: Document): import('becoder-oj-connect').ProblemDocument {
	const current = page.querySelector('.problem-statement');
	if (!current || !current.querySelector(':scope > .header > .title') || !Array.isArray(companion.tests) || typeof companion.interactive !== 'boolean') { throw new Error('Codeforces statement is unavailable.'); }
	const statement = current.cloneNode(true) as Element;
	statementMath(statement);
	const sections: Section[] = [];
	const body = statement.cloneNode(true) as Element;
	for (const child of [...body.children]) {
		if (child.matches('.header, .input-specification, .output-specification, .sample-tests, .note')) { child.remove(); }
	}
	sections.push({ heading: '\u9898\u76ee\u63cf\u8ff0', format: 'html', content: body.innerHTML });
	for (const [selector, heading, notes] of [
		['.input-specification', '\u8f93\u5165\u683c\u5f0f', false],
		['.output-specification', '\u8f93\u51fa\u683c\u5f0f', false],
		['.note', '\u8bf4\u660e/\u63d0\u793a', true]
	] as const) {
		for (const element of statement.querySelectorAll(':scope > ' + selector)) {
			const clone = element.cloneNode(true) as Element;
			clone.querySelector(':scope > .section-title')?.remove();
			sections.push({ heading, format: 'html', content: clone.innerHTML, ...(notes ? { kind: 'notes' as const } : {}) });
		}
	}
	const limits: { label: string; value: string }[] = [];
	for (const [key, label, format] of [['timeLimit', 'Time Limit', formatTime], ['memoryLimit', 'Memory Limit', (memory: number) => formatMemory(memory * 2 ** 20)]] as const) {
		const limit = companion[key];
		if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) { limits.push({ label, value: format(limit) }); }
	}
	const title = text(companion.name, 2048), prefix = problem.nativeId.split('/').at(-1)! + '. ';
	const result = validateProblem({ ref: problem, title: title.startsWith(prefix) ? title.slice(prefix.length) : title, bodies: [{ locale: page.documentElement.lang || 'en', sections }], samples: companion.tests, limits, interactive: companion.interactive });
	return result;
}

/** Parses the same original HTML used by the fixed CPH parser. */
export function parseCodeforcesProblem(input: unknown, html: string): import('becoder-oj-connect').ProblemDocument {
	const value = object(input), problem = validateProblemRef(value.problem), companion = object(value.companion);
	if (problem.site !== 'codeforces' || codeforcesProblem(text(companion.url))?.url !== problem.url || html.length > 8 * 1024 * 1024) { throw new Error('oj-connect-problem-route'); }
	return organizeCodeforcesProblem(problem, companion, new DOMParser().parseFromString(html, 'text/html'));
}

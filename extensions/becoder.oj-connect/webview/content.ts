/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import DOMPurify from 'dompurify';
import katex from 'katex';
import hljs from 'highlight.js/lib/common';

const math = (value: string, displayMode = false) => katex.renderToString(value, { displayMode, throwOnError: false, trust: false, strict: 'ignore', maxExpand: 1000 });
/** Treat all site HTML as hostile. No scripts, forms, embeds, event handlers or command links. */
export function renderContent(content: string, baseURL: string): DocumentFragment {
	const clean = DOMPurify.sanitize(content, {
		RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select'],
		FORBID_ATTR: ['style', 'srcset', 'id', 'name'], ALLOW_DATA_ATTR: false
	});
	for (const element of clean.querySelectorAll('[href], [src]')) {
		for (const attr of ['href', 'src']) {
			if (!element.hasAttribute(attr)) { continue; }
			try {
				const url = new URL(element.getAttribute(attr)!, baseURL);
				if (url.protocol !== 'https:' || url.username || url.password) { throw new Error('Invalid content URL'); }
				element.setAttribute(attr, url.href);
			} catch { element.removeAttribute(attr); }
		}
	}
	for (const variable of clean.querySelectorAll('var')) {
		if (variable.closest('pre, code')) { continue; }
		const span = document.createElement('span');
		span.innerHTML = math(variable.textContent ?? '', variable.classList.contains('oj-math-display'));
		variable.replaceWith(span);
	}
	highlightCodeBlocks(clean);
	return clean;
}

/** Preserve existing PHP/other language support when upstream Shiki leaves a fence plain. */
export function highlightCodeBlocks(root: ParentNode): void {
	for (const pre of root.querySelectorAll('pre')) {
		let code = pre.querySelector('code');
		if (!code) {
			code = document.createElement('code');
			code.append(...pre.childNodes); pre.append(code);
		}
		const language = code && [...code.classList].find(name => name.startsWith('language-'))?.slice('language-'.length);
		if (!pre.classList.contains('shiki') && language && hljs.getLanguage(language)) { hljs.highlightElement(code); }
	}
}

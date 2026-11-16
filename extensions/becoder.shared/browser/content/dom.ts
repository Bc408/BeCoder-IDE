/* Copyright (c) BeCoder contributors. MIT License. See ../../LICENSE. */
import type { Root, RootContent } from 'hast';
import { find, html, svg } from 'property-information';

/** Only accepts the shared parser's already sanitized HAST, never website DOM. */
export function contentFragment(tree: Root) {
	const fragment = document.createDocumentFragment();
	const append = (parent: DocumentFragment | Element, children: readonly RootContent[], namespace?: string) => {
		for (const child of children) {
			if (child.type === 'text') { parent.append(document.createTextNode(child.value)); continue; }
			if (child.type !== 'element') { continue; }
			const ns = child.tagName === 'svg' ? 'http://www.w3.org/2000/svg' : child.tagName === 'math' ? 'http://www.w3.org/1998/Math/MathML' : namespace;
			const element = ns ? document.createElementNS(ns, child.tagName) : document.createElement(child.tagName);
			for (const [key, value] of Object.entries(child.properties ?? {})) {
				if (value === undefined || value === null || value === false) { continue; }
				const info = find(ns === 'http://www.w3.org/2000/svg' ? svg : html, key);
				const attribute = info.attribute;
				element.setAttribute(attribute, Array.isArray(value) ? value.join(info.commaSeparated ? ',' : ' ') : value === true ? '' : String(value));
			}
			append(element, child.children, ns);
			parent.append(element);
		}
	};
	append(fragment, tree.children);
	return fragment;
}

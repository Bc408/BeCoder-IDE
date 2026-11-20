/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Element, Nodes, Root } from 'hast';

// allow-any-unicode-next-line
const sectionNames = new Set(['题目背景', '题目描述', '问题描述', '输入描述', '输入格式', '输出描述', '输出格式', '说明/提示', '说明', '提示', '备注', '样例说明', '数据范围', '评测用例规模与约定']);

function headingAnchor(node: Nodes): boolean {
	return node.type === 'element' && node.tagName === 'a' && Array.isArray(node.properties.className) && node.properties.className.includes('heading-anchor') && node.properties.ariaHidden === 'true' && node.properties.tabIndex === -1;
}

function plainLabel(node: Nodes): string | undefined {
	if (node.type === 'text') { return node.value; }
	if (headingAnchor(node)) { return ''; }
	if (node.type !== 'element' || !/^(?:p|h[1-6]|strong|em)$/.test(node.tagName)) { return undefined; }
	const values = node.children.map(plainLabel);
	return values.some(value => value === undefined) ? undefined : values.join('');
}

/** Presentation only: keep the single parsed document, fragment IDs and cached input untouched. */
export function lanqiaoStatement(tree: Root, title?: string): Root {
	const referenced = new Set<string>(), stack: Nodes[] = [...tree.children];
	while (stack.length) {
		const node = stack.pop()!;
		if (node.type !== 'element') { continue; }
		const href = node.properties.href;
		if (node.tagName === 'a' && !headingAnchor(node) && typeof href === 'string' && href.startsWith('#')) {
			try { referenced.add(decodeURIComponent(href.slice(1))); } catch { /* Preserve malformed links as supplied by the content policy. */ }
		}
		for (const child of node.children) { stack.push(child); }
	}
	const first = tree.children.findIndex(node => node.type !== 'text' || node.value.trim());
	const firstNode = tree.children[first];
	const isHeading = (node: Nodes): node is Element => node.type === 'element' && /^h[1-6]$/.test(node.tagName);
	const hasMainSection = tree.children.slice(first + 1).some(node => isHeading(node) && sectionNames.has(plainLabel(node)?.trim() ?? ''));
	const omitTitle = title !== undefined && firstNode?.type === 'element' && plainLabel(firstNode)?.trim() === title.trim() && !sectionNames.has(title.trim()) && hasMainSection && !referenced.has(String(firstNode.properties.id));
	const children = tree.children.filter((_, index) => !omitTitle || index !== first);
	const depth = children.reduce((value, node) => isHeading(node) ? Math.min(value, Number(node.tagName[1])) : value, Infinity);
	const omit = new Set<number>();
	const normalized = children.map((node, index) => {
		if (!isHeading(node) || Number(node.tagName[1]) !== depth) { return node; }
		const label = plainLabel(node)?.trim();
		if (!label || !sectionNames.has(label)) { return node; }
		let next = index + 1;
		while (children[next]?.type === 'text') {
			const sibling = children[next];
			if (sibling.type !== 'text' || sibling.value.trim()) { break; }
			next++;
		}
		const paragraph = children[next];
		if (paragraph?.type === 'element' && paragraph.tagName === 'p' && paragraph.properties.id === undefined && plainLabel(paragraph)?.trim() === label) { omit.add(next); }
		return { ...node, tagName: 'h2', children: node.children.filter(child => !headingAnchor(child)) };
	});
	return { ...tree, children: normalized.filter((_, index) => !omit.has(index)) };
}

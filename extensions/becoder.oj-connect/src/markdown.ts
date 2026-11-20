/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2018 引领天下. MIT License.
 *  Adapted from yltx/vscode-luogu v4.20.0 (987ca974b5419230a07b59a195ec44026e16f6f4).
 *  BeCoder changes: shared OJ integration and localization. See ThirdPartyNotices.txt.
 *--------------------------------------------------------------------------------------------*/

import { parseMarkdown, parseHtml } from 'becoder-content';
import type { Root } from 'hast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';

let lanqiaoMathParser: ReturnType<typeof percentageParser> | undefined;
function percentageParser() { return unified().use(remarkParse).use(remarkMath); }

function lanqiaoPercentages(markdown: string): string {
	if (!markdown.includes('\\\\%')) { return markdown; }
	const tree = (lanqiaoMathParser ??= percentageParser()).parse(markdown);
	const ranges: { start: number; end: number }[] = [];
	let hasHtml = false;
	visit(tree, node => {
		// Mixed author HTML stays untouched, including math-looking text inside inline code tags.
		if (node.type === 'html') { hasHtml = true; }
		if (node.type === 'inlineMath' && /^[\t ]*\d+(?:\.\d+)?[\t ]*\\\\%[\t ]*$/.test(node.value)) {
			const start = node.position?.start.offset, end = node.position?.end.offset;
			if (start !== undefined && end !== undefined && /^(\$+)[\t ]*\d+(?:\.\d+)?[\t ]*\\\\%[\t ]*\1$/.test(markdown.slice(start, end))) { ranges.push({ start, end }); }
		}
	});
	if (hasHtml || !ranges.length) { return markdown; }
	const parts: string[] = [];
	let cursor = 0;
	for (const { start, end } of ranges.sort((left, right) => left.start - right.start)) {
		parts.push(markdown.slice(cursor, start), markdown.slice(start, end).replace('\\\\%', '\\%'));
		cursor = end;
	}
	return parts.join('') + markdown.slice(cursor);
}

/** The shared pipeline cleans author HTML once, before generating trusted math. */
export function renderMarkdownTree(markdown: string, lanqiao = false): Root {
	return parseMarkdown(lanqiao ? lanqiaoPercentages(markdown) : markdown, { dialect: 'luogu' });
}

export function renderHtmlTree(html: string, baseURL: string): Root {
	return parseHtml(html, baseURL);
}

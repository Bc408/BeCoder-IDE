/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the MIT License. See LICENSE in the component root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 * Copyright (c) 2026 Federico2903. MIT License. See LICENSE.luogu-markdown.txt.
 * Adapted from @luogu-saver-next/markdown-renderer 1.0.3 (laikit-dev/luogu-saver).
 * BeCoder changes: shared synchronous AST pipeline; author-content policies;
 * native callouts, safe embeds and unhighlighted code; no HTML output round trip.
 *--------------------------------------------------------------------------------------------*/

import { unified, type Processor } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkDirective from 'remark-directive';
import remarkSmartypants from 'remark-smartypants';
import remarkBreaks from 'remark-breaks';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { visit } from 'unist-util-visit';
import { VFile } from 'vfile';
import { fromHtml } from 'hast-util-from-html';
import { normalizeMath } from './math';
import type { Root, Element, Properties } from 'hast';
import type { Root as MarkdownRoot } from 'mdast';
import type { Node, Data } from 'unist';

// These transformations intentionally mutate remark directive/table extension fields.
// Keep their third-party AST fields local; public render results use the HAST Root contract.
type MutableNode = Node & {
	value?: string;
	children?: MutableNode[];
	tagName?: string;
	properties?: Properties;
	name?: string;
	attributes?: Record<string, string | boolean | null | undefined> | null;
	url?: string;
	alt?: string | null;
	title?: string | null;
	data?: Data & { hName?: string; hProperties?: Properties; directiveLabel?: boolean | null };
};
type MarkdownProcessor = Processor<MarkdownRoot, MarkdownRoot, Root>;
type MathFence = { offset: number; length: number; end?: number };
type TextOffsetLookup = (offset: number) => boolean;

const luoguCaptchaUrlFragment = 'https://www.luogu.com.cn/lg4/captcha';
// Lucide pin SVG, ISC; upstream f6571da835fb5c9766dbceb295b8eecefa0791cb.
// Copyright (c) 2026 Lucide Icons and Contributors. See LICENSE.lucide.txt.
const headingAnchorIcon: Element = {
	type: 'element',
	tagName: 'svg',
	properties: {
		className: ['heading-pin-icon', 'lucide', 'lucide-pin'],
		xmlns: 'http://www.w3.org/2000/svg',
		width: 24,
		height: 24,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 2,
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
		ariaHidden: 'true',
		focusable: 'false'
	},
	children: [
		{
			type: 'element',
			tagName: 'path',
			properties: { d: 'M12 17v5' },
			children: []
		},
		{
			type: 'element',
			tagName: 'path',
			properties: {
				d: 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'
			},
			children: []
		}
	]
};


// Author CSS is removed before trusted formula/container markup is generated.
// Parse5 (inside rehype-raw/from-html) resolves duplicate attributes exactly once.
const schema = {
	...defaultSchema,
	attributes: {
		...Object.fromEntries(Object.entries((defaultSchema.attributes ?? {})).map(([tag, attributes]) => [tag, attributes.filter(attribute => (Array.isArray(attribute) ? attribute[0] : attribute) !== 'style')])),
		'*': ['className'],
		div: ['className', 'dataAuthor', 'dataTitle', 'dataOpen'],
		span: ['className'],
		pre: ['className'],
		code: ['className'],
		var: ['className'],
		th: ['align', 'className', 'rowSpan', 'colSpan'],
		td: ['align', 'className', 'rowSpan', 'colSpan'],
		details: ['className', 'open'],
		summary: ['className']
	},
	tagNames: [...(defaultSchema.tagNames ?? []), 'div', 'span', 'var', 'details', 'summary'],
	strip: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select']
};

let beaconProcessor: MarkdownProcessor;
let luoguProcessor: MarkdownProcessor;

function classes(node: MutableNode): string[] {
	const value = node.properties?.className;
	return Array.isArray(value) ? value as string[] : typeof value === 'string' ? value.split(/\s+/) : [];
}

function plainText(node: MutableNode): string {
	return node.type === 'text' ? node.value! : (node.children ?? []).map(plainText).join('');
}

function omitDirectivesAndImages(beacon: boolean) {
	return () => (tree: MutableNode) => {
		const clean = (parent: MutableNode) => {
			parent.children = (parent.children ?? []).filter((node: MutableNode) => !(beacon && node.type === 'image') && !(!beacon && node.type === 'leafDirective' && node.name === 'anti-ai'));
			for (const node of parent.children) {
				if (node.children) { clean(node); }
			}
		};
		clean(tree);
	};
}

function adaptAuthorHtml() {
	return (tree: MutableNode) => {
		visit(tree, 'element', (node: MutableNode) => {
			if (node.tagName !== 'iframe') { return; }
			const href = safeUrl(node.properties?.src, 'https://www.luogu.com.cn');
			node.tagName = href ? 'a' : 'span';
			node.properties = href ? { href } : {};
			node.children = [{ type: 'text', value: href ? '\u5728\u6d4f\u89c8\u5668\u4e2d\u6253\u5f00\u5d4c\u5165\u5185\u5bb9' : '\u5d4c\u5165\u5185\u5bb9\u4e0d\u53ef\u7528' }];
		});
	};
}

function safeUrl(value: unknown, baseURL?: string) {
	if (typeof value !== 'string') { return undefined; }
	try {
		const url = new URL(value, baseURL);
		return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
	} catch { return undefined; }
}

function normalizeUrls(baseURL?: string) {
	return (tree: MutableNode, file: VFile) => {
		visit(tree, 'element', (node: MutableNode) => {
			for (const key of ['href', 'src']) {
				const value = node.properties?.[key];
				if (value === undefined || key === 'href' && typeof value === 'string' && value.startsWith('#')) { continue; }
				const url = safeUrl(value, baseURL || (typeof file.data.baseURL === 'string' ? file.data.baseURL : undefined));
				if (url) { node.properties![key] = url; }
				else { delete node.properties![key]; }
			}
		});
	};
}

function nativeContainers() {
	return (tree: MutableNode) => {
		visit(tree, 'element', (node: MutableNode) => {
			const names = classes(node);
			if (names.includes('md-epigraph')) {
				const author = node.properties!.dataAuthor as string;
				delete node.properties!.dataAuthor;
				node.children = [{ type: 'element', tagName: 'div', properties: { className: ['epigraph-body'] }, children: node.children }];
				if (author) { node.children.push({ type: 'element', tagName: 'span', properties: { className: ['epigraph-author'] }, children: [{ type: 'text', value: author }] }); }
			}
			const kind = names.find(name => ['info', 'warning', 'success', 'error'].includes(name));
			if (!kind || !names.includes('md-block')) { return; }
			const title = names.includes('has-title-children') ? node.children!.splice(0, 1).flatMap((child: MutableNode) => child.children ?? [child]) : [{ type: 'text', value: node.properties!.dataTitle as string || kind.toUpperCase() }];
			const body = node.children;
			node.tagName = 'details';
			node.properties = { className: names.filter(name => name !== 'has-title-children'), open: node.properties!.dataOpen === 'true' };
			node.children = [
				{ type: 'element', tagName: 'summary', properties: { className: ['md-block-title'] }, children: [{ type: 'element', tagName: 'span', properties: {}, children: title }] },
				{ type: 'element', tagName: 'div', properties: { className: ['md-block-body'] }, children: body }
			];
		});
	};
}

function contentStructure() {
	return (tree: MutableNode) => {
		const walk = (parent: MutableNode) => {
			delete parent.position;
			delete parent.data;
			parent.children = parent.children!.map((node: MutableNode) => {
				delete node.position;
				delete node.data;
				if (node.type !== 'element') { return node; }
				if (node.tagName === 'pre' && !node.children!.some((child: MutableNode) => child.type === 'element' && child.tagName === 'code')) {
					node.children = [{ type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: plainText(node) }] }];
				}
				walk(node);
				return node.tagName === 'table' ? { type: 'element', tagName: 'div', properties: { className: ['table-container'] }, children: [node] } : node;
			});
		};
		walk(tree);
	};
}

function mathExpressions() {
	return (tree: MutableNode) => {
		const walk = (parent: MutableNode) => {
			parent.children = parent.children!.map((child: MutableNode) => {
				if (child.type !== 'element') { return child; }
				const expression = child.tagName === 'pre' ? child.children!.find((node: MutableNode) => node.type === 'element' && node.tagName === 'code') : child;
				const names = expression ? classes(expression) : [];
				if (names.some(name => ['language-math', 'math-inline', 'math-display'].includes(name))) {
					return { type: 'element', tagName: 'span', properties: { ...child.properties, className: ['math-formula', child.tagName === 'pre' || names.includes('math-display') ? 'math-display' : 'math-inline'] }, children: expression!.children };
				}
				walk(child);
				return child;
			});
		};
		walk(tree);
	};
}

function literalAuthorHtml() {
	return (tree: MutableNode) => {
		visit(tree, 'raw', (node: MutableNode) => { node.type = 'text'; });
	};
}

function atcoderMath() {
	return (tree: MutableNode) => {
		const contains = (node: MutableNode, tag: string): boolean => node.type === 'element' && node.tagName === tag || (node.children ?? []).some((child: MutableNode) => contains(child, tag));
		const walk = (parent: MutableNode, code = false) => {
			for (const child of parent.children ?? []) {
				if (child.type !== 'element') { continue; }
				// AtCoder uses pre/var for mathematical input layouts, not source code.
				if (!code && child.tagName === 'pre' && contains(child, 'var') && !contains(child, 'code')) {
					child.tagName = 'div'; child.properties = { ...child.properties, className: ['oj-input-format'] };
				}
				if (!code && child.tagName === 'var') {
					const display = classes(child).includes('oj-math-display');
					child.tagName = display ? 'pre' : 'code';
					child.properties = { ...child.properties, className: ['language-math', display ? 'math-display' : 'math-inline'] };
					child.children = [{ type: 'text', value: plainText(child) }];
					// KaTeX replaces its code/pre node, so author targets live outside it.
					const id = child.properties.id;
					if (id) {
						delete child.properties.id;
						const expression = { ...child };
						child.tagName = display ? 'div' : 'span';
						child.properties = { id };
						child.children = [expression];
					}
				}
				walk(child, code || ['pre', 'code'].includes(child.tagName!));
			}
		};
		walk(tree);
	};
}

function getBeaconProcessor() {
	// A fixed entry lets the Beacon bundle omit the site HTML/Luogu transforms.
	return beaconProcessor ??= unified().use(remarkParse).use(remarkGfm).use(remarkMath)
		.use(remarkBreaks).use(omitDirectivesAndImages(true))
		.use(remarkRehype, { allowDangerousHtml: true }).use(literalAuthorHtml)
		.use(rehypeSanitize, schema).use(mathExpressions).use(contentStructure);
}

function getLuoguProcessor() {
	return luoguProcessor ??= unified().use(remarkParse).use(remarkGfm).use(remarkMath)
		.use(remarkSmartypants).use(remarkDirective).use(omitDirectivesAndImages(false))
		.use(remarkCuteTable).use(remarkCustomContainers).use(remarkTableMergeMarkers).use(remarkImages)
		.use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(adaptAuthorHtml).use(rehypeApplyTableMerges)
		.use(rehypeSanitize, schema).use(normalizeUrls, 'https://www.luogu.com.cn')
		.use(rehypeSlug).use(rehypeAutolinkHeadings, { behavior: 'prepend', content: headingAnchorIcon, properties: { className: ['heading-anchor'], ariaHidden: 'true', tabIndex: -1 } })
		.use(nativeContainers).use(rehypeSafeKatex, { strict: 'ignore', trust: false, maxExpand: 1000 }).use(contentStructure);
}

/** Fixed Beacon policy, preserving its safe links and streaming math closure. */
export function parseBeaconMarkdown(source: string, options: { streaming?: boolean } = {}): Root {
	const processor = getBeaconProcessor();
	const tree = processor.parse(source);
	const isCodeFree = containsCodeSyntax(source) ? createCodeOffsetLookup(source, tree) : () => true;
	const normalized = normalizeMath(source, options.streaming ?? false, isCodeFree);
	// Standard delimiters and code-only streams keep their original parsed tree.
	return processor.runSync(normalized === source ? tree : processor.parse(normalized), new VFile(normalized)) as Root;
}

/** Shared content pipeline; dialects retain their existing math/content policies. */
export function parseMarkdown(source: string, options: { dialect: 'luogu' | 'beacon'; streaming?: boolean } = { dialect: 'luogu' }): Root {
	if (options.dialect === 'beacon') { return parseBeaconMarkdown(source, options); }
	const processor = getLuoguProcessor();
	const parsed = parseLuoguMarkdown(processor, source);
	return processor.runSync(parsed.tree, parsed.file) as Root;
}

let htmlProcessor: Processor<undefined, Root, Root>;

function htmlFragmentLinks() {
	return (tree: Root) => {
		visit(tree, 'element', node => {
			const href = node.properties.href;
			if (typeof href !== 'string' || !href.startsWith('#')) { return; }
			try {
				node.properties.href = '#' + encodeURIComponent('user-content-' + decodeURIComponent(href.slice(1)));
			} catch { delete node.properties.href; }
		});
	};
}

/** Native site HTML enters HAST directly; it never passes through Markdown. */
export function parseHtml(source: string, baseURL: string): Root {
	htmlProcessor ??= unified().use(rehypeSanitize, { ...schema, attributes: { ...schema.attributes, '*': ['className', 'id'] } }).use(htmlFragmentLinks).use(normalizeUrls).use(atcoderMath).use(rehypeSafeKatex, { strict: 'ignore', trust: false, maxExpand: 1000 }).use(contentStructure);
	const tree = fromHtml(source, { fragment: true });
	return htmlProcessor.runSync(tree, new VFile({ data: { baseURL } })) as Root;
}
let markdownStructureParser: Processor<MarkdownRoot>;
function containsCodeSyntax(source: string): boolean {
	return source.includes('`') || source.includes('~~~') || source.includes('    ') || source.includes('\t');
}
function createCodeOffsetLookup(src: string, parsed: MarkdownRoot) {
	let ranges: { start: number; end: number }[] | undefined;
	return (start: number, end = start + 1) => {
		if (!ranges) {
			let mathContainsCode = false;
			visit(parsed, node => {
				if ((node.type === 'math' || node.type === 'inlineMath') && node.position && containsCodeSyntax(src.slice(node.position.start.offset, node.position.end.offset))) { mathContainsCode = true; }
			});
			// A malformed dollar formula can consume a later code fence. Only that
			// exceptional case needs Markdown's code boundaries without math syntax.
			if (mathContainsCode) {
				markdownStructureParser ??= unified().use(remarkParse);
				parsed = markdownStructureParser.parse(src);
			}
			ranges = [];
			visit(parsed, node => {
				if ((node.type === 'code' || node.type === 'inlineCode') && node.position) {
					ranges!.push({ start: node.position.start.offset!, end: node.position.end.offset! });
				}
			});
		}
		let low = 0;
		let high = ranges.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if (ranges[middle].end <= start) { low = middle + 1; }
			else { high = middle; }
		}
		return low === ranges.length || ranges[low].start >= end;
	};
}
function createTextOffsetLookup(src: string) {
	let ranges: { start: number; end: number }[] | undefined;
	return (offset: number) => {
		if (!ranges) {
			markdownStructureParser ??= unified().use(remarkParse);
			const textRanges: { start: number; end: number }[] = [];
			visit(markdownStructureParser.parse(src), 'text', (node: MutableNode) => {
				let _a, _b;
				const start = (_a = node.position) === null || _a === void 0 ? void 0 : _a.start.offset;
				const end = (_b = node.position) === null || _b === void 0 ? void 0 : _b.end.offset;
				if (start !== undefined && end !== undefined) {
					textRanges.push({ end, start });
				}
			});
			ranges = textRanges.sort((a, b) => a.start - b.start);
		}
		let low = 0;
		let high = ranges.length - 1;
		while (low <= high) {
			const middle = Math.floor((low + high) / 2);
			const range = ranges[middle];
			if (offset < range.start) {
				high = middle - 1;
			}
			else if (offset >= range.end) {
				low = middle + 1;
			}
			else {
				return true;
			}
		}
		return false;
	};
}
function findUnclosedMathFences(src: string, tree: MutableNode, isTextOffset: TextOffsetLookup) {
	const fences: (MathFence & { end: number })[] = [];
	visit(tree, 'math', (node: MutableNode) => {
		let _a, _b;
		const start = (_a = node.position) === null || _a === void 0 ? void 0 : _a.start;
		const end = (_b = node.position) === null || _b === void 0 ? void 0 : _b.end;
		if (start?.offset === undefined || end?.offset === undefined) {
			return;
		}
		const openingLineEnd = Math.min(...[
			src.indexOf('\n', start.offset),
			src.indexOf('\r', start.offset),
			src.length
		].filter(offset => offset >= 0));
		const openingFence = /^(\${2,})[ \t]*$/.exec(src.slice(start.offset, openingLineEnd));
		if (!openingFence) {
			return;
		}
		// remark-math uses the same node shape at EOF, so only the source range reveals closure.
		const lineBreak = Math.max(src.lastIndexOf('\n', end.offset - 1), src.lastIndexOf('\r', end.offset - 1));
		const finalLine = src.slice(lineBreak + 1, end.offset);
		const closingFence = /^(?:[ \t]*>[ \t]?)*[ \t]*(\${2,})[ \t]*$/.exec(finalLine);
		const closingFenceOffset = closingFence === null ? -1 : lineBreak + 1 + finalLine.lastIndexOf(closingFence[1]);
		const isClosed = end.line > start.line &&
			closingFence !== null &&
			closingFence[1].length >= openingFence[1].length &&
			isTextOffset(closingFenceOffset);
		if (!isClosed) {
			fences.push({ end: end.offset, length: openingFence[1].length, offset: start.offset });
		}
	});
	return fences;
}
function findStandaloneMathFences(src: string, range: MathFence & { end: number }, isTextOffset: TextOffsetLookup) {
	const fences: MathFence[] = [];
	let lineStart = Math.max(src.lastIndexOf('\n', range.offset - 1), src.lastIndexOf('\r', range.offset - 1));
	lineStart++;
	while (lineStart < range.end) {
		const lineEnd = Math.min(...[src.indexOf('\n', lineStart), src.indexOf('\r', lineStart), range.end].filter(offset => offset >= 0 && offset <= range.end));
		const line = src.slice(lineStart, lineEnd);
		const match = /^(?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?[ \t]*(\${2,})[ \t]*$/.exec(line);
		if (match) {
			const offset = lineStart + line.lastIndexOf(match[1]);
			if (range.offset <= offset && isTextOffset(offset)) {
				fences.push({ length: match[1].length, offset });
			}
		}
		lineStart = lineEnd + (src[lineEnd] === '\r' && src[lineEnd + 1] === '\n' ? 2 : 1);
	}
	if (!fences.some(fence => fence.offset === range.offset)) {
		fences.unshift({ length: range.length, offset: range.offset });
	}
	return fences;
}
function findFenceOpenersWithoutClosers(fences: MathFence[]) {
	const nextClosingFence = new Array(fences.length).fill(-1);
	const stack: number[] = [];
	// The stack gives each opener the nearest later fence with at least the same width.
	for (let index = fences.length - 1; index >= 0; index--) {
		while (stack.length > 0 && fences[stack[stack.length - 1]].length < fences[index].length) {
			stack.pop();
		}
		if (stack.length > 0) {
			nextClosingFence[index] = stack[stack.length - 1];
		}
		stack.push(index);
	}
	const openers = [];
	for (let index = 0; index < fences.length;) {
		const closingIndex = nextClosingFence[index];
		if (closingIndex === -1) {
			openers.push(fences[index]);
			index++;
		}
		else {
			index = closingIndex + 1;
		}
	}
	return openers;
}
function escapeMathFences(src: string, fences: MathFence[]) {
	const uniqueFences = [...new Map(fences.map(fence => [fence.offset, fence])).values()].sort((a, b) => a.offset - b.offset);
	const parts = [];
	let cursor = 0;
	for (const fence of uniqueFences) {
		parts.push(src.slice(cursor, fence.offset), '\\$'.repeat(fence.length));
		cursor = fence.offset + fence.length;
	}
	parts.push(src.slice(cursor));
	return parts.join('');
}
function normalizeDisplayMathFences(src: string) {
	const lines = [];
	let lineStart = 0;
	while (lineStart <= src.length) {
		const lineFeed = src.indexOf('\n', lineStart);
		const rawEnd = lineFeed === -1 ? src.length : lineFeed;
		const lineEnd = rawEnd > lineStart && src[rawEnd - 1] === '\r' ? rawEnd - 1 : rawEnd;
		lines.push({ start: lineStart, text: src.slice(lineStart, lineEnd) });
		if (lineFeed === -1) {
			break;
		}
		lineStart = lineFeed + 1;
	}
	const isTextOffset = createTextOffsetLookup(src);
	const insertions = [];
	const lineEnding = src.includes('\r\n') ? '\r\n' : '\n';
	const openerPattern = /^[ \t]*(\${2,})(?!\$)[ \t]*(\S.*)$/;
	let closingFences: ({ offset: number; length: number; needsLineBreak: boolean } | undefined)[] | undefined;
	const maxClosingLength = new Array<number>(lines.length + 1).fill(0);
	for (let index = 0; index < lines.length; index++) {
		const openingLine = lines[index];
		const openingMatch = openerPattern.exec(openingLine.text);
		if (!openingMatch) {
			continue;
		}
		const openingFenceOffset = openingLine.start + openingLine.text.indexOf(openingMatch[1]);
		if (!isTextOffset(openingFenceOffset)) {
			continue;
		}
		const insertedLine = lineEnding + openingLine.text.slice(0, openingFenceOffset - openingLine.start);
		const sameLineClosingFence = /(\${2,})[ \t]*$/.exec(openingMatch[2]);
		if (sameLineClosingFence && sameLineClosingFence[1].length >= openingMatch[1].length) {
			const closingFenceOffset = openingLine.start + openingLine.text.lastIndexOf(sameLineClosingFence[1]);
			if (closingFenceOffset > openingFenceOffset + openingMatch[1].length &&
				isTextOffset(closingFenceOffset)) {
				insertions.push({
					offset: openingFenceOffset + openingMatch[1].length,
					value: insertedLine
				});
				insertions.push({ offset: closingFenceOffset, value: insertedLine });
			}
			continue;
		}
		if (!closingFences) {
			closingFences = lines.map(line => {
				const match = /(\${2,})[ \t]*$/.exec(line.text);
				if (!match) { return undefined; }
				const opener = openerPattern.exec(line.text);
				const selfContained = opener && /(\${2,})[ \t]*$/.exec(opener[2]);
				if (opener && selfContained && selfContained[1].length >= opener[1].length) { return undefined; }
				const offset = line.start + match.index;
				return isTextOffset(offset) ? { offset, length: match[1].length, needsLineBreak: line.text.slice(0, match.index).trim() !== '' } : undefined;
			});
			for (let closingIndex = lines.length - 1; closingIndex >= 0; closingIndex--) {
				maxClosingLength[closingIndex] = Math.max(maxClosingLength[closingIndex + 1], closingFences[closingIndex]?.length ?? 0);
			}
		}
		// Failed searches must not rescan every suffix. Successful searches advance
		// the outer cursor to the closing line, so their scanned ranges do not overlap.
		if (maxClosingLength[index + 1] < openingMatch[1].length) { continue; }
		for (let closingIndex = index + 1; closingIndex < lines.length; closingIndex++) {
			const closingFence = closingFences[closingIndex];
			if (!closingFence || closingFence.length < openingMatch[1].length) { continue; }
			// remark-math drops content attached to a multiline opening fence unless the fence is isolated.
			insertions.push({
				offset: openingFenceOffset + openingMatch[1].length,
				value: insertedLine
			});
			if (closingFence.needsLineBreak) {
				insertions.push({ offset: closingFence.offset, value: insertedLine });
			}
			index = closingIndex;
			break;
		}
	}
	if (insertions.length === 0) {
		return src;
	}
	const uniqueInsertions = [
		...new Map(insertions.map(insertion => [insertion.offset, insertion])).values()
	].sort((a, b) => a.offset - b.offset);
	const parts = [];
	let cursor = 0;
	for (const insertion of uniqueInsertions) {
		parts.push(src.slice(cursor, insertion.offset), insertion.value);
		cursor = insertion.offset;
	}
	parts.push(src.slice(cursor));
	return parts.join('');
}
function parseLuoguMarkdown(processor: MarkdownProcessor, src: string) {
	let protectedSrc = normalizeDisplayMathFences(src);
	while (true) {
		const file = new VFile(protectedSrc);
		const tree = processor.parse(file);
		const isTextOffset = createTextOffsetLookup(protectedSrc);
		const fences = findUnclosedMathFences(protectedSrc, tree, isTextOffset);
		if (fences.length === 0) {
			return { file, tree };
		}
		const openers = fences.flatMap(fence => {
			const unclosedOpeners = findFenceOpenersWithoutClosers(findStandaloneMathFences(protectedSrc, fence, isTextOffset));
			return unclosedOpeners.length > 0 ? unclosedOpeners : [fence];
		});
		protectedSrc = escapeMathFences(protectedSrc, openers);
	}
}
function rehypeSafeKatex(options: Parameters<typeof rehypeKatex>[0]) {
	const transform = rehypeKatex(options);
	return (tree: MutableNode, file: VFile) => {
		visit(tree, 'element', (node: MutableNode) => {
			node.properties ||= {};
		});
		return transform(tree as Root, file);
	};
}

function remarkCustomContainers() {
	return (tree: MutableNode) => {
		const stringifyDirective = (node: MutableNode) => {
			let _a;
			const label = ((_a = node.children) === null || _a === void 0 ? void 0 : _a.map((child: MutableNode) => child.value || '').join('')) || '';
			const attributes = Object.entries(node.attributes || {})
				.map(([key, value]) => (value === true ? key : `${key}="${value}"`))
				.join(' ');
			return `:${node.name}${label ? `[${label}]` : ''}${attributes ? `{${attributes}}` : ''}`;
		};
		const extractDirectiveLabel = (node: MutableNode) => {
			let _a, _b, _c;
			const labelNode = (_a = node.children) === null || _a === void 0 ? void 0 : _a[0];
			if (!((_b = labelNode === null || labelNode === void 0 ? void 0 : labelNode.data) === null || _b === void 0 ? void 0 : _b.directiveLabel)) {
				return '';
			}
			const label = (_c = labelNode!.children) === null || _c === void 0 ? void 0 : _c.map((child: MutableNode) => child.value || '').join('').trim();
			node.children = node.children!.slice(1);
			return label || '';
		};
		visit(tree, (node: MutableNode) => {
			let _a, _b, _c;
			if (node.type === 'textDirective' || node.type === 'leafDirective') {
				node.type = 'text';
				node.value = stringifyDirective(node);
				delete node.name;
				delete node.attributes;
				delete node.children;
				delete node.data;
				return;
			}
			if (node.type === 'containerDirective') {
				const data = node.data || (node.data = {});
				const attributes = node.attributes || {};
				const name = node.name!;
				if (name === 'align') {
					const align = attributes.class || Object.keys(attributes)[0] || 'center';
					data.hName = 'div';
					data.hProperties = { className: [`md-align-${align}`] };
				}
				else if (name === 'epigraph') {
					const label = extractDirectiveLabel(node);
					const author = attributes.author || label || '';
					data.hName = 'div';
					data.hProperties = {
						className: ['md-epigraph'],
						'data-author': author
					};
				}
				else if (['info', 'warning', 'success', 'error'].includes(name)) {
					const hasLabel = Boolean(!attributes.title && ((_c = (_b = (_a = node.children) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.directiveLabel));
					const title = attributes.title || (hasLabel ? '' : name.toUpperCase());
					const open = attributes.open !== undefined;
					data.hName = 'div';
					data.hProperties = {
						className: hasLabel
							? ['md-block', name, 'has-title-children']
							: ['md-block', name],
						'data-title': title,
						'data-open': open.toString()
					};
				}
			}
		});
	};
}
function remarkCuteTable() {
	const addClass = (node: MutableNode, classToAdd: string) => {
		node.data ||= {};
		node.data.hProperties ||= {};
		const className = node.data.hProperties.className as string | string[] || [];
		node.data.hProperties.className = Array.isArray(className)
			? [...className, classToAdd]
			: [className, classToAdd].filter(Boolean);
	};
	return (tree: MutableNode) => {
		let _a;
		const children = tree.children || [];
		for (let index = 0; index < children.length; index++) {
			const node = children[index];
			const next = children[index + 1];
			if ((node === null || node === void 0 ? void 0 : node.type) !== 'leafDirective' ||
				node.name !== 'cute-table' ||
				((_a = node.attributes) === null || _a === void 0 ? void 0 : _a.tuack) === undefined ||
				(next === null || next === void 0 ? void 0 : next.type) !== 'table') {
				continue;
			}
			addClass(next, 'cute-table');
			children.splice(index, 1);
			index--;
		}
	};
}
function remarkImages() {
	return (tree: MutableNode) => {
		visit(tree, 'image', (node: MutableNode) => {
			if (node.url!.includes(luoguCaptchaUrlFragment)) {
				node.type = 'text';
				node.value = '[LUOGU CAPTCHA]';
				delete node.url;
				delete node.alt;
				delete node.title;
				return;
			}
			if (node.url!.startsWith('bilibili:')) {
				const bilibiliUrl = node.url!.substring(9);
				const [videoID, queryString] = bilibiliUrl.split('?');
				let bvid = '';
				let aid = '';
				if (videoID.startsWith('BV')) {
					bvid = videoID;
				}
				else if (videoID.startsWith('av')) {
					aid = videoID.substring(2);
				}
				else if (/^\d+$/.test(videoID)) {
					aid = videoID;
				}
				const params = new URLSearchParams(queryString || '');
				const page = params.get('page') || '1';
				const t = params.get('t') || '0';
				const videoId = bvid || (aid && `av${aid}`);
				if (!videoId) {
					node.type = 'text';
					node.value = '\u5d4c\u5165\u5185\u5bb9\u4e0d\u53ef\u7528';
					delete node.url;
				} else {
					const url = new URL(`/video/${encodeURIComponent(videoId)}`, 'https://www.bilibili.com');
					url.searchParams.set('p', page);
					url.searchParams.set('t', t);
					node.type = 'link';
					node.url = url.href;
					node.children = [{ type: 'text', value: `\u5728 bilibili \u4e2d\u6253\u5f00\u89c6\u9891 ${videoId}` }];
				}
				delete node.alt;
				delete node.title;
			}
		});
	};
}
function remarkTableMergeMarkers() {
	const escapedMarkers: Record<string, string> = {
		'\\^': '^',
		'\\<': '<',
		'\\>': '>',
		'\\v': 'v'
	};
	const getCellText = (cell: MutableNode, source: string) => {
		let _a, _b, _c, _d;
		if (!cell.children || cell.children.length !== 1) {
			return null;
		}
		const child = cell.children[0];
		if (child.type !== 'text') {
			return null;
		}
		const start = (_b = (_a = child.position) === null || _a === void 0 ? void 0 : _a.start) === null || _b === void 0 ? void 0 : _b.offset;
		const end = (_d = (_c = child.position) === null || _c === void 0 ? void 0 : _c.end) === null || _d === void 0 ? void 0 : _d.offset;
		const raw = typeof start === 'number' && typeof end === 'number'
			? source.slice(start, end)
			: child.value!;
		return { child, raw, value: child.value! };
	};
	const hasNeighbor = (rows: MutableNode[][], rowIndex: number, cellIndex: number, marker: string) => {
		let _a, _b, _c, _d;
		switch (marker) {
			case '^':
				return rowIndex > 0 && Boolean((_a = rows[rowIndex - 1]) === null || _a === void 0 ? void 0 : _a[cellIndex]);
			case '<':
				return cellIndex > 0 && Boolean((_b = rows[rowIndex]) === null || _b === void 0 ? void 0 : _b[cellIndex - 1]);
			case '>':
				return Boolean((_c = rows[rowIndex]) === null || _c === void 0 ? void 0 : _c[cellIndex + 1]);
			case 'v':
				return (rowIndex < rows.length - 1 && Boolean((_d = rows[rowIndex + 1]) === null || _d === void 0 ? void 0 : _d[cellIndex]));
			default:
				return false;
		}
	};
	return (tree: MutableNode, file: VFile) => {
		const source = String(file.value || '');
		visit(tree, 'table', (table: MutableNode) => {
			const rows = (table.children || []).map((row: MutableNode) => row.children || []);
			rows.forEach((row: MutableNode[], rowIndex: number) => {
				row.forEach((cell: MutableNode, cellIndex: number) => {
					const text = getCellText(cell, source);
					if (!text) {
						return;
					}
					if (escapedMarkers[text.raw]) {
						text.child.value = escapedMarkers[text.raw];
						return;
					}
					if (text.value !== text.raw ||
						!hasNeighbor(rows, rowIndex, cellIndex, text.raw)) {
						return;
					}
					cell.data ||= {};
					cell.data.hProperties ||= {};
					cell.data.hProperties['data-merge-marker'] = text.raw;
				});
			});
		});
	};
}
function rehypeApplyTableMerges() {
	const getMarker = (cell: MutableNode) => { let _a, _b; return ((_a = cell.properties) === null || _a === void 0 ? void 0 : _a.dataMergeMarker) || ((_b = cell.properties) === null || _b === void 0 ? void 0 : _b['data-merge-marker']); };
	const deleteMarker = (cell: MutableNode) => {
		if (!cell.properties) {
			return;
		}
		delete cell.properties.dataMergeMarker;
		delete cell.properties['data-merge-marker'];
	};
	const addClass = (cell: MutableNode, classToAdd: string) => {
		cell.properties ||= {};
		const className = cell.properties.className as string | string[] || [];
		const classes = Array.isArray(className) ? className : [className].filter(Boolean);
		if (!classes.includes(classToAdd)) {
			classes.push(classToAdd);
		}
		cell.properties.className = classes;
	};
	const getSpan = (cell: MutableNode, property: string) => {
		let _a, _b;
		return Number(((_a = cell.properties) === null || _a === void 0 ? void 0 : _a[property]) || ((_b = cell.properties) === null || _b === void 0 ? void 0 : _b[property.toLowerCase()]) || 1);
	};
	const setSpan = (cell: MutableNode, property: string, value: number) => {
		cell.properties ||= {};
		cell.properties[property] = value;
	};
	const copyCell = (source: MutableNode, target: MutableNode) => {
		target.tagName = source.tagName;
		target.properties = { ...(source.properties || {}) };
		target.children = source.children || [];
		deleteMarker(target);
	};
	return (tree: MutableNode) => {
		visit(tree, 'element', (table: MutableNode) => {
			if (table.tagName !== 'table') {
				return;
			}
			const rowNodes: MutableNode[] = [];
			visit(table, 'element', (row: MutableNode) => {
				if (row.tagName === 'tr') {
					rowNodes.push(row);
				}
			});
			const rows = rowNodes.map((row: MutableNode) => (row.children || []).filter((child: MutableNode) => child.type === 'element' &&
				(child.tagName === 'td' || child.tagName === 'th')));
			const owners = rows.map(row => row.map(cell => cell));
			const removed = new WeakSet();
			const ownerAt = (rowIndex: number, cellIndex: number) => {
				let _a;
				const owner = (_a = owners[rowIndex]) === null || _a === void 0 ? void 0 : _a[cellIndex];
				return owner && !removed.has(owner) ? owner : null;
			};
			const mergeInto = (markerCell: MutableNode, target: MutableNode, property: string) => {
				addClass(target, 'md-table-merged-cell');
				setSpan(target, property, getSpan(target, property) + 1);
				removed.add(markerCell);
			};
			rows.forEach((row: MutableNode[], rowIndex: number) => {
				row.forEach((cell: MutableNode, cellIndex: number) => {
					if (removed.has(cell)) {
						return;
					}
					const marker = getMarker(cell);
					if (!marker) {
						return;
					}
					if (marker === '^') {
						const target = ownerAt(rowIndex - 1, cellIndex);
						if (target) {
							mergeInto(cell, target, 'rowSpan');
							owners[rowIndex][cellIndex] = target;
						}
					}
					else if (marker === '<') {
						const target = ownerAt(rowIndex, cellIndex - 1);
						if (target) {
							mergeInto(cell, target, 'colSpan');
							owners[rowIndex][cellIndex] = target;
						}
					}
					else if (marker === '>') {
						const target = ownerAt(rowIndex, cellIndex + 1);
						if (target) {
							copyCell(target, cell);
							addClass(cell, 'md-table-merged-cell');
							setSpan(cell, 'colSpan', getSpan(cell, 'colSpan') + 1);
							removed.add(target);
							owners[rowIndex][cellIndex] = cell;
							owners[rowIndex][cellIndex + 1] = cell;
						}
					}
					else if (marker === 'v') {
						const target = ownerAt(rowIndex + 1, cellIndex);
						if (target) {
							copyCell(target, cell);
							addClass(cell, 'md-table-merged-cell');
							setSpan(cell, 'rowSpan', getSpan(cell, 'rowSpan') + 1);
							removed.add(target);
							owners[rowIndex][cellIndex] = cell;
							owners[rowIndex + 1][cellIndex] = cell;
						}
					}
				});
			});
			rows.flat().forEach(deleteMarker);
			rowNodes.forEach((row: MutableNode) => {
				row.children = (row.children || []).filter((child: MutableNode) => !(child.type === 'element' && removed.has(child)));
			});
		});
	};
}

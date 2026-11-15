/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2018 引领天下. MIT License.
 *  Adapted from yltx/vscode-luogu v4.20.0 (987ca974b5419230a07b59a195ec44026e16f6f4).
 *  BeCoder changes: shared OJ integration and localization. See ThirdPartyNotices.txt.
 *--------------------------------------------------------------------------------------------*/

import renderLuoguMarkdown from '@luogu-saver-next/markdown-renderer';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import type { Element, Root } from 'hast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

const luoguOrigin = 'https://www.luogu.com.cn';

function hasClass(element: Element, name: string) {
	const classes = element.properties.className;
	return Array.isArray(classes)
		? classes.includes(name)
		: typeof classes === 'string' && classes.split(/\s+/).includes(name);
}

function adaptEmbed(element: Element) {
	const source = element.properties.src;
	let href: string | undefined;
	let label = '在浏览器中打开嵌入内容';
	if (typeof source === 'string') {
		try {
			const url = new URL(source, luoguOrigin);
			if (url.protocol === 'https:' || url.protocol === 'http:') {
				href = url.href;
				if (
					url.hostname === 'player.bilibili.com' &&
					url.pathname === '/player.html'
				) {
					const bvid = url.searchParams.get('bvid');
					const aid = url.searchParams.get('aid');
					const videoId = bvid || (aid && `av${aid}`);
					if (videoId) {
						const video = new URL(
							`/video/${encodeURIComponent(videoId)}`,
							'https://www.bilibili.com'
						);
						video.searchParams.set('p', url.searchParams.get('page') || '1');
						video.searchParams.set('t', url.searchParams.get('t') || '0');
						href = video.href;
						label = `在 bilibili 中打开视频 ${videoId}`;
					}
				}
			}
		} catch {
			// Invalid embedded URLs should not prevent the rest of an article rendering.
		}
	}
	element.tagName = href ? 'a' : 'span';
	element.properties = href ? { href } : {};
	element.children = [{ type: 'text', value: href ? label : '嵌入内容不可用' }];
}

function adaptCallout(element: Element) {
	const title = element.children.find(
		(child): child is Element =>
			child.type === 'element' && hasClass(child, 'md-block-title')
	);
	const body = element.children.find(
		(child): child is Element =>
			child.type === 'element' && hasClass(child, 'md-block-body')
	);
	if (!title || !body) { return; }

	element.tagName = 'details';
	element.properties.open = body.properties.style !== 'display:none';
	title.tagName = 'summary';
	title.children = title.children.filter(
		child => !(child.type === 'element' && hasClass(child, 'toggle-btn'))
	);
	delete body.properties.style;
}

function removeAntiAiDirectives(parent: Root | Element) {
	if (
		parent.type === 'element' &&
		!['blockquote', 'li', 'div'].includes(parent.tagName)
	)
		{ return; }
	// The renderer emits unsupported leaf directives as bare text with one colon.
	// Paragraphs and code elements keep literal/escaped examples unchanged.
	parent.children = parent.children.filter(child => {
		if (child.type !== 'text') { return true; }
		child.value = child.value.replace(
			/(^|\n):anti-ai(?:\[[^\r\n]*\])?(?:\{[^\r\n]*\})?(?=\r?\n|$)/g,
			'$1'
		);
		return !!child.value;
	});
}

const markdownParser = unified().use(remarkParse);

/** Strip author styles before rendering; generated KaTeX/Shiki CSS remains untouched. */
function withoutAuthorStyles(markdown: string): string {
	const ranges: { start: number; end: number }[] = [];
	const html = (node: DefaultTreeAdapterTypes.Node, offset: number) => {
		// eslint-disable-next-line local/code-no-in-operator -- Parse5's structural AST union has no shared discriminant or runtime classes.
		if ('tagName' in node) {
			const style = node.sourceCodeLocation?.attrs?.style;
			if (style) { ranges.push({ start: offset + style.startOffset, end: offset + style.endOffset }); }
			if (node.tagName === 'template') { html((node as DefaultTreeAdapterTypes.Template).content, offset); }
		}
		// eslint-disable-next-line local/code-no-in-operator -- Narrow the parser's parent node union before visiting children.
		if ('childNodes' in node) { for (const child of node.childNodes) { html(child, offset); } }
	};
	const visit = (node: { type: string; value?: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: readonly unknown[] }) => {
		if (node.type === 'html' && node.value && node.position?.start.offset !== undefined && node.position.end.offset !== undefined) {
			html(parseFragment(markdown.slice(node.position.start.offset, node.position.end.offset), { sourceCodeLocationInfo: true }), node.position.start.offset);
		}
		for (const child of node.children ?? []) { visit(child as typeof node); }
	};
	visit(markdownParser.parse(markdown));
	for (const { start, end } of ranges.sort((a, b) => b.start - a.start)) {
		// Keep the first attribute inert so HTML's ignored duplicate attributes cannot become active.
		markdown = markdown.slice(0, start) + 'style=""' + markdown.slice(end);
	}
	return markdown;
}

/** Adapt the renderer's sanitized output to VS Code, without parsing Markdown here. */
export async function renderMarkdownTree(markdown: string): Promise<Root> {
	const tree = fromHtml(await renderLuoguMarkdown(withoutAuthorStyles(markdown)), {
		fragment: true
	});
	const walk = (element: Element) => {
		removeAntiAiDirectives(element);
		if (element.tagName === 'iframe') { adaptEmbed(element); }
		for (const key of ['href', 'src']) {
			const value = element.properties[key];
			if (typeof value !== 'string' || key === 'href' && value.startsWith('#')) { continue; }
			try {
				const url = new URL(value, luoguOrigin);
				if (url.protocol !== 'https:' || url.username || url.password) { throw new Error('Invalid content URL'); }
				element.properties[key] = url.href;
			} catch { delete element.properties[key]; }
		}
		if (hasClass(element, 'md-block')) { adaptCallout(element); }
		if (
			element.tagName === 'a' &&
			typeof element.properties.href === 'string'
		) {
			const href = element.properties.href;
			if (href.startsWith('/'))
				{ element.properties.href = new URL(href, luoguOrigin).href; }
		}
		element.children.forEach(child => {
			if (child.type === 'element') { walk(child); }
		});
	};
	removeAntiAiDirectives(tree);
	tree.children.forEach(child => {
		if (child.type === 'element') { walk(child); }
	});
	return tree;
}

export default async function renderMarkdown(
	markdown: string
): Promise<string> {
	return toHtml(await renderMarkdownTree(markdown));
}

export async function renderInlineMarkdown(markdown: string): Promise<string> {
	const tree = await renderMarkdownTree(markdown);
	tree.children = tree.children.flatMap(child =>
		child.type === 'element' && child.tagName === 'p' ? child.children : [child]
	);
	return toHtml(tree);
}

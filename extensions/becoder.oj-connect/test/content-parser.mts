/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Element, Nodes } from 'hast';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../../..');
const output = path.join(root, 'tmp/oj-connect-audit/content-parser');
await mkdir(output, { recursive: true });
const entry = path.join(root, 'extensions/becoder.oj-connect/src/markdown.ts');
const shared = path.join(root, 'extensions/becoder.shared/content/parser.ts');
const nodePaths = [path.join(root, 'extensions/becoder.oj-connect/node_modules')];
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(output, 'markdown.cjs'), alias: { 'becoder-content': shared }, nodePaths });
const renderer = require(path.join(output, 'markdown.cjs'));
const descendants = (node: Nodes, predicate: (node: Nodes) => boolean): Nodes[] => [...(predicate(node) ? [node] : []), ...('children' in node ? node.children.flatMap(child => descendants(child, predicate)) : [])];
const elements = (tree: Nodes, tag: string): Element[] => descendants(tree, node => node.type === 'element' && node.tagName === tag).filter((node): node is Element => node.type === 'element');
const hasClass = (node: Element, name: string): boolean => Array.isArray(node.properties.className) && node.properties.className.includes(name);
const text = (node: Nodes): string => node.type === 'text' ? node.value : ('children' in node ? node.children.map(text).join('') : '');

// Losing a trailing newline or eagerly tokenizing prevents immediate, exact raw-code display.
const code = '  #include <iostream>\nint main() { return 0; }\n\n';
const rawTree = await renderer.renderMarkdownTree('```cpp\n' + code + '```');
assert.equal(text(elements(rawTree, 'code')[0]), code, 'code source retains all trailing newlines');
assert.equal(elements(rawTree, 'code')[0].children.length, 1, 'host carries one raw text node, without highlight tokens');

const hostile = await renderer.renderMarkdownTree('<div class="hostile" style="position:fixed" STYLE="inset:0">ordinary</div>\n\n$\\boxed{x}+\\color{red}{y}$\n\n```html\n<div style="position:fixed">literal</div>\n```');
assert.equal(elements(hostile, 'div').find(node => hasClass(node, 'hostile'))?.properties.style, undefined);
assert.ok(descendants(hostile, node => node.type === 'element' && String(node.properties.style).includes('border-style')).length > 0, 'generated math retains its styles');
assert.equal(text(elements(hostile, 'code')[0]), '<div style="position:fixed">literal</div>\n');

const dialect = await renderer.renderMarkdownTree('::cute-table{tuack}\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| ^ | 3 |\n| 4 | < |\n\n:::warning[Read this]{open}\nBody\n:::\n\n::anti-ai[]\n\nLiteral `::anti-ai[]`.\n\n![video](bilibili:BV1xx?page=2&t=3)');
assert.ok(hasClass(elements(dialect, 'table')[0], 'cute-table'));
assert.ok(elements(dialect, 'td').some(node => node.properties.rowSpan === 2));
assert.ok(elements(dialect, 'td').some(node => node.properties.colSpan === 2));
assert.equal(elements(dialect, 'details')[0].properties.open, true);
assert.equal(text(elements(dialect, 'summary')[0]), 'Read this');
assert.equal(text(dialect).match(/::anti-ai/g)?.length, 1, 'only a real anti-ai directive is omitted');
assert.equal(elements(dialect, 'a').find(node => String(node.properties.href).startsWith('https://www.bilibili.com'))?.properties.href, 'https://www.bilibili.com/video/BV1xx?p=2&t=3');
assert.equal(elements(dialect, 'iframe').length, 0);

const urls = await renderer.renderMarkdownTree('[relative](/problem/P1001) [bad](javascript:alert) <a href="command:evil">bad</a> ![x](//example.org/img.png)');
assert.equal(elements(urls, 'a')[0].properties.href, 'https://www.luogu.com.cn/problem/P1001');
assert.ok(elements(urls, 'a').slice(1).every(node => !node.properties.href));
assert.equal(elements(urls, 'img')[0].properties.src, 'https://example.org/img.png');

const anchors = await renderer.renderHtmlTree('<a href="#details">Details</a><h3 id="details">Details</h3><a href="#%E8%AF%B4%E6%98%8E">Notes</a><div id="说明">Notes</div><div id="app" onclick="alert(1)">author</div>', 'https://atcoder.jp/');
assert.equal(elements(anchors, 'h3')[0].properties.id, 'user-content-details', 'author IDs retain the sanitizer clobber prefix');
assert.equal(elements(anchors, 'a')[0].properties.href, '#user-content-details', 'fragment links follow sanitized targets');
assert.equal(decodeURIComponent(elements(anchors, 'a')[1].properties.href as string), '#user-content-说明');
assert.equal(elements(anchors, 'div')[1].properties.id, 'user-content-app');
assert.equal(elements(anchors, 'div')[1].properties.onClick, undefined);

await build({ entryPoints: [path.join(root, 'extensions/becoder.oj-connect/webview/lanqiaoStatement.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(output, 'lanqiao-statement.cjs'), nodePaths });
const { lanqiaoStatement } = require(path.join(output, 'lanqiao-statement.cjs'));
// Synthetic independent blocks reproduce the layout issue; they are not an official229 response.
const layoutSource = '迷宫与陷阱\n\n### 题目描述\n\n题目描述\n\n保留 $N \\times N$ 与[引用][ref]。\n\n#### 输入描述\n\n真实子标题。\n\n### 输入描述\n\n输入描述\n\n输入描述\n\n两个整数。\n\n### 输出描述\n\n输出描述\n\n最少步数。\n\n[ref]: https://www.lanqiao.cn/problems/229/learning/\n';
const layoutOriginal = renderer.renderMarkdownTree(layoutSource), beforeLayout = JSON.stringify(layoutOriginal);
const layout = lanqiaoStatement(layoutOriginal, '迷宫与陷阱');
assert.deepEqual(elements(layout, 'h2').map(text), ['题目描述', '输入描述', '输出描述']);
assert.deepEqual(elements(layout, 'h4').map(text), ['输入描述'], 'lower heading levels remain actual subheadings');
assert.equal(elements(layout, 'p').filter(node => text(node) === '迷宫与陷阱').length, 0);
assert.equal(elements(layout, 'p').filter(node => text(node) === '输入描述').length, 1, 'only one adjacent redundant label is omitted');
assert.ok(elements(layout, 'h2').every(node => !elements(node, 'a').some(anchor => hasClass(anchor, 'heading-anchor'))));
assert.ok(elements(layout, 'h4').some(node => elements(node, 'a').some(anchor => hasClass(anchor, 'heading-anchor'))));
assert.equal(elements(layout, 'h2')[1].properties.id, elements(layoutOriginal, 'h3')[1].properties.id, 'main heading fragment identity survives');
assert.equal(elements(layout, 'a').find(node => text(node) === '引用')?.properties.href, 'https://www.lanqiao.cn/problems/229/learning/');
assert.equal(JSON.stringify(layoutOriginal), beforeLayout, 'normalization cannot mutate a shared cached render tree');

const richTitle = renderer.renderMarkdownTree('# 迷宫与陷阱\n\n### 题目描述\n\n正文。\n\n### 输入描述\n\n输入。');
assert.equal(elements(lanqiaoStatement(richTitle, '迷宫与陷阱'), 'h1').length, 0, 'an unreferenced duplicate Markdown title is also omitted');
const protectedSource = '### 题目描述\n\n题目描述\n这两行是同一段正文。\n\n- 项目\n  ### 输入描述\n\n> ### 输出描述\n\n<div>\n\n### 输入描述\n\n</div>\n\n:::warning[提示]{open}\n### 输出描述\n:::\n\n````cpp\n### 输入描述\n```\n题目描述\n````\n\n    ### 输出描述\n\n$$\nx = \\text{输入描述}\n$$\n';
const protectedTree = renderer.renderMarkdownTree(protectedSource), protectedNormalized = lanqiaoStatement(protectedTree);
for (const tag of ['pre', 'blockquote', 'ul', 'details', 'div']) {
	assert.deepEqual(elements(protectedNormalized, tag), elements(protectedTree, tag), `${tag} descendants remain unchanged`);
}
assert.deepEqual(elements(protectedNormalized, 'span').filter(node => hasClass(node, 'katex')), elements(protectedTree, 'span').filter(node => hasClass(node, 'katex')));
assert.ok(elements(protectedNormalized, 'p').some(node => text(node) === '题目描述\n这两行是同一段正文。'));

for (const source of [
	'### 教程\n\n#### 输入描述\n\n输入描述\n\n正文。',
	'[迷宫与陷阱](https://www.lanqiao.cn/)\n\n### 题目描述\n\n正文。',
	'`迷宫与陷阱`\n\n### 题目描述\n\n正文。',
	'# 迷宫与陷阱\n\n[回到题名](#迷宫与陷阱)\n\n### 题目描述\n\n正文。'
]) {
	const tree = renderer.renderMarkdownTree(source), normalized = lanqiaoStatement(tree, '迷宫与陷阱');
	assert.deepEqual(normalized.children[0], tree.children[0], 'unrecognized hierarchy, links, code and referenced title blocks remain readable');
}
const laterTitle = lanqiaoStatement(renderer.renderMarkdownTree('### 题目描述\n\n迷宫与陷阱\n\n### 输入描述\n\n输入。'), '迷宫与陷阱');
assert.ok(elements(laterTitle, 'p').some(node => text(node) === '迷宫与陷阱'), 'the title is only removable before all actual sections');
const labeledCode = lanqiaoStatement(renderer.renderMarkdownTree('### 输入描述\n\n`输入描述`\n\n### 输出描述\n\n[输出描述](https://www.lanqiao.cn/)'));
assert.equal(elements(labeledCode, 'code').length, 1);
assert.equal(elements(labeledCode, 'a').filter(node => text(node) === '输出描述').length, 1);
const sectionTitle = lanqiaoStatement(renderer.renderMarkdownTree('### 题目描述\n\n正文。\n\n### 输入描述\n\n输入。'), '题目描述');
assert.deepEqual(elements(sectionTitle, 'h2').map(text), ['题目描述', '输入描述'], 'a real main section is not removed when the problem happens to have the same name');
// Main heading names and overescaped percentages observed in official2128/2109 on2026-11-20.
const observedHeadings = renderer.renderMarkdownTree('### 问题描述\n\n正文。\n\n#### 问题描述\n\n真实子标题。\n\n### 输入格式\n\n输入。\n\n### 输出格式\n\n输出。\n\n### 评测用例规模与约定\n\n约定。');
const normalizedHeadings = lanqiaoStatement(observedHeadings);
assert.deepEqual(elements(normalizedHeadings, 'h2').map(text), ['问题描述', '输入格式', '输出格式', '评测用例规模与约定']);
assert.ok(elements(normalizedHeadings, 'h2').every(node => !elements(node, 'a').some(anchor => hasClass(anchor, 'heading-anchor'))));
assert.deepEqual(elements(normalizedHeadings, 'h4'), elements(observedHeadings, 'h4'), 'an actual same-name subheading keeps its level and anchor');

const observedPercentage = String.raw`对于 $30 \\%$ 的评测用例， $n, m \leq 50$;`;
const percentageTree = renderer.renderMarkdownTree(observedPercentage, true);
assert.equal(text(elements(percentageTree, 'annotation')[0]), String.raw`30 \%`, 'Lanqiao numeric percentages use one TeX escape');
assert.ok(elements(percentageTree, 'span').some(node => hasClass(node, 'katex-html') && text(node).includes('30%')), 'the visible percentage retains its percent sign');
assert.equal(descendants(percentageTree, node => node.type === 'element' && hasClass(node, 'newline')).length, 0, 'an escaped percent must not become a TeX line break');
assert.equal(text(elements(renderer.renderMarkdownTree(observedPercentage), 'annotation')[0]), String.raw`30 \\%`, 'other sites keep their existing TeX policy');
const multiplePercentages = '中文 😀\r\n\r\n' + observedPercentage + '\r\n\r\n' + String.raw`对于 $70 \\%$ 的数据。` + '\r\n\r\n' + String.raw`比例 $99.5 \\%$。`;
assert.deepEqual(elements(renderer.renderMarkdownTree(multiplePercentages, true), 'annotation').map(text), [String.raw`30 \%`, String.raw`n, m \leq 50`, String.raw`70 \%`, String.raw`99.5 \%`], 'raw UTF-16 offsets remain correct for multiple formulas, CRLF, Chinese and emoji');
const protectedPercentages = [
	'`' + String.raw`$30 \\%$` + '`',
	'```text\n' + observedPercentage + '\n```',
	'    ' + observedPercentage,
	String.raw`$30 \%$`,
	String.raw`$30 \\% + x$`,
	String.raw`$30 \\\%$`,
	String.raw`$30 \\\\%$`,
	String.raw`$a \\ b$`,
	String.raw`<code>$30 \\%$</code>`,
	'<div>\n' + observedPercentage + '\n</div>'
];
for (const source of protectedPercentages) {
	assert.deepEqual(renderer.renderMarkdownTree(source, true), renderer.renderMarkdownTree(source), 'code, HTML, correct escapes and complex formulas stay unchanged');
}
console.log('Lanqiao statement layout normalization regressions passed');

await build({ entryPoints: [path.join(root, 'extensions/becoder.shared/browser/content/dom.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(output, 'dom.cjs'), nodePaths });
const { JSDOM } = require('jsdom');
const document = new JSDOM('<!doctype html><main id="app"></main>').window.document;
Object.assign(globalThis, { document });
const { contentFragment } = require(path.join(output, 'dom.cjs'));
const firstFragment = contentFragment(anchors), secondFragment = contentFragment(anchors);
const firstTarget = firstFragment.querySelector('h3'), secondTarget = secondFragment.querySelector('h3');
assert.notEqual(firstTarget.id, secondTarget.id, 'reused cached trees receive independent DOM namespaces');
assert.equal(decodeURIComponent(firstFragment.querySelector('a').getAttribute('href')), '#' + firstTarget.id);
assert.equal(decodeURIComponent(secondFragment.querySelector('a').getAttribute('href')), '#' + secondTarget.id);
assert.equal(elements(anchors, 'h3')[0].properties.id, 'user-content-details', 'DOM mounting never mutates the shared cached tree');
assert.notEqual(firstFragment.querySelectorAll('div')[1].id, 'app', 'author IDs cannot shadow host controls');

const unusualAnchors = await renderer.renderHtmlTree('<a href="#a%2520b">Percent</a><h3 id="a%20b">Percent</h3><a href="#format">Input</a><pre id="format"><var>N</var></pre><a href="#app">Unknown</a>', 'https://atcoder.jp/');
const unusualFragment = contentFragment(unusualAnchors);
const unusualLinks = unusualFragment.querySelectorAll('a');
assert.equal(decodeURIComponent(unusualLinks[0].hash.slice(1)), unusualFragment.querySelector('h3').id, 'literal percent IDs are decoded only once');
assert.equal(decodeURIComponent(unusualLinks[1].hash.slice(1)), unusualFragment.querySelector('.oj-input-format').id, 'input-format transforms preserve sanitized IDs');
assert.notEqual(unusualLinks[2].hash, '#app', 'unmatched author hashes cannot address host controls');
for (const className of ['', 'oj-math-display']) {
	const formulaAnchor = contentFragment(await renderer.renderHtmlTree('<a href="#math">Formula</a><var id="math" class="' + className + '">N</var>', 'https://atcoder.jp/'));
	assert.equal(formulaAnchor.querySelectorAll('[id]').length, 1, 'formula rendering retains the author target');
	assert.equal(decodeURIComponent(formulaAnchor.querySelector('a').hash.slice(1)), formulaAnchor.querySelector('[id]').id);
}
const crossLink = contentFragment(await renderer.renderHtmlTree('<a href="#details">Details</a>', 'https://atcoder.jp/'), 'problem-test');
const crossTarget = contentFragment(await renderer.renderHtmlTree('<h3 id="details">Details</h3>', 'https://atcoder.jp/'), 'problem-test');
assert.equal(decodeURIComponent(crossLink.querySelector('a').hash.slice(1)), crossTarget.querySelector('h3').id, 'separate sections share only their owning problem namespace');
delete (globalThis as { document?: Document }).document;

const math = await renderer.renderMarkdownTree('$$a+b\n=c+d$$\n\nLiteral \\$5\n\n$$\nunclosed');
assert.ok(descendants(math, node => node.type === 'element' && hasClass(node, 'katex')).length > 0);
assert.ok(text(math).includes('unclosed'));
console.log('OJ content parser regressions passed');

const inputFormat = await renderer.renderHtmlTree('<pre><var>N</var> <var>M</var>\n<var>A_1</var> <var>\\ldots</var> <var>A_N</var>\n</pre>', 'https://atcoder.jp/contests/abc467/tasks/abc467_e');
assert.equal(elements(inputFormat, 'code').length, 0, 'a mathematical input format must not enter syntax highlighting');
assert.equal(elements(inputFormat, 'span').filter(node => hasClass(node, 'katex')).length, 5);
assert.ok(text(inputFormat).includes('\n'), 'input format keeps its line layout');

const equations = await renderer.renderHtmlTree('<p><img src="https://www.nowcoder.com/equation?tex=a%2Bb" alt="wrong alt"><img src="https://hr.nowcoder.com/equation?tex=n%20%5Cle%2010%5E5"></p><img src="https://example.org/equation?tex=x"><img src="https://www.nowcoder.com/figure.png"><pre><code>&lt;img src="https://www.nowcoder.com/equation?tex=x"&gt;</code></pre>', 'https://ac.nowcoder.com/acm/problem/322020');
assert.equal(elements(equations, 'span').filter(node => hasClass(node, 'katex')).length, 2, 'official equation images use local theme-readable math');
assert.equal(elements(equations, 'img').length, 2, 'ordinary images and other hosts remain images');
assert.equal(text(elements(equations, 'code')[0]), '<img src="https://www.nowcoder.com/equation?tex=x">', 'math conversion never touches literal code');

await build({ entryPoints: [path.join(root, 'extensions/becoder.oj-connect/src/markdownService.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['./markdown'], outfile: path.join(output, 'service.cjs') });
const { MarkdownService } = require(path.join(output, 'service.cjs'));
let renderCalls = 0;
const service = new MarkdownService(async () => ({ ...renderer, renderMarkdownTree: (value: string, lanqiao?: boolean) => { renderCalls++; return renderer.renderMarkdownTree(value, lanqiao); } }), 2);
const [firstTree, pendingTree] = await Promise.all([service.renderTree('same source'), service.renderTree('same source')]);
assert.equal(firstTree, pendingTree, 'in-flight tree requests share one parse');
assert.equal(await service.renderTree('same source'), firstTree, 'completed tree requests share the bounded cache');
assert.equal(renderCalls, 1);
await service.renderTree('second');
await service.renderTree('third');
await service.renderTree('same source');
assert.equal(renderCalls, 4, 'old trees are evicted at the entry budget');
service.clear();
await service.renderTree('same source');
assert.equal(renderCalls, 5, 'clear invalidates completed trees');
const htmlAtCoder = await service.renderHtmlTree('<img src="/x.png">', 'https://atcoder.jp/task');
const htmlOther = await service.renderHtmlTree('<img src="/x.png">', 'https://example.org/task');
assert.equal(elements(htmlAtCoder, 'img')[0].properties.src, 'https://atcoder.jp/x.png');
assert.equal(elements(htmlOther, 'img')[0].properties.src, 'https://example.org/x.png', 'the base URL is part of the cache identity');
const percentageService = new MarkdownService(async () => renderer);
const ordinaryPercentage = await percentageService.renderTree(observedPercentage);
const lanqiaoPercentage = await percentageService.renderTree(observedPercentage, true);
assert.equal(text(elements(ordinaryPercentage, 'annotation')[0]), String.raw`30 \\%`);
assert.equal(text(elements(lanqiaoPercentage, 'annotation')[0]), String.raw`30 \%`, 'the Lanqiao render cache does not reuse the ordinary-site tree');
assert.strictEqual(await percentageService.renderTree(observedPercentage), ordinaryPercentage);
assert.strictEqual(await percentageService.renderTree(observedPercentage, true), lanqiaoPercentage);
console.log('Shared content cache regressions passed');

// Shared parser contracts also run in a browser bundle; no DOM APIs are required here.
await build({ entryPoints: [shared], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(output, 'parser.cjs'), nodePaths });
const parser = require(path.join(output, 'parser.cjs'));
// Count only this normalization pass's closing-fence probes, independently of machine speed.
const closingFencePattern = /(\${2,})[ \t]*$/.source;
const originalExec = RegExp.prototype.exec;
let closingFenceProbes = 0;
RegExp.prototype.exec = function (input: string) {
	if (this.source === closingFencePattern) { closingFenceProbes++; }
	return originalExec.call(this, input);
};
const unmatchedLines = 256;
try { parser.parseMarkdown('$$x\n'.repeat(unmatchedLines), { dialect: 'luogu' }); }
finally { RegExp.prototype.exec = originalExec; }
assert.ok(closingFenceProbes <= unmatchedLines * 4, `unmatched display fences must not rescan every suffix (${closingFenceProbes} probes)`);
for (const fence of ['$$', '$$$$']) {
	for (const ending of ['\n', '\r\n']) {
		const tree = parser.parseMarkdown(`${fence}a+b${ending}=c+d${fence}${ending}`, { dialect: 'luogu' });
		assert.deepEqual(elements(tree, 'annotation').map(text), ['a+b\n=c+d'], 'normalization preserves wider fences and CRLF formula content');
	}
}
const beaconRawHtml = parser.parseBeaconMarkdown('<div>Do not lose this instruction</div>\n\nInline <b>literal</b> text.');
assert.ok(text(beaconRawHtml).includes('<div>Do not lose this instruction</div>'), 'Beacon raw HTML remains safe literal text instead of silently losing its content');
assert.ok(text(beaconRawHtml).includes('Inline <b>literal</b> text.'));
assert.equal(elements(beaconRawHtml, 'div').length, 0);
assert.equal(elements(beaconRawHtml, 'b').length, 0);
const directBeacon = parser.parseBeaconMarkdown('a\nb\n\n$x+y$', { streaming: false });
assert.equal(elements(directBeacon, 'br').length, 1);
assert.ok(elements(directBeacon, 'span').some(node => hasClass(node, 'math-formula')));
const beacon = parser.parseMarkdown('a\nb\n\n<img src="https://example.org/x">\n\n![hidden](https://example.org/image)\n\n$x+y$\n\n```cpp\n$literal$\n```', { dialect: 'beacon' });
assert.equal(elements(beacon, 'img').length, 0);
assert.equal(elements(beacon, 'br').length, 1);
assert.ok(elements(beacon, 'span').some(node => hasClass(node, 'math-formula') && text(node) === 'x+y'));
assert.equal(text(elements(beacon, 'code')[0]), '$literal$\n');
const normalizedMath = parser.parseMarkdown('Inline \\(a+b\\)\n\nGrowing $x+\\sqrt{', { dialect: 'beacon', streaming: true });
assert.equal(elements(normalizedMath, 'span').filter(node => hasClass(node, 'math-formula')).length, 2, 'shared Beacon entry owns delimiter and incomplete-math normalization');
const beaconLinks = parser.parseMarkdown('[relative](/account) [safe](https://example.org/a)', { dialect: 'beacon' });
assert.equal(elements(beaconLinks, 'a')[0].properties.href, '/account', 'Beacon relative links never inherit the Luogu site origin');
assert.equal(elements(beaconLinks, 'a')[1].properties.href, 'https://example.org/a');
const protocols = parser.parseMarkdown('[http](http://example.org/a) [mail](mailto:author@example.org) [xmpp](xmpp:author@example.org) [bad](javascript:alert) [bad2](data:text/plain,x) [bad3](command:evil)', { dialect: 'beacon' });
assert.deepEqual(elements(protocols, 'a').map(node => node.properties.href), ['http://example.org/a', 'mailto:author@example.org', 'xmpp:author@example.org', undefined, undefined, undefined], 'shared parsing preserves Beacon safe protocols without widening unsafe ones');
const html = parser.parseHtml('<p><var>a+b</var></p><pre><var>literal</var>  \n</pre><img src="/image.png" onerror="alert(1)" style="position:fixed"><script>bad()</script>', 'https://atcoder.jp/contests/abc086/tasks/abc086_a');
assert.equal(elements(html, 'script').length, 0);
assert.ok(descendants(html, node => node.type === 'element' && hasClass(node, 'katex')).length > 0);
assert.equal(elements(html, 'code').length, 0, 'explicit var inside an input-format pre remains mathematical');
assert.equal(elements(html, 'img')[0].properties.src, 'https://atcoder.jp/image.png');
assert.equal(elements(html, 'img')[0].properties.onError, undefined);
assert.equal(elements(html, 'img')[0].properties.style, undefined);
const escapedMerge = parser.parseMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n| \\^ | \\< |', { dialect: 'luogu' });
assert.equal(elements(escapedMerge, 'td').length, 4, 'escaped merge markers remain literal cells');
assert.ok(elements(escapedMerge, 'td').every(node => !node.properties.rowSpan && !node.properties.colSpan));
const closed = parser.parseMarkdown(':::warning[Closed]\ncontent\n:::\n\n## Heading', { dialect: 'luogu' });
assert.equal(elements(closed, 'details')[0].properties.open, false);
assert.equal(elements(closed, 'h2')[0].properties.id, 'heading');
assert.equal(elements(closed, 'a')[0].properties.href, '#heading');
assert.equal(descendants(closed, node => Boolean(node.position || node.data)).length, 0, 'render trees omit parser-only metadata after all dialect transforms');
await build({ entryPoints: [shared], bundle: true, platform: 'browser', format: 'iife', globalName: 'SharedContent', outfile: path.join(output, 'parser.browser.js'), nodePaths });

const beaconBundle = await build({
	stdin: { contents: `export { parseBeaconMarkdown } from ${JSON.stringify(shared)};`, resolveDir: root },
	bundle: true, platform: 'browser', format: 'esm', minify: true, metafile: true, write: false, nodePaths,
	alias: { katex: path.join(root, 'extensions/becoder.oj-connect/node_modules/katex') }
});
const beaconInputs = Object.values(beaconBundle.metafile.outputs).flatMap(output => Object.entries(output.inputs)).filter(([, input]) => input.bytesInOutput > 0).map(([name]) => name);
assert.ok(beaconInputs.every(name => !/(?:retext|rehype-raw|remark-directive|hast-util-from-html|katex)/.test(name)), 'fixed Beacon parser entry excludes Luogu-only transforms and eager formula rendering');
console.log('Shared Markdown/HTML policy regressions passed');

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

const math = await renderer.renderMarkdownTree('$$a+b\n=c+d$$\n\nLiteral \\$5\n\n$$\nunclosed');
assert.ok(descendants(math, node => node.type === 'element' && hasClass(node, 'katex')).length > 0);
assert.ok(text(math).includes('unclosed'));
console.log('OJ content parser regressions passed');

const inputFormat = await renderer.renderHtmlTree('<pre><var>N</var> <var>M</var>\n<var>A_1</var> <var>\\ldots</var> <var>A_N</var>\n</pre>', 'https://atcoder.jp/contests/abc467/tasks/abc467_e');
assert.equal(elements(inputFormat, 'code').length, 0, 'a mathematical input format must not enter syntax highlighting');
assert.equal(elements(inputFormat, 'span').filter(node => hasClass(node, 'katex')).length, 5);
assert.ok(text(inputFormat).includes('\n'), 'input format keeps its line layout');

await build({ entryPoints: [path.join(root, 'extensions/becoder.oj-connect/src/markdownService.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['./markdown'], outfile: path.join(output, 'service.cjs') });
const { MarkdownService } = require(path.join(output, 'service.cjs'));
let renderCalls = 0;
const service = new MarkdownService(async () => ({ ...renderer, renderMarkdownTree: (value: string) => { renderCalls++; return renderer.renderMarkdownTree(value); } }), 2);
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

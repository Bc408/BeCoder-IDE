/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { test } from 'node:test';
import { parseImportedProblem } from '../src/problem';

const { JSDOM } = require('jsdom');
const script = fs.readFileSync(path.resolve('extensions/becoder.cph/dist/problem-parser.js'), 'utf8');

async function parse(html: string, url: string) {
	const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
	try {
		Object.defineProperty(dom.window.crypto, 'randomUUID', { value: randomUUID });
		dom.window.fetch = () => { throw new Error('Parsers must not fetch resources.'); };
		const json = await dom.window.eval(`${script}\nBeCoderCompanion.parseCurrentProblem()`);
		return parseImportedProblem(json, url);
	} finally { dom.window.close(); }
}

const cf = `<div class="problem-statement"><div class="header">
<div class="title">A. Test</div><div class="time-limit"><div>Time limit</div>2 seconds</div>
<div class="memory-limit"><div>Memory</div>256 megabytes</div>
<div class="input-file"><div>Input</div>standard input</div>
<div class="output-file"><div>Output</div>standard output</div></div>
<div class="input"><pre>1<br>2</pre></div><div class="output"><pre>3</pre></div></div>`;

test('bundled CF parser returns data without requiring extension APIs or network', async () => {
	const result = await parse(cf, 'https://codeforces.com/problemset/problem/1/A');
	assert.strictEqual(result.name, 'A. Test');
	assert.strictEqual(result.timeLimit, 2000);
	assert.deepStrictEqual(result.tests, [{ input: '1\n2\n', output: '3\n' }]);
});

const fixture = (name: string) => fs.readFileSync(path.resolve('extensions/becoder.cph/test/fixtures', name), 'utf8');

test('CSES live-page fixture extracts the actual example and limits', async () => {
	const result = await parse(fixture('cses-1068.html'), 'https://cses.fi/problemset/task/1068');
	assert.strictEqual(result.name, 'Weird Algorithm');
	assert.strictEqual(result.group, 'CSES - CSES Problem Set');
	assert.strictEqual(result.timeLimit, 1000);
	assert.strictEqual(result.memoryLimit, 512);
	assert.deepStrictEqual(result.tests, [{ input: '3\n', output: '3 10 5 16 8 4 2 1\n' }]);
});

test('HDU live-page fixture uses Others limits for C/C++ and ignores sample decorations', async () => {
	for (const url of ['https://acm.hdu.edu.cn/showproblem.php?pid=1000', 'http://acm.hdu.edu.cn/showproblem.php?pid=1000']) {
		const result = await parse(fixture('hdu-1000.html'), url);
		assert.strictEqual(result.name, 'A + B Problem');
		assert.strictEqual(result.timeLimit, 1000);
		assert.strictEqual(result.memoryLimit, 32);
		assert.deepStrictEqual(result.tests, [{ input: '1 1\n', output: '2\n' }]);
	}
});

const acwing = `<h1 class="problem-content-title">1. A + B</h1><div class="martor-preview">
<pre>not a sample</pre><h4>输入样例：</h4><pre>1 2</pre><h4>输出样例：</h4><pre>3</pre></div>
<table class="table table-striped"><tr><td>1s</td><td>64MB</td></tr></table>`;
const loj = `<h1 class="ui header"><span>#1. 求和</span></h1>
<span class="label"><i class="clock icon"></i>1000 ms</span>
<span class="label"><i class="microchip icon"></i>256 MiB</span>
<pre class="_sampleDataPre_x"> 1 2 </pre><pre class="_sampleDataPre_x">3</pre>
<pre class="_sampleDataPre_y"></pre><pre class="_sampleDataPre_y">EOF</pre>`;
const dmoj = `<div class="problem-title"><h2>CCC - Sum</h2></div>
<div class="problem-info-entry"><i class="fa-clock-o"></i>\nTime limit:\n1.5s</div>
<div class="problem-info-entry"><i class="fa-server"></i>\nMemory limit:\n128M</div>
<h4>Sample Input 1</h4><pre><code>1 2</code></pre><h4>Sample Output 1</h4><pre>3</pre>
<h4>Sample Explanation</h4><pre>not a sample</pre>`;

test('AcWing upstream DOM contract extracts samples after the sample header', async () => {
	const result = await parse(acwing, 'https://www.acwing.com/problem/content/1/');
	assert.strictEqual(result.name, 'A + B');
	assert.strictEqual(result.timeLimit, 1000);
	assert.strictEqual(result.memoryLimit, 64);
	assert.deepStrictEqual(result.tests, [{ input: '1 2\n', output: '3\n' }]);
});

test('LibreOJ upstream DOM contract preserves whitespace and empty-input EOF', async () => {
	const result = await parse(loj, 'https://loj.ac/p/1');
	assert.strictEqual(result.name, '#1. 求和');
	assert.strictEqual(result.timeLimit, 1000);
	assert.strictEqual(result.memoryLimit, 256);
	assert.deepStrictEqual(result.tests, [{ input: ' 1 2 \n', output: '3\n' }, { input: '', output: 'EOF\n' }]);
});

test('DMOJ upstream DOM contract handles code wrappers, limits and heading variants', async () => {
	for (const heading of ['Sample Output 1', 'Output for Sample Input 1']) {
		const result = await parse(dmoj.replace('Sample Output 1', heading), 'https://dmoj.ca/problem/aplusb');
		assert.strictEqual(result.name, 'Sum');
		assert.strictEqual(result.group, 'DMOJ - CCC');
		assert.strictEqual(result.timeLimit, 1500);
		assert.strictEqual(result.memoryLimit, 128);
		assert.deepStrictEqual(result.tests, [{ input: '1 2\n', output: '3\n' }]);
	}
});

test('new parser routes include CSES examples, HDU contests and LibreOJ archive contests', async () => {
	const cses = `<div class="title-block"><h1>Sum</h1><h3><a>Contest</a></h3></div>
	<div class="task-constraints">1 s 512 MB</div><div class="content"><pre>explanation</pre>
	<h2 id="example1">Example</h2><pre>1</pre><pre>2</pre><pre>ignored explanation</pre>
	<h2 id="example2">Example</h2><pre>3</pre><pre>4</pre></div>`;
	const result = await parse(cses, 'https://www.cses.fi/contest/task/100?lang=en');
	assert.deepStrictEqual(result.tests, [{ input: '1\n', output: '2\n' }, { input: '3\n', output: '4\n' }]);
	await assert.rejects(parse(cses.replace('<pre>4</pre>', ''), 'https://cses.fi/problemset/task/100'), /Incomplete/);
	const hdu = await parse(fixture('hdu-1000.html'), 'https://acm.hdu.edu.cn/contests/contest_showproblem.php?pid=1000&cid=1');
	assert.strictEqual(hdu.tests[0].output, '2\n');
	const archive = `<title>Sum - Archive Contest</title><h1 class="ui header">Sum</h1>
	<div class="row"><span class="ui label">内存：128</span><span class="ui label">时间：2000</span></div>
	<div class="row"><h4>样例</h4><pre><code>1 2</code></pre><pre><code>3</code></pre></div>`;
	const archived = await parse(archive, 'https://libreoj.github.io/contest/test/problem/1');
	assert.strictEqual(archived.group, 'LibreOJ - Archive Contest');
	assert.strictEqual(archived.timeLimit, 2000);
	assert.strictEqual(archived.memoryLimit, 128);
	assert.deepStrictEqual(archived.tests, [{ input: '1 2\n', output: '3\n' }]);
});

test('new OJ parsers reject missing pages, incomplete samples and disguised hosts', async () => {
	for (const [html, url] of [
		[acwing, 'https://www.acwing.com/problem/content/1/'],
		[loj, 'https://loj.ac/p/1'],
		[dmoj, 'https://dmoj.ca/problem/aplusb'],
		[fixture('cses-1068.html'), 'https://cses.fi/problemset/task/1068'],
		[fixture('hdu-1000.html'), 'https://acm.hdu.edu.cn/showproblem.php?pid=1000']
	]) {
		await assert.rejects(parse('<html><title>Login or unavailable</title></html>', url));
		const spoof = new URL(url); spoof.hostname += '.evil.invalid';
		await assert.rejects(parse(html, spoof.href), /not supported/);
	}
	await assert.rejects(parse(acwing.replace('<pre>3</pre>', ''), 'https://www.acwing.com/problem/content/1/'), /Incomplete/);
	await assert.rejects(parse(loj.replace('<pre class="_sampleDataPre_y">EOF</pre>', ''), 'https://loj.ac/p/1'), /Incomplete/);
	await assert.rejects(parse(dmoj.replace('<h4>Sample Output 1</h4><pre>3</pre>', ''), 'https://dmoj.ca/problem/aplusb'), /Incomplete/);
	await assert.rejects(parse(fixture('acwing-1.html'), 'https://www.acwing.com/problem/content/1/'));
});

test('interactive and file-based CF tasks are rejected by import policy', async () => {
	await assert.rejects(parse(cf + '<div class="section-title">Interaction</div>', 'https://codeforces.com/contest/1/problem/A'), /Interactive/);
	await assert.rejects(parse(cf.replace('standard input', 'input.txt'), 'https://codeforces.com/contest/1/problem/A'), /standard input/);
});

test('Luogu structured data parsing preserves Unicode and samples', async () => {
	const data = { data: { problem: { pid: 'P1001', name: '求和', limits: { time: [1000], memory: [131072] }, samples: [['1 2', '3']] } } };
	const result = await parse(`<script id="lentille-context" type="application/json">${JSON.stringify(data)}</script>`, 'https://www.luogu.com.cn/problem/P1001');
	assert.strictEqual(result.name, 'P1001 求和');
	assert.strictEqual(result.memoryLimit, 128);
	assert.deepStrictEqual(result.tests, [{ input: '1 2\n', output: '3\n' }]);
});

test('unsupported hosts and resource-fetch pages fail without local POST', async () => {
	await assert.rejects(parse(cf, 'https://codeforces.com.evil.invalid/contest/1/problem/A'), /not supported/);
	await assert.rejects(parse('<embed type="application/pdf">', 'https://codeforces.com/contest/1/problem/A'), /additional resource/);
});

test('AtCoder Japanese sample sections produce one sample pair', async () => {
	const result = await parse(`<h2>A - Sum</h2><a class="contest-title">ABC</a>
	<p>Time Limit: 2 sec / Memory Limit: 1024 MiB</p><div id="task-statement">
	<h3>入力例 1</h3><pre>1 2</pre><h3>出力例 1</h3><pre>3</pre></div>`,
	'https://atcoder.jp/contests/abc001/tasks/abc001_1');
	assert.strictEqual(result.timeLimit, 2000);
	assert.strictEqual(result.group, 'AtCoder - ABC');
	assert.deepStrictEqual(result.tests, [{ input: '1 2\n', output: '3\n' }]);
});

test('Lanqiao DOM parser extracts title, limits and paired samples', async () => {
	const result = await parse(`<div class="course-name">求和</div><h2 id="运行限制">运行限制</h2>
	<p>时间 1 秒 内存 256 MB</p><pre><code>1 2</code></pre><pre><code>3</code></pre>`,
	'https://www.lanqiao.cn/problems/1/learning/');
	assert.strictEqual(result.name, '求和');
	assert.strictEqual(result.memoryLimit, 256);
	assert.deepStrictEqual(result.tests, [{ input: '1 2\n', output: '3\n' }]);
});

test('NowCoder ACM parser extracts independent sample blocks', async () => {
	const result = await parse(`<h1 class="terminal-topic-title">Sum</h1><div class="question-intr">
	<div class="subject-item-wrap"><span>1 秒</span><span>256 MB</span></div></div>
	<div class="question-oi-bd"><pre>1 2</pre><pre>3</pre></div>`,
	'https://ac.nowcoder.com/acm/problem/1001');
	assert.strictEqual(result.timeLimit, 1000);
	assert.deepStrictEqual(result.tests, [{ input: '1 2\n', output: '3\n' }]);
});

test('SPOJ parser handles separately labelled sample blocks', async () => {
	const result = await parse(`<h1 id="problem-name">SUM - Sum</h1><ol class="breadcrumb"><li>Home</li><li>classical</li></ol>
	<div id="problem-body"><h3>Example</h3><pre>Input:\n1 2</pre><pre>Output:\n3</pre></div>
	<table id="problem-meta"><tbody><tr><td>Time limit:</td><td>1s</td></tr><tr><td>Memory limit:</td><td>256MB</td></tr></tbody></table>`,
	'https://www.spoj.com/problems/SUM/');
	assert.strictEqual(result.name, 'Sum');
	assert.deepStrictEqual(result.tests, [{ input: '1 2\n', output: '3\n' }]);
});

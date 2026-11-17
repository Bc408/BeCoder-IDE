/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { cphSamples } from '../src/cphHost';
function fixture() {
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM('<body></body>', { url: 'https://atcoder.jp/', runScripts: 'outside-only' });
	dom.window.TextEncoder = TextEncoder;
	dom.window.fetch = async () => { throw new Error('Unexpected website request'); };
	const script = fs.readFileSync(path.resolve(__dirname, '../../dist/site-scripts.js'), 'utf8');
	dom.window.eval(script);
	return dom;
}

test('the injected runtime cannot submit Luogu code or create its DOM captcha', () => {
	const dom = fixture();
	try { assert.strictEqual(dom.window.BeCoderOj.submitLuogu, undefined); assert.strictEqual(dom.window.BeCoderOj.prepareLuogu, undefined); }
	finally { dom.window.close(); }
});

test('AtCoder reads bilingual raw statements and sample whitespace without rendered-page pollution', async () => {
	const dom = fixture();
	const problem = { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
	dom.reconfigure({ url: problem.url });
	dom.window.fetch = async () => new Response('<span class="h2">A - Product</span><p>Time Limit: 2 sec / Memory Limit: 256 MiB</p><div id="task-statement"><span class="lang-ja"><section><h3>入力例 1</h3><pre> 3 4\n</pre></section><section><h3>出力例 1</h3><pre>Even\n</pre><p>EXPLANATION_REQUIRED <var>a+b</var></p></section><var>a*b</var></span><span class="lang-en">English <var>a*b</var></span></div>');
	try {
		const value = await dom.window.BeCoderOj.readAtCoderProblem(problem, 'read-one');
		assert.deepStrictEqual(Array.from(value.bodies, (body: any) => body.locale), ['ja', 'en']);
		assert.strictEqual(value.samples[0].input, ' 3 4\n');
		assert.strictEqual(value.limits[0].value, '2.00s');
		assert.strictEqual(value.limits[1].value, '256.00MiB');
		assert.ok(value.bodies[0].sections[0].content.includes('<var>a*b</var>'));
		assert.ok(!value.bodies[0].sections[0].content.includes('入力例'), 'samples appear once in the common sample section');
		assert.ok(!value.bodies[0].sections[0].content.includes('EXPLANATION_REQUIRED'), 'sample explanation must not precede the sample grid');
		assert.strictEqual(value.bodies[0].sections[1].kind, 'sample-explanation');
		assert.strictEqual(value.bodies[0].sections[1].sampleIndex, 0);
		assert.ok(value.bodies[0].sections[1].content.includes('EXPLANATION_REQUIRED'));
	} finally { dom.window.close(); }
});

test('AtCoder limits use Luogu units and remain usable by CPH', async () => {
	const dom = fixture();
	const problem = { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
	dom.reconfigure({ url: problem.url });
	try {
		for (const [limits, expected, milliseconds, memoryMiB] of [
			['Time Limit: 0.5 sec / Memory Limit: 256 MiB', ['Time Limit=500ms', 'Memory Limit=256.00MiB'], 500, 256],
			['Time Limit: 60 sec / Memory Limit: 1024 MiB', ['Time Limit=1.00min', 'Memory Limit=1.00GiB'], 60000, 1024],
			['Time Limit: 3600 sec / Memory Limit: 1 MB', ['Time Limit=1.00h', 'Memory Limit=976.56KiB'], 3600000, 976.56 / 1024],
			['Time Limit: 0 sec / Memory Limit: 0 MiB', [], undefined, undefined],
			['Time Limit: -2 sec / Memory Limit: -256 MiB', [], undefined, undefined],
			['Time Limit: 1.2.3 sec / Memory Limit: 256.1.2 MiB', [], undefined, undefined],
			['Time Limit: unavailable / Memory Limit: unknown', [], undefined, undefined]
		] as const) {
			dom.window.fetch = async () => new Response('<span class="h2">A - Product</span><p>' + limits + '</p><div id="task-statement"><p>Statement</p></div>');
			const value = await dom.window.BeCoderOj.readAtCoderProblem(problem, 'read-limits');
			assert.deepStrictEqual(Array.from(value.limits, (item: any) => item.label + '=' + item.value), [...expected]);
			const payload = cphSamples(value) as { timeLimitMs?: number; memoryLimitMiB?: number };
			assert.strictEqual(payload.timeLimitMs, milliseconds);
			assert.strictEqual(payload.memoryLimitMiB, memoryMiB);
		}
	} finally { dom.window.close(); }
});

test('AtCoder common chapter headings follow Luogu without translating prose or code', async () => {
	const dom = fixture();
	const problem = { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
	dom.reconfigure({ url: problem.url });
	dom.window.fetch = async () => new Response('<div id="task-statement"><span class="lang-en"><section><h3 id="statement">Problem Statement</h3><p>English statement <var>a+b</var>.</p><pre><code>Input:\n</code></pre></section><section><h3>Constraints</h3><ul><li>All values are integers.</li></ul></section><section><h3>Input</h3><pre><var>N</var>\n<var>A</var></pre></section><section><h3>Output</h3><p>Print the answer.</p></section></span><span class="lang-ja"><section><h3>問題文</h3><p>日本語の本文。</p></section><section><h3>制約</h3><p>整数。</p></section><section><h3>入力</h3><pre><var>N</var></pre></section><section><h3>出力</h3><p>答え。</p></section></span></div>');
	try {
		const value = await dom.window.BeCoderOj.readAtCoderProblem(problem, 'read-chapters');
		for (const body of value.bodies) {
			const page = new dom.window.DOMParser().parseFromString(body.sections.map((section: any) => section.content).join(''), 'text/html');
			assert.deepStrictEqual(Array.from(page.querySelectorAll('h2'), (heading: any) => heading.textContent), ['题目描述', body.locale === 'en' ? 'Constraints' : '制約', '输入格式', '输出格式']);
			assert.ok(page.querySelector('var'));
			if (body.locale === 'en') {
				assert.strictEqual(page.querySelector('#statement')?.textContent, '题目描述');
				assert.strictEqual(page.querySelector('code')?.textContent, 'Input:\n');
				assert.ok(page.body.textContent.includes('English statement'));
			} else { assert.ok(page.body.textContent.includes('日本語の本文')); }
		}
	} finally { dom.window.close(); }
});

test('the injected runtime does not expose programmatic account logout', () => {
	const dom = fixture();
	try { assert.strictEqual(dom.window.BeCoderOj.logoutAtCoder, undefined); }
	finally { dom.window.close(); }
});

test('AtCoder login checks are owned by main rather than an injected page runtime', () => {
	const dom = fixture();
	try { assert.strictEqual(dom.window.BeCoderOj.readAtCoderLogin, undefined); }
	finally { dom.window.close(); }
});

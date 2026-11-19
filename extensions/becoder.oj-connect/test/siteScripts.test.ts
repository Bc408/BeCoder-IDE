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

test('Codeforces reads current DOM sections and reuses exact CPH samples and limits', async () => {
	const dom = fixture();
	try {
		assert.strictEqual(typeof dom.window.BeCoderOj.readCodeforcesProblem, 'function');
		const problem = { site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
		dom.reconfigure({ url: 'https://codeforces.com/problemset/problem/4/A?locale=en' });
		dom.window.document.body.innerHTML = '<div class="problem-statement"><div class="header"><div class="title">A. Watermelon</div></div><div><p>Split $$$w$$$.</p></div><div class="input-specification"><div class="section-title">Input</div><p>Weight.</p></div><div class="output-specification"><div class="section-title">Output</div><p>YES or NO.</p></div><div class="sample-tests">DUPLICATED_SAMPLE</div><div class="note"><div class="section-title">Note</div><p>Explanation.</p></div></div>';
		const companion = { url: dom.window.location.href, name: 'A. Watermelon', tests: [{ input: ' 8\n', output: 'YES\n' }], timeLimit: 1000, memoryLimit: 64, interactive: false };
		const value = await dom.window.BeCoderOj.readCodeforcesProblem({ problem, companion }, 'cf-read');
		assert.strictEqual(JSON.stringify(value.samples), JSON.stringify(companion.tests));
		assert.deepStrictEqual(Array.from(value.limits, (limit: any) => limit.label + '=' + limit.value), ['Time Limit=1.00s', 'Memory Limit=64.00MiB']);
		assert.strictEqual(value.title, 'Watermelon');
		assert.deepStrictEqual(Array.from(value.bodies[0].sections, (section: any) => section.heading), ['题目描述', '输入格式', '输出格式', '说明/提示']);
		assert.strictEqual(value.bodies[0].sections.at(-1).kind, 'notes');
		assert.ok(!JSON.stringify(value.bodies).includes('DUPLICATED_SAMPLE'));
		assert.ok(JSON.stringify(value.bodies).includes('<var>w</var>'));
		await assert.rejects(dom.window.BeCoderOj.readCodeforcesProblem({ problem, companion: { ...companion, url: 'https://codeforces.com/contest/5/problem/A' } }, 'cf-other'));
	} finally { dom.window.close(); }
});

test('Codeforces strips only the matching official title index and formats limits like Luogu', async () => {
	const dom = fixture();
	try {
		const problem = { site: 'codeforces', nativeId: '2121/H', url: 'https://codeforces.com/contest/2121/problem/H' };
		dom.reconfigure({ url: problem.url });
		dom.window.document.body.innerHTML = '<div class="problem-statement"><div class="header"><div class="title">H. Ice Baby</div></div></div>';
		for (const [name, title] of [['H. Ice Baby', 'Ice Baby'], ['Ice Baby', 'Ice Baby'], ['A. Different title', 'A. Different title']]) {
			const value = await dom.window.BeCoderOj.readCodeforcesProblem({ problem, companion: { url: problem.url, name, tests: [], interactive: false, timeLimit: 2000, memoryLimit: 512 } }, 'cf-title');
			assert.strictEqual(value.title, title);
			assert.deepStrictEqual(Array.from(value.limits, (limit: any) => limit.value), ['2.00s', '512.00MiB']);
			const samples = cphSamples(value) as { timeLimitMs?: number; memoryLimitMiB?: number };
			assert.strictEqual(samples.timeLimitMs, 2000);
			assert.strictEqual(samples.memoryLimitMiB, 512);
		}
	} finally { dom.window.close(); }
});

test('Codeforces title cleanup preserves compound indices and punctuation in the actual name', async () => {
	const dom = fixture();
	try {
		const problem = { site: 'codeforces', nativeId: '1985/F1', url: 'https://codeforces.com/contest/1985/problem/F1' };
		dom.reconfigure({ url: problem.url });
		dom.window.document.body.innerHTML = '<div class="problem-statement"><div class="header"><div class="title">F1. Test</div></div></div>';
		for (const [name, title] of [['F1. A. Keep - punctuation', 'A. Keep - punctuation'], ['F. Different index', 'F. Different index'], ['F1. F1. Real title', 'F1. Real title']]) {
			const value = await dom.window.BeCoderOj.readCodeforcesProblem({ problem, companion: { url: problem.url, name, tests: [], interactive: false } }, 'cf-compound-title');
			assert.strictEqual(value.title, title);
		}
	} finally { dom.window.close(); }
});

test('Codeforces converts native formulas and rendered MathJax sources without touching code', async () => {
	const dom = fixture();
	try {
		const problem = { site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
		dom.reconfigure({ url: problem.url });
		dom.window.document.body.innerHTML = '<div class="problem-statement"><div class="header"><div class="title">A. Test</div></div><div><p>$$$a+b$$$ $$$$$$c+d$$$$$$</p><pre><code>$$$literal$$$</code></pre><span class="MathJax_Preview">visual duplicate</span><span class="MathJax" id="MathJax-Element-1-Frame">rendered duplicate</span><script type="math/tex" id="MathJax-Element-1">x&lt;y</script><div class="MathJax_Display">display duplicate</div><script type="math/tex; mode=display">z^2</script></div></div>';
		const value = await dom.window.BeCoderOj.readCodeforcesProblem({ problem, companion: { url: problem.url, name: 'Test', tests: [], interactive: false } }, 'cf-math');
		const page = new dom.window.DOMParser().parseFromString(value.bodies[0].sections[0].content, 'text/html');
		assert.deepStrictEqual(Array.from(page.querySelectorAll('var'), (node: any) => [node.textContent, node.className]), [['a+b', ''], ['c+d', 'oj-math-display'], ['x&lt;y', ''], ['z^2', 'oj-math-display']]);
		assert.strictEqual(page.querySelector('code')?.textContent, '$$$literal$$$');
		assert.ok(!page.body.textContent.includes('duplicate')); assert.strictEqual(page.querySelector('script'), null);
	} finally { dom.window.close(); }
});

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

test('AtCoder strips only the matching task index from the official heading', async () => {
	const dom = fixture();
	try {
		for (const [task, heading, title] of [
			['abc484_c', 'C - Move One Card', 'Move One Card'],
			['abc484_c', 'Move One Card', 'Move One Card'],
			['abc484_c', 'C - Move - One Card', 'Move - One Card'],
			['abc484_c', 'C - C - Real title', 'C - Real title'],
			['abc484_c', 'A - Different index', 'A - Different index'],
			['abc484_c', 'Card - Game', 'Card - Game'],
			['abc484_c', 'C - ', 'C -'],
			['abc484_c', '', 'abc484/abc484_c'],
			['abc484_ex', 'Ex - Extra - Task', 'Extra - Task'],
			['abc484_c1', 'C1 - Subtask', 'Subtask']
		]) {
			const problem = { site: 'atcoder', nativeId: 'abc484/' + task, url: 'https://atcoder.jp/contests/abc484/tasks/' + task };
			dom.reconfigure({ url: problem.url });
			dom.window.fetch = async () => new Response('<span class="h2">' + heading + '<span class="badge">300</span></span><div id="task-statement"><p>Statement</p></div>');
			const value = await dom.window.BeCoderOj.readAtCoderProblem(problem, 'atcoder-title');
			assert.strictEqual(value.title, title);
			assert.strictEqual(value.ref.nativeId, problem.nativeId);
		}
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

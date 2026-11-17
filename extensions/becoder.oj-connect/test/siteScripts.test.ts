/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
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
		assert.strictEqual(value.limits[0].value, '2 sec');
		assert.ok(value.bodies[0].sections[0].content.includes('<var>a*b</var>'));
		assert.ok(!value.bodies[0].sections[0].content.includes('入力例'), 'samples appear once in the common sample section');
		assert.ok(!value.bodies[0].sections[0].content.includes('EXPLANATION_REQUIRED'), 'sample explanation must not precede the sample grid');
		assert.strictEqual(value.bodies[0].sections[1].kind, 'sample-explanation');
		assert.strictEqual(value.bodies[0].sections[1].sampleIndex, 0);
		assert.ok(value.bodies[0].sections[1].content.includes('EXPLANATION_REQUIRED'));
	} finally { dom.window.close(); }
});

test('AtCoder logout follows inspected official POST form and confirms fresh signed-out state', async () => {
	const dom = fixture();
	dom.reconfigure({ url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' });
	let posts = 0, gets = 0;
	dom.window.fetch = async (url: string, options: any) => {
		if (options.method === 'POST') {
			assert.strictEqual(url, '/logout'); assert.strictEqual(String(options.body), 'csrf_token=fresh-form-token'); posts++;
			return new Response('');
		}
		assert.strictEqual(url, '/'); gets++;
		return new Response(`<script>var userScreenName = '${gets === 1 ? 'fixture-user' : ''}';</script><form action="/logout" method="post"><input type="hidden" name="csrf_token" value="fresh-form-token"></form>`);
	};
	try { assert.strictEqual(await dom.window.BeCoderOj.logoutAtCoder(null, 'logout-atcoder'), true); assert.strictEqual(posts, 1); assert.strictEqual(gets, 2); }
	finally { dom.window.close(); }
});

test('AtCoder login checks are owned by main rather than an injected page runtime', () => {
	const dom = fixture();
	try { assert.strictEqual(dom.window.BeCoderOj.readAtCoderLogin, undefined); }
	finally { dom.window.close(); }
});

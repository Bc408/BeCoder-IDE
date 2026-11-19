/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeAtCoderHTML, parseAtCoderRecordHTML, checkAtCoderSourceResponse, extractAtCoderSourceHTML } from '../../common/atcoderSubmission.js';
import * as atCoderSubmission from '../../common/atcoderSubmission.js';

// Pure HTML/response parsing; no tracked IDisposable instances.
// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('AtCoder record parsing', () => {
	test('readonly compiler catalogue reads the contest submit form independently of source and verification', () => {
		const parse = Reflect.get(atCoderSubmission, 'parseAtCoderLanguages');
		assert.strictEqual(typeof parse, 'function');
		const problem = { site: 'atcoder' as const, nativeId: 'abc484/abc484_c', url: 'https://atcoder.jp/contests/abc484/tasks/abc484_c' };
		const html = '<html><body><form method="post" action="/contests/abc484/submit"><select name="data.TaskScreenName"><option value="abc484_c" selected>C</option></select><div id="select-lang"><select name="data.LanguageId"><option value="1">C++23 (GCC 15.2.0)</option><option value="2">C23 (GCC 14.2.0)</option><option value="3">Python</option><option disabled value="4">C++20</option></select></div></form></body></html>';
		assert.deepStrictEqual(parse(problem, html), [{ id: '1', label: 'C++23 (GCC 15.2.0)', family: 'cpp' }, { id: '2', label: 'C23 (GCC 14.2.0)', family: 'c' }]);
		const grouped = html.replace('<div id="select-lang">', '<div id="select-lang-abc484_c">').replace('</form>', '<div id="select-lang-abc484_d"><select><option value="999">C++17 (Other task)</option></select></div></form>');
		assert.deepStrictEqual(parse(problem, grouped).map(option => option.id), ['1', '2'], 'the official per-task group excludes other task directories');
		assert.throws(() => parse(problem, html.replace('abc484_c" selected', 'abc484_d" selected')), /task/);
		assert.throws(() => parse(problem, html.replace('action="/contests/abc484/submit"', 'action="https://evil.test/submit"')), /form/);
		assert.throws(() => parse(problem, '<html><body><form action="/login"><input name="username"></form></body></html>'), /login-required/);
		assert.throws(() => parse(problem, '<html><body>Just a moment</body></html>'), /form/);
		assert.throws(() => parse(problem, html.replace('</html>', '')), /incomplete/);
	});

	const url = 'https://atcoder.jp/contests/abc086/submissions/80773297';
	test('session-only HTML parser preserves source, real tests and compiler output', () => {
		const problem = { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
		const record = { problem, id: '80773297', url };
		const html = `<pre id="submission-code">// &amp;lt; &lt;x&gt; &#x1f600;\nint main() {}\n</pre>
		<table><tr><th>Task</th><td><a href="${problem.url}">A</a></td></tr><tr><th>User</th><td><a href="/users/test-user">test-user</a></td></tr><tr><th>Language</th><td>C++23</td></tr><tr><th>Status</th><td id="judge-status"><span>CE</span></td></tr></table>
		<h4>Compile Error</h4><pre>./Main.cpp: &lt;error&gt;\n ^~~\n</pre>
		<table><tr><th>Case Name</th><th>Status</th><th>Exec Time</th><th>Memory</th></tr><tr><td>sample_01</td><td>AC</td><td>1 ms</td><td>2048 KB</td></tr></table>`;
		const snapshot = parseAtCoderRecordHTML(record, html);
		assert.strictEqual(snapshot.source, '// &lt; <x> 😀\nint main() {}\n');
		assert.strictEqual(snapshot.rawStatus, 'CE'); assert.strictEqual(snapshot.phase, 'finished');
		assert.strictEqual(snapshot.compileMessage, './Main.cpp: <error>\n ^~~\n');
		assert.deepStrictEqual(snapshot.groups, [{ name: 'Test Cases', rows: [['sample_01', 'AC', '1 ms', '2048 KB']] }]);
		assert.throws(() => parseAtCoderRecordHTML({ ...record, problem: { ...problem, url: problem.url + 'wrong' } }, html), /task-mismatch/);
		assert.strictEqual(decodeAtCoderHTML('&amp;amp; &#39; &#x22;'), '&amp; \' "');
	});

	test('reads escaped source from original pre without Ace gutter and measurement text', () => {
		const html = '<html><pre class="prettyprint" id="submission-code">#include &lt;iostream&gt;\nint main() { return 123; }\n</pre><script>renderAce()</script></html>';
		assert.strictEqual(extractAtCoderSourceHTML(html), '#include &lt;iostream&gt;\nint main() { return 123; }\n');
		assert.throws(() => extractAtCoderSourceHTML('<pre id="submission-code"><div class="ace_gutter">123</div>garbage</pre>'), /source/);
		assert.throws(() => extractAtCoderSourceHTML('<html>Sign In</html>'), /source/);
		assert.throws(() => extractAtCoderSourceHTML(html + html), /source/);
	});

	test('accepts HTML response with empty URL as returned by Electron fetch', () => {
		const response = new Response('<pre id="submission-code">int main() {}</pre>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
		assert.strictEqual(response.url, '');
		assert.doesNotThrow(() => checkAtCoderSourceResponse(response));
	});

	test('rejects redirects, denied requests, non-HTML and missing bodies with safe diagnostics', () => {
		for (const response of [new Response('', { status: 302 }), new Response('', { status: 403 }), new Response('{}', { headers: { 'Content-Type': 'application/json' } }), new Response(null, { headers: { 'Content-Type': 'text/html' } })]) {
			assert.throws(() => checkAtCoderSourceResponse(response), /atcoder-source-response status=\d+ html=(true|false) body=(true|false)/);
		}
	});
});

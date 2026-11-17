/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeAtCoderHTML, parseAtCoderRecordHTML, checkAtCoderSourceResponse, extractAtCoderSourceHTML } from '../../common/atcoderSubmission.js';

// Pure HTML/response parsing; no tracked IDisposable instances.
// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('AtCoder record parsing', () => {

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

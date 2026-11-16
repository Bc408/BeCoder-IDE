/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { checkAtCoderSourceResponse, extractAtCoderSourceHTML, readAtCoderSubmission, type IAtCoderSubmissionPage } from '../../common/atcoderSubmission.js';

// Structural watcher handles are checked directly; this isolated probe has no tracked IDisposable instances.
// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('AtCoder submission experiment', () => {

	const url = 'https://atcoder.jp/contests/abc086/submissions/80773297';
	function page(): IAtCoderSubmissionPage {
		return {
			ownerWindowId: 7, url: () => url, loading: () => false, closed: () => false,
			watchChange: () => ({ dispose() { } }),
			read: async () => ({ url, submissionId: '80773297', contestId: 'abc086', source: 'int main() {}\n', taskUrl: 'https://atcoder.jp/contests/abc086/tasks/abc086_a', owner: 'test-user', status: 'AC', info: [['Score', '100']], tests: [['sample', 'AC', '1 ms', '3480 KiB']] })
		};
	}

	test('returns exact source and formal identity without treating another account as self', async () => {
		const result = await readAtCoderSubmission(page(), 7, url);
		assert.strictEqual(result.source, 'int main() {}\n');
		assert.strictEqual(result.submissionId, '80773297');
		assert.strictEqual(result.owner, 'test-user');
		assert.strictEqual(result.viewerIdentity, 'unverified');
	});
	test('metadata mode preserves a record without claiming inaccessible source was verified', async () => {
		const p = page(), read = p.read;
		p.read = async code => ({ ...await read(code) as object, source: '' });
		await assert.rejects(readAtCoderSubmission(p, 7, url), /incomplete/);
		const record = await readAtCoderSubmission(p, 7, url, 1000, true);
		assert.strictEqual(record.submissionId, '80773297');
		assert.strictEqual(record.sourceRepresentation, 'unavailable');
	});

	test('preserves bounded compiler output independently from source visibility', async () => {
		const p = page(), read = p.read;
		p.read = async code => ({ ...await read(code) as object, status: 'CE', source: '', compileMessage: 'error: <cin>\n  ^~~\n' });
		const snapshot = await readAtCoderSubmission(p, 7, url, 1000, true);
		assert.strictEqual(snapshot.compileMessage, 'error: <cin>\n  ^~~\n');
		assert.strictEqual(snapshot.sourceRepresentation, 'unavailable');
		for (const compileMessage of [1, 'x'.repeat(524289)]) {
			p.read = async code => ({ ...await read(code) as object, compileMessage });
			await assert.rejects(readAtCoderSubmission(p, 7, url), /incomplete/);
		}
	});

	test('rejects another window before reading its DOM', async () => {
		const p = page();
		p.read = async () => { assert.fail('must not read another window'); };
		await assert.rejects(readAtCoderSubmission(p, 8, url), /owner/);
	});

	test('rejects foreign hosts and non-detail routes before reading', async () => {
		for (const other of ['https://atcoder.jp.evil.test/contests/abc086/submissions/1', 'http://atcoder.jp/contests/abc086/submissions/1', 'https://atcoder.jp/contests/abc086/submissions/me']) {
			const p = page();
			p.url = () => other;
			p.read = async () => { assert.fail('must not read unsupported route'); };
			await assert.rejects(readAtCoderSubmission(p, 7, other), /route/);
		}
	});

	test('navigation invalidates an in-flight read and releases the watcher', async () => {
		const p = page();
		let change = () => { };
		let disposed = false;
		p.watchChange = listener => { change = listener; return { dispose() { disposed = true; } }; };
		p.read = () => new Promise(() => { });
		const result = readAtCoderSubmission(p, 7, url);
		change();
		await assert.rejects(result, /changed/);
		assert.strictEqual(disposed, true);
	});

	test('missing source or mismatched submission never becomes a successful receipt', async () => {
		for (const patch of [{ source: null }, { submissionId: '999' }, { taskUrl: 'https://atcoder.jp/contests/other/tasks/other_a' }]) {
			const p = page();
			const read = p.read;
			p.read = async script => ({ ...await read(script) as object, ...patch });
			await assert.rejects(readAtCoderSubmission(p, 7, url), /incomplete/);
		}
	});

	test('timeout releases resources without returning a receipt', async () => {
		const p = page();
		let disposed = false;
		p.watchChange = () => ({ dispose() { disposed = true; } });
		p.read = () => new Promise(() => { });
		await assert.rejects(readAtCoderSubmission(p, 7, url, 5), /timeout/);
		assert.strictEqual(disposed, true);
	});

	test('loading, closure and oversized responses never produce a receipt', async () => {
		for (const state of ['loading', 'closed'] as const) {
			const p = page();
			p[state] = () => true;
			p.read = async () => { assert.fail('must not read an unavailable page'); };
			await assert.rejects(readAtCoderSubmission(p, 7, url), /changed/);
		}
		const p = page();
		const read = p.read;
		p.read = async script => ({ ...await read(script) as object, source: 'x'.repeat(2 * 1024 * 1024) });
		await assert.rejects(readAtCoderSubmission(p, 7, url), /too-large/);
	});

	test('reads escaped source from original pre without Ace gutter and measurement text', () => {
		const html = '<html><pre class="prettyprint" id="submission-code">#include &lt;iostream&gt;\nint main() { return 123; }\n</pre><script>renderAce()</script></html>';
		assert.strictEqual(extractAtCoderSourceHTML(html), '#include &lt;iostream&gt;\nint main() { return 123; }\n');
		assert.throws(() => extractAtCoderSourceHTML('<pre id="submission-code"><div class="ace_gutter">123</div>garbage</pre>'), /source/);
		assert.throws(() => extractAtCoderSourceHTML('<html>Sign In</html>'), /source/);
		assert.throws(() => extractAtCoderSourceHTML(html + html), /source/);
	});

	test('aborts underlying work after navigation', async () => {
		const p = page();
		let change = () => { };
		let signal: AbortSignal | undefined;
		p.watchChange = listener => { change = listener; return { dispose() { } }; };
		p.read = (_script, readSignal) => { signal = readSignal; return new Promise(() => { }); };
		const result = readAtCoderSubmission(p, 7, url);
		change();
		await assert.rejects(result, /changed/);
		assert.strictEqual(signal?.aborted, true);
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

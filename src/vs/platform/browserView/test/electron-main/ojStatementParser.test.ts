/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import { join } from '../../../../base/common/path.js';
import { parseOjStatement } from '../../electron-main/ojStatementParser.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Native contents close in every parser finally.
suite('OJ offline statement parser', () => {
	const problem = { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
	test('only the trusted parser executes and malicious HTML cannot fetch navigate or run scripts', async function () {
		if (process.type !== 'browser') { this.skip(); }
		const { webContents } = await import('electron'); const before = new Set(webContents.getAllWebContents().map(value => value.id));
		const html = '<script>globalThis.INJECTED=true;fetch("https://evil.invalid/script")</script><meta http-equiv="refresh" content="0;url=https://evil.invalid/nav"><iframe src="file:///C:/private"></iframe><img src="https://evil.invalid/img" onerror="globalThis.INJECTED=true"><style>@import "https://evil.invalid/css";</style><div id="task-statement">Safe <var>a+b</var></div>';
		const oj = 'globalThis.BeCoderOj={parseAtCoderProblem:(problem,html)=>{const parsed=new DOMParser().parseFromString(html,"text/html");if(globalThis.INJECTED)throw Error("injected");if(document.querySelector("img,iframe,style"))throw Error("attached");if(location.href.startsWith("http"))throw Error("navigated");return {ref:problem,title:"Safe",bodies:[{locale:"en",sections:[{format:"html",content:parsed.querySelector("#task-statement").innerHTML}]}],samples:[],limits:[],interactive:false}}};';
		const result = await parseOjStatement(problem, html, { oj }, new AbortController().signal);
		assert.strictEqual(result.title, 'Safe'); assert.ok(result.bodies[0].sections[0].content.includes('<var>a+b</var>'));
		assert.deepStrictEqual(webContents.getAllWebContents().filter(value => !before.has(value.id)).map(value => value.id), [], 'no local parser remains');
	});
	test('supplied images frames styles scripts and meta refresh never contact a local resource server', async function () {
		if (process.type !== 'browser') { this.skip(); }
		const { createServer } = await import('http');
		let requests = 0;
		const server = createServer((_request, response) => { requests++; response.end('unexpected'); });
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		try {
			const address = server.address(); assert.ok(address && typeof address === 'object'); const base = 'http://127.0.0.1:' + address.port;
			const html = `<script src="${base}/script"></script><iframe src="${base}/frame"></iframe><img src="${base}/image"><link rel="stylesheet" href="${base}/style"><meta http-equiv="refresh" content="0;url=${base}/navigate"><style>@import '${base}/import';p{background:url('${base}/css-image')}</style><p>safe</p>`;
			const oj = `globalThis.BeCoderOj={parseAtCoderProblem:async(problem,html)=>{new DOMParser().parseFromString(html,'text/html');await new Promise(resolve=>setTimeout(resolve,50));return {ref:problem,title:'Safe',bodies:[],samples:[],limits:[],interactive:false}}};`;
			await parseOjStatement(problem, html, { oj }, new AbortController().signal); assert.strictEqual(requests, 0);
		} finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
	});
	test('the real fixed bundles preserve AtCoder bilingual samples and CF original line semantics', async function () {
		if (process.type !== 'browser') { this.skip(); }
		const bundles = { oj: await fs.readFile(join(process.cwd(), 'extensions/becoder.oj-connect/dist/site-scripts.js'), 'utf8'), companion: await fs.readFile(join(process.cwd(), 'extensions/becoder.cph/dist/problem-parser.js'), 'utf8') };
		const at = await parseOjStatement(problem, '<span class="h2">A - Product</span><div id="task-statement"><span class="lang-ja"><p>日本語 <var>a*b</var></p><section><h3>入力例 1</h3><pre> 3 4\n</pre></section><section><h3>出力例 1</h3><pre>Even\n</pre></section></span><span class="lang-en"><p>English <var>a*b</var></p></span></div>', bundles, new AbortController().signal);
		assert.deepStrictEqual(at.bodies.map(body => body.locale), ['ja', 'en']); assert.deepStrictEqual(at.samples, [{ input: ' 3 4\n', output: 'Even\n' }]);
		const cf = { site: 'codeforces' as const, nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
		const html = '<html lang="en"><body><div class="problem-statement"><div class="header"><div class="title">A. Watermelon</div><div class="time-limit"><div>time limit</div>1 second</div><div class="memory-limit"><div>memory limit</div>64 megabytes</div><div class="input-file"><div>input</div>standard input</div><div class="output-file"><div>output</div>standard output</div></div><div><p>Split $$$w$$$.</p></div><div class="sample-tests"><div class="input"><pre><div class="test-example-line"> 8</div><div class="test-example-line"><br></div></pre></div><div class="output"><pre>YES<br>NO</pre></div></div></div></body></html>';
		const value = await parseOjStatement(cf, html, bundles, new AbortController().signal);
		assert.strictEqual(value.title, 'Watermelon'); assert.deepStrictEqual(value.samples, [{ input: ' 8\n', output: 'YES\nNO\n' }]); assert.ok(value.bodies[0].sections[0].content.includes('<var>w</var>'));
		assert.deepStrictEqual(value.limits.map(limit => limit.value), ['1.00s', '64.00MiB']);
	});
	test('cancelled or failed local parsing closes contents and never reuses a previous document', async function () {
		if (process.type !== 'browser') { this.skip(); }
		const { webContents } = await import('electron'), before = webContents.getAllWebContents().length;
		const controller = new AbortController(); controller.abort(); await assert.rejects(parseOjStatement(problem, '', { oj: '' }, controller.signal));
		await assert.rejects(parseOjStatement(problem, '', { oj: 'throw Error("fixture failure")' }, new AbortController().signal));
		assert.strictEqual(webContents.getAllWebContents().length, before);
	});
});

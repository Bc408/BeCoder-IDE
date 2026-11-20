/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Same-version Electron, intercepted private session. No live account or OJ traffic.
// eslint-disable-next-line local/code-no-new-javascript-files -- Standalone Electron integration fixture.
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const audit = path.join(root, 'tmp/oj-connect-audit');
app.setPath('userData', path.join(audit, 'shortcut-probe-data'));
app.on('window-all-closed', () => undefined);
app.whenReady().then(async () => {
	let window;
	const attempts = new Map();
	try {
		global._VSCODE_PRODUCT_JSON = require(path.join(root, 'product.json'));
		global._VSCODE_PACKAGE_JSON = require(path.join(root, 'package.json'));
		const { BrowserViewMainService } = require(path.join(audit, 'shortcut-main.cjs'));
		const { AtCoderBridgeController } = require(path.join(audit, 'shortcut-bridge.cjs'));
		const { SubmissionController } = require(path.join(root, 'extensions/becoder.oj-connect/out/workflowController.js'));
		const { OjPreferences } = require(path.join(root, 'extensions/becoder.oj-connect/out/preferences.js'));
		const { AtCoderAdapter } = require(path.join(root, 'extensions/becoder.oj-connect/out/adapters/atcoder/adapter.js'));
		const { defaultDirectories } = require(path.join(root, 'extensions/becoder.oj-connect/out/settings.js'));
		const task = 'https://atcoder.jp/contests/abc086/tasks/abc086_a';
		const submit = 'https://atcoder.jp/contests/abc086/submit?taskScreenName=abc086_a';
		const source = '#include <iostream>\nint main(){std::cout << "\u5feb\u6377\u952e \u05d4X123";}\n// literal $& $$ $` $\' const detailHTML = null;\n';
		const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		let emptyHistory = false, pollInterval = 750;
		let posts = 0, detailReads = 0, historyReads = 0, captcha = false, ambiguous = false, mismatch = false, wrongResponse = false, rawVerdict = 'AC', japanese = false, sourceVisible = true;
		const partition = session.fromPartition('shortcut-fetch-fixture');
		await partition.setProxy({ proxyRules: 'http://127.0.0.1:9', proxyBypassRules: '<-loopback>' });
		const scope = 'global';
		const browserSession = { id: 'fixture-session', storageScope: scope, electronSession: { cookies: partition.cookies, fetch: (url, init) => partition.fetch(url, { ...init, bypassCustomProtocolHandlers: false }) } };
		const row = id => `<tr><td><a href="/contests/abc086/tasks/abc086_a">A</a></td><td><a href="/users/test_user">user</a></td><td><a href="/contests/abc086/submissions/me?f.Language=6017">C++23</a></td><td><a href="/contests/abc086/submissions/${id}">Detail</a></td></tr>`;
		partition.protocol.handle('https', async request => {
			const url = new URL(request.url);
			assert.equal(url.origin, 'https://atcoder.jp');
			let html;
			if (url.pathname.endsWith('/submit') && request.method === 'POST') {
				posts++;
				const data = new URLSearchParams(await request.text());
				assert.equal(data.get('sourceCode'), source);
				assert.equal(data.get('data.LanguageId'), '6017');
				assert.equal(data.get('data.TaskScreenName'), 'abc086_a');
				assert.equal(data.get('csrf_token'), 'fixture-csrf');
				assert.equal(data.get('extra-hidden'), 'preserved');
				if (captcha) { assert.equal(data.get('cf-turnstile-response'), 'fixture-approved'); }
				return new Response(null, { status: 302, headers: { Location: wrongResponse ? task : 'https://atcoder.jp/contests/abc086/submissions/me' } });
			} else if (url.pathname.endsWith('/submit')) {
				html = `<form method="post" action="/contests/abc086/submit"><input name="data.TaskScreenName" value="abc086_a"><input type="hidden" name="csrf_token" value="fixture-csrf"><input type="hidden" name="extra-hidden" value="preserved"><div id="select-lang"><select class="current" name="data.LanguageId"><option value="6017">C++23 (GCC)</option></select></div><textarea name="sourceCode" id="plain-textarea"></textarea><button id="submit">Submit</button>${captcha ? '<input name="cf-turnstile-response" value="">' : ''}</form>`;
			} else if (url.pathname.endsWith('/submissions/me')) {
				historyReads++;
				html = '<script>var userScreenName="test_user";</script><table><tr><th>Submission Time</th><th>Code Size</th></tr>' + (posts ? row('11') : '') + (posts && ambiguous ? row('12') : '') + (emptyHistory ? '' : row('10')) + '</table>';
			} else if (url.pathname.endsWith('/status/json')) {
				return new Response(JSON.stringify({ Result: { '11': { Html: `<span class="label">${rawVerdict}</span>` } }, Interval: pollInterval }), { headers: { 'Content-Type': 'application/json' } });
			} else if (/\/submissions\/\d+$/.test(url.pathname)) {
				detailReads++;
				html = `<pre id="submission-code">${sourceVisible ? escape(mismatch ? source + 'changed' : source) : ''}</pre><table><tr><th>Task</th><td><a href="/contests/abc086/tasks/abc086_a">A</a></td></tr><tr><th>User</th><td><a href="/users/test_user">user</a></td></tr><tr><th>Score</th><td>100</td></tr><tr><th>Status</th><td id="judge-status">${rawVerdict}</td></tr></table>`;
				if (rawVerdict === 'CE') { html += '<h4>' + (japanese ? '\u30b3\u30f3\u30d1\u30a4\u30eb\u30a8\u30e9\u30fc' : 'Compile Error') + '</h4><pre>./Main.cpp:4: error: &lt;cin&gt;\n  ^~~\n</pre>'; }
				const headers = japanese ? ['\u30c6\u30b9\u30c8\u30b1\u30fc\u30b9', '\u7d50\u679c', '\u5b9f\u884c\u6642\u9593', '\u30e1\u30e2\u30ea'] : ['Case Name', 'Status', 'Exec Time', 'Memory'];
				html += '<table><tr>' + headers.map(value => '<th>' + value + '</th>').join('') + '</tr><tr><td>sample_01</td><td>AC</td><td>1 ms</td><td>2048 KB</td></tr></table>';
			} else if (url.pathname.endsWith('/tasks/abc086_a')) { html = '<h1>Unexpected redirect target</h1>'; }
			else { return new Response('unsupported', { status: 404 }); }
			return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
		});
		const createWindow = () => { window = new BrowserWindow({ show: false, webPreferences: { partition: 'shortcut-fetch-fixture', sandbox: true, contextIsolation: true } }); return window.webContents.executeJavaScriptInIsolatedWorld.bind(window.webContents); };
		let execute = createWindow();
		const load = async url => { await window.loadURL(url); if (window.webContents.isLoading()) { await new Promise(resolve => window.webContents.once('did-stop-loading', resolve)); } };
		const view = { owner: { mainWindowId: 1 }, session: browserSession, getWebContentsView: () => ({ webContents: window.webContents }), onDidClose: listener => { const current = window; current.on('closed', listener); return { dispose: () => current.removeListener('closed', listener) }; }, onDidNavigate: listener => { const contents = window.webContents, fn = (_event, url) => listener({ url }); contents.on('did-navigate', fn); return { dispose: () => contents.removeListener('did-navigate', fn) }; } };
		const service = { logService: { info() {} }, _getBrowserView: () => view, ojSession: (owner, inputScope) => { assert.equal(owner, 1); assert.equal(inputScope, scope); return browserSession; }, atCoderRequests: new Map(), atCoderAttempts: attempts, atCoderRecords: new Map(), atCoderRecordRequests: new Map(), ojReads: new Map() };
		for (const name of ['prepareAtCoderTask', 'readAtCoderRecord', 'releaseAtCoderRecord', 'atCoderRecordKey', 'sendAndConfirmAtCoderTask', 'cancelAtCoderTask', 'reconcileAtCoderAttempt']) { service[name] = BrowserViewMainService.prototype[name]; }
		const payload = { source, fileName: 'abc086_a.cpp', languageId: '6017', replaceDraft: false };
		const send = () => service.sendAndConfirmAtCoderTask('fixture', 1, task, payload);
		const reset = async (needsCaptcha = false) => { emptyHistory = false; posts = 0; detailReads = 0; historyReads = 0; ambiguous = false; mismatch = false; wrongResponse = false; rawVerdict = 'AC'; japanese = false; sourceVisible = true; captcha = needsCaptcha; service.atCoderRecords.clear(); await load(submit); };
		const approve = () => window.webContents.executeJavaScript('document.querySelector("[name=cf-turnstile-response]").value="fixture-approved"');
		const arm = () => { let resolve; const waiting = new Promise(done => { resolve = done; }); window.webContents.executeJavaScriptInIsolatedWorld = (world, scripts, ...rest) => { const work = execute(world, scripts, ...rest); if (scripts[0].code.includes('const verification =')) { work.then(value => { if (value === false) { resolve(); } }, () => undefined); } return work; }; return waiting; };
		const passed = [], failed = [];
		const check = async (name, work) => { try { await work(); assert.equal(service.atCoderRequests.size, 0); passed.push(name); console.log('PASS ' + name); } catch (error) { failed.push(name + ': ' + error.stack); console.error('FAIL ' + name, error); } finally { if (!window.isDestroyed()) { await service.cancelAtCoderTask('fixture', 1); window.webContents.executeJavaScriptInIsolatedWorld = execute; } } };
		await check('direct payload preserves full native fields without upload or Ace and consumes initial detail once', async () => {
			await reset(); const receipt = await send(); assert.equal(receipt.kind, 'record'); assert.equal(receipt.record.id, '11'); assert.equal(posts, 1); assert.equal(historyReads, 2); assert.equal(detailReads, 1); assert.equal(window.webContents.getURL(), submit);
			const result = await service.readAtCoderRecord(scope, 1, receipt.record); assert.equal(result.source, source); assert.equal(result.sourceVerification, 'matched'); assert.equal(detailReads, 1); assert.equal(window.isVisible(), false);
		});
		await check('first submission uses authenticated template identity with an empty own-list baseline', async () => { await reset(); emptyHistory = true; const receipt = await send(); assert.equal(receipt.kind, 'record'); assert.equal(receipt.record.id, '11'); assert.equal(posts, 1); });
		await check('verification completion sends once without revealing browser', async () => { await reset(true); const ready = arm(), pending = send(); await ready; assert.equal(posts, 0); await approve(); const receipt = await pending; assert.equal(receipt.kind, 'record'); assert.equal(posts, 1); assert.equal(window.isVisible(), false); });
		await check('cancel before verification sends nothing after a late approval', async () => { await reset(true); const ready = arm(), pending = send(); await ready; await service.cancelAtCoderTask('fixture', 1); assert.equal((await pending).kind, 'not-sent'); await approve(); await new Promise(resolve => setTimeout(resolve, 400)); assert.equal(posts, 0); });
		await check('verification container without a response field waits for normal field creation', async () => {
			await reset(true);
			await window.webContents.executeJavaScript(`document.querySelector('[name=cf-turnstile-response]').remove(); const container=document.createElement('div');container.className='cf-turnstile';document.querySelector('form').append(container);`);
			const ready = arm(), pending = send(); await ready; assert.equal(posts, 0);
			await window.webContents.executeJavaScript(`const field=document.createElement('input');field.name='cf-turnstile-response';field.value='fixture-approved';document.querySelector('form').append(field);`);
			assert.equal((await pending).kind, 'record'); assert.equal(posts, 1);
		});
		await check('delayed queued send expires before returning uncertainty', async () => {
			await reset(); let queued, enter; const ready = new Promise(resolve => { enter = resolve; }); window.webContents.executeJavaScriptInIsolatedWorld = (world, scripts, ...rest) => { if (scripts[0].code.includes('const body = new FormData(form, button)')) { queued = () => execute(world, scripts, ...rest); enter(); return new Promise(() => undefined); } return execute(world, scripts, ...rest); };
			const pending = send(); await ready; await service.cancelAtCoderTask('fixture', 1); assert.equal((await pending).kind, 'unconfirmed'); await queued(); assert.equal(posts, 0);
		});
		await check('lost renderer reply only reads back the accepted receipt and never resends', async () => { await reset(); window.webContents.executeJavaScriptInIsolatedWorld = async (world, scripts, ...rest) => { const value = await execute(world, scripts, ...rest); if (scripts[0].code.includes('const body = new FormData(form, button)')) { throw new Error('fixture lost reply'); } return value; }; const receipt = await send(); assert.equal(receipt.kind, 'record'); assert.equal(posts, 1); });
		await check('wrong response URL is not accepted without independent receipt/source checks', async () => { await reset(); wrongResponse = true; const receipt = await send(); assert.equal(receipt.kind, 'record'); assert.equal(posts, 1); assert.ok(historyReads >= 2); });
		await check('mismatched source remains unconfirmed without resend', async () => { await reset(); mismatch = true; assert.equal((await send()).kind, 'unconfirmed'); assert.equal(posts, 1); });
		await check('ambiguous receipt reconciles using session after task page destruction', async () => { await reset(); ambiguous = true; const receipt = await send(); assert.equal(receipt.kind, 'unconfirmed'); ambiguous = false; window.destroy(); const result = await service.reconcileAtCoderAttempt(receipt.attemptId, 1); assert.equal(result.kind, 'record'); assert.equal(posts, 1); execute = createWindow(); });
		await check('record polling survives task page destruction and uses official interval', async () => {
			await reset(); rawVerdict = 'WJ'; const receipt = await send(); const first = await service.readAtCoderRecord(scope, 1, receipt.record); assert.equal(first.rawStatus, 'WJ'); assert.equal(detailReads, 1); window.destroy(); rawVerdict = '1/13'; const pending = await service.readAtCoderRecord(scope, 1, receipt.record); assert.equal(pending.pollAfterMs, 750); assert.equal(detailReads, 1); rawVerdict = 'AC'; const done = await service.readAtCoderRecord(scope, 1, receipt.record); assert.equal(done.phase, 'finished'); assert.equal(detailReads, 2); await service.releaseAtCoderRecord(scope, 1, receipt.record); assert.equal(service.atCoderRecords.size, 0); execute = createWindow();
		});
		await check('existing CE detail and Japanese case headers remain available without source', async () => { await reset(); const receipt = await send(); await service.releaseAtCoderRecord(scope, 1, receipt.record); rawVerdict = 'CE'; japanese = true; sourceVisible = false; const ce = await service.readAtCoderRecord(scope, 1, receipt.record); assert.equal(ce.compileMessage, './Main.cpp:4: error: <cin>\n  ^~~\n'); assert.equal(ce.compileSucceeded, false); assert.equal(ce.source, undefined); assert.deepEqual(ce.groups, [{ name: 'Test Cases', rows: [['sample_01', 'AC', '1 ms', '2048 KB']] }]); });
		await check('missing or invalid interval discards the previous official delay', async () => {
			await reset(); rawVerdict = 'WJ'; pollInterval = 750;
			const receipt = await send(); await service.readAtCoderRecord(scope, 1, receipt.record);
			assert.equal((await service.readAtCoderRecord(scope, 1, receipt.record)).pollAfterMs, 750);
			for (const value of [undefined, 0, 90000]) {
				pollInterval = value;
				assert.equal((await service.readAtCoderRecord(scope, 1, receipt.record)).pollAfterMs, undefined);
			}
			pollInterval = 750;
		});
		await check('actual extension/controller/opaque bridge releases task page before displaying record', async () => {
			await reset(); let handle = 0, revealed, released = false;
			const bridge = new AtCoderBridgeController({ newHandle: () => String(++handle), isPageCurrent: () => !window.isDestroyed() && window.webContents.getURL() === submit, openTask: async url => { await load(submit); return { viewId: 'fixture', url }; }, inspectTask: page => service.prepareAtCoderTask(page.viewId, 1, page.url), sendAndConfirm: (page, value) => service.sendAndConfirmAtCoderTask(page.viewId, 1, page.url, value), readRecord: record => service.readAtCoderRecord(scope, 1, record), cancel: page => service.cancelAtCoderTask(page.viewId, 1), release: () => { released = true; window.destroy(); } });
			const adapter = new AtCoderAdapter(Object.assign(bridge, { readProblem: async () => { throw new Error('unused'); }, loginSummary: async () => ({ site: 'atcoder', state: 'unknown' }) }));
			const preferences = new Map();
			const controller = new SubmissionController({ adapters: [adapter], directories: () => defaultDirectories, requestProblem: async () => undefined, chooseLanguage: async () => '6017', confirmDraft: async () => true, runWithProgress: async (_name, operation) => operation(() => undefined), openRecord: async record => { assert.equal(released, true); revealed = record; } }, new OjPreferences({ get: key => preferences.get(key), update: async (key, value) => { preferences.set(key, value); } }));
			try { const receipt = await controller.submit({ uri: 'file:///C:/practice/atcoder/abc086_a.cpp', fileName: 'abc086_a.cpp', version: 7, family: 'cpp', source }); assert.equal(receipt.kind, 'record'); assert.equal(revealed.id, '11'); assert.equal((await adapter.readRecord(receipt.record, new AbortController().signal)).rawStatus, 'AC'); assert.equal(posts, 1); } finally { await controller.dispose(); await bridge.dispose(); execute = createWindow(); }
		});
		console.log(JSON.stringify({ passed, failed }));
		if (failed.length) { throw new Error(failed.join('\n')); }
	} catch (error) { console.error(error.stack); process.exitCode = 1; }
	finally { for (const entry of attempts.values()) { clearTimeout(entry.timer); } window?.destroy(); app.exit(process.exitCode || 0); }
});

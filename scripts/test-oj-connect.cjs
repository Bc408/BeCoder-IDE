/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Same-version Electron, intercepted private session. No live OJ account or traffic.
// eslint-disable-next-line local/code-no-new-javascript-files -- Standalone Electron fixture runs directly without TypeScript compilation.
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const assert = require('assert/strict');
const { EventEmitter } = require('events');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'tmp/oj-connect-audit/shared-workflow/native-fixture-data'));
app.whenReady().then(async () => {
	let window;
	try {
		global._VSCODE_PRODUCT_JSON = require(path.join(root, 'product.json'));
		global._VSCODE_PACKAGE_JSON = require(path.join(root, 'package.json'));
		const { BrowserViewMainService } = require(path.join(root, 'tmp/oj-connect-audit/native-luogu-main.cjs'));
		// Invoke the actual watcher against synthetic cookie notifications, without touching cookies.
		const cookieEvents = new EventEmitter(), accountEvents = [], cookieWatchers = new Map();
		const watcherHost = {
			_getBrowserView: () => ({ owner: { mainWindowId: 1 }, getWebContentsView: () => ({ webContents: { session: { cookies: cookieEvents } } }), onDidClose: () => ({ dispose() {} }) }),
			ojSessionWatchers: cookieWatchers, _onDidChangeOjSession: { fire: value => accountEvents.push(value) }
		};
		try {
			await BrowserViewMainService.prototype.watchOjSession.call(watcherHost, 'cookie-fixture', 1);
			await BrowserViewMainService.prototype.watchOjSession.call(watcherHost, 'cookie-fixture', 1);
			assert.equal(cookieEvents.listenerCount('changed'), 1);
			const cookie = { domain: '.luogu.com.cn', name: '_uid', value: 'synthetic-fixture-value' };
			cookieEvents.emit('changed', {}, cookie, 'explicit', false);
			cookieEvents.emit('changed', {}, cookie, 'explicit', false);
			assert.deepEqual(accountEvents, [{ windowId: 1, site: 'luogu' }]);
			cookieEvents.emit('changed', {}, cookie, 'explicit', true);
			assert.equal(accountEvents.length, 2, 'removing the previously observed cookie must refresh the account');
			cookieEvents.emit('changed', {}, cookie, 'explicit', false);
			assert.equal(accountEvents.length, 3, 'setting the same value again after removal must refresh the account');
			cookieEvents.emit('changed', {}, { ...cookie, name: 'unrelated' }, 'explicit', false);
			assert.equal(accountEvents.length, 3);
			await assert.rejects(BrowserViewMainService.prototype.watchOjSession.call(watcherHost, 'cookie-fixture', 2), /owner/);
		} finally {
			for (const watcher of cookieWatchers.values()) { watcher.dispose(); }
			cookieWatchers.clear();
		}
		assert.equal(cookieEvents.listenerCount('changed'), 0);
		// The Luogu browser-carrier fixture moved to test-luogu-session.cts and
		// test-luogu-session-host.cjs. Keep the distinct AtCoder read-route regressions here.
		const partition = 'oj-connect-atcoder-read-fixture';
		const atcoder = { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
		session.fromPartition(partition).protocol.handle('https', request => {
			const url = new URL(request.url);
			assert.equal(url.origin, 'https://atcoder.jp');
			if (url.pathname === '/') { return new Response('<script>var userScreenName="fixture_user";</script>', { headers: { 'Content-Type': 'text/html' } }); }
			if (/^\/contests\/abc086\/tasks\/abc086_a\/?$/.test(url.pathname)) { return new Response('<span class="h2">A - Product</span><div id="task-statement"><span class="lang-en"><section><p>Multiply a*b.</p></section></span></div>', { headers: { 'Content-Type': 'text/html' } }); }
			throw new Error('Unexpected AtCoder fixture route: ' + request.url);
		});
		window = new BrowserWindow({ show: false, webPreferences: { partition, sandbox: true, contextIsolation: true } });
		const load = async url => { await window.loadURL(url); if (window.webContents.isLoading()) { await new Promise(resolve => window.webContents.once('did-stop-loading', resolve)); } };
		const view = { owner: { mainWindowId: 1 }, getURL: () => window.webContents.getURL(), getWebContentsView: () => ({ webContents: window.webContents }),
			onDidClose: listener => { window.on('closed', listener); return { dispose: () => window.removeListener('closed', listener) }; },
			onDidNavigate: listener => { const fn = (_event, url) => listener({ url }); window.webContents.on('did-navigate', fn); return { dispose: () => window.webContents.removeListener('did-navigate', fn) }; }
		};
		const service = { _getBrowserView: () => view, environmentMainService: { appRoot: root }, ojReads: new Map() };
		for (const name of ['_runOjRead', 'readOjProblem', 'readOjLogin']) { service[name] = BrowserViewMainService.prototype[name]; }
		for (const suffix of ['?lang=en', '/']) {
			await load(atcoder.url + suffix);
			assert.equal((await service.readOjProblem('fixture', 1, atcoder)).ref.url, atcoder.url);
		}
		await assert.rejects(service.readOjProblem('fixture', 2, atcoder), /owner/);
		assert.equal((await service.readOjLogin('fixture', 1, 'atcoder')).label, 'fixture_user', 'login summary must fetch the fresh account homepage');
		assert.equal(service.ojReads.size, 0);
		console.log(JSON.stringify({ passed: true, realMainService: true, cookieRemovalRefresh: true, freshAtCoderLogin: true, atcoderQueryAndTrailingSlash: true, atcoderWindowIsolation: true }));
	} catch (error) { console.error(error.stack); process.exitCode = 1; }
	finally { window?.destroy(); app.exit(process.exitCode || 0); }
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Actual Electron documents with intercepted, delayed images. No live site, credentials or submission.
const { app, BrowserWindow, session } = require('electron');
const assert = require('assert/strict');
const path = require('path');
const root = path.resolve(__dirname, '..');
const audit = process.env.BECODER_OJ_READY_AUDIT || path.join(root, 'tmp/oj-connect-audit/language-catalog-20261119/readiness-agent');
app.setPath('userData', path.join(root, 'tmp/oj-connect-audit/oj-ready-profile'));
app.on('window-all-closed', () => { });

app.whenReady().then(async () => {
	const windows = [];
	const watchdog = setTimeout(() => app.exit(1), 15000);
	try {
		global._VSCODE_PRODUCT_JSON = require(path.join(root, 'product.json'));
		global._VSCODE_PACKAGE_JSON = require(path.join(root, 'package.json'));
		const { BrowserViewMainService } = require(path.join(audit, 'main.cjs'));
		const native = session.fromPartition('oj-problem-ready-fixture');
		const problemURL = 'https://atcoder.jp/contests/abc086/tasks/abc086_a';
		let releaseDocument;
		native.protocol.handle('https', async request => {
			if (new URL(request.url).pathname === '/slow.png') { await new Promise(resolve => setTimeout(resolve, 1200)); return new Response('', { headers: { 'Content-Type': 'image/png' } }); }
			if (releaseDocument) { await new Promise(resolve => { releaseDocument = resolve; }); }
			return new Response('<!doctype html><h1 id="title">Ready statement</h1><img src="https://atcoder.jp/slow.png">', { headers: { 'Content-Type': 'text/html' } });
		});
		const fixture = () => {
			const window = new BrowserWindow({ show: false, webPreferences: { session: native, sandbox: true, contextIsolation: true } }); windows.push(window);
			const contents = window.webContents;
			let visible = false;
			const view = { owner: { mainWindowId: 1 }, session: { storageScope: 'global' }, getWebContentsView: () => ({ webContents: contents }), getState: () => ({ visible }), onDidClose: listener => { window.on('closed', listener); return { dispose: () => window.removeListener('closed', listener) }; } };
			const views = new Map(); views.deleteAndDispose = id => views.delete(id);
			const service = { browserViews: views, ojProblemDocuments: new WeakMap(), ojReads: new Map(), _windowConfigurations: new Map(), applicationStorageMainService: {}, instantiationService: { createInstance: () => view } };
			for (const name of ['createBrowserView', '_getBrowserView', 'waitForOjProblemDocument']) { service[name] = BrowserViewMainService.prototype[name]; }
			service.createBrowserView('fixture', view.owner, { connectStorage() { } });
			return { window, contents, view, service, reveal: () => { visible = true; } };
		};
		const hidden = fixture();
		assert.equal(typeof hidden.service.waitForOjProblemDocument, 'function');
		const hiddenStarted = Date.now();
		void hidden.window.loadURL(problemURL).catch(() => undefined);
		await hidden.service.waitForOjProblemDocument('fixture', 1, problemURL);
		assert.equal(await hidden.contents.executeJavaScriptInIsolatedWorld(1002, [{ code: 'document.querySelector("#title").textContent' }]), 'Ready statement');
		assert.ok(Date.now() - hiddenStarted < 1000, 'a new hidden reader must not wait for the delayed image');
		assert.equal(hidden.contents.getURL(), problemURL, 'stopping subresources retains the document');
		assert.equal((await native.fetch(problemURL, { bypassCustomProtocolHandlers: false })).status, 200, 'the persistent Session still fetches after stopping the page');
		await assert.rejects(hidden.service.waitForOjProblemDocument('fixture', 2, problemURL), /owner/);
		hidden.view.session.storageScope = 'ephemeral';
		await assert.rejects(hidden.service.waitForOjProblemDocument('fixture', 1, problemURL), /persistent/);
		hidden.window.destroy();

		const visible = fixture(); visible.reveal();
		const visibleStarted = Date.now();
		void visible.window.loadURL(problemURL).catch(() => undefined);
		await visible.service.waitForOjProblemDocument('fixture', 1, problemURL);
		assert.ok(Date.now() - visibleStarted >= 1000, 'a revealed reader must finish normally without stopping its resources');
		visible.window.destroy();

		for (const action of ['close', 'navigate']) {
			const pending = fixture();
			releaseDocument = () => { };
			void pending.window.loadURL(problemURL).catch(() => undefined);
			const waiting = pending.service.waitForOjProblemDocument('fixture', 1, problemURL);
			const rejected = assert.rejects(waiting, /page-changed|stopped/);
			await new Promise(resolve => setTimeout(resolve, 20));
			if (action === 'close') { pending.window.destroy(); }
			else { void pending.window.loadURL('https://atcoder.jp/login').catch(() => undefined); }
			await rejected;
			releaseDocument?.(); releaseDocument = undefined;
			if (!pending.window.isDestroyed()) { pending.window.destroy(); }
		}
		console.log('OJ problem readiness passed: delayed image skipped only for hidden readers; isolated DOM and Session retained; visibility, owner, persistence, close and navigation protected.');
	} catch (error) { console.error(error.stack); process.exitCode = 1; }
	finally { clearTimeout(watchdog); for (const window of windows) { if (!window.isDestroyed()) { window.destroy(); } } app.exit(process.exitCode || 0); }
});

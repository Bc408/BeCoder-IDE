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
const audit = process.env.BECODER_OJ_CONNECT_HOST_AUDIT;
app.setPath('userData', audit ? path.join(audit, 'atcoder-profile') : path.join(root, 'tmp/oj-connect-audit/shared-workflow/native-fixture-data'));
app.whenReady().then(async () => {
	let window;
	try {
		global._VSCODE_PRODUCT_JSON = require(path.join(root, 'product.json'));
		global._VSCODE_PACKAGE_JSON = require(path.join(root, 'package.json'));
		const { BrowserViewMainService } = require(audit ? path.join(audit, 'main.cjs') : path.join(root, 'tmp/oj-connect-audit/native-luogu-main.cjs'));
		// Invoke the actual watcher against synthetic cookie notifications, without touching cookies.
		const cookieEvents = new EventEmitter(), accountEvents = [], cookieWatchers = new Map();
		const watcherHost = {
			_getBrowserView: () => ({ owner: { mainWindowId: 1 }, session:{id:'fixture-session'}, getWebContentsView: () => ({ webContents: { getURL:()=> 'https://www.luogu.com.cn/', session: { cookies: cookieEvents } } }), onDidClose: () => ({ dispose() {} }),onDidNavigate:()=>({dispose(){}}) }),
			ojSessionWatchers: cookieWatchers, atCoderAccounts: new Map(), atCoderAccountReads:new Map(),invalidateAtCoderAccount:BrowserViewMainService.prototype.invalidateAtCoderAccount, _onDidChangeOjSession: { fire: value => accountEvents.push(value) }
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
			const atcoderCookie={domain:'.atcoder.jp',name:'REVEL_SESSION',value:'rotated-one'};
			cookieEvents.emit('changed',{},atcoderCookie,'overwrite',true);
			cookieEvents.emit('changed',{},atcoderCookie,'explicit',false);
			cookieEvents.emit('changed',{}, {...atcoderCookie,value:'rotated-two'},'overwrite',true);
			cookieEvents.emit('changed',{}, {...atcoderCookie,value:'rotated-two'},'explicit',false);
			assert.equal(accountEvents.length,3,'ordinary AtCoder session rotation must not start another account check');
			cookieEvents.emit('changed',{},atcoderCookie,'expired',true);
			assert.deepEqual(accountEvents[3],{windowId:1,site:'atcoder'});
			await assert.rejects(BrowserViewMainService.prototype.watchOjSession.call(watcherHost, 'cookie-fixture', 2), /owner/);
		} finally {
			for (const watcher of cookieWatchers.values()) { watcher.dispose(); }
			cookieWatchers.clear();
		}
		assert.equal(cookieEvents.listenerCount('changed'), 0);
		// The Luogu browser-carrier fixture moved to test-luogu-session.cts and
		// test-luogu-session-host.cjs. Keep the distinct AtCoder read-route regressions here.
		const partition = 'oj-connect-atcoder-read-fixture';
		let account='fixture_user', accountReads=0;
		const atcoder = { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
		session.fromPartition(partition).protocol.handle('https', request => {
			const url = new URL(request.url);
			assert.equal(url.origin, 'https://atcoder.jp');
			if (url.pathname === '/') { accountReads++; return new Response(account===undefined?'Unknown page':`<script>var userScreenName="${account}";</script>`, { headers: { 'Content-Type': 'text/html' } }); }
			if (/^\/contests\/abc086\/tasks\/abc086_a\/?$/.test(url.pathname)) { return new Response('<span class="h2">A - Product</span><div id="task-statement"><span class="lang-en"><section><p>Multiply a*b.</p></section></span></div>', { headers: { 'Content-Type': 'text/html' } }); }
			throw new Error('Unexpected AtCoder fixture route: ' + request.url);
		});
		window = new BrowserWindow({ show: false, webPreferences: { partition, sandbox: true, contextIsolation: true } });
		const load = async url => { await window.loadURL(url); if (window.webContents.isLoading()) { await new Promise(resolve => window.webContents.once('did-stop-loading', resolve)); } };
		const view = { owner: { mainWindowId: 1 }, session: { storageScope: 'global' }, getURL: () => window.webContents.getURL(), getWebContentsView: () => ({ webContents: window.webContents }),
			onDidClose: listener => { window.on('closed', listener); return { dispose: () => window.removeListener('closed', listener) }; },
			onDidNavigate: listener => { const fn = (_event, url) => listener({ url }); window.webContents.on('did-navigate', fn); return { dispose: () => window.webContents.removeListener('did-navigate', fn) }; }
		};
		const identityEvents = [];
		const service = { _getBrowserView: () => view, environmentMainService: { appRoot: root }, ojReads: new Map(), atCoderAccounts: new Map(), atCoderAccountReads:new Map(), _onDidChangeOjSession: { fire: event => identityEvents.push(event) }, ojSession:(owner,scope)=>{assert.ok([1, 2, 3].includes(owner));assert.equal(scope,'global');return{id: owner === 3 ? 'workspace:other' : partition,electronSession:window.webContents.session};} };
		for (const name of ['_runOjRead', 'readOjProblem', 'readOjLogin', 'readAtCoderLogin', 'invalidateAtCoderAccount']) { service[name] = BrowserViewMainService.prototype[name]; }
		for (const suffix of ['?lang=en', '/']) {
			await load(atcoder.url + suffix);
			assert.equal((await service.readOjProblem('fixture', 1, atcoder)).ref.url, atcoder.url);
		}
		await assert.rejects(service.readOjProblem('fixture', 2, atcoder), /owner/);
		assert.equal((await service.readOjLogin('fixture', 1, 'atcoder')).label, 'fixture_user', 'login summary must fetch the fresh account homepage');
		const before=accountReads;
		const summaries=await Promise.all(Array.from({length:8},()=>service.readAtCoderLogin(1,'global')));
		assert.equal(accountReads-before,1,'concurrent sidebar refreshes must share one request');
		assert.ok(summaries.every(value=>value.state==='signed-in'));
		account='';assert.equal((await service.readAtCoderLogin(1,'global')).state,'signed-out');
		account=undefined;assert.equal((await service.readAtCoderLogin(1,'global')).state,'unknown');
		assert.equal(service.atCoderAccountReads.size,0);
		// A slow response from before login/logout cannot be reused as the new identity.
		const bodies=[];
		service.ojSession=()=>({id:partition,electronSession:{fetch:async()=>new Response(new ReadableStream({start(controller){bodies.push(controller);}}),{headers:{'Content-Type':'text/html'}})}});
		const stale=service.readAtCoderLogin(1,'global');
		const rejected=assert.rejects(stale);
		await new Promise(resolve=>setImmediate(resolve));
		service.invalidateAtCoderAccount(1,partition);
		const fresh=service.readAtCoderLogin(1,'global');
		await new Promise(resolve=>setImmediate(resolve));
		bodies[0].enqueue(new TextEncoder().encode('<script>var userScreenName="old_user";</script>'));bodies[0].close();
		await rejected;
		assert.equal(service.atCoderAccountReads.size,1,'the old request cannot delete its replacement');
		bodies[1].enqueue(new TextEncoder().encode('<script>var userScreenName="new_user";</script>'));bodies[1].close();
		assert.equal((await fresh).label,'new_user');assert.equal(service.atCoderAccountReads.size,0);
		// A window that only read a summary still shares login changes with its Session.
		service.ojSession = owner => ({ id: owner === 3 ? 'workspace:other' : partition, electronSession: { fetch: async () => new Response('<script>var userScreenName="new_user";</script>', { headers: { 'Content-Type': 'text/html' } }) } });
		await service.readAtCoderLogin(2, 'global'); await service.readAtCoderLogin(3, 'global');
		identityEvents.length = 0;
		let navigateAccount;
		const sharedCookies = new EventEmitter(), sharedWatchers = new Map();
		const sharedWatcher = { ...service, ojSessionWatchers: sharedWatchers, _getBrowserView: () => ({ owner: { mainWindowId: 1 }, session: { id: partition },
			getWebContentsView: () => ({ webContents: { getURL: () => 'https://atcoder.jp/', session: { cookies: sharedCookies } } }),
			onDidNavigate(listener) { navigateAccount = listener; return { dispose() {} }; }, onDidClose: () => ({ dispose() {} }) }) };
		await BrowserViewMainService.prototype.watchOjSession.call(sharedWatcher, 'atcoder-account', 1);
		navigateAccount({ url: 'https://atcoder.jp/login' });
		assert.deepEqual(identityEvents, [{ windowId: 1, site: 'atcoder' }, { windowId: 2, site: 'atcoder' }], 'login changes notify every window using the same Session, without a browser tab');
		identityEvents.length = 0;
		sharedCookies.emit('changed', {}, { domain: '.atcoder.jp', name: 'REVEL_SESSION', value: 'ordinary-rotation' }, 'overwrite', true);
		sharedCookies.emit('changed', {}, { domain: '.atcoder.jp', name: 'REVEL_SESSION', value: 'ordinary-rotation' }, 'explicit', false);
		assert.equal(identityEvents.length, 0, 'ordinary rotation never invalidates either window');
		sharedCookies.emit('changed', {}, { domain: '.atcoder.jp', name: 'REVEL_SESSION', value: 'expired' }, 'expired', true);
		assert.deepEqual(identityEvents, [{ windowId: 1, site: 'atcoder' }, { windowId: 2, site: 'atcoder' }], 'expiry notifies all windows using the expired Session');
		for (const watcher of sharedWatchers.values()) { watcher.dispose(); }
		const pendingBodies = new Map();
		service.ojSession = owner => ({ id: owner === 3 ? 'workspace:other' : partition, electronSession: { fetch: async () => new Response(new ReadableStream({ start(controller) { pendingBodies.set(owner, controller); } }), { headers: { 'Content-Type': 'text/html' } }) } });
		const firstRead = service.readAtCoderLogin(1, 'global'), secondRead = service.readAtCoderLogin(2, 'global'), isolatedRead = service.readAtCoderLogin(3, 'global');
		const firstRejected = assert.rejects(firstRead), secondRejected = assert.rejects(secondRead);
		await new Promise(resolve => setImmediate(resolve));
		service.invalidateAtCoderAccount(1, partition);
		for (const body of pendingBodies.values()) { body.enqueue(new TextEncoder().encode('<script>var userScreenName="late_user";</script>')); body.close(); }
		await Promise.all([firstRejected, secondRejected]);
		assert.equal((await isolatedRead).label, 'late_user', 'another workspace account read stays alive');
		identityEvents.length = 0;
		service.ojSession = () => ({ id: partition, electronSession: { fetch: async () => new Response('<script>var userScreenName="changed_user";</script>', { headers: { 'Content-Type': 'text/html' } }) } });
		assert.equal((await service.readAtCoderLogin(1, 'global')).label, 'changed_user', 'verified identity change preserves the successful source read');
		assert.deepEqual(identityEvents, [{ windowId: 1, site: 'atcoder' }, { windowId: 2, site: 'atcoder' }]);
		await service.readAtCoderLogin(2, 'global');
		assert.equal(identityEvents.length, 2, 'refreshing the notified peer cannot start an identity refresh loop');
		for (const name of ['codeforcesRequests', 'codeforcesClients', 'nowcoderRequests', 'nowcoderClients', 'nowcoderAttempts', 'luoguRequests', 'luoguClients', 'atCoderRequests', 'atCoderRecords', 'atCoderAttempts', 'luoguAttempts']) { service[name] = new Map(); }
		await BrowserViewMainService.prototype.cancelOjOperations.call(service, 2);
		identityEvents.length = 0; service.invalidateAtCoderAccount(1, partition);
		assert.deepEqual(identityEvents, [{ windowId: 1, site: 'atcoder' }], 'a closed window no longer receives account changes');
		assert.equal(service.ojReads.size, 0);
		console.log(JSON.stringify({ passed: true, realMainService: true, cookieRemovalRefresh: true, freshAtCoderLogin: true, atcoderQueryAndTrailingSlash: true, atcoderWindowIsolation: true, sharedAccountNavigation: true, sharedReadInvalidation: true, identityRefreshNoLoop: true, closedWindowReleased: true }));
	} catch (error) { console.error(error.stack); process.exitCode = 1; }
	finally { window?.destroy(); app.exit(process.exitCode || 0); }
});

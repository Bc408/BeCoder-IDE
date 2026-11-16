/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Actual main-service methods with real Electron cookies in an intercepted private Session.
// No BrowserView, user account, or live OJ traffic is used.
// eslint-disable-next-line local/code-no-new-javascript-files -- Standalone Electron fixture runs directly without TypeScript compilation.
const { app, session, BrowserWindow } = require('electron');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'tmp/oj-connect-audit/native-luogu-host-fixture-data'));
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
	let host;
	const watchdog = setTimeout(() => { console.error('Luogu native host fixture timed out.'); app.exit(1); }, 20000);
	try {
		global._VSCODE_PRODUCT_JSON = require(path.join(root, 'product.json'));
		global._VSCODE_PACKAGE_JSON = require(path.join(root, 'package.json'));
		const { BrowserViewMainService } = require(path.join(root, 'tmp/oj-connect-audit/native-luogu-main.cjs'));
		const privateSession = session.fromPartition('luogu-native-host-fixture');
		const problem = { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
		const payload = { source: '#include <iostream>\nint main(){std::cout << "\u540c\u4e00\u5feb\u7167";}\n', fileName: 'P1001.cpp', languageId: '27:o2' };
		const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6EGQAAAAASUVORK5CYII=';
		let uid = 123, mode = 'ordinary', creations = 0, imageReads = 0, captchaWaiter;
		const posts = [], accounts = [], captchaEvents = [], cancellations = [];
		privateSession.protocol.handle('https', async request => {
			const url = new URL(request.url);
			assert.equal(url.origin, 'https://www.luogu.com.cn');
			if (url.pathname === '/_lfe/config') { return Response.json({ CodeLanguage: { 27: { id: 27, name: 'C++20', fileExt: ['cpp'], canO2: true } } }); }
			if (url.pathname === '/api/verify/captcha') { imageReads++; return new Response(Buffer.from(image, 'base64'), { headers: { 'Content-Type': 'image/png' } }); }
			if (url.pathname === '/fe/api/problem/submit/P1001') {
				assert.equal(request.method, 'POST');
				const body = await request.json(); posts.push(body);
				if (mode === 'captcha' && body.captcha !== 'correct') { return Response.json({ errorMessage: '\u9a8c\u8bc1\u7801\u9519\u8bef' }, { status: 400 }); }
				return Response.json({ rid: 22 });
			}
			if (url.pathname === '/ranking' || url.pathname === '/problem/P1001') {
				return url.searchParams.has('_contentOnly')
					? Response.json({ user: { uid, name: 'fixture-user' }, data: { problem: { pid: 'P1001', acceptLanguages: [27] } } })
					: new Response('<meta name="csrf-token" content="9999999999:fixture">');
			}
			throw new Error('Unexpected private fixture route: ' + request.url);
		});
		const browserSession = { id: 'global', electronSession: { cookies: privateSession.cookies,
			// Electron fetch bypasses custom protocols by default. Opt in only in this fixture.
			fetch: (url, init) => privateSession.fetch(url, { ...init, bypassCustomProtocolHandlers: false }) }, connectStorage() {} };
		host = {
			logService: { info() {} },
			// This fixture owns host lifecycle; the direct wire transport has separate coverage.
			fetchLuogu: (browserSession, url, init) => browserSession.fetch(url, init),
			windowsMainService: { getWindowById: id => id === 1 || id === 2 ? { id, openedWorkspace: { id: 'fixture-workspace' } } : undefined },
			instantiationService: { createInstance: constructor => { assert.match(constructor.name, /BrowserSession$/); creations++; return browserSession; } },
			environmentMainService: {}, applicationStorageMainService: {}, _ensureWindowCloseSubscription() {},
			_getBrowserView: () => { throw new Error('Luogu must not access a BrowserView'); },
			createBrowserView: () => { throw new Error('Luogu must not create a BrowserView'); },
			luoguClients: new Map(), luoguRequests: new Map(), luoguCaptchas: new Map(), luoguAttempts: new Map(), ojReads: new Map(),
			_onDidChangeOjSession: { fire: value => accounts.push(value) },
			_onDidRequireLuoguCaptcha: { fire: value => { captchaEvents.push(value); const done = captchaWaiter; captchaWaiter = undefined; done?.(value); } },
			_onDidCancelLuoguCaptcha: { fire: value => cancellations.push(value) }
		};
		for (const name of ['openLuoguSession', 'luoguClient', 'readOjLogin', 'prepareLuoguTask', 'submitLuoguTask', 'cancelLuoguTask', 'getLuoguCaptcha', 'answerLuoguCaptcha']) { host[name] = BrowserViewMainService.prototype[name]; }
		const setUid = value => privateSession.cookies.set({ url: 'https://www.luogu.com.cn/', name: '_uid', value: String(value), path: '/' });
		await setUid(uid);
		const id = await host.openLuoguSession(1, 'global');
		assert.equal(id, 'global'); assert.equal(host.luoguClients.size, 1);
		assert.equal((await host.readOjLogin(id, 1, 'luogu')).state, 'signed-in');
		await assert.rejects(host.openLuoguSession(99, 'global'), /owner/);
		await assert.rejects(host.openLuoguSession(1, 'ephemeral'), /persistent/);
		await assert.rejects(host.readOjLogin(id, 2, 'luogu'), /owner/);
		const prepared = await host.prepareLuoguTask(id, 1, problem);
		await setUid(uid); // Electron reports overwrite/remove/add; effective credentials remain equal.
		const receipt = await host.submitLuoguTask(id, 1, problem, payload, prepared.ownerKey, 'same-cookie');
		assert.equal(receipt.kind, 'record'); assert.equal(posts.length, 1); assert.equal(accounts.length, 0);
		assert.equal(posts[0].code, payload.source);
		await host.prepareLuoguTask(id, 1, problem);
		// Suppress notifications to exercise the immediate pre-dispatch cookie synchronization fallback.
		const cookieListeners = privateSession.cookies.listeners('changed');
		for (const listener of cookieListeners) { privateSession.cookies.removeListener('changed', listener); }
		uid = 456; await setUid(uid);
		const rejected = await host.submitLuoguTask(id, 1, problem, payload, '123', 'changed-cookie');
		assert.equal(rejected.kind, 'not-sent'); assert.match(rejected.reason, /session-changed/); assert.equal(posts.length, 1);
		assert.deepEqual(accounts, [{ windowId: 1, site: 'luogu' }]);
		for (const listener of cookieListeners) { privateSession.cookies.on('changed', listener); }
		mode = 'captcha'; posts.length = 0;
		await host.prepareLuoguTask(id, 1, problem);
		const firstPrompt = new Promise(resolve => { captchaWaiter = resolve; });
		const sending = host.submitLuoguTask(id, 1, problem, payload, '456', 'captcha-answer');
		const interaction = await firstPrompt;
		assert.deepEqual(interaction, { windowId: 1, requestId: 'captcha-answer', image });
		await assert.rejects(host.getLuoguCaptcha(2, interaction.requestId), /expired/);
		await host.answerLuoguCaptcha(2, interaction.requestId, 'correct');
		assert.equal(host.luoguCaptchas.size, 1, 'another window must not answer this request');
		assert.equal(await host.getLuoguCaptcha(1, interaction.requestId), image);
		const retryPrompt = new Promise(resolve => { captchaWaiter = resolve; });
		await host.answerLuoguCaptcha(1, interaction.requestId, 'wrong');
		await retryPrompt;
		assert.deepEqual(cancellations, [], 'normal answers must not send a delayed cancellation to the next round');
		await host.answerLuoguCaptcha(1, interaction.requestId, 'correct');
		assert.equal((await sending).kind, 'record'); assert.equal(posts.length, 3); assert.equal(posts[2].captcha, 'correct');
		assert.deepEqual(cancellations, [], 'successful answers close their own panel locally');
		assert.equal(host.luoguCaptchas.size, 0); assert.equal(imageReads, 3);
		posts.length = 0;
		await host.prepareLuoguTask(id, 1, problem);
		const secondPrompt = new Promise(resolve => { captchaWaiter = resolve; });
		const cancelling = host.submitLuoguTask(id, 1, problem, payload, '456', 'captcha-cancel');
		await secondPrompt;
		await host.cancelLuoguTask(id, 1, 'captcha-cancel');
		assert.equal((await cancelling).kind, 'not-sent'); assert.equal(posts.length, 1);
		await host.answerLuoguCaptcha(1, 'captcha-cancel', 'correct');
		assert.equal(posts.length, 1); assert.equal(host.luoguRequests.size, 0); assert.equal(host.luoguCaptchas.size, 0);
		assert.ok(cancellations.some(value => value.requestId === 'captcha-cancel'));
		assert.equal(cancellations.filter(value => value.requestId === 'captcha-cancel').length, 1, 'abort emits exactly one cancellation');
		assert.equal(BrowserWindow.getAllWindows().length, 0); assert.equal(creations, 1);
		console.log(JSON.stringify({ passed: true, actualMainService: true, noBrowserViews: true, sameCookieOverwritePreserved: true, changedCookieFencedBeforePost: true, windowIsolation: true, captchaNativeReplyAndRefresh: true, captchaCancellationNoResend: true }));
	} catch (error) { console.error(error.stack); process.exitCode = 1; }
	finally { clearTimeout(watchdog); for (const { client } of host?.luoguClients.values() ?? []) { client.dispose(); } app.exit(process.exitCode || 0); }
});

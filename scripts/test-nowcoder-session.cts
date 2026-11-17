/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Actual native host + Electron Session. All requests are intercepted; no account or live submissions.
const { app, session, BrowserWindow } = require('electron');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'tmp/oj-connect-audit/nowcoder-native/profile'));
app.whenReady().then(async () => {
	let host;
	const watchdog = setTimeout(() => app.exit(1), 25000);
	try {
		global._VSCODE_PRODUCT_JSON = require(path.join(root, 'product.json'));
		global._VSCODE_PACKAGE_JSON = require(path.join(root, 'package.json'));
		const { BrowserViewMainService } = require(path.join(root, 'tmp/oj-connect-audit/nowcoder-native/main.cjs'));
		const native = session.fromPartition('nowcoder-native-fixture');
		const problem = { site: 'nowcoder', nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' };
		const payload = { source: 'int main(){}\n', fileName: '18204.cpp', languageId: '2' };
		let posts = 0, code = 0, uid = 123;
		native.protocol.handle('https', async request => {
			const url = new URL(request.url);
			if (url.hostname === 'gw-c.nowcoder.com') { return Response.json({ code: 0, data: { userId: uid } }); }
			if (url.hostname === 'static.nowcoder.com') { return new Response(`({1:function(){var g=[{id:'2',lang:'C++',suffix:'cpp'}],x=[];window.location.host.includes('ac.nowcoder.com')&&(x=['2'],g[0].lang='C++23');}})`); }
			if (url.pathname === '/acm/problem/18204') { return new Response(`<script>window.pageInfo={questionId:'235780',problemId:'18204',tagId:'4',codeJudgeType:'0',subTagId:'0',doneQuestionId:'18204'};</script><script src="//static.nowcoder.com/acm/nowcoder/2.0.120/javascripts-acm/lib/env.js"></script><div class="terminal-topic-title">A+B</div><div class="subject-describe">Sum.</div>`); }
			if (url.pathname === '/nccommon/submit_cd') { posts++; assert.equal(request.method, 'POST'); assert.equal((await request.formData()).get('content'), payload.source); return Response.json(code ? { code, msg: 'verification' } : { code: 0, data: { submissionId: 12345 } }); }
			if (url.pathname === '/nccommon/status') { return Response.json({ code: 0, id: 12345, status: 5 }); }
			throw new Error('Unexpected fixed route');
		});
		const browserSession = { id: 'global', electronSession: { cookies: native.cookies, fetch: (url, init) => native.fetch(url, { ...init, bypassCustomProtocolHandlers: false }) }, connectStorage() {} };
		host = {
			windowsMainService: { getWindowById: id => id === 1 || id === 2 ? { id, openedWorkspace: { id: 'fixture' } } : undefined },
			instantiationService: { createInstance: () => browserSession }, environmentMainService: {}, applicationStorageMainService: {}, _ensureWindowCloseSubscription() {},
			nowcoderClients: new Map(), nowcoderRequests: new Map(), nowcoderAttempts: new Map(), ojReads: new Map(), _onDidChangeOjSession: { fire() {} }
		};
		for (const name of ['ojSession', 'openNowcoderSession', 'nowcoderClient', 'readOjLogin', 'prepareNowcoderTask', 'submitNowcoderTask', 'readNowcoderRecord', 'releaseNowcoderRecord']) { host[name] = BrowserViewMainService.prototype[name]; }
		const setToken = value => native.cookies.set({ url: 'https://ac.nowcoder.com', domain: '.nowcoder.com', name: 't', value, path: '/' });
		await setToken('fixture');
		const id = await host.openNowcoderSession(1, 'global');
		assert.equal((await host.readOjLogin(id, 1, 'nowcoder')).state, 'signed-in');
		await assert.rejects(host.readOjLogin(id, 2, 'nowcoder'), /owner/);
		await assert.rejects(host.openNowcoderSession(99, 'global'), /owner/);
		await assert.rejects(host.openNowcoderSession(1, 'ephemeral'), /persistent/);
		const prepared = await host.prepareNowcoderTask(id, 1, problem);
		await setToken('fixture');
		const receipt = await host.submitNowcoderTask(id, 1, problem, payload, prepared.ownerKey, 'one');
		assert.equal(receipt.kind, 'record'); assert.equal(posts, 1);
		assert.equal((await host.readNowcoderRecord(id, 1, receipt.record)).rawStatus, 'AC');
		await host.releaseNowcoderRecord(id, 1, receipt.record);
		assert.equal((await host.readNowcoderRecord(id, 1, receipt.record)).rawStatus, 'AC');
		const old = await host.prepareNowcoderTask(id, 1, problem);
		uid = 124; await setToken('changed');
		assert.equal((await host.submitNowcoderTask(id, 1, problem, payload, old.ownerKey, 'old')).kind, 'not-sent'); assert.equal(posts, 1);
		await assert.rejects(host.readNowcoderRecord(id, 1, receipt.record), /unowned/);
		code = 1125;
		const next = await host.prepareNowcoderTask(id, 1, problem);
		assert.equal((await host.submitNowcoderTask(id, 1, problem, payload, next.ownerKey, 'verification')).kind, 'not-sent'); assert.equal(posts, 2);
		assert.equal(BrowserWindow.getAllWindows().length, 0);
		console.log('Nowcoder actual Electron host passed: no pages, shared Session, cross-window rejection, same-cookie rewrite, account change, once-only verification, record reopen.');
	} catch (error) { console.error(error.stack); process.exitCode = 1; }
	finally { clearTimeout(watchdog); for (const entry of host?.nowcoderClients.values() ?? []) { entry.client.dispose(); } app.exit(process.exitCode || 0); }
});

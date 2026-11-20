/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Synthetic native Session/host verification. No website, real account, page or submission.
const { app, session, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/oj-connect-audit/lanqiao-native');
const profile = fs.mkdtempSync(path.join(output, 'profile-'));
app.setPath('userData', profile);
app.whenReady().then(async () => {
	const watchdog = setTimeout(() => app.exit(1), 40000);
	let host;
	try {
		global._VSCODE_PRODUCT_JSON = require(path.join(root, 'product.json'));
		global._VSCODE_PACKAGE_JSON = require(path.join(root, 'package.json'));
		const { BrowserViewMainService } = require(path.join(output, 'main.cjs'));
		const fixtures = require(path.join(output, 'fixtures.cjs'));
		const problem = fixtures.lanqiaoFixtureProblem, id = '000000000000000000000001';
		const payload = { source: 'int main(){}\n', fileName: '254.cpp', languageId: 'cpp' };
		const native = session.fromPartition('lanqiao-offline-fixture');
		await native.setProxy({ proxyRules: 'http=127.0.0.1:9;https=127.0.0.1:9', proxyBypassRules: '<-loopback>' });
		let sourcePosts = 0, reportPosts = 0, reads = 0, unexpected = 0, account = 12;
		let sourceObserved;
		const sourceRequest = new Promise(resolve => { sourceObserved = resolve; });
		const events = [];
		await native.protocol.handle('https', async request => {
			reads++;
			const url = new URL(request.url);
			if (!['www.lanqiao.cn', 'assets.lanqiao.cn', 'opcenter.lanqiao.cn'].includes(url.hostname)) { unexpected++; return new Response('', { status: 418 }); }
			if (url.origin === 'https://assets.lanqiao.cn') {
				const body = url.pathname.endsWith('1111111.js') ? fixtures.lanqiaoFixtureRuntime : url.pathname.endsWith('2222222.js') ? fixtures.lanqiaoFixtureApplication : url.pathname.endsWith('4444444.js') ? fixtures.lanqiaoFixtureLanguages : undefined;
				if (!body) { unexpected++; return new Response('', { status: 418 }); } return new Response(body);
			}
			if (url.pathname === '/api/v2/user/basic/') { assert.equal(request.method, 'GET'); return Response.json({ id: account, name: 'Fixture' }); }
			if (url.pathname === '/problems/') { return new Response(fixtures.lanqiaoFixtureHTML); }
			if (url.pathname === '/api/v2/problems/254/new/') { return Response.json(fixtures.lanqiaoFixtureData); }
			if (url.pathname === '/api/v2/problems/254/submissions/') { return Response.json({ results: sourcePosts ? [{ submission_id: id, language: 'cpp' }] : [] }); }
			if (url.pathname === '/api/v2/problems/254/submit/') {
				sourcePosts++; assert.equal(request.method, 'POST'); assert.equal(sourcePosts, 1);
				sourceObserved();
				assert.deepEqual(await request.json(), { language: 'cpp', submit_content: payload.source, judge_client: 2, is_submit: true });
				return Response.json({ submission_url: 'https://opcenter.lanqiao.cn/api/v1/evaluation/questions/43756/submissions/' + id + '/?is_submit=true&judge_client=2', judge_client: 2 });
			}
			if (url.pathname === '/api/v1/evaluation/questions/43756/submissions/' + id + '/') { assert.equal(request.method, 'GET'); return Response.json({ code: 0, data: { execute_status: 2 } }); }
			if (url.pathname === '/api/v2/problems/254/submit-report/') {
				reportPosts++; assert.equal(reportPosts, 1); assert.equal(request.method, 'POST');
				assert.deepEqual(await request.json(), { submission_id: id, is_submit: true, problem_type: 6, judge_client: 2 });
				return Response.json({ status: 'AC', test_cases: [{ status: true, millisecond: 0, memory: 0, result: 'NEVER_EXPOSE_HIDDEN_OUTPUT' }] });
			}
			if (url.pathname === '/api/v2/problems/254/submissions/' + id + '/') { assert.equal(request.method, 'GET'); return Response.json({ submission_id: id, problem_id: 254, language: 'cpp', content: payload.source, status: 'AC', elapsed_time: 0, memory: 0, pass_sample: '1 / 1' }); }
			unexpected++; return new Response('', { status: 418 });
		});
		const browserSession = { id: 'global', storageScope: 'global', electronSession: native, connectStorage() { } };
		host = Object.assign(Object.create(BrowserViewMainService.prototype), {
			lanqiaoClients: new Map(), lanqiaoRequests: new Map(), ojReads: new Map(), cancelledOjStatementReads: new Set(), cancelledOjLanguageReads: new Set(),
			windowsMainService: { getWindowById: windowId => [1, 2].includes(windowId) ? { openedWorkspace: { id: 'fixture' } } : undefined },
			instantiationService: { createInstance: () => browserSession }, environmentMainService: {}, applicationStorageMainService: {}, _ensureWindowCloseSubscription() { },
			_onDidChangeOjSession: { fire(event) { events.push(event); } }
		});
		await assert.rejects(host.openLanqiaoSession(99, 'global'), /owner/);
		await assert.rejects(host.openLanqiaoSession(1, 'ephemeral'), /persistent/);
		const sessionId = await host.openLanqiaoSession(1, 'global');
		assert.equal((await host.readOjLogin(sessionId, 1, 'lanqiao')).state, 'signed-in');
		await assert.rejects(host.readOjLogin(sessionId, 2, 'lanqiao'), /owner/);
		const document = await host.readOjStatement(1, 'global', problem, 'read', { family: 'c' });
		assert.equal(document.limits[0].value, '2 s'); assert.deepEqual(document.samples, [{ input: '1 2\n', output: '3\n' }]);
		const catalogue = await host.readOjLanguages(1, 'global', problem, 'catalogue'); assert.equal(catalogue.languages[0].id, 'cpp');
		const prepared = await host.prepareLanqiaoTask(sessionId, 1, problem);
		const sending = host.submitLanqiaoTask(sessionId, 1, problem, payload, prepared.ownerKey, 'attempt');
		await sourceRequest;
		const beforeProgress = reads;
		assert.equal((await host.readLanqiaoProgress(sessionId, 1, 'attempt')).phase, 'sending');
		assert.equal(await host.readLanqiaoProgress(sessionId, 1, 'foreign'), undefined);
		await assert.rejects(host.readLanqiaoProgress(sessionId, 2, 'attempt'), /owner/);
		assert.equal(reads, beforeProgress, 'progress is local and never issues another website request');
		await assert.rejects(host.submitLanqiaoTask(sessionId, 1, problem, payload, prepared.ownerKey, 'second'), /busy/);
		const outcome = await sending; assert.equal(outcome.kind, 'record');
		assert.equal(await host.readLanqiaoProgress(sessionId, 1, 'attempt'), undefined);
		const record = await host.readLanqiaoRecord(sessionId, 1, outcome.record);
		// allow-any-unicode-next-line
		assert.equal(record.sourceVerification, 'matched'); assert.equal(record.language, 'C++（g++17）'); assert.equal(record.memory, '0 kb');
		assert.equal(JSON.stringify(record).includes('NEVER_EXPOSE'), false);
		await host.releaseLanqiaoRecord(sessionId, 1, outcome.record);
		assert.equal((await host.readLanqiaoRecord(sessionId, 1, outcome.record)).groups, undefined);
		assert.equal(sourcePosts, 1); assert.equal(reportPosts, 1);
		const next = await host.prepareLanqiaoTask(sessionId, 1, problem);
		account = 13; await native.cookies.set({ url: 'https://www.lanqiao.cn', domain: '.lanqiao.cn', path: '/', name: 'lqtoken', value: 'synthetic-only' });
		await new Promise(resolve => setTimeout(resolve, 30));
		const stale = await host.submitLanqiaoTask(sessionId, 1, problem, payload, next.ownerKey, 'old-owner').catch(() => undefined);
		assert.notEqual(stale?.kind, 'record'); assert.equal(sourcePosts, 1);
		// Browser Get uses its original Ephemeral Session and cannot acquire submission rights.
		const viewEvents = new EventEmitter();
		let actual = problem.url;
		const temporary = { id: 'ephemeral:fixture', storageScope: 'ephemeral', electronSession: native };
		const view = { owner: { mainWindowId: 1 }, session: temporary, getWebContentsView: () => ({ webContents: { getURL: () => actual } }), onDidClose: listener => { viewEvents.on('close', listener); return { dispose: () => viewEvents.removeListener('close', listener) }; }, onDidNavigate: listener => { viewEvents.on('navigate', listener); return { dispose: () => viewEvents.removeListener('navigate', listener) }; } };
		host._getBrowserView = () => view;
		host.resolveBrowserProblem = async url => url === problem.url ? problem : undefined;
		assert.equal((await host.readOjProblem('view', 1, problem, { family: 'cpp' })).title, 'A+B');
		await assert.rejects(host.readOjProblem('view', 2, problem), /page-changed|owner/);
		actual = 'https://www.lanqiao.cn/problems/255/learning/'; await assert.rejects(host.readOjProblem('view', 1, problem), /page-changed/);
		assert.equal(host.lanqiaoClients.has('1:ephemeral:fixture'), false);
		assert.equal(unexpected, 0); assert.ok(reads > 10); assert.equal(BrowserWindow.getAllWindows().length, 0);
		assert.equal(host.lanqiaoRequests.size, 0);
		await host.cancelLanqiaoOperations(1);
		assert.equal([...host.lanqiaoClients.values()].filter(entry => entry.windowId === 1).length, 0);
		await assert.rejects(host.readLanqiaoRecord(sessionId, 1, outcome.record), /owner/);
		console.log('Lanqiao native Session fixture passed: current source, fixed operations, one source/report, formal source verification, owner/busy boundaries, zero values, private point projection, Ephemeral Get and zero browser windows/external requests.');
	} catch (error) { console.error(error.stack); process.exitCode = 1; }
	finally { clearTimeout(watchdog); if (host) { for (const entry of host.lanqiaoClients.values()) { entry.client.dispose(); } } app.exit(process.exitCode || 0); }
});

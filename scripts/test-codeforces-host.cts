/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Actual main-service methods under Electron. No account, page or live submission.
const { app, session, BrowserWindow } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const audit = process.env.BECODER_OJ_CONNECT_HOST_AUDIT || path.join(root, 'tmp/oj-connect-audit/codeforces-native');
app.setPath('userData', path.join(audit, 'host-profile'));
app.whenReady().then(async () => {
	try {
		global._VSCODE_PRODUCT_JSON = require(path.join(root, 'product.json'));
		global._VSCODE_PACKAGE_JSON = require(path.join(root, 'package.json'));
		const { BrowserViewMainService } = require(path.join(audit, 'main.cjs'));
		const { CodeforcesSessionClient, cfForm, cfList } = require(path.join(audit, 'client-fixtures.cjs'));
		let cancelled = false, disposed = false, reconciles = 0;
		const host = { codeforcesClients: new Map(), codeforcesRequests: new Map(), ojReads: new Map(),
			windowsMainService: { getWindowById: id => id === 1 ? { openedWorkspace: { id: 'fixture' } } : undefined } };
		for (const name of ['codeforcesClient','prepareCodeforcesTask','submitCodeforcesTask','cancelCodeforcesTask','readCodeforcesRecord','releaseCodeforcesRecord','reconcileCodeforcesAttempt','readOjProblem']) {
			host[name] = BrowserViewMainService.prototype[name];
		}
		const problem = { site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
		const payload = { source: 'int main(){}', languageId: '54', fileName: '4_a.cpp' };
		const record = { problem, id: '22', url: 'https://codeforces.com/contest/4/submission/22' };
		const client = {
			prepare: async (_, signal) => { signal.throwIfAborted(); return { ownerKey: 'tourist', languages: [], hasDraft: false }; },
			submit: async (_, __, ___, ____, signal) => new Promise(resolve => { signal.addEventListener('abort', () => { cancelled = true; resolve({ kind: 'unconfirmed', problem, attemptId: 'once', message: 'uncertain' }); }); }),
			reconcile: async (attemptId, signal) => { signal.throwIfAborted(); assert.equal(attemptId, 'once'); reconciles++; return { kind: 'record', record }; },
			readRecord: async () => ({ ref: record, rawStatus: 'Accepted' }), releaseRecord: () => {}, dispose: () => { disposed = true; }
		};
		host.codeforcesClients.set('1:global', { windowId: 1, scope: 'global', session: { id: 'global', storageScope: 'global' }, client });
		host.codeforcesClients.set('1:workspace:other', { windowId: 1, session: { id: 'workspace:other', storageScope: 'workspace' }, client });
		await assert.rejects(host.prepareCodeforcesTask('workspace:other', 1, problem), /owner/);
		host.codeforcesClients.delete('1:workspace:other');
		await assert.rejects(host.prepareCodeforcesTask('global', 2, problem), /owner/);
		assert.equal((await host.prepareCodeforcesTask('global', 1, problem)).ownerKey, 'tourist');
		const sending = host.submitCodeforcesTask('global', 1, problem, payload, 'tourist', 'once');
		await assert.rejects(host.submitCodeforcesTask('global', 1, problem, payload, 'tourist', 'twice'), /busy/);
		await host.cancelCodeforcesTask('global', 1, 'other'); assert.equal(cancelled, false);
		await host.cancelCodeforcesTask('global', 1, 'once'); assert.equal((await sending).kind, 'unconfirmed');
		assert.equal((await host.reconcileCodeforcesAttempt('global', 1, 'once')).kind, 'record'); assert.equal(reconciles, 1);
		await assert.rejects(host.reconcileCodeforcesAttempt('global', 2, 'once'), /owner/);
		assert.equal(host.codeforcesRequests.size, 0);
		let actual = 'https://codeforces.com/problemset/problem/4/A?locale=en', parsed = 0;
		host._getBrowserView = () => ({ owner: { mainWindowId: 1 }, getWebContentsView: () => ({ webContents: { getURL: () => actual } }) });
		host.parseProblem = async () => { parsed++; return { url: actual, json: '{"name":"Watermelon","tests":[{"input":"8","output":"YES"}]}' }; };
		host._runOjRead = async (id, windowId, url, operation, input) => {
			assert.equal(id, 'view'); assert.equal(windowId, 1); assert.equal(url, actual); assert.equal(operation, 'readCodeforcesProblem');
			assert.equal(input.problem.nativeId, '4/A'); assert.equal(input.companion.tests[0].input, '8'); return { ref: problem, title: 'Watermelon' };
		};
		assert.equal((await host.readOjProblem('view', 1, problem)).title, 'Watermelon'); assert.equal(parsed, 1);
		actual = 'https://codeforces.com/group/private/contest/4/problem/A';
		await assert.rejects(host.readOjProblem('view', 1, problem), /changed|route/); assert.equal(parsed, 1);
		actual = problem.url; await assert.rejects(host.readOjProblem('view', 2, problem), /owner/); assert.equal(parsed, 1);
		assert.equal(disposed, false);
		let preparationCancelled = false;
		host.ojReads.set('preparation', { windowId: 1, operation: 'prepareCodeforces', cancel() { preparationCancelled = true; } });
		await BrowserViewMainService.prototype.cancelOjPreparations.call(host, 2); assert.equal(preparationCancelled, false);
		await BrowserViewMainService.prototype.cancelOjPreparations.call(host, 1); assert.equal(preparationCancelled, true);
		for (const name of ['nowcoderRequests', 'nowcoderClients', 'nowcoderAttempts', 'atCoderAccounts', 'atCoderAccountReads', 'luoguRequests', 'luoguClients', 'atCoderRequests', 'atCoderRecords', 'atCoderAttempts', 'luoguAttempts']) { host[name] = new Map(); }
		await BrowserViewMainService.prototype.cancelOjOperations.call(host, 1);
		assert.equal(disposed, true); assert.equal(host.codeforcesClients.size, 0);
		await assert.rejects(host.prepareCodeforcesTask('global', 1, problem), /owner/);
		const cookies = new EventEmitter(), sessionEvents = [], watchers = new Map(); let navigate;
		let signingStarted, finishSigning, posts = 0;
		const watchedClient = new CodeforcesSessionClient({
			fetch: async url => new Response(url.endsWith('/') ? '<div id="header"><div class="lang-chooser"><a href="/profile/fixture">fixture</a><a href="/logout">Logout</a></div></div>' : url.includes('/submit?') ? cfForm : cfList()),
			getSigningCookie: () => new Promise(resolve => { finishSigning = resolve; signingStarted(); }),
			post: async () => { posts++; return { status: 200 }; }, onSessionChange: () => ({ dispose() {} })
		});
		const watcherHost = {
			_getBrowserView: () => ({ owner: { mainWindowId: 1 }, session: { id: 'global' }, getWebContentsView: () => ({ webContents: { getURL: () => 'https://codeforces.com/', session: { cookies } } }),
				onDidNavigate(listener) { navigate = listener; return { dispose() {} }; }, onDidClose: () => ({ dispose() {} }) }),
			ojSessionWatchers: watchers, codeforcesClients: new Map([['1:global', { windowId: 1, session: { id: 'global' }, client: watchedClient }]]), invalidateCodeforcesSession: BrowserViewMainService.prototype.invalidateCodeforcesSession, _onDidChangeOjSession: { fire: event => sessionEvents.push(event) }
		};
		try {
			await BrowserViewMainService.prototype.watchOjSession.call(watcherHost, 'view', 1);
			await BrowserViewMainService.prototype.watchOjSession.call(watcherHost, 'view', 1);
			assert.equal(cookies.listenerCount('changed'), 1);
			cookies.emit('changed', {}, { domain: '.codeforces.com', name: 'JSESSIONID', value: 'rotated' }, 'overwrite', true);
			cookies.emit('changed', {}, { domain: '.codeforces.com', name: 'JSESSIONID', value: 'rotated' }, 'explicit', false);
			assert.equal(sessionEvents.length, 0);
			navigate({ url: 'https://codeforces.com/enter' }); navigate({ url: 'https://codeforces.com/' }); navigate({ url: 'https://codeforces.com/' });
			assert.deepEqual(sessionEvents, [{ windowId: 1, site: 'codeforces' }, { windowId: 1, site: 'codeforces' }]);
			for (const route of ['enter', '', 'logout', '']) {
				await watchedClient.prepare(problem, new AbortController().signal);
				const started = new Promise(resolve => { signingStarted = resolve; });
				const sending = watchedClient.submit(problem, { ...payload, languageId: '89' }, 'fixture', 'navigation-' + sessionEvents.length, new AbortController().signal);
				await started; navigate({ url: 'https://codeforces.com/' + route }); finishSigning('fixture-signing-cookie');
				assert.equal((await sending).kind, 'not-sent', 'explicit account navigation invalidates the native generation before a delayed signing cookie returns');
				assert.equal(posts, 0, 'no source POST follows an account navigation');
			}
		} finally { watchedClient.dispose(); for (const watcher of watchers.values()) { watcher.dispose(); } }
		assert.equal(cookies.listenerCount('changed'), 0);
		const native = session.fromPartition('codeforces-host-fixture');
		let owner = 'fixture', accountReads = 0, challenge = false, identityChanges = 0, stallAccounts = false;
		const pendingBodies = [];
		native.protocol.handle('https', request => {
			assert.equal(request.url, 'https://codeforces.com/'); accountReads++;
			if (stallAccounts) { return new Response(new ReadableStream({ start(controller) { pendingBodies.push(controller); } })); }
			return new Response(challenge ? '<title>Just a moment...</title>' : owner
				? `<div id="header"><div class="lang-chooser"><a href="/profile/${owner}">${owner}</a><a href="/logout">Logout</a></div></div>`
				: '<div id="header"><a href="/enter">Enter</a><a href="/register">Register</a></div>');
		});
		const browserSession = { id: 'global', storageScope: 'global', electronSession: {
			cookies: native.cookies, fetch: (url, init) => native.fetch(url, { ...init, bypassCustomProtocolHandlers: false })
		}, connectStorage() {} };
		const nativeTraces = [];
		const nativeEvents = [];
		const nativeHost = { codeforcesClients: new Map(), windowsMainService: { getWindowById: id => [1, 2, 3].includes(id) ? { openedWorkspace: { id: 'fixture' } } : undefined },
			logService: { info(...args) { nativeTraces.push(args); } },
			instantiationService: { createInstance: () => browserSession }, environmentMainService: {}, applicationStorageMainService: {}, _ensureWindowCloseSubscription() {},
			_onDidChangeOjSession: { fire(event) { assert.equal(event.site, 'codeforces'); nativeEvents.push(event); identityChanges++; } }
		};
		for (const name of ['ojSession', 'openCodeforcesSession', 'codeforcesClient', 'readOjLogin', 'invalidateCodeforcesSession']) { nativeHost[name] = BrowserViewMainService.prototype[name]; }
		try {
			await assert.rejects(nativeHost.openCodeforcesSession(99, 'global'), /owner/);
			await assert.rejects(nativeHost.openCodeforcesSession(1, 'ephemeral'), /persistent/);
			const id = await nativeHost.openCodeforcesSession(1, 'global');
			assert.equal(await nativeHost.openCodeforcesSession(1, 'global'), id);
			assert.equal(nativeHost.codeforcesClients.size, 1);
			const summaries = await Promise.all(Array.from({ length: 8 }, () => nativeHost.readOjLogin(id, 1, 'codeforces')));
			assert.equal(accountReads, 1, 'concurrent sidebar reads share the native account operation');
			assert.ok(summaries.every(summary => summary.state === 'signed-in' && summary.label === 'fixture'));
			assert.ok(nativeTraces.some(([prefix, event, details]) => prefix === '[OJ Connect CF]' && event === 'operation-complete' && details.windowId === 1 && details.phase === 'account'));
			await assert.rejects(nativeHost.readOjLogin(id, 2, 'codeforces'), /owner/);
			for (const value of ['rotated-one', 'rotated-two']) { await native.cookies.set({ url: 'https://codeforces.com/', name: 'JSESSIONID', value }); }
			assert.equal((await nativeHost.readOjLogin(id, 1, 'codeforces')).label, 'fixture');
			assert.equal(identityChanges, 0, 'ordinary cookie writes do not imply an account change');
			challenge = true; assert.equal((await nativeHost.readOjLogin(id, 1, 'codeforces')).state, 'unknown');
			assert.equal(identityChanges, 0, 'a challenge does not imply logout');
			challenge = false; owner = 'other';
			assert.equal((await nativeHost.readOjLogin(id, 1, 'codeforces')).label, 'other'); assert.equal(identityChanges, 1);
			owner = ''; assert.equal((await nativeHost.readOjLogin(id, 1, 'codeforces')).state, 'signed-out'); assert.equal(identityChanges, 2);
			assert.ok(nativeTraces.some(([, event, details]) => event === 'session-invalidated' && details.reason === 'identity-change'));
			await nativeHost.openCodeforcesSession(2, 'global');
			await nativeHost.readOjLogin(id, 2, 'codeforces');
			const isolatedClient = new CodeforcesSessionClient({ fetch: async () => new Response(stallAccounts ? new ReadableStream({ start(controller) { pendingBodies.push(controller); } }) : '<div id="header"><a href="/enter">Enter</a><a href="/register">Register</a></div>'), getSigningCookie: async () => undefined, post: async () => { throw new Error('No source POST in login fixture'); }, onSessionChange: () => ({ dispose() {} }) });
			nativeHost.codeforcesClients.set('3:workspace:fixture', { windowId: 3, session: { id: 'workspace:fixture', storageScope: 'workspace' }, client: isolatedClient });
			nativeEvents.length = 0; owner = 'shared';
			assert.equal((await nativeHost.readOjLogin(id, 1, 'codeforces')).label, 'shared', 'broadcast does not invalidate the successful source account read');
			assert.deepEqual(nativeEvents, [{ windowId: 1, site: 'codeforces' }, { windowId: 2, site: 'codeforces' }], 'verified identity changes refresh a peer with no browser tab, and isolate other workspaces');
			assert.equal((await nativeHost.readOjLogin(id, 2, 'codeforces')).label, 'shared');
			assert.equal(nativeEvents.length, 2, 'the peer refresh cannot cause an identity refresh loop');
			stallAccounts = true;
			const pendingPeer = nativeHost.readOjLogin(id, 2, 'codeforces'), pendingIsolated = nativeHost.readOjLogin('workspace:fixture', 3, 'codeforces');
			await new Promise(resolve => setImmediate(resolve));
			nativeHost.invalidateCodeforcesSession('global', 1);
			assert.equal((await pendingPeer).state, 'unknown', 'account navigation invalidates peer reads from the previous identity');
			for (const body of pendingBodies) { try { body.enqueue(new TextEncoder().encode('<div id="header"><a href="/enter">Enter</a><a href="/register">Register</a></div>')); body.close(); } catch { /* An invalidated response may already have been cancelled. */ } }
			assert.equal((await pendingIsolated).state, 'signed-out', 'another Session account read is not cancelled');
			for (const name of ['codeforcesRequests', 'nowcoderRequests', 'nowcoderClients', 'nowcoderAttempts', 'atCoderAccounts', 'atCoderAccountReads', 'luoguRequests', 'luoguClients', 'ojReads', 'atCoderRequests', 'atCoderRecords', 'atCoderAttempts', 'luoguAttempts']) { nativeHost[name] = new Map(); }
			await BrowserViewMainService.prototype.cancelOjOperations.call(nativeHost, 2);
			nativeEvents.length = 0; nativeHost.invalidateCodeforcesSession('global', 1);
			assert.deepEqual(nativeEvents, [{ windowId: 1, site: 'codeforces' }], 'a closed window is not notified');
			assert.doesNotMatch(JSON.stringify(nativeTraces), /fixture|rotated-one|rotated-two|https:\/\//);
			assert.equal(BrowserWindow.getAllWindows().length, 0);
			console.log('Codeforces native host passed: fixed source identity, window ownership, busy/cancel, readonly reconcile, active CPH route, shared persistent Session, deduped login, rotation, challenge, shared identity refresh without loops, pending peer read invalidation, workspace isolation and closed window release.');
		} finally { for (const entry of nativeHost.codeforcesClients.values()) { entry.client.dispose(); } }
	} catch (error) { console.error(error.stack); process.exitCode = 1; }
	finally { app.exit(process.exitCode || 0); }
});

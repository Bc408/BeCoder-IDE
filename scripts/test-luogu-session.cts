/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Same-version Electron with a private, intercepted session. No live OJ traffic or account.
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'tmp/oj-connect-audit/native-luogu-fixture-data'));
// Keep the test alive after intentionally destroying its only browser window.
app.on('window-all-closed', () => { });

app.whenReady().then(async () => {
	let client;
	const watchdog = setTimeout(() => { console.error('Luogu fixture did not finish.'); app.exit(1); }, 20000);
	try {
		const { LuoguSessionClient } = require(path.join(root, 'tmp/oj-connect-audit/native-luogu-client.cjs'));
		const browserSession = session.fromPartition('luogu-native-fixture');
		const window = new BrowserWindow({ show: false, webPreferences: { partition: 'luogu-native-fixture', sandbox: true } });
		assert.equal(window.webContents.session, browserSession, 'transport must share the browser session');
		window.destroy();
		assert.equal(BrowserWindow.getAllWindows().length, 0);
		const problem = { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
		const payload = { source: '#include <iostream>\nint main(){std::cout << "\u4f60\u597d";}\n', fileName: 'P1001.cpp', languageId: '27:o2' };
		const context = { user: { uid: 123, name: 'fixture-user' }, data: { problem: { pid: 'P1001', name: 'A+B', content: { locale: 'zh-CN', description: 'Sum $a+b$.' }, samples: [['20 30\n', '50\n']], acceptLanguages: [27], limits: { time: [1000], memory: [524288] } }, translations: {} } };
		const config = { CodeLanguage: { 27: { id: 27, name: 'C++20', fileExt: ['cpp'], canO2: true } }, RecordStatus: { 0: { name: 'Waiting', shortName: 'WJ' }, 1: { name: 'Judging', shortName: 'Judging' }, 12: { name: 'Accepted', shortName: 'AC' } } };
		const html = value => '<meta name="csrf-token" content="9999999999:fixture"><script id="lentille-context" type="application/json">' + JSON.stringify(value) + '</script>';
		let mode = 'ordinary', recordStatus = 12, blockedRecord;
		const posts = [], requests = [], prompts = [];
		const sockets = [];
		let answers = [], waiting, sessionChanged;
		browserSession.protocol.handle('https', async request => {
			const url = new URL(request.url);
			assert.equal(url.origin, 'https://www.luogu.com.cn');
			requests.push(url.pathname);
			if (url.pathname === '/_lfe/config') { return Response.json(config); }
			if (url.pathname === '/_lfe/tags/zh-CN') { return Response.json({ tags: [{ id: 1, name: '\u6a21\u62df', type: 2 }], types: [{ id: 2, color: 'orange-3' }] }); }
			if (url.pathname === '/api/verify/captcha') { return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6EGQAAAAASUVORK5CYII=', 'base64'), { headers: { 'Content-Type': 'image/png' } }); }
			if (url.pathname === '/fe/api/problem/submit/P1001') {
				assert.equal(request.method, 'POST');
				assert.equal(request.headers.get('X-CSRF-Token'), '9999999999:fixture');
				const body = await request.json(); posts.push(body);
				if (mode === 'captcha' && body.captcha !== 'correct') { return Response.json({ errorMessage: '\u9a8c\u8bc1\u7801\u9519\u8bef' }, { status: 400 }); }
				if (mode === 'rejected') { return Response.json({ errorMessage: '\u63d0\u4ea4\u8fc7\u4e8e\u9891\u7e41' }, { status: 429 }); }
				if (mode === 'lost') { return Response.json({}); }
				if (mode === 'redirect') { return new Response(null, { status: 307, headers: { Location: '/unexpected-replay' } }); }
				return Response.json({ rid: 22 });
			}
			if (url.pathname === '/record/22') {
				if (blockedRecord) { const gate = blockedRecord; blockedRecord = undefined; gate.entered(); await gate.promise; }
				return Response.json({ user: context.user, data: { canViewCode: true, canViewStatus: true, testcaseGroup: { 0: [0, 1] }, record: { id: 22, status: recordStatus, score: 100, language: 27, user: context.user, problem: { pid: 'P1001', type: 'P' }, sourceCode: payload.source, detail: {} } } });
			}
			if (['/', '/ranking', '/problem/P1001'].includes(url.pathname)) { return url.searchParams.has('_contentOnly') ? Response.json(context) : new Response(html(context), { headers: { 'Content-Type': 'text/html' } }); }
			throw new Error('Unexpected fixture route: ' + url.pathname);
		});
		client = new LuoguSessionClient({
			fetch: (url, init) => browserSession.fetch(url, { ...init, bypassCustomProtocolHandlers: false }),
			createSocket: async () => {
				const socket = { closed: false, sent: false,
					send(value) { assert.deepEqual(JSON.parse(value), { type: 'join_channel', channel: 'record.track', channel_param: '22' }); this.sent = true; },
					close() { this.closed = true; },
					push(record, welcome = false) { this.onmessage?.({ data: JSON.stringify(welcome ? { _ws_type: 'join_result', welcome_message: { record } } : { _ws_type: 'server_broadcast', type: 'status_push', record }) }); }
				};
				sockets.push(socket); setImmediate(() => socket.onopen?.()); return socket;
			},
			askCaptcha: async (requestId, signal) => {
				prompts.push(requestId);
				if (waiting) { waiting(); return new Promise(resolve => signal.addEventListener('abort', () => resolve(undefined), { once: true })); }
				return answers.shift();
			},
			onSessionChange: listener => { sessionChanged = listener; return { dispose() { sessionChanged = undefined; } }; }
		});
		const signal = () => new AbortController().signal;
		const prepared = await client.prepare(problem, signal());
		assert.equal(prepared.ownerKey, '123');
		assert.ok(prepared.languages.some(language => language.id === '27:o2'));
		const ordinary = await client.submit(problem, payload, '123', 'ordinary', signal());
		assert.equal(ordinary.kind, 'record'); assert.equal(ordinary.record.id, '22');
		assert.equal(posts.length, 1);
		assert.deepEqual(posts[0], { code: payload.source, lang: 27, enableO2: 1 });
		assert.equal((await client.readProblem(problem, signal())).samples[0].input, '20 30\n');
		assert.equal(requests.filter(route => route === '/_lfe/tags/zh-CN').length, 0, 'no tags require no tag request');
		Object.assign(context.data.problem, { difficulty: 1, tags: [1] });
		const [withTags, repeated] = await Promise.all([client.readProblem(problem, signal()), client.readProblem(problem, signal())]);
		assert.deepEqual(withTags.difficulty, { label: '\u5165\u95e8', color: '#FE4C61' });
		assert.deepEqual(withTags.tags, [{ label: '\u6a21\u62df', color: '#f39c11' }]);
		assert.deepEqual(withTags.limits.map(limit => limit.value), ['1.00s', '512.00MiB']);
		assert.deepEqual(repeated.tags, withTags.tags);
		assert.equal(requests.filter(route => route === '/_lfe/tags/zh-CN').length, 1, 'concurrent problems share the cached tag request');
		assert.equal((await client.login(signal())).state, 'signed-in');
		const first = await client.readRecord(ordinary.record, signal());
		assert.equal(first.phase, 'finished'); assert.equal(first.rawStatus, 'AC');
		assert.equal((await client.readRecord(ordinary.record, signal())).ref.id, '22', 'record can be read again without a page or subscription route');
		mode = 'captcha'; answers = ['wrong', 'correct'];
		const beforeCaptcha = posts.length, beforeProblemReads = requests.filter(route => route === '/problem/P1001').length;
		const verified = await client.submit(problem, payload, '123', 'captcha', signal());
		assert.equal(verified.kind, 'record');
		assert.equal(posts.length - beforeCaptcha, 3, 'one explicit captcha rejection permits one continuation per answer');
		assert.deepEqual(prompts, ['captcha', 'captcha']);
		for (const body of posts.slice(beforeCaptcha)) { assert.equal(body.code, payload.source); assert.equal(body.lang, 27); assert.equal(body.enableO2, 1); }
		assert.ok(requests.filter(route => route === '/problem/P1001').length - beforeProblemReads <= 1, 'captcha continuation must not repeat full problem preparation');
		answers = ['wrong-1', 'wrong-2', 'wrong-3', 'correct'];
		const beforeLimit = posts.length, beforePrompts = prompts.length;
		const limited = await client.submit(problem, payload, '123', 'captcha-limit', signal());
		assert.deepEqual(limited, { kind: 'not-sent', reason: 'luogu-browser-verification-required' });
		assert.equal(posts.length - beforeLimit, 4, 'initial challenge plus three rejected answers stops automatic sending');
		assert.equal(prompts.length - beforePrompts, 3, 'do not ask for another answer after the limit');
		assert.deepEqual(answers, ['correct'], 'the next answer must remain unused');
		assert.equal((await client.submit(problem, payload, '123', 'captcha-new-attempt', signal())).kind, 'record', 'a fresh user action has its own failure counter');
		mode = 'rejected';
		const rejection = await client.submit(problem, payload, '123', 'rejected', signal()).catch(error => error);
		assert.ok(rejection instanceof Error || rejection.kind === 'not-sent', 'a definite server rejection must not become an uncertain receipt');
		mode = 'lost'; const beforeLost = posts.length;
		assert.equal((await client.submit(problem, payload, '123', 'lost', signal())).kind, 'unconfirmed');
		assert.equal(posts.length - beforeLost, 1, 'lost receipt must never auto-resend');
		mode = 'redirect'; const beforeRedirect = posts.length;
		const redirected = await client.submit(problem, payload, '123', 'redirect', signal());
		assert.notEqual(redirected.kind, 'record'); assert.equal(posts.length - beforeRedirect, 1);
		assert.ok(!requests.includes('/unexpected-replay'), '307 response must never replay source to another route');
		mode = 'captcha'; const cancelled = new AbortController(); let entered;
		const enteredPromise = new Promise(resolve => { entered = resolve; }); waiting = entered;
		const beforeCancel = posts.length;
		const pending = client.submit(problem, payload, '123', 'cancel', cancelled.signal).catch(error => error);
		await enteredPromise; cancelled.abort();
		const stopped = await pending;
		assert.ok(stopped instanceof Error || stopped.kind === 'not-sent');
		assert.equal(posts.length - beforeCancel, 1, 'cancelling captcha must never send again');
		waiting = undefined; mode = 'ordinary';
		recordStatus = 0;
		assert.equal((await client.readRecord(ordinary.record, signal())).phase, 'queued');
		const socket = sockets.at(-1);
		await new Promise(resolve => setImmediate(resolve)); assert.equal(socket.sent, true);
		socket.push({ id: 22, status: 1 }, true);
		const judging = await client.readRecord(ordinary.record, signal());
		assert.equal(judging.phase, 'judging');
		assert.deepEqual(judging.groups[0].rows.map(row => row.slice(0, 2)), [['1', 'Judging'], ['2', 'Judging']], 'official groups survive the native push path');
		const terminal = client.readRecord(ordinary.record, signal());
		recordStatus = 12; socket.push({ id: 22, status: 12, score: '100' });
		assert.equal((await terminal).phase, 'finished'); assert.equal(socket.closed, true);
		recordStatus = 0;
		await client.readRecord(ordinary.record, signal());
		const closed = sockets.at(-1); client.releaseRecord(ordinary.record); assert.equal(closed.closed, true);
		await client.readRecord(ordinary.record, signal());
		assert.notEqual(sockets.at(-1), closed, 'reopening an unfinished record must reconnect by ID');
		client.releaseRecord(ordinary.record);
		let releaseGate, enterGate;
		const gateEntered = new Promise(resolve => { enterGate = resolve; });
		blockedRecord = { entered: enterGate, promise: new Promise(resolve => { releaseGate = resolve; }) };
		const socketCount = sockets.length;
		const initialRead = client.readRecord(ordinary.record, signal());
		await gateEntered; client.releaseRecord(ordinary.record); releaseGate();
		await assert.rejects(initialRead, /released|cancel/i);
		assert.equal(sockets.length, socketCount, 'closing during initial HTTP read must not create a late socket');
		if (sessionChanged) { sessionChanged(); }
		assert.equal((await client.prepare(problem, signal())).ownerKey, '123');
		assert.equal(BrowserWindow.getAllWindows().length, 0, 'all operations worked with no browser tab');
		console.log(JSON.stringify({ ok: true, electron: process.versions.electron, noBrowserWindow: true, ordinarySubmit: true, captcha400AndWrongAnswerRetry: true, definiteRejection: true, lostReceiptNoResend: true, redirectNoReplay: true, cancellationNoResend: true, pushLifecycle: true, reopenRecord: true, noLateSocket: true }));
	} catch (error) { console.error(error.stack); process.exitCode = 1; }
	finally { clearTimeout(watchdog); client?.dispose(); app.exit(process.exitCode || 0); }
});

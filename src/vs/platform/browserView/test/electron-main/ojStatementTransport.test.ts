/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import { createOjStatementRead } from '../../electron-main/ojStatementTransport.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Inert transport fixtures.
suite('OJ fixed statement transport', () => {
	const at = { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
	const cf = { site: 'codeforces' as const, nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
	function fixture(dispatch: (request: EventEmitter) => void, creating?: () => void) {
		let calls = 0, aborted = 0; const session = {} as Electron.Session;
		const factory = (options: Electron.ClientRequestConstructorOptions) => {
			calls++; assert.strictEqual(options.session, session); assert.strictEqual(options.method, 'GET'); assert.strictEqual(options.redirect, 'manual'); assert.strictEqual(options.useSessionCookies, true); assert.strictEqual(options.cache, 'no-store');
			const req = Object.assign(new EventEmitter(), { setHeader: () => undefined, abort: () => { aborted++; req.emit('error', new Error('private')); }, end: (...body: unknown[]) => { assert.strictEqual(body.length, 0); queueMicrotask(() => dispatch(req)); } });
			creating?.(); return req as unknown as Electron.ClientRequest;
		};
		return { read: createOjStatementRead(session, factory as typeof import('electron').net.request), calls: () => calls, aborted: () => aborted };
	}
	test('uses one fixed GET and the original Session with no source body', async () => {
		for (const problem of [at, cf]) {
			const f = fixture(req => { const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: { 'content-type': ['text/html; charset=utf-8'] } }); req.emit('response', response); response.emit('data', Buffer.from('<html>statement</html>')); response.emit('end'); });
			assert.strictEqual(await f.read(problem, new AbortController().signal), '<html>statement</html>'); assert.strictEqual(f.calls(), 1); assert.strictEqual(f.aborted(), 1);
		}
	});
	test('rejects foreign noncanonical mismatched and cancelled targets before dispatch', async () => {
		const f = fixture(() => assert.fail('unexpected request'));
		for (const problem of [{ ...at, url: at.url + '?lang=en' }, { ...cf, url: cf.url + '#x' }, { ...cf, nativeId: '5/A' }, { ...at, url: at.url.replace('atcoder.jp', 'other.invalid') }, { ...cf, url: cf.url.replace('codeforces.com', 'user@codeforces.com') }, { ...cf, url: 'https://codeforces.com/problemset/problem/4/A' }]) { await assert.rejects(f.read(problem, new AbortController().signal), /oj-statement-target/); }
		const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(f.read(at, cancelled.signal)); assert.strictEqual(f.calls(), 0);
	});
	test('classifies login or other redirects without following and rejects non HTML status and oversized bodies', async () => {
		for (const [mode, code] of [['login', 'atcoder-login-required'], ['redirect', 'oj-statement-redirect-unavailable'], ['status', 'oj-statement-response-unavailable'], ['type', 'oj-statement-response-type'], ['size', 'oj-connect-response-too-large'], ['body', 'oj-statement-response-body-read']]) {
			const f = fixture(req => {
				if (mode === 'login' || mode === 'redirect') { req.emit('redirect', 302, 'GET', mode === 'login' ? '/login?continue=x' : 'https://other.invalid/'); return; }
				const response = Object.assign(new EventEmitter(), { statusCode: mode === 'status' ? 403 : 200, headers: { 'content-type': [mode === 'type' ? 'application/json' : 'text/html'] } }); req.emit('response', response);
				if (mode === 'body') { response.emit('error', new Error('private')); }
				response.emit('data', Buffer.alloc(mode === 'size' ? 8 * 1024 * 1024 + 1 : 1)); response.emit('end');
			});
			await assert.rejects(f.read(at, new AbortController().signal), { message: code }); assert.strictEqual(f.calls(), 1); assert.strictEqual(f.aborted(), 1);
		}
	});
	test('cancellation during creation cannot dispatch and stalled request timeout retires timers', async () => {
		const controller = new AbortController(), created = fixture(() => assert.fail('cancelled dispatch'), () => controller.abort());
		await assert.rejects(created.read(cf, controller.signal), /oj-statement-cancelled/); assert.strictEqual(created.aborted(), 1);
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try { const stalled = fixture(() => undefined); const rejected = assert.rejects(stalled.read(cf, new AbortController().signal), /oj-statement-timeout/); await clock.tickAsync(15000); await rejected; assert.strictEqual(stalled.aborted(), 1); assert.strictEqual(clock.countTimers(), 0); } finally { clock.restore(); }
	});
});

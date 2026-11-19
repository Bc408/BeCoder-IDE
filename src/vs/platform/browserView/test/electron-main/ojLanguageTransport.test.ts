/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import { createOjLanguageRead } from '../../electron-main/ojLanguageTransport.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Native request fixtures use inert EventEmitters only.
suite('OJ readonly language transport', () => {
	const cf = 'https://codeforces.com/contest/2192/submit?problemIndex=A';
	const atcoder = 'https://atcoder.jp/contests/abc484/submit?taskScreenName=abc484_c';
	function fixture(dispatch: (request: EventEmitter) => void, created?: () => void) {
		const session = {} as Electron.Session, headers = new Map<string, string>();
		let calls = 0, aborted = 0;
		const factory = ((options: Electron.ClientRequestConstructorOptions) => {
			calls++; assert.strictEqual(options.method, 'GET'); assert.strictEqual(options.session, session);
			assert.strictEqual(options.useSessionCookies, true); assert.strictEqual(options.redirect, 'manual');
			const request = new EventEmitter() as EventEmitter & { setHeader(name: string, value: string): void; abort(): void; end(): void };
			request.setHeader = (name, value) => { headers.set(name, value); };
			request.abort = () => { aborted++; request.emit('error', new Error('request aborted')); request.emit('redirect', 302, 'GET', '/enter'); };
			request.end = (...body: unknown[]) => { assert.strictEqual(body.length, 0, 'a catalogue GET never sends a body'); queueMicrotask(() => dispatch(request)); };
			created?.();
			return request as unknown as Electron.ClientRequest;
		}) as typeof import('electron').net.request;
		return { read: createOjLanguageRead(session, factory), headers, calls: () => calls, aborted: () => aborted };
	}
	test('reads only bounded official submit HTML using the original Session and no source body', async () => {
		for (const url of [cf, atcoder]) {
			const f = fixture(request => {
				const response = Object.assign(new EventEmitter(), { statusCode: 200 });
				request.emit('response', response); response.emit('data', Buffer.from('<html>compiler catalogue</html>')); response.emit('end');
			});
			assert.strictEqual(await f.read(url, new AbortController().signal), '<html>compiler catalogue</html>');
			assert.strictEqual(f.headers.get('Referer'), new URL(url).origin + '/');
			assert.strictEqual(f.calls(), 1); assert.strictEqual(f.aborted(), 1);
		}
	});
	test('classifies only the same-site login redirect and never follows any redirect', async () => {
		for (const [url, destination, reason] of [
			[cf, 'https://codeforces.com/enter?back=submit', 'oj-language-login-required'],
			[atcoder, '/login?continue=submit', 'oj-language-login-required'],
			[cf, 'https://atcoder.jp/login', 'oj-language-redirect-unavailable'],
			[atcoder, 'https://other.invalid/login', 'oj-language-redirect-unavailable'],
			[cf, cf, 'oj-language-redirect-unavailable'],
			[cf, 'https://secret@codeforces.com/enter', 'oj-language-redirect-unavailable']
		]) {
			const f = fixture(request => request.emit('redirect', 302, 'GET', destination));
			await assert.rejects(f.read(url, new AbortController().signal), { message: reason });
			assert.strictEqual(f.calls(), 1); assert.strictEqual(f.aborted(), 1);
		}
	});
	test('foreign targets, duplicate parameters and cancelled callers dispatch nothing', async () => {
		const f = fixture(() => assert.fail('invalid target must not dispatch'));
		for (const url of [
			'https://other.invalid/contest/4/submit?problemIndex=A',
			'https://codeforces.com/contest/4/my?problemIndex=A',
			cf + '&problemIndex=B', cf + '&source=private', cf + '#hash',
			'https://user@codeforces.com/contest/4/submit?problemIndex=A',
			atcoder.replace('taskScreenName=', 'unknown='), atcoder.replace('abc484/submit', 'abc484/tasks')
		]) { await assert.rejects(f.read(url, new AbortController().signal), /oj-language-target/); }
		const cancelled = new AbortController(); cancelled.abort();
		await assert.rejects(f.read(cf, cancelled.signal)); assert.strictEqual(f.calls(), 0);
	});
	test('rejects non-200, oversized and broken responses with fixed diagnostic classes', async () => {
		for (const [kind, reason] of [['status', 'oj-language-response-unavailable'], ['size', 'oj-language-response-too-large'], ['body', 'oj-language-response-body-read'], ['request', 'oj-language-request-failed']]) {
			const f = fixture(request => {
				if (kind === 'request') { request.emit('error', new Error('private error URL')); return; }
				const response = Object.assign(new EventEmitter(), { statusCode: kind === 'status' ? 403 : 200 });
				request.emit('response', response);
				if (kind === 'size') { response.emit('data', Buffer.alloc(4 * 1024 * 1024 + 1)); }
				if (kind === 'body') { response.emit('error', new Error('private response body')); }
				response.emit('end');
			});
			await assert.rejects(f.read(cf, new AbortController().signal), { message: reason });
			assert.strictEqual(f.aborted(), 1);
		}
	});
	test('cancels stalled requests and removes the timeout after either cancellation or deadline', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			for (const cause of ['caller', 'deadline']) {
				const f = fixture(() => { }), controller = new AbortController();
				const rejected = assert.rejects(f.read(cf, controller.signal), { message: cause === 'caller' ? 'oj-language-cancelled' : 'oj-language-timeout' });
				await clock.tickAsync(0);
				if (cause === 'caller') { controller.abort(); } else { await clock.tickAsync(15000); }
				await rejected; assert.strictEqual(f.aborted(), 1); assert.strictEqual(clock.countTimers(), 0);
			}
		} finally { clock.restore(); }
	});
	test('an abort during native request creation prevents dispatch and tolerates reentrant abort events', async () => {
		const controller = new AbortController();
		const f = fixture(() => assert.fail('already cancelled request cannot end'), () => controller.abort());
		await assert.rejects(f.read(cf, controller.signal), { message: 'oj-language-cancelled' });
		assert.strictEqual(f.calls(), 1); assert.strictEqual(f.aborted(), 1);
	});
});

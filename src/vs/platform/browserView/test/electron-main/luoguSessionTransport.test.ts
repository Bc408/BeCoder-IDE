/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { Readable, type Transform } from 'stream';
import type { ClientRequest, IncomingMessage } from 'http';
import { gzipSync } from 'zlib';
import { fetchLuoguDirect, type LuoguHttpsRequest } from '../../electron-main/luoguSessionTransport.js';

function fixture() {
	let uid = '123', status = 200, headers: IncomingMessage['headers'] = { 'content-type': 'application/json' };
	let body: Buffer = Buffer.from('{"rid":22}');
	let calls = 0, sent = '', aborted = false, timeout: (() => void) | undefined;
	let options: import('https').RequestOptions | undefined;
	let holdResponse = false, incoming: IncomingMessage | undefined;
	let decoder: Transform | undefined;
	let onDispatch!: () => void, onResponse!: () => void;
	const dispatched = new Promise<void>(resolve => { onDispatch = resolve; });
	const received = new Promise<void>(resolve => { onResponse = resolve; });
	const cookies = async () => [{ name: '_uid', value: uid }, { name: '__client_id', value: 'private-client' }, { name: 'unrelated', value: 'not-exported' }];
	const session = { cookies: { get: cookies }, getUserAgent: () => 'same-browser-agent' } as unknown as Pick<Electron.Session, 'cookies' | 'getUserAgent'>;
	const request: LuoguHttpsRequest = (_url, input, callback) => {
		calls++; options = input;
		const req = new EventEmitter() as EventEmitter & { end(value?: string | Uint8Array): void; destroy(error?: Error): void; setTimeout(ms: number, callback: () => void): void };
		req.setTimeout = (ms, callback) => { assert.strictEqual(ms, 6000); timeout = callback; };
		req.destroy = error => { aborted = true; if (error) { queueMicrotask(() => req.emit('error', error)); } };
		req.end = value => {
			sent = value?.toString() ?? '';
			const response = (holdResponse ? new Readable({ read() { } }) : Readable.from([body])) as IncomingMessage;
			response.pipe = function <T extends NodeJS.WritableStream>(destination: T, options?: { end?: boolean }): T {
				decoder = destination as unknown as Transform;
				return Readable.prototype.pipe.call(this, destination, options) as T;
			};
			response.statusCode = status; response.headers = headers;
			incoming = response;
			onDispatch();
			queueMicrotask(() => { callback(response); onResponse(); });
		};
		return req as unknown as ClientRequest;
	};
	return { session, request, dispatched, received, get calls() { return calls; }, get options() { return options; }, get sent() { return sent; }, get aborted() { return aborted; }, get decoder() { return decoder; }, hold: () => { holdResponse = true; }, interrupt: (error: Error) => incoming!.destroy(error), expire: () => timeout?.(), setUid: (value: string) => { uid = value; }, respond: (code: number, value: Buffer, values: IncomingMessage['headers'] = {}) => { status = code; body = value; headers = values; } };
}

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('Luogu direct HTTP transport', () => {
	test('uses fresh browser credentials and unchanged UA with direct routing and exact JSON', async () => {
		const f = fixture(), source = JSON.stringify({ code: '你好', captcha: 'aB12' });
		const response = await fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/fe/api/problem/submit/P1001', { method: 'POST', body: source, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'token' }, redirect: 'manual' }, f.request);
		assert.deepStrictEqual(await response.json(), { rid: 22 });
		assert.strictEqual(f.options!.agent, false);
		assert.strictEqual(f.sent, source);
		const headers = new Headers(f.options!.headers as Record<string, string>);
		assert.strictEqual(headers.get('content-length'), String(Buffer.byteLength(source)));
		assert.strictEqual(headers.get('cookie'), '_uid=123;__client_id=private-client');
		assert.strictEqual(headers.get('user-agent'), 'same-browser-agent');
		f.setUid('456');
		await fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/ranking', {}, f.request);
		assert.ok(new Headers(f.options!.headers as Record<string, string>).get('cookie')!.includes('_uid=456;'));
	});
	test('returns redirects without following them and rejects foreign routes before cookies', async () => {
		const f = fixture(); f.respond(307, Buffer.alloc(0), { location: 'https://example.org/replay' });
		assert.strictEqual((await fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/fe/api/problem/submit/P1001', { method: 'POST', body: '{}' }, f.request)).status, 307);
		assert.strictEqual(f.calls, 1);
		await assert.rejects(fetchLuoguDirect(f.session, 'https://example.org/ranking', {}, f.request), /route/);
		await assert.rejects(fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/unrelated', {}, f.request), /route/);
		await assert.rejects(fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/auth/logout', { method: 'POST' }, f.request), /route/);
		assert.strictEqual(f.calls, 1);
	});
	test('cancellation before dispatch sends nothing', async () => {
		const f = fixture(), controller = new AbortController(); controller.abort(new Error('stopped'));
		await assert.rejects(fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/ranking', { signal: controller.signal }, f.request), /stopped/);
		assert.strictEqual(f.calls, 0);
	});
	test('cancellation after dispatch destroys the request', async () => {
		const f = fixture(); f.hold();
		const next = new AbortController();
		const reading = fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/ranking', { signal: next.signal }, f.request);
		await f.dispatched; next.abort(new Error('late-stop'));
		await assert.rejects(reading, /late-stop/); assert.strictEqual(f.aborted, true);
	});
	test('request timeout rejects and destroys an unfinished response', async () => {
		const f = fixture(); f.hold();
		const reading = fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/ranking', {}, f.request);
		await f.received; f.expire();
		await assert.rejects(reading, /luogu-request-timeout/);
		assert.strictEqual(f.aborted, true);
	});
	test('cancellation destroys the active decompressor of a compressed response', async () => {
		const f = fixture(), controller = new AbortController();
		f.hold(); f.respond(200, Buffer.alloc(0), { 'content-encoding': 'gzip' });
		const reading = fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/ranking', { signal: controller.signal }, f.request);
		await f.received;
		assert.ok(f.decoder);
		controller.abort(new Error('stop-compressed-read'));
		await assert.rejects(reading, /stop-compressed-read/);
		assert.strictEqual(f.decoder.destroyed, true);
	});
	test('response stream errors reject without waiting for the request timeout', async () => {
		const f = fixture(); f.hold();
		const reading = fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/ranking', {}, f.request);
		await f.received; f.interrupt(new Error('socket-closed'));
		await assert.rejects(reading, /socket-closed/);
		assert.strictEqual(f.aborted, true);
	});
	test('synchronous request construction errors reject without sending', async () => {
		const f = fixture();
		await assert.rejects(fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/ranking', {}, () => { throw new Error('request-construction'); }), /request-construction/);
		assert.strictEqual(f.calls, 0);
	});
	test('bounds encoded and decoded responses and handles gzip without exporting auth changes', async () => {
		const f = fixture(); f.respond(200, gzipSync(Buffer.from('{"ok":true}')), { 'content-encoding': 'gzip', 'content-type': 'application/json' });
		assert.deepStrictEqual(await (await fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/ranking', {}, f.request)).json(), { ok: true });
		f.respond(200, gzipSync(Buffer.alloc(8 * 1024 * 1024 + 1)), { 'content-encoding': 'gzip' });
		await assert.rejects(fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/ranking', {}, f.request), /too-large/);
		f.respond(200, Buffer.from('ok'), { 'set-cookie': ['_uid=999; Path=/; Secure'] });
		await assert.rejects(fetchLuoguDirect(f.session, 'https://www.luogu.com.cn/ranking', {}, f.request), /session-changed/);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { createCodeforcesPost } from '../../electron-main/codeforcesTransport.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- EventEmitter fixtures have no external resources.
suite('Codeforces native single request', () => {
	test('captures manual redirects in the bound Session and never follows or resends', async () => {
		for (const status of [302, 307, 308]) {
			let calls = 0, sent = '', stopped = false;
			const session = {} as Electron.Session;
			const request = ((options: Electron.ClientRequestConstructorOptions) => {
				calls++; assert.strictEqual(options.session, session); assert.strictEqual(options.useSessionCookies, true); assert.strictEqual(options.redirect, 'manual');
				const req = new EventEmitter() as EventEmitter & { setHeader(): void; abort(): void; end(body: string): void };
				req.setHeader = () => { }; req.abort = () => { stopped = true; }; req.end = body => { sent = body; queueMicrotask(() => req.emit('redirect', status, status === 302 ? 'GET' : 'POST', 'https://codeforces.com/contest/4/my')); };
				return req as unknown as Electron.ClientRequest;
			}) as typeof import('electron').net.request;
			const post = createCodeforcesPost(session, request);
			const result = await post('https://codeforces.com/contest/4/submit?csrf_token=fixture', { body: 'source=exact', headers: {}, signal: new AbortController().signal });
			assert.strictEqual(result.status, status); assert.strictEqual(result.location, 'https://codeforces.com/contest/4/my'); assert.strictEqual(calls, 1); assert.strictEqual(sent, 'source=exact'); assert.strictEqual(stopped, true);
		}
	});
	test('already cancelled and foreign targets cannot dispatch source', async () => {
		let calls = 0; const request = (() => { calls++; throw new Error('must not dispatch'); }) as typeof import('electron').net.request;
		const post = createCodeforcesPost({} as Electron.Session, request), controller = new AbortController(); controller.abort();
		await assert.rejects(post('https://codeforces.com/contest/4/submit?csrf_token=fixture', { body: '', headers: {}, signal: controller.signal }));
		await assert.rejects(post('https://evil.invalid/contest/4/submit', { body: '', headers: {}, signal: new AbortController().signal })); assert.strictEqual(calls, 0);
	});
});

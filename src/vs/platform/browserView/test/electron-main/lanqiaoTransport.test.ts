/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { createLanqiaoTransport } from '../../electron-main/lanqiaoTransport.js';
import { lanqiaoFixtureProblem as problem } from './lanqiaoFixtures.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Finite EventEmitter request doubles.
suite('Lanqiao fixed native operations', () => {
	test('one source dispatch uses bound Session, manual redirects and original body', async () => {
		let calls = 0, sent = '', target: Electron.ClientRequestConstructorOptions | undefined;
		const session = {} as Electron.Session;
		const factory = ((options: Electron.ClientRequestConstructorOptions) => {
			target = options; calls++;
			const req = new EventEmitter() as EventEmitter & { end(body: string): void; abort(): void; setHeader(): void };
			req.setHeader = () => { }; req.abort = () => { };
			req.end = body => { sent = body; queueMicrotask(() => req.emit('redirect', 307, 'POST', 'https://evil.example')); };
			return req as unknown as Electron.ClientRequest;
		}) as typeof import('electron').net.request;
		const value = await createLanqiaoTransport(session, factory).request({ kind: 'source', problem, source: 'int main(){}\n', language: 'cpp' }, new AbortController().signal);
		assert.strictEqual(value.status, 307); assert.strictEqual(calls, 1);
		assert.strictEqual(target?.session, session); assert.strictEqual(target?.useSessionCookies, true); assert.strictEqual(target?.redirect, 'manual');
		assert.strictEqual(target?.url, 'https://www.lanqiao.cn/api/v2/problems/254/submit/');
		assert.deepStrictEqual(JSON.parse(sent), { language: 'cpp', submit_content: 'int main(){}\n', judge_client: 2, is_submit: true });
	});
	test('foreign targets, malformed operations and cancelled reads never reach native request', async () => {
		let calls = 0;
		const factory = (() => { calls++; throw new Error('unexpected-dispatch'); }) as typeof import('electron').net.request;
		const transport = createLanqiaoTransport({} as Electron.Session, factory);
		await assert.rejects(transport.request({ kind: 'catalogue-asset', url: 'https://evil.example/1111111.js' }, new AbortController().signal));
		await assert.rejects(transport.request({ kind: 'problem', problem: { ...problem, url: problem.url + '?contest_id=1' } }, new AbortController().signal));
		const stopped = new AbortController(); stopped.abort();
		await assert.rejects(transport.request({ kind: 'account' }, stopped.signal));
		assert.strictEqual(calls, 0);
	});
});

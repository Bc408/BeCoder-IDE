/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event, Emitter } from '../../../../base/common/event.js';
import { BrowserViewStorageScope } from '../../common/browserView.js';
import type { BrowserViewMainService } from '../../electron-main/browserViewMainService.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Inert service boundary fixtures.
suite('OJ statement ownership and cancellation', () => {
	test('cancellation before registration prevents any Session or transport acquisition', async function () {
		if (process.type !== 'browser') { this.skip(); }
		const { BrowserViewMainService } = await import('../../electron-main/browserViewMainService.js');
		let sessions = 0;
		const service = Object.assign(Object.create(BrowserViewMainService.prototype), { ojReads: new Map(), cancelledOjStatementReads: new Set(), ojSession: () => { sessions++; throw new Error('unexpected Session'); } }) as BrowserViewMainService;
		await service.cancelOjStatementRead(1, 'request');
		await assert.rejects(service.readOjStatement(1, BrowserViewStorageScope.Global, { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' }, 'request'), /oj-statement-cancelled/);
		assert.strictEqual(sessions, 0);
		await assert.rejects(service.readOjStatement(1, BrowserViewStorageScope.Global, { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://other.invalid/task' }, 'invalid'), /oj-statement-target/); assert.strictEqual(sessions, 0);
	});
	test('browser Get retains its owner problem identity and original temporary Session without navigation', async function () {
		if (process.type !== 'browser') { this.skip(); }
		const { BrowserViewMainService } = await import('../../electron-main/browserViewMainService.js');
		const problem = { site: 'codeforces' as const, nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' }, calls: unknown[][] = [];
		let owner = 1, url = 'https://codeforces.com/problemset/problem/4/A?locale=en';
		const session = { storageScope: BrowserViewStorageScope.Ephemeral };
		const view = { owner: { get mainWindowId() { return owner; } }, session, onDidClose: Event.None, onDidNavigate: Event.None, getWebContentsView: () => ({ webContents: { getURL: () => url } }) };
		const service = Object.assign(Object.create(BrowserViewMainService.prototype), { _getBrowserView: () => view, readStatementDocument: async (...args: unknown[]) => { calls.push(args); (args[4] as () => void)(); return { ref: problem, title: 'Watermelon', bodies: [], samples: [], limits: [], interactive: false }; } }) as BrowserViewMainService;
		await service.readOjProblem('view', 1, problem); assert.deepStrictEqual(calls[0].slice(0, 3), [session, 1, problem]);
		owner = 2; await assert.rejects(service.readOjProblem('view', 1, problem), /oj-connect-owner/);
		owner = 1; url = 'https://codeforces.com/contest/5/problem/A'; await assert.rejects(service.readOjProblem('view', 1, problem), /oj-connect-page-changed/); assert.strictEqual(calls.length, 1);
	});
	test('browser navigation or closure promptly cancels only its own pending statement', async function () {
		if (process.type !== 'browser') { this.skip(); }
		const { BrowserViewMainService } = await import('../../electron-main/browserViewMainService.js');
		for (const cause of ['close', 'navigate']) {
			const closed = new Emitter<void>(), navigated = new Emitter<void>();
			try {
				const problem = { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
				let reject!: (error: Error) => void, request = '', cancellations = 0;
				const view = { owner: { mainWindowId: 1 }, session: { storageScope: BrowserViewStorageScope.Ephemeral }, onDidClose: closed.event, onDidNavigate: navigated.event, getWebContentsView: () => ({ webContents: { getURL: () => problem.url } }) };
				const service = Object.assign(Object.create(BrowserViewMainService.prototype), { _getBrowserView: () => view, readStatementDocument: async (_session: unknown, _owner: number, _problem: unknown, id: string) => { request = id; return new Promise((_resolve, fail) => { reject = fail; }); }, cancelOjStatementRead: async (owner: number, id: string) => { assert.strictEqual(owner, 1); assert.strictEqual(id, request); cancellations++; reject(new Error('oj-statement-cancelled')); } }) as BrowserViewMainService;
				const rejected = assert.rejects(service.readOjProblem('view', 1, problem), /oj-statement-cancelled/);
				if (cause === 'close') { closed.fire(); } else { navigated.fire(); }
				assert.strictEqual(cancellations, 1); await rejected;
				closed.fire(); navigated.fire(); assert.strictEqual(cancellations, 1, 'retired browser watchers cannot cancel another read');
			} finally { closed.dispose(); navigated.dispose(); }
		}
	});
});

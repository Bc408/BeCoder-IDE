/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { BrowserView } from '../../electron-main/browserView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('Browser favicon ownership', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	function fixture(fetch: (url: string) => Promise<Response>) {
		let page = 'https://example.com/first', disposed = false;
		const updates: unknown[] = [], history: unknown[] = [];
		const contents = Object.assign(new EventEmitter(), { ipc: new EventEmitter(), getURL: () => page, isDestroyed: () => disposed, session: { fetch } });
		const cache = new Map<string, Promise<string>>();
		// Register the production listeners without constructing an unrelated native window.
		const view = Object.assign(Object.create(BrowserView.prototype), {
			_view: { webContents: contents }, _faviconRequestCache: cache, _faviconRequestVersion: 0,
			_isDisposed: false, _onDidChangeFavicon: { fire: (value: unknown) => updates.push(value) },
			_currentHistoryHandle: { update: (value: unknown) => history.push(value) },
			session: { trust: { installCertErrorHandler() { } } }
		});
		view.setupEventListeners();
		const update = (urls: string[]) => contents.listeners('page-favicon-updated')[0](undefined, urls);
		return { update, updates, history, cache, navigate: () => { page = 'https://example.com/second'; }, dispose: () => { disposed = true; view._isDisposed = true; } };
	}

	function deferred<T>() {
		let resolve!: (value: T) => void;
		return { promise: new Promise<T>(accept => { resolve = accept; }), resolve: (value: T) => resolve(value) };
	}

	test('a late old favicon cannot replace the latest event or its history', async () => {
		const old = deferred<Response>();
		const f = fixture(async () => old.promise);
		const first = f.update(['https://example.com/old.png']);
		await f.update(['data:image/png;base64,bmV3']);
		old.resolve(new Response('old', { headers: { 'Content-Type': 'image/png' } })); await first;
		assert.deepStrictEqual(f.updates, [{ favicon: 'data:image/png;base64,bmV3' }]);
		assert.deepStrictEqual(f.history, f.updates);
	});

	test('navigation or disposal drops an outstanding favicon', async () => {
		for (const action of ['navigate', 'dispose'] as const) {
			const result = deferred<Response>(), f = fixture(async () => result.promise);
			const updating = f.update(['https://example.com/icon.png']); f[action]();
			result.resolve(new Response('icon', { headers: { 'Content-Type': 'image/png' } })); await updating;
			assert.deepStrictEqual(f.updates, []); assert.deepStrictEqual(f.history, []);
		}
	});

	test('a failed request can recover on a later event', async () => {
		let calls = 0;
		const f = fixture(async () => ++calls === 1 ? new Response('', { status: 503 }) : new Response('icon', { headers: { 'Content-Type': 'image/png' } }));
		await f.update(['https://example.com/icon.png']); await f.update(['https://example.com/icon.png']);
		assert.strictEqual(calls, 2); assert.strictEqual(f.updates.length, 1);
	});

	test('distinct icons have bounded cache retention and repeated icons reuse their request', async () => {
		let calls = 0;
		const f = fixture(async () => { calls++; return new Response('icon', { headers: { 'Content-Type': 'image/png' } }); });
		for (let i = 0; i < 100; i++) { await f.update(['https://example.com/' + i + '.png']); }
		assert.ok(f.cache.size <= 32);
		await f.update(['https://example.com/99.png']);
		assert.strictEqual(calls, 100);
	});
});

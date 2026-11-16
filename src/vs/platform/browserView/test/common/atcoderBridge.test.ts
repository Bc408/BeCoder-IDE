/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { AtCoderBridgeController, AtCoderPageGeneration, type IAtCoderBridgePorts } from '../../common/atcoderBridge.js';

// Every controller's timers are explicitly released in teardown.
// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('AtCoder extension bridge', () => {
	const url = 'https://atcoder.jp/contests/abc086/tasks/abc086_a';
	const payload = { source: 'int main() {}\n', fileName: 'abc086_a.cpp', languageId: '6017', replaceDraft: false };
	const controllers: AtCoderBridgeController[] = [];
	test('navigation away and back invalidates a pending page even at the same URL', async () => {
		const f = fixture(), generations = new AtCoderPageGeneration();
		f.ports.openTask = async () => generations.capture({ viewId: 'native-view', url });
		f.ports.isPageCurrent = page => generations.isCurrent(page);
		const page = await f.bridge.openTask(url, 'file:///test.cpp');
		generations.didNavigate('native-view');
		generations.didNavigate('native-view');
		await assert.rejects(f.bridge.sendAndConfirm(page, payload), /changed/);
		assert.strictEqual(f.calls(), 0);
	});
	function fixture() {
		let current = true, calls = 0, cancelled = 0;
		const ports: IAtCoderBridgePorts = {
			openTask: async () => ({ viewId: 'native-view', url }),
			inspectTask: async () => ({ languages: [{ id: '6017', label: 'C++23' }], hasDraft: false }),
			sendAndConfirm: async () => { calls++; return { kind: 'record', record: { problem: { site: 'atcoder', nativeId: 'abc086/abc086_a', url }, id: '11', url: 'https://atcoder.jp/contests/abc086/submissions/11' } }; },
			cancel: async () => { cancelled++; },
			newHandle: () => String(controllers.length) + '-handle',
			isPageCurrent: () => current
		};
		const bridge = new AtCoderBridgeController(ports);
		controllers.push(bridge);
		return { bridge, ports, calls: () => calls, cancelled: () => cancelled, change: () => { current = false; } };
	}
	test('a disposed late open cannot cancel a newer transaction on the reused native view', async () => {
		const old = fixture(), newer = fixture();
		let finishOpen!: (value: { viewId: string; url: string }) => void;
		old.ports.openTask = () => new Promise(resolve => { finishOpen = resolve; });
		old.ports.cancel = newer.ports.cancel;
		const opening = old.bridge.openTask(url, 'file:///old.cpp');
		await old.bridge.dispose();
		const page = await newer.bridge.openTask(url, 'file:///new.cpp');
		let finishSubmit!: (value: Awaited<ReturnType<NonNullable<IAtCoderBridgePorts['sendAndConfirm']>>>) => void;
		newer.ports.sendAndConfirm = () => new Promise(resolve => { finishSubmit = resolve; });
		const submitting = newer.bridge.sendAndConfirm(page, payload);
		finishOpen({ viewId: 'native-view', url });
		await assert.rejects(opening, /stopped/);
		assert.strictEqual(newer.cancelled(), 0);
		finishSubmit({ kind: 'not-sent', reason: 'cancelled' });
		assert.strictEqual((await submitting).kind, 'not-sent');
	});
	teardown(async () => { await Promise.all(controllers.splice(0).map(item => item.dispose())); });
	test('preparation expiry cannot cancel a consumed submission or release its receipt page', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const f = fixture();
			let released = 0;
			f.ports.release = () => { released++; };
			const page = await f.bridge.openTask(url, 'file:///test.cpp');
			await clock.tickAsync(119000);
			let finish!: (value: Awaited<ReturnType<NonNullable<IAtCoderBridgePorts['sendAndConfirm']>>>) => void;
			f.ports.sendAndConfirm = () => new Promise(resolve => { finish = resolve; });
			const pending = f.bridge.sendAndConfirm(page, payload);
			await clock.tickAsync(2000);
			assert.strictEqual(f.cancelled(), 0);
			assert.strictEqual(released, 0);
			finish({ kind: 'not-sent', reason: 'cancelled' });
			assert.strictEqual((await pending).kind, 'not-sent');
			await f.bridge.release(page);
			assert.strictEqual(released, 1);
		} finally {
			clock.restore();
		}
	});
	test('rejects foreign window handle', async () => {
		const first = fixture(), other = fixture();
		const page = await first.bridge.openTask(url, 'file:///test.cpp');
		await assert.rejects(other.bridge.sendAndConfirm(page, payload), /handle/);
		assert.strictEqual(other.calls(), 0);
	});
	test('rejects changed page URL', async () => {
		const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
		f.change();
		await assert.rejects(f.bridge.sendAndConfirm(page, payload), /changed/);
		assert.strictEqual(f.calls(), 0);
	});
	test('consumes the send handle once and preserves the host receipt', async () => {
		const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
		f.ports.readRecord = async ref => ({ ref, phase: 'queued', rawStatus: 'WJ', sourceVerification: 'not-checked' });
		const result = await f.bridge.sendAndConfirm(page, payload);
		assert.strictEqual(result.kind, 'record');
		if (result.kind !== 'record') { throw new Error('Expected record'); }
		Object.assign(result.record, { id: 'fake' });
		await assert.rejects(f.bridge.sendAndConfirm(page, payload), /consumed/);
		assert.strictEqual(f.calls(), 1);
		assert.strictEqual((await f.bridge.readRecord({ ...result.record, id: '11' })).ref.id, '11');
	});
	test('release invalidates handle without sending', async () => {
		const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
		await f.bridge.release(page);
		await assert.rejects(f.bridge.inspectTask(page), /handle/);
		assert.strictEqual(f.calls(), 0);
	});
	test('early receipt consumes the same lease and keeps a verified record readable after release', async () => {
		const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
		const problem = { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url };
		const record = { problem, id: '11', url: 'https://atcoder.jp/contests/abc086/submissions/11' };
		f.ports.sendAndConfirm = async () => ({ kind: 'record', record });
		f.ports.readRecord = async ref => ({ ref, phase: 'queued', rawStatus: 'WJ', sourceVerification: 'not-checked' });
		const receipt = await f.bridge.sendAndConfirm(page, payload);
		assert.strictEqual(receipt.kind, 'record');
		await assert.rejects(f.bridge.sendAndConfirm(page, payload), /consumed/);
		await f.bridge.release(page);
		assert.strictEqual((await f.bridge.readRecord(record)).rawStatus, 'WJ');
		await assert.rejects(f.bridge.readRecord({ ...record, id: '12', url: 'https://atcoder.jp/contests/abc086/submissions/12' }), /record/);
	});
	test('cancelling preserves a formal accepted receipt without restoring the source lease', async () => {
		const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
		let finish!: (value: Awaited<ReturnType<NonNullable<IAtCoderBridgePorts['sendAndConfirm']>>>) => void;
		f.ports.sendAndConfirm = () => new Promise(resolve => { finish = resolve; });
		const record = { problem: { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url }, id: '11', url: 'https://atcoder.jp/contests/abc086/submissions/11' };
		f.ports.readRecord = async ref => ({ ref, phase: 'queued', rawStatus: 'WJ', sourceVerification: 'not-checked' });
		const pending = f.bridge.sendAndConfirm(page, payload);
		await f.bridge.release(page);
		finish({ kind: 'record', record });
		assert.strictEqual((await pending).kind, 'record');
		assert.strictEqual((await f.bridge.readRecord(record)).rawStatus, 'WJ');
		await assert.rejects(f.bridge.sendAndConfirm(page, payload), /handle/);
	});
	test('dispose cancels pending native work and suppresses its late receipt', async () => {
		const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
		let finish!: (value: Awaited<ReturnType<NonNullable<IAtCoderBridgePorts['sendAndConfirm']>>>) => void;
		f.ports.sendAndConfirm = () => new Promise(resolve => { finish = resolve; });
		const pending = f.bridge.sendAndConfirm(page, payload);
		await f.bridge.dispose();
		finish({ kind: 'not-sent', reason: 'cancelled' });
		await assert.rejects(pending, /stopped/);
		assert.strictEqual(f.cancelled(), 1);
	});
	test('cancelling preserves an unconfirmed attempt for reconciliation without resending', async () => {
		const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
		const problem = { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url };
		const record = { problem, id: '11', url: 'https://atcoder.jp/contests/abc086/submissions/11' };
		let sends = 0, finish!: (value: Awaited<ReturnType<NonNullable<IAtCoderBridgePorts['sendAndConfirm']>>>) => void;
		f.ports.sendAndConfirm = () => { sends++; return new Promise(resolve => { finish = resolve; }); };
		f.ports.reconcile = async attemptId => { assert.strictEqual(attemptId, 'sent-attempt'); return { kind: 'record', record }; };
		const pending = f.bridge.sendAndConfirm(page, payload);
		await f.bridge.cancel(page);
		finish({ kind: 'unconfirmed', problem, attemptId: 'sent-attempt', message: 'Connection lost' });
		assert.deepStrictEqual(await pending, { kind: 'unconfirmed', problem, attemptId: 'sent-attempt', message: 'Connection lost' });
		assert.deepStrictEqual(await f.bridge.reconcile('sent-attempt'), { kind: 'record', record });
		await assert.rejects(f.bridge.sendAndConfirm(page, payload), /handle/);
		assert.strictEqual(sends, 1);
		assert.strictEqual(f.cancelled(), 1);
	});
	test('a cancelled lease still rejects an unconfirmed attempt for a different problem', async () => {
		const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
		let finish!: (value: Awaited<ReturnType<NonNullable<IAtCoderBridgePorts['sendAndConfirm']>>>) => void;
		f.ports.sendAndConfirm = () => new Promise(resolve => { finish = resolve; });
		const pending = f.bridge.sendAndConfirm(page, payload);
		await f.bridge.cancel(page);
		finish({ kind: 'unconfirmed', problem: { site: 'atcoder', nativeId: 'abc086/abc086_b', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_b' }, attemptId: 'foreign-attempt', message: 'Connection lost' });
		await assert.rejects(pending, /invalid-attempt/);
		await assert.rejects(f.bridge.reconcile('foreign-attempt'), /invalid-attempt/);
	});
	test('dispose suppresses both late accepted records and unconfirmed attempts', async () => {
		for (const kind of ['record', 'unconfirmed'] as const) {
			const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
			const problem = { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url };
			let finish!: (value: Awaited<ReturnType<NonNullable<IAtCoderBridgePorts['sendAndConfirm']>>>) => void;
			f.ports.sendAndConfirm = () => new Promise(resolve => { finish = resolve; });
			const pending = f.bridge.sendAndConfirm(page, payload);
			await f.bridge.dispose();
			finish(kind === 'record' ? { kind, record: { problem, id: '11', url: 'https://atcoder.jp/contests/abc086/submissions/11' } } : { kind, problem, attemptId: 'sent-attempt', message: 'Connection lost' });
			await assert.rejects(pending, /stopped/);
			await assert.rejects(f.bridge.reconcile('sent-attempt'), /invalid-attempt/);
			assert.strictEqual(f.cancelled(), 1);
		}
	});
	test('dispose between native completion and receipt registration suppresses the outcome', async () => {
		for (const kind of ['record', 'unconfirmed'] as const) {
			const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
			const problem = { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url };
			let finish!: (value: Awaited<ReturnType<NonNullable<IAtCoderBridgePorts['sendAndConfirm']>>>) => void;
			f.ports.sendAndConfirm = () => new Promise(resolve => { finish = resolve; });
			const pending = f.bridge.sendAndConfirm(page, payload);
			finish(kind === 'record' ? { kind, record: { problem, id: '11', url: 'https://atcoder.jp/contests/abc086/submissions/11' } } : { kind, problem, attemptId: 'sent-attempt', message: 'Connection lost' });
			// The native continuation runs first; disposal precedes sendAndConfirm's continuation.
			const disposed = new Promise<void>(resolve => queueMicrotask(() => { resolve(f.bridge.dispose()); }));
			await assert.rejects(pending, /stopped/);
			await disposed;
		}
	});
	test('rejects malformed routes, handles and source before a native call', async () => {
		const f = fixture();
		await assert.rejects(f.bridge.openTask('https://evil.test/task', 'file:///test.cpp'), /route/);
		const page = await f.bridge.openTask(url, 'file:///test.cpp');
		await assert.rejects(f.bridge.sendAndConfirm({ ...page, url: url + '?changed' }, payload), /handle/);
		await assert.rejects(f.bridge.sendAndConfirm(page, { ...payload, source: '' }), /source/);
		assert.strictEqual(f.calls(), 0);
	});
});

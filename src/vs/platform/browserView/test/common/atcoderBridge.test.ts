/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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
		await assert.rejects(f.bridge.submit(page, payload), /changed/);
		assert.strictEqual(f.calls(), 0);
	});
	function fixture() {
		let current = true, calls = 0, cancelled = 0;
		const shown: unknown[] = [];
		const ports: IAtCoderBridgePorts = {
			openTask: async () => ({ viewId: 'native-view', url }),
			inspectTask: async () => ({ languages: [{ id: '6017', label: 'C++23' }], hasDraft: false }),
			submit: async () => { calls++; return { id: '11', url: 'https://atcoder.jp/contests/abc086/submissions/11', status: 'AC', verified: true }; },
			cancel: async () => { cancelled++; },
			revealResult: async (_page, receipt) => { shown.push(receipt); },
			newHandle: () => String(controllers.length) + '-handle',
			isPageCurrent: () => current
		};
		const bridge = new AtCoderBridgeController(ports);
		controllers.push(bridge);
		return { bridge, ports, shown, calls: () => calls, cancelled: () => cancelled, change: () => { current = false; } };
	}
	test('a disposed late open cannot cancel a newer transaction on the reused native view', async () => {
		const old = fixture(), newer = fixture();
		let finishOpen!: (value: { viewId: string; url: string }) => void;
		old.ports.openTask = () => new Promise(resolve => { finishOpen = resolve; });
		old.ports.cancel = newer.ports.cancel;
		const opening = old.bridge.openTask(url, 'file:///old.cpp');
		await old.bridge.dispose();
		const page = await newer.bridge.openTask(url, 'file:///new.cpp');
		let finishSubmit!: (value: { status: string; verified: boolean }) => void;
		newer.ports.submit = () => new Promise(resolve => { finishSubmit = resolve; });
		const submitting = newer.bridge.submit(page, payload);
		finishOpen({ viewId: 'native-view', url });
		await assert.rejects(opening, /stopped/);
		assert.strictEqual(newer.cancelled(), 0);
		finishSubmit({ status: 'AC', verified: true });
		assert.strictEqual((await submitting).status, 'AC');
	});
	teardown(async () => { await Promise.all(controllers.splice(0).map(item => item.dispose())); });
	test('rejects foreign window handle', async () => {
		const first = fixture(), other = fixture();
		const page = await first.bridge.openTask(url, 'file:///test.cpp');
		await assert.rejects(other.bridge.submit(page, payload), /handle/);
		assert.strictEqual(other.calls(), 0);
	});
	test('rejects changed page URL', async () => {
		const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
		f.change();
		await assert.rejects(f.bridge.submit(page, payload), /changed/);
		assert.strictEqual(f.calls(), 0);
	});
	test('consumes submit handle once and reveals only host receipt', async () => {
		const f = fixture(), page = await f.bridge.openTask(url, 'file:///test.cpp');
		const result = await f.bridge.submit(page, payload);
		result.id = 'fake';
		await assert.rejects(f.bridge.submit(page, payload), /consumed/);
		await f.bridge.revealResult(page);
		assert.strictEqual(f.calls(), 1);
		assert.strictEqual((f.shown[0] as { id: string }).id, '11');
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
		await assert.rejects(f.bridge.submit(page, payload), /consumed/);
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
		let finish!: (value: { status: string; verified: boolean }) => void;
		f.ports.submit = () => new Promise(resolve => { finish = resolve; });
		const pending = f.bridge.submit(page, payload);
		await f.bridge.dispose();
		finish({ status: 'unknown', verified: false });
		await assert.rejects(pending, /stopped/);
		assert.strictEqual(f.cancelled(), 1);
		assert.deepStrictEqual(f.shown, []);
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
		await assert.rejects(f.bridge.submit({ ...page, url: url + '?changed' }, payload), /handle/);
		await assert.rejects(f.bridge.submit(page, { ...payload, source: '' }), /source/);
		assert.strictEqual(f.calls(), 0);
	});
});

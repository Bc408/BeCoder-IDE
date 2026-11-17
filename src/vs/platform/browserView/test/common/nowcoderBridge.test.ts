/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NowcoderBridgeController, type NowcoderBridgePorts } from '../../common/nowcoderBridge.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('Nowcoder bridge', () => {
	const problem = { site: 'nowcoder' as const, nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' };
	const payload = { source: 'int main() {}\n', fileName: '18204.cpp', languageId: '2' };
	let handles = 0;
	const bridges: NowcoderBridgeController[] = [];
	function fixture() {
		let current = true, sends = 0, cancelled = 0;
		const ports: NowcoderBridgePorts = {
			newHandle: () => String(++handles), isCurrent: () => current,
			open: async () => ({ viewId: 'view', url: problem.url, ownerKey: '123', languages: [{ id: '2', label: 'C++20 O2', family: 'cpp' }] }),
			send: async () => { sends++; return { kind: 'record', record: { problem, id: '22', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=22' } }; },
			cancel: async () => { cancelled++; },
			readRecord: async ref => ({ ref, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' })
		};
		const bridge = new NowcoderBridgeController(ports); bridges.push(bridge);
		return { bridge, ports, sends: () => sends, cancelled: () => cancelled, navigate: () => { current = false; } };
	}
	teardown(async () => { await Promise.all(bridges.splice(0).map(bridge => bridge.dispose())); });
	test('a stable same-site session carrier can submit a different target problem', async () => {
		const f = fixture();
		f.ports.open = async () => ({ viewId: 'view', url: 'https://ac.nowcoder.com/', ownerKey: '123', languages: [{ id: '2', label: 'C++20 O2', family: 'cpp' }] });
		const prepared = await f.bridge.prepare(problem, 'file:///18204.cpp');
		assert.strictEqual((await f.bridge.send(prepared.handle, payload)).kind, 'record');
	});
	test('one lease sends once, retains its formal record and rejects foreign handles', async () => {
		const f = fixture(), other = fixture();
		const prepared = await f.bridge.prepare(problem, 'file:///18204.cpp');
		await assert.rejects(other.bridge.send(prepared.handle, payload), /handle/);
		const result = await f.bridge.send(prepared.handle, payload);
		assert.strictEqual(result.kind, 'record');
		await assert.rejects(f.bridge.send(prepared.handle, payload), /consumed/);
		await f.bridge.release(prepared.handle);
		if (result.kind === 'record') { assert.strictEqual((await f.bridge.readRecord(result.record)).rawStatus, 'AC'); }
		assert.strictEqual(f.sends(), 1);
	});
	test('changed page or invalid language prevents sending', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///18204.cpp');
		await assert.rejects(f.bridge.send(prepared.handle, { ...payload, languageId: '999' }), /language/);
		f.navigate(); await assert.rejects(f.bridge.send(prepared.handle, payload), /changed/);
		assert.strictEqual(f.sends(), 0);
	});
	test('extension stop cancels pending native interaction and rejects its late receipt', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///18204.cpp');
		let finish!: (value: { kind: 'not-sent'; reason: string }) => void;
		f.ports.send = async () => new Promise(resolve => { finish = resolve; });
		const pending = f.bridge.send(prepared.handle, payload);
		await f.bridge.dispose(); finish({ kind: 'not-sent', reason: 'cancelled' });
		await assert.rejects(pending, /stopped/); assert.strictEqual(f.cancelled(), 1);
	});
	test('cancelling an active lease preserves a formal accepted record without reviving the handle', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///18204.cpp');
		let finish!: (value: Awaited<ReturnType<NowcoderBridgePorts['send']>>) => void;
		f.ports.send = () => new Promise(resolve => { finish = resolve; });
		const pending = f.bridge.send(prepared.handle, payload);
		await f.bridge.cancel(prepared.handle);
		const record = { problem, id: '22', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=22' };
		finish({ kind: 'record', record });
		assert.strictEqual((await pending).kind, 'record');
		assert.strictEqual((await f.bridge.readRecord(record)).rawStatus, 'AC');
		await assert.rejects(f.bridge.send(prepared.handle, payload), /handle/);
	});
	test('cancelling preserves an unconfirmed attempt for reconciliation without resending', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///18204.cpp');
		const record = { problem, id: '22', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=22' };
		let sends = 0, finish!: (value: Awaited<ReturnType<NowcoderBridgePorts['send']>>) => void;
		f.ports.send = () => { sends++; return new Promise(resolve => { finish = resolve; }); };
		f.ports.reconcile = async attemptId => { assert.strictEqual(attemptId, prepared.handle); return { kind: 'record', record }; };
		const pending = f.bridge.send(prepared.handle, payload);
		await f.bridge.cancel(prepared.handle);
		finish({ kind: 'unconfirmed', problem, attemptId: prepared.handle, message: 'Connection lost' });
		assert.deepStrictEqual(await pending, { kind: 'unconfirmed', problem, attemptId: prepared.handle, message: 'Connection lost' });
		assert.deepStrictEqual(await f.bridge.reconcile(prepared.handle), { kind: 'record', record });
		await assert.rejects(f.bridge.send(prepared.handle, payload), /handle/);
		assert.strictEqual(sends, 1);
		assert.strictEqual(f.cancelled(), 1);
	});
	test('a cancelled lease still rejects an unconfirmed attempt with a different identifier', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///18204.cpp');
		let finish!: (value: Awaited<ReturnType<NowcoderBridgePorts['send']>>) => void;
		f.ports.send = () => new Promise(resolve => { finish = resolve; });
		const pending = f.bridge.send(prepared.handle, payload);
		await f.bridge.cancel(prepared.handle);
		finish({ kind: 'unconfirmed', problem, attemptId: 'foreign-attempt', message: 'Connection lost' });
		await assert.rejects(pending, /invalid-attempt/);
		await assert.rejects(f.bridge.reconcile('foreign-attempt'), /invalid-attempt/);
	});
	test('dispose suppresses both late accepted records and unconfirmed attempts', async () => {
		for (const kind of ['record', 'unconfirmed'] as const) {
			const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///18204.cpp');
			let finish!: (value: Awaited<ReturnType<NowcoderBridgePorts['send']>>) => void;
			f.ports.send = () => new Promise(resolve => { finish = resolve; });
			const pending = f.bridge.send(prepared.handle, payload);
			await f.bridge.dispose();
			finish(kind === 'record' ? { kind, record: { problem, id: '22', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=22' } } : { kind, problem, attemptId: prepared.handle, message: 'Connection lost' });
			await assert.rejects(pending, /stopped/);
			await assert.rejects(f.bridge.reconcile(prepared.handle), /invalid-attempt/);
			assert.strictEqual(f.cancelled(), 1);
		}
	});
});

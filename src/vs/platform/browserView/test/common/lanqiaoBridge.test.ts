/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { LanqiaoBridgeController, type LanqiaoBridgePorts } from '../../common/lanqiaoBridge.js';
const problem = { site: 'lanqiao' as const, nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' };
const id = '6aff1ff717e87398a15a4abf', record = { problem, id, url: 'https://www.lanqiao.cn/problems/254/submissions/' + id + '/' };

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Controllers disposed in teardown.
suite('Lanqiao semantic window bridge', () => {
	const bridges: LanqiaoBridgeController[] = [];
	teardown(async () => { await Promise.all(bridges.splice(0).map(value => value.dispose())); });
	function fixture() {
		let sends = 0, handle = 0, current = true;
		const ports: LanqiaoBridgePorts = {
			newHandle: () => 'handle-' + ++handle, isCurrent: () => current,
			open: async () => ({ viewId: 'global', url: 'https://www.lanqiao.cn/', ownerKey: 'owner-key', languages: [{ id: 'cpp', label: 'C++（g++17）', family: 'cpp' }] }),
			send: async () => { sends++; return { kind: 'record', record }; }, cancel: async () => { },
			readRecord: async ref => ({ ref, phase: 'finished', rawStatus: 'AC', sourceVerification: 'matched' }),
			reconcile: async () => ({ kind: 'record', record })
		};
		const bridge = new LanqiaoBridgeController(ports); bridges.push(bridge);
		return { bridge, ports, sends: () => sends, stale: () => { current = false; } };
	}
	test('only native-confirmed same-problem receipt gains record ownership and handles send once', async () => {
		const f = fixture(), lease = await f.bridge.prepare(problem, 'file:///lanqiao/254.cpp');
		await assert.rejects(f.bridge.readRecord(record));
		assert.strictEqual((await f.bridge.send(lease.handle, { source: 'int main(){}', languageId: 'cpp', fileName: '254.cpp' })).kind, 'record');
		await assert.rejects(f.bridge.send(lease.handle, { source: 'x', languageId: 'cpp', fileName: '254.cpp' }));
		assert.strictEqual(f.sends(), 1);
		assert.strictEqual((await f.bridge.readRecord(record)).rawStatus, 'AC');
		await f.bridge.release(lease.handle);
		assert.strictEqual((await f.bridge.readRecord(record)).ref.id, id);
	});
	test('foreign tokens, changed window context and forged receipts cannot authorize sending or a record', async () => {
		const f = fixture(), lease = await f.bridge.prepare(problem, 'file:///254.cpp');
		await assert.rejects(f.bridge.send(lease.handle, { source: 'x', fileName: '254.cpp', languageId: '1' }));
		f.stale(); await assert.rejects(f.bridge.send(lease.handle, { source: 'x', fileName: '254.cpp', languageId: 'cpp' }));
		assert.strictEqual(f.sends(), 0);
		const g = fixture(), ready = await g.bridge.prepare(problem, 'file:///254.cpp');
		g.ports.send = async () => ({ kind: 'record', record: { ...record, url: record.url.replace('/254/', '/255/') } });
		await assert.rejects(g.bridge.send(ready.handle, { source: 'x', fileName: '254.cpp', languageId: 'cpp' }));
	});
	test('progress is private to an active lease and a scope change suppresses a late read', async () => {
		const f = fixture(), lease = await f.bridge.prepare(problem, 'file:///254.cpp');
		assert.strictEqual(await f.bridge.readProgress(lease.handle), undefined);
		let finish!: (value: Awaited<ReturnType<LanqiaoBridgePorts['send']>>) => void;
		let answer!: (value: { phase: 'judging' }) => void;
		f.ports.send = async () => new Promise(resolve => { finish = resolve; });
		f.ports.readProgress = async () => new Promise(resolve => { answer = resolve; });
		const sending = f.bridge.send(lease.handle, { source: 'x', fileName: '254.cpp', languageId: 'cpp' });
		assert.strictEqual(await f.bridge.readProgress('foreign'), undefined);
		await assert.rejects(f.bridge.readRecord(record), 'a provisional view grants no formal record capability');
		const reading = f.bridge.readProgress(lease.handle); f.stale(); answer({ phase: 'judging' });
		assert.strictEqual(await reading, undefined);
		finish({ kind: 'unconfirmed', problem, attemptId: lease.handle, message: 'pending' }); await sending;
		assert.strictEqual(await f.bridge.readProgress(lease.handle), undefined);
	});
});

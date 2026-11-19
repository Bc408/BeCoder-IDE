/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { assertCodeforcesProblem, codeforcesRecord, CodeforcesBridgeController, type CodeforcesBridgePorts } from '../../common/codeforcesBridge.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('Codeforces bridge', () => {
	const problem = { site: 'codeforces' as const, nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
	const payload = { source: 'int main() {}\n', fileName: '4_a.cpp', languageId: '2' };
	let handles = 0;
	const bridges: CodeforcesBridgeController[] = [];
	function fixture() {
		let current = true, sends = 0, cancelled = 0;
		const ports: CodeforcesBridgePorts = {
			newHandle: () => String(++handles), isCurrent: () => current,
			open: async () => ({ viewId: 'view', url: problem.url, ownerKey: 'tourist', languages: [{ id: '2', label: 'C++20 O2', family: 'cpp' }] }),
			send: async () => { sends++; return { kind: 'record', record: { problem, id: '22', url: 'https://codeforces.com/contest/4/submission/22' } }; },
			cancel: async () => { cancelled++; },
			readRecord: async ref => ({ ref, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' })
		};
		const bridge = new CodeforcesBridgeController(ports); bridges.push(bridge);
		return { bridge, ports, sends: () => sends, cancelled: () => cancelled, navigate: () => { current = false; } };
	}
	teardown(async () => { await Promise.all(bridges.splice(0).map(bridge => bridge.dispose())); });
	test('an official rejection is terminal, releases its lease and never gains receipt ownership', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		let released = 0;
		f.ports.release = () => { released++; };
		f.ports.send = async () => ({ kind: 'rejected', reason: 'codeforces-duplicate-source' });
		assert.deepStrictEqual(await f.bridge.send(prepared.handle, payload), { kind: 'rejected', reason: 'codeforces-duplicate-source' });
		await f.bridge.release(prepared.handle);
		assert.strictEqual(released, 1);
		await assert.rejects(f.bridge.reconcile(prepared.handle), /invalid-attempt/);
		await assert.rejects(f.bridge.send(prepared.handle, payload), /handle/);
	});
	test('only canonical ordinary problem identities produce contest record URLs', () => {
		assert.deepStrictEqual(codeforcesRecord(problem, '22'), { problem, id: '22', url: 'https://codeforces.com/contest/4/submission/22' });
		for (const value of [
			{ ...problem, nativeId: '4/a' },
			{ ...problem, url: 'https://codeforces.com/problemset/problem/4/A' },
			{ ...problem, url: 'https://codeforces.com/group/private/contest/4/problem/A' },
			{ ...problem, url: 'https://codeforces.com/gym/4/problem/A' },
			{ ...problem, url: 'https://mirror.codeforces.com/contest/4/problem/A' }
		]) { assert.throws(() => assertCodeforcesProblem(value), /route/); }
		for (const id of ['', '0', '22/x']) { assert.throws(() => codeforcesRecord(problem, id), /record/); }
	});
	test('preparation rejects foreign origins, credentials and missing or duplicate compiler choices', async () => {
		for (const page of [
			{ url: 'https://example.com/', languages: [{ id: '2', label: 'C++20', family: 'cpp' as const }] },
			{ url: 'https://attacker@codeforces.com/', languages: [{ id: '2', label: 'C++20', family: 'cpp' as const }] },
			{ url: problem.url, languages: [] },
			{ url: problem.url, languages: [{ id: '2', label: 'C++20', family: 'cpp' as const }, { id: '2', label: 'C++17', family: 'cpp' as const }] }
		]) {
			const f = fixture(); let released = 0;
			f.ports.open = async () => ({ viewId: 'view', ownerKey: 'tourist', ...page });
			f.ports.release = () => { released++; };
			await assert.rejects(f.bridge.prepare(problem, 'file:///4_a.cpp'), /page-changed|form-invalid/);
			assert.strictEqual(released, 1);
		}
	});
	test('foreign receipts and altered record snapshots cannot gain ownership', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		f.ports.send = async () => ({ kind: 'record', record: { problem, id: '22', url: 'https://codeforces.com/contest/5/submission/22' } });
		await assert.rejects(f.bridge.send(prepared.handle, payload), /invalid-record/);
		const g = fixture(), valid = await g.bridge.prepare(problem, 'file:///4_a.cpp');
		const result = await g.bridge.send(valid.handle, payload); assert.strictEqual(result.kind, 'record');
		if (result.kind !== 'record') { return; }
		g.ports.readRecord = async ref => ({ ref: { ...ref, id: '23' }, phase: 'finished', rawStatus: 'Accepted', sourceVerification: 'matched' });
		await assert.rejects(g.bridge.readRecord(result.record), /invalid-record/);
	});
	test('an unconfirmed receipt cannot substitute a different native problem', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		f.ports.send = async () => ({ kind: 'unconfirmed', problem: { ...problem, nativeId: '4/B' }, attemptId: prepared.handle, message: 'unknown' });
		await assert.rejects(f.bridge.send(prepared.handle, payload), /invalid-attempt/);
	});
	test('a stable same-site session carrier can submit a different target problem', async () => {
		const f = fixture();
		f.ports.open = async () => ({ viewId: 'view', url: 'https://codeforces.com/', ownerKey: 'tourist', languages: [{ id: '2', label: 'C++20 O2', family: 'cpp' }] });
		const prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		assert.strictEqual((await f.bridge.send(prepared.handle, payload)).kind, 'record');
	});
	test('one lease sends once, retains its formal record and rejects foreign handles', async () => {
		const f = fixture(), other = fixture();
		const prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		await assert.rejects(other.bridge.send(prepared.handle, payload), /handle/);
		const result = await f.bridge.send(prepared.handle, payload);
		assert.strictEqual(result.kind, 'record');
		await assert.rejects(f.bridge.send(prepared.handle, payload), /consumed/);
		await f.bridge.release(prepared.handle);
		if (result.kind === 'record') { assert.strictEqual((await f.bridge.readRecord(result.record)).rawStatus, 'AC'); }
		assert.strictEqual(f.sends(), 1);
	});
	test('changed page or invalid language prevents sending', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		await assert.rejects(f.bridge.send(prepared.handle, { ...payload, languageId: '999' }), /language/);
		f.navigate(); await assert.rejects(f.bridge.send(prepared.handle, payload), /changed/);
		assert.strictEqual(f.sends(), 0);
	});
	test('extension stop cancels pending native interaction and rejects its late receipt', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		let finish!: (value: { kind: 'not-sent'; reason: string }) => void;
		f.ports.send = async () => new Promise(resolve => { finish = resolve; });
		const pending = f.bridge.send(prepared.handle, payload);
		await f.bridge.dispose(); finish({ kind: 'not-sent', reason: 'cancelled' });
		await assert.rejects(pending, /stopped/); assert.strictEqual(f.cancelled(), 1);
	});
	test('cancelling an active lease preserves a formal accepted record without reviving the handle', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		let finish!: (value: Awaited<ReturnType<CodeforcesBridgePorts['send']>>) => void;
		f.ports.send = () => new Promise(resolve => { finish = resolve; });
		const pending = f.bridge.send(prepared.handle, payload);
		await f.bridge.cancel(prepared.handle);
		const record = { problem, id: '22', url: 'https://codeforces.com/contest/4/submission/22' };
		finish({ kind: 'record', record });
		assert.strictEqual((await pending).kind, 'record');
		assert.strictEqual((await f.bridge.readRecord(record)).rawStatus, 'AC');
		await assert.rejects(f.bridge.send(prepared.handle, payload), /handle/);
	});
	test('cancel during asynchronous scope resolution cannot dispatch a later native submission', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		let resume!: () => void, dispatched = 0;
		const scope = new Promise<void>(resolve => { resume = resolve; });
		f.ports.send = async (_page, _problem, _payload, _requestId, signal) => {
			await scope; signal?.throwIfAborted(); dispatched++;
			return { kind: 'record', record: { problem, id: '22', url: 'https://codeforces.com/contest/4/submission/22' } };
		};
		const pending = f.bridge.send(prepared.handle, payload);
		await f.bridge.cancel(prepared.handle); resume();
		await assert.rejects(pending, /cancelled/);
		assert.strictEqual(dispatched, 0);
	});
	test('cancelling preserves an unconfirmed attempt for reconciliation without resending', async () => {
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		const record = { problem, id: '22', url: 'https://codeforces.com/contest/4/submission/22' };
		let sends = 0, finish!: (value: Awaited<ReturnType<CodeforcesBridgePorts['send']>>) => void;
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
		const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
		let finish!: (value: Awaited<ReturnType<CodeforcesBridgePorts['send']>>) => void;
		f.ports.send = () => new Promise(resolve => { finish = resolve; });
		const pending = f.bridge.send(prepared.handle, payload);
		await f.bridge.cancel(prepared.handle);
		finish({ kind: 'unconfirmed', problem, attemptId: 'foreign-attempt', message: 'Connection lost' });
		await assert.rejects(pending, /invalid-attempt/);
		await assert.rejects(f.bridge.reconcile('foreign-attempt'), /invalid-attempt/);
	});
	test('dispose suppresses both late accepted records and unconfirmed attempts', async () => {
		for (const kind of ['record', 'unconfirmed'] as const) {
			const f = fixture(), prepared = await f.bridge.prepare(problem, 'file:///4_a.cpp');
			let finish!: (value: Awaited<ReturnType<CodeforcesBridgePorts['send']>>) => void;
			f.ports.send = () => new Promise(resolve => { finish = resolve; });
			const pending = f.bridge.send(prepared.handle, payload);
			await f.bridge.dispose();
			finish(kind === 'record' ? { kind, record: { problem, id: '22', url: 'https://codeforces.com/contest/4/submission/22' } } : { kind, problem, attemptId: prepared.handle, message: 'Connection lost' });
			await assert.rejects(pending, /stopped/);
			await assert.rejects(f.bridge.reconcile(prepared.handle), /invalid-attempt/);
			assert.strictEqual(f.cancelled(), 1);
		}
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { NowcoderAdapter, type NowcoderHost } from '../src/adapters/nowcoder/adapter';
import { nowcoderProblem } from '../src/adapters/nowcoder/task';
import type { RecordRef, RecordSnapshot } from '../src/domain';

test('cancelling a pending Nowcoder record read cancels that exact native record and rejects late data', async () => {
	const record: RecordRef = { problem: nowcoderProblem('18204')!, id: '22', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=22' };
	const cancelled: RecordRef[] = [];
	let finish!: (value: RecordSnapshot) => void;
	const host = { readRecord: () => new Promise<RecordSnapshot>(resolve => { finish = resolve; }), cancelRecord: async (ref: RecordRef) => { cancelled.push(ref); } } as unknown as NowcoderHost;
	const controller = new AbortController();
	const reading = new NowcoderAdapter(host).readRecord(record, controller.signal);
	controller.abort();
	finish({ ref: record, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' });
	await assert.rejects(reading, error => error === controller.signal.reason);
	assert.deepStrictEqual(cancelled, [record]);
});

test('completed and already aborted Nowcoder record reads do not cancel native tracking', async () => {
	const record: RecordRef = { problem: nowcoderProblem('18204')!, id: '22', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=22' };
	const snapshot: RecordSnapshot = { ref: record, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' };
	let reads = 0, cancels = 0;
	const host = { readRecord: async () => { reads++; return snapshot; }, cancelRecord: async () => { cancels++; } } as unknown as NowcoderHost;
	const adapter = new NowcoderAdapter(host), controller = new AbortController();
	assert.strictEqual((await adapter.readRecord(record, controller.signal)).rawStatus, 'AC');
	controller.abort();
	await assert.rejects(adapter.readRecord(record, controller.signal), error => error === controller.signal.reason);
	assert.strictEqual(reads, 1);
	assert.strictEqual(cancels, 0);
});

test('Nowcoder session sends its exact snapshot through an opaque lease and releases once', async () => {
	const problem = nowcoderProblem('18204')!;
	let sends = 0, releases = 0;
	const host: NowcoderHost = {
		prepare: async () => ({ handle: 'opaque', languages: [{ id: '2', label: 'C++20 O2', family: 'cpp' }], hasDraft: false }),
		send: async (handle, payload) => { assert.strictEqual(handle, 'opaque'); assert.strictEqual(payload.source, 'chosen source\n'); sends++; return { kind: 'record', record: { problem, id: '22', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=22' } }; },
		cancel: async () => undefined, release: async () => { releases++; },
		readProblem: async () => { throw new Error('unused'); }, readRecord: async () => { throw new Error('unused'); },
		loginSummary: async () => ({ site: 'nowcoder', state: 'unknown' }), reconcile: async () => { throw new Error('unused'); }
	};
	const adapter = new NowcoderAdapter(host), signal = new AbortController().signal;
	const session = await adapter.prepare(problem, 'file:///18204.cpp', () => undefined, signal);
	const input = { snapshot: { uri: 'file:///18204.cpp', fileName: '18204.cpp', family: 'cpp' as const, version: 1, source: 'chosen source\n' }, languageId: '2', replaceDraft: false };
	assert.strictEqual((await session.send(input, () => undefined, signal)).kind, 'record');
	await assert.rejects(session.send(input, () => undefined, signal), /consumed/);
	await session.dispose(); await session.dispose(); assert.strictEqual(sends, 1); assert.strictEqual(releases, 1);
});

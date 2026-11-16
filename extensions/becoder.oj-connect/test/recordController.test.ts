/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { RecordController } from '../src/recordController';
import type { RecordRef, RecordSnapshot } from '../src/domain';

const ref: RecordRef = { problem: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, id: '11', url: 'https://www.luogu.com.cn/record/11' };
test('tracking reads one confirmed ID and ends only on the actual final snapshot', async () => {
	let reads = 0;
	const states: string[] = [];
	const controller = new RecordController(async record => {
		assert.strictEqual(record.id, '11'); reads++;
		return { ref, phase: reads === 1 ? 'queued' : 'finished', rawStatus: reads === 1 ? 'Waiting' : 'Accepted', sourceVerification: 'not-checked' };
	}, { intervalMs: 1, timeoutMs: 1000 });
	await controller.track(ref, value => { states.push(value.phase); }, new AbortController().signal);
	assert.deepStrictEqual(states, ['queued', 'finished']);
});
test('record failure and cancellation do not start another read or send', async () => {
	let reads = 0;
	const controller = new RecordController(async () => { reads++; throw new Error('offline'); });
	await assert.rejects(controller.track(ref, () => undefined, new AbortController().signal), /offline/);
	assert.strictEqual(reads, 1);
	const abort = new AbortController(); abort.abort();
	await controller.track(ref, () => undefined, abort.signal);
	assert.strictEqual(reads, 1);
});
test('replaced record and unknown-status deadline cannot masquerade as a final verdict', async () => {
	const other = { ...ref, id: '12', url: 'https://www.luogu.com.cn/record/12' };
	const controller = new RecordController(async () => ({ ref: other, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' }));
	await assert.rejects(controller.track(ref, () => undefined, new AbortController().signal), /record/);
	let now = 0;
	const pending = new RecordController(async () => ({ ref, phase: 'unknown', rawStatus: 'new status', sourceVerification: 'unavailable' } as RecordSnapshot), { now: () => now, intervalMs: 1, timeoutMs: 2, sleep: async () => { now++; } });
	await assert.rejects(pending.track(ref, () => undefined, new AbortController().signal), /timed out/);
});

test('AtCoder healthy judging continues beyond two minutes and stops on the final result', async () => {
	const record: RecordRef = { problem: { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' }, id: '55', url: 'https://atcoder.jp/contests/abc086/submissions/55' };
	let elapsed = 0, reads = 0;
	const updates: string[] = [];
	const controller = new RecordController(async () => ({ ref: record, phase: ++reads === 4 ? 'finished' : 'judging', rawStatus: reads === 4 ? 'AC' : 'WJ', sourceVerification: 'not-checked' }), { now: () => elapsed, sleep: async () => { elapsed += 61000; } });
	await controller.track(record, value => updates.push(value.rawStatus), new AbortController().signal);
	assert.deepStrictEqual(updates, ['WJ', 'WJ', 'WJ', 'AC']);
});

test('closing an AtCoder result during a pending read ignores the late result', async () => {
	const record: RecordRef = { problem: { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' }, id: '55', url: 'https://atcoder.jp/contests/abc086/submissions/55' };
	let finish!: (value: RecordSnapshot) => void;
	const controller = new RecordController(async () => new Promise(resolve => { finish = resolve; }));
	const signal = new AbortController(), updates: string[] = [];
	const tracking = controller.track(record, value => updates.push(value.rawStatus), signal.signal);
	signal.abort(); await tracking;
	finish({ ref: record, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' });
	await Promise.resolve(); assert.deepStrictEqual(updates, []);
});

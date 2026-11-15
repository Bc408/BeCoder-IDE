/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
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

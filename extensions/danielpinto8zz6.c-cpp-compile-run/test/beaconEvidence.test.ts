/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { BeaconEvidence } from '../src/beaconEvidence';

const snapshot = { originalPath: 'C:\\project\\main.cpp', canonicalPath: 'C:\\project\\main.cpp', path: 'C:\\private\\main.cpp', capturedAt: 1, bytesBase64: Buffer.from('V1').toString('base64'), byteLength: 2, sha256: 'captured-hash' };

test('evidence freezes observed values, batches in order and drains before finish', async () => {
	const calls: { operation: string; input: any }[] = [];
	const evidence = new BeaconEvidence('handle', 'runner', async (operation, input) => { calls.push({ operation, input }); }, () => assert.fail('unexpected observation failure'));
	const metadata = { compiler: 'GCC V1' };
	const event = { type: 'stream', text: 'observed V1' };
	const outcome = { status: 'completed' };
	evidence.start(snapshot, metadata); evidence.event(event);
	metadata.compiler = 'GCC V2'; event.text = 'later V2';
	const finishing = evidence.finish(outcome); outcome.status = 'mutated';
	await finishing;
	assert.deepStrictEqual(calls.map(call => call.operation), ['startRuntime', 'appendRuntime']);
	assert.strictEqual(calls[0].input.code, 'V1');
	assert.strictEqual(calls[0].input.events[0].details.compiler, 'GCC V1');
	assert.strictEqual(calls[1].input.sequence, 1);
	assert.strictEqual(calls[1].input.events[0].text, 'observed V1');
	assert.strictEqual(calls[1].input.events.at(-1).outcome.status, 'completed');
	evidence.event({ type: 'late' }); await evidence.finish({ status: 'late' });
	assert.strictEqual(calls.length, 2);
});

test('no workspace or no compile attempt creates no runtime queue entry', async () => {
	let calls = 0;
	for (const handle of [undefined, 'prepared-only']) {
		const evidence = new BeaconEvidence(handle, 'cph', async () => { calls++; }, () => assert.fail('unexpected error'));
		if (!handle) { evidence.start(snapshot, {}); }
		evidence.event({ type: 'preparation' }); await evidence.finish({ status: 'failed-before-compile' });
	}
	assert.strictEqual(calls, 0);
});

test('cache failure and eviction do not reject execution or reinsert late events', async () => {
	for (const failure of [true, false]) {
		const calls: string[] = [];
		const errors: unknown[] = [];
		const evidence = new BeaconEvidence('handle', 'runner', async operation => {
			calls.push(operation);
			if (failure) { throw new Error('disk unavailable'); }
			return operation === 'appendRuntime' ? false : undefined;
		}, error => errors.push(error));
		evidence.start(snapshot, {}); evidence.event({ type: 'output' });
		await evidence.finish({ status: 'completed' });
		evidence.event({ type: 'late' }); await evidence.finish({ status: 'late' });
		assert.deepStrictEqual(calls, failure ? ['startRuntime'] : ['startRuntime', 'appendRuntime']);
		assert.strictEqual(errors.length, failure ? 1 : 0);
	}
});

test('bounded cache explicitly marks partial evidence and preserves the final status', async () => {
	const calls: any[] = [];
	const evidence = new BeaconEvidence('handle', 'cph', async (_operation, input) => { calls.push(input); }, () => assert.fail('unexpected failure'), 2048);
	evidence.start(snapshot, { config: 'actual' });
	for (let index = 0; index < 10; index++) { evidence.event({ type: 'stream', text: 'x'.repeat(4096) }); }
	await evidence.finish({ status: 'completed' });
	const events = calls.flatMap(call => call.events);
	assert.ok(events.some(event => event.partial === true));
	assert.strictEqual(events.at(-1).outcome.status, 'completed');
	assert.strictEqual(events.at(-1).coverage.truncated, true);
	assert.ok(events.at(-1).coverage.omittedEvents > 0);
	assert.ok(Buffer.byteLength(JSON.stringify(calls)) < 4096);
});

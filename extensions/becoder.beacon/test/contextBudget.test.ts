/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureBeaconRequest, type PreparedBeaconRequest } from '../src/contextBudget';
import { createGenerator } from '../src/provider';
import { defaultCapabilities, resolveCapabilities } from '../src/models';
import { ChatSession } from '../src/session';

const prepared = (): PreparedBeaconRequest => ({ source: { provider: 'fixture', baseURL: 'https://fixture.example', model: 'one' }, phase: 'answer', limits: { contextWindow: 32768, maxInputTokens: 24576, maxOutputTokens: 8192 }, instructions: 'mentor', activeTools: [], messages: [{ role: 'user', content: '中文与 code {}' }], media: [], projectionFingerprint: 'p', contractFingerprint: 'c', unitFingerprints: ['u'] });
test('a discovered large context does not inherit an unrelated 24K input ceiling', () => {
	const capabilities = resolveCapabilities('deepseek', 'https://fixture.example', 'synthetic', { ...defaultCapabilities, source: 'service', contextWindow: 1048576, maxOutputTokens: 393216 });
	const measured = measureBeaconRequest({ ...prepared(), limits: { contextWindow: capabilities.contextWindow!, maxInputTokens: capabilities.maxInputTokens!, maxOutputTokens: capabilities.maxOutputTokens! } });
	assert.equal(measured.budget, 655360);
});
test('32768 24576 8192 reserves output once and yields 24576 22118 14745', () => {
	const measured = measureBeaconRequest(prepared());
	assert.deepEqual([measured.budget, measured.trigger, measured.target], [24576, 22118, 14745]);
});
test('usage anchor matches complete source and contract, zero or changed identity is ignored', () => {
	const input = prepared(), anchor = { source: input.source, phase: input.phase, inputTokens: 1000, projectionFingerprint: 'p', contractFingerprint: 'c', unitFingerprints: ['u'] };
	assert.equal(measureBeaconRequest(input, anchor).estimatedInput, 1000);
	assert.equal(measureBeaconRequest(input, { ...anchor, inputTokens: 0 }).method, 'utf8-estimate');
	assert.equal(measureBeaconRequest({ ...input, contractFingerprint: 'changed-tools' }, anchor).method, 'utf8-estimate');
	assert.equal(measureBeaconRequest({ ...input, source: { ...input.source, model: 'other' } }, anchor).method, 'utf8-estimate');
});
test('full tool definitions are counted and unknown image coverage does not discard the image', () => {
	const input = prepared(), before = measureBeaconRequest(input);
	const image = { type: 'image' as const, image: 'https://fixture.example/image.png' };
	const result = measureBeaconRequest({ ...input, activeTools: [{ name: 'inspect', definition: { description: 'x'.repeat(10000), schema: { type: 'object' } } }], messages: [{ role: 'user', content: [image] }], media: [{ key: 'image-1', kind: 'image' }] });
	assert.ok(result.estimatedInput > before.estimatedInput); assert.deepEqual(result.unknownMedia, ['image-1']); assert.equal(result.coverage, 'unknown-media');
	assert.equal(image.image, 'https://fixture.example/image.png');
});
test('real request output budget matches resolved defaults for both model adapters', async () => {
	for (const provider of ['deepseek', 'bailian'] as const) {
		let output: unknown;
		const generator = createGenerator(async () => ({ provider, baseURL: 'https://provider.invalid', model: 'fixture', apiKey: 'synthetic', parameters: {}, capabilities: { ...defaultCapabilities, contextWindow: 100000, maxInputTokens: 90000, maxOutputTokens: 1234 } }), async (_url, init) => {
			output = JSON.parse(String(init?.body)).max_tokens;
			return new Response('data: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		});
		const session = new ChatSession(() => { }, String); await session.send('question', generator);
		assert.equal(session.snapshot.error, ''); assert.equal(output, 1234);
	}
});
test('known input overflow is blocked before any final fetch', async () => {
	let calls = 0;
	const generator = createGenerator(async () => ({ provider: 'deepseek', baseURL: 'https://provider.invalid', model: 'fixture', apiKey: 'synthetic', parameters: {}, capabilities: { ...defaultCapabilities, contextWindow: 1000, maxInputTokens: 900, maxOutputTokens: 100 } }), async () => { calls++; throw new Error('should not fetch'); });
	const session = new ChatSession(() => { }, String); await session.send('x'.repeat(10000), generator);
	assert.equal(calls, 0); assert.ok(session.snapshot.error);
});
test('legal ordinary requests reserve tool results up to hard capacity before the next compaction gate', async () => {
	const budget = 49152, minimum = Math.floor((budget * 0.1 - 512) * 0.8);
	let legal = 0;
	for (let padding = 16000; padding <= 36000; padding += 2000) {
		let allocated = -1, fetched = false;
		const generator = createGenerator(async () => ({ provider: 'deepseek', baseURL: 'https://provider.invalid', model: 'fixture', apiKey: 'synthetic', parameters: { maxOutputTokens: 4096 }, capabilities: { ...defaultCapabilities, contextWindow: 65536, maxInputTokens: budget, maxOutputTokens: 8192 } }), async () => {
			fetched = true;
			return new Response('data: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		}, 'none', [], false, undefined, {}, { describe: async () => 'x'.repeat(padding), execute: async () => ({ ok: false }), setResultBudget: bytes => { allocated = bytes; } });
		const session = new ChatSession(() => {}, String); await session.send('Read the relevant current code.', generator);
		if (fetched) { legal++; assert.ok(allocated >= minimum, `A legal request left only ${allocated} bytes for tool results at padding ${padding}`); }
	}
	assert.ok(legal > 0, 'The regression must exercise an admitted ordinary request.');
});

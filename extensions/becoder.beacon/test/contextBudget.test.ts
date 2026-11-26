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
import { ChatHistory } from '../src/history';
import type { Connection } from '../src/connection';

const prepared = (): PreparedBeaconRequest => ({ source: { provider: 'fixture', baseURL: 'https://fixture.example', model: 'one' }, phase: 'answer', limits: { contextWindow: 32768, maxInputTokens: 24576, maxOutputTokens: 8192 }, instructions: 'mentor', activeTools: [], messages: [{ role: 'user', content: '中文与 code {}' }], media: [], projectionFingerprint: 'p', contractFingerprint: 'c', unitFingerprints: ['u'] });
for (const contextWindow of [4096, 8192]) {
	for (const explicitOutputLimit of [false, true]) {
		test(`request preparation: default output leaves input capacity (${contextWindow}, ${explicitOutputLimit ? 'declared output limit' : 'missing output limit'})`, async () => {
			const capabilities = resolveCapabilities('ollama', 'http://localhost:11434/v1', 'fixture', { ...defaultCapabilities, source: 'service', tools: false, contextWindow, ...(explicitOutputLimit ? { maxOutputTokens: contextWindow } : {}) });
			const connection: Connection = { provider: 'ollama', baseURL: 'http://localhost:11434/v1', model: 'fixture', parameters: {}, capabilities };
			const before = structuredClone(connection);
			const outputs: number[] = [];
			const request: typeof fetch = async (_url, init) => {
				outputs.push((JSON.parse(String(init?.body)) as { max_tokens: number }).max_tokens);
				return new Response('data: ' + JSON.stringify({ id: 'small', choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
			};
			const session = new ChatSession(() => { }, String);
			await session.send('Hi', createGenerator(async () => connection, request, 'none', [], false), connection);
			assert.equal(session.snapshot.error, '');
			assert.equal(session.snapshot.messages.at(-1)?.text, 'Hello');
			assert.equal(outputs.length, 1);
			assert.ok(outputs[0] > 0 && outputs[0] < contextWindow);
			assert.deepEqual(connection, before, 'Request defaults must not rewrite discovered capacities');
			if (explicitOutputLimit) { assert.equal(connection.capabilities?.maxOutputTokens, contextWindow); }

			const overridden = { ...connection, parameters: { maxOutputTokens: contextWindow } };
			const explicit = new ChatSession(() => { }, String);
			await explicit.send('Hi', createGenerator(async () => overridden, request, 'none', [], false), overridden);
			assert.ok(explicit.snapshot.error, 'An explicit output reservation must still obey the hard budget');
			assert.equal(outputs.length, 1);

			if (contextWindow === 4096 && !explicitOutputLimit) {
				const withTools = { ...connection, capabilities: { ...capabilities, tools: true } };
				const full = new ChatSession(() => { }, String);
				await full.send('Hi', createGenerator(async () => withTools, request, 'workspace', [], true, request, {}, { describe: async () => '', execute: async () => { assert.fail('Oversized schemas must fail before tool execution'); } }), withTools);
				assert.ok(full.snapshot.error, 'A 4K window must still reject its complete oversized tool contract');
				assert.equal(outputs.length, 1);
			}
		});
	}
}

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
for (const oversized of [false, true]) {
	test(`complete record exchange is retained before ${oversized ? 'capacity failure' : 'one compaction'} without repeat execution`, async () => {
		const history = new ChatHistory(undefined, async data => data, () => {}, String);
		for (let index = 0; index < 4; index++) { await history.session.send('Q' + 'x'.repeat(1000), async function* () { yield { type: 'text', text: 'A' + 'y'.repeat(1000) }; }); }
		// Keep the result-driven trigger above 90% after removing the old long system prompt.
		const contents = 'FULL-BEGIN' + 'z'.repeat(oversized ? 200000 : 26000) + 'FULL-END';
		let calls = 0, reads = 0, summaries = 0;
		const generator = createGenerator(async () => ({ provider: 'deepseek', baseURL: 'https://provider.invalid', model: 'fixture', apiKey: 'synthetic', parameters: { maxOutputTokens: 4096 }, capabilities: { ...defaultCapabilities, contextWindow: 65536, maxInputTokens: 38000, maxOutputTokens: 8192 } }), async (_url, init) => {
			const body = JSON.parse(String(init?.body)); calls++;
			const summary = body.messages[0].content.startsWith('Summarize');
			if (summary) { summaries++; }
			const delta = calls === 1 ? { tool_calls: [{ index: 0, id: 'full', type: 'function', function: { name: 'readRunRecord', arguments: '{"id":"run"}' } }] } : { content: summary ? '{"summary":"Earlier questions were explained."}' : 'answer' };
			return new Response('data: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta: {}, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		}, 'none', [], false, undefined, {}, { names: ['readRunRecord'], describe: async () => '', execute: async () => { reads++; return { record: { id: 'run', code: contents } }; } });
		try {
			await history.session.send('Read this run.', generator);
			assert.equal(reads, 1);
			assert.ok(JSON.stringify(history.snapshot.messages.at(-1)?.protocol).includes(contents));
			if (oversized) { assert.ok(history.snapshot.error); assert.equal(summaries, 0); }
			else { assert.equal(history.snapshot.error, ''); assert.equal(summaries, 1); }
		} finally { await history.dispose(); }
	});
}

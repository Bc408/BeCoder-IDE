/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as provider from '../src/provider';
import { responsesStream } from './responsesFixture';
import type { ProviderId } from '../src/connection';

test('translation uses a task-only request without tools and never accepts truncated output', async () => {
	assert.equal(typeof provider.generateTranslationBatch, 'function');
	const connection = { provider: 'ollama' as const, baseURL: 'http://localhost:11434/v1', model: 'fixture', parameters: {} };
	for (const finish of ['stop', 'length']) {
		const request: typeof fetch = async (_url, init) => {
			const body = JSON.parse(String(init?.body));
			assert.equal(body.tools, undefined); assert.equal(body.messages.length, 2);
			assert.equal(body.messages[0].content, 'Task system'); assert.equal(body.messages[1].content, 'Only this problem');
			return new Response('data: ' + JSON.stringify({ id: 'one', object: 'chat.completion.chunk', created: 0, model: 'fixture', choices: [{ index: 0, delta: { content: '{"parts":[]}' }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'one', object: 'chat.completion.chunk', created: 0, model: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: finish }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		};
		const result = provider.generateTranslationBatch(connection, 'Task system', 'Only this problem', new AbortController().signal, request);
		if (finish === 'length') { await assert.rejects(result, /translation-incomplete/); } else { assert.equal(await result, '{"parts":[]}'); }
	}
});

test('all five translation adapters use task input and custom credentials remain optional', async () => {
	for (const id of ['deepseek', 'bailian', 'moonshot', 'ollama', 'custom'] as ProviderId[]) {
		for (const apiKey of id === 'custom' ? [undefined, 'fixture-secret'] : ['fixture-secret']) {
			let calls = 0;
			const value = await provider.generateTranslationBatch({ provider: id, baseURL: 'https://fixture.invalid/v1', model: 'fixture', parameters: {}, apiKey }, 'Translation task', 'Only statement', new AbortController().signal, async (_url, init) => {
				calls++; const body = JSON.parse(String(init?.body)); assert.equal(body.tools, undefined);
				assert.equal(new Headers(init?.headers).get('authorization'), apiKey ? 'Bearer ' + apiKey : null);
				if (id === 'custom') { assert.equal(body.store, false); assert.equal(body.previous_response_id, undefined); return responsesStream('complete'); }
				assert.equal(body.messages.length, 2); return new Response('data: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta: { content: 'complete' }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
			});
			assert.equal(value, 'complete'); assert.equal(calls, 1);
		}
	}
});

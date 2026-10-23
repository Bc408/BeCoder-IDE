/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { testModelConnection } from '../src/provider';
import { ProviderTests } from '../src/providerTests';
import { providers, type Connection } from '../src/connection';
const connections: Connection[] = ['A', 'B', 'C'].map(model => ({ provider: 'deepseek', baseURL: 'https://api.deepseek.com', model, parameters: {}, apiKey: 'private-key' }));
test('provider batch preserves partial results without exposing raw errors', async () => {
	const calls: string[] = [];
	const tests = new ProviderTests(async connection => { calls.push(connection.model); if (connection.model === 'B') { throw new Error('private-key service body'); } }, () => {});
	await tests.start(connections, 1);
	assert.deepStrictEqual(calls, ['A', 'B', 'C']);
	assert.deepStrictEqual(tests.snapshot?.models.map(model => model.status), ['success', 'failure', 'success']);
	assert.ok(!JSON.stringify(tests.snapshot).includes('private-key'));
});
test('cancel aborts the current request and no remaining model starts', async () => {
	let release!: () => void; let calls = 0;
	const ready = new Promise<void>(resolve => { release = resolve; });
	const tests = new ProviderTests(async (_connection, signal) => { calls++; release(); await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); }, () => {});
	const running = tests.start(connections, 2); await ready;
	await assert.rejects(tests.start(connections, 2), /settings-pending/);
	tests.cancel(tests.snapshot!.id); await running;
	assert.equal(calls, 1);
	assert.deepStrictEqual(tests.snapshot?.models.map(model => model.status), ['cancelled', 'cancelled', 'cancelled']);
	tests.dispose();
});

test('SDK probe sends only fixed text and omits user generation parameters', async () => {
	let calls = 0;
	await testModelConnection({ ...connections[0], parameters: { temperature: 0.8, maxOutputTokens: 9000 } }, new AbortController().signal, async (_url, options) => {
		calls++; const body = JSON.parse(String(options?.body));
		assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'Reply with OK.' }]);
		assert.equal(body.tools, undefined); assert.equal(body.temperature, undefined); assert.equal(body.max_tokens, undefined);
		const data = { id: 'probe', choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: null }] };
		return new Response('data: ' + JSON.stringify(data) + String.fromCharCode(10,10) + 'data: [DONE]' + String.fromCharCode(10,10), { headers: { 'Content-Type': 'text/event-stream' } });
	});
	assert.equal(calls, 1);
});

test('provider probes isolate cloud failures and use the local SDK placeholder only without an Ollama key', async () => {
	const snapshots: Connection[] = (['bailian', 'moonshot', 'ollama', 'ollama'] as const).map((provider, index) => ({ provider, ...providers[provider], model: `model-${index}`, parameters: {}, ...(index === 2 ? {} : { apiKey: 'fixture' }) }));
	const requests: string[] = [];
	const tests = new ProviderTests((connection, signal) => testModelConnection(connection, signal, async (url, options) => {
		requests.push(String(url)); const body = JSON.parse(String(options?.body));
		assert.equal(options?.redirect, 'error'); assert.equal(body.model, connection.model);
		assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'Reply with OK.' }]);
		assert.equal(new Headers(options?.headers).get('authorization'), `Bearer ${connection.apiKey ?? 'ollama'}`);
		if (connection.provider === 'moonshot') { return new Response('private provider failure', { status: 401 }); }
		return new Response('data: ' + JSON.stringify({ id: 'probe', choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
	}), () => {});
	await tests.start(snapshots, 1);
	assert.equal(requests.length, 4); assert.deepStrictEqual(tests.snapshot?.models.map(model => model.status), ['success', 'failure', 'success', 'success']);
	assert.ok(!JSON.stringify(tests.snapshot).includes('private provider failure')); tests.dispose();
});

/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeBeaconPrompt } from '../src/prompts';
import { createGenerator } from '../src/provider';
import { ChatHistory } from '../src/history';
import { BeaconContextClient } from '../src/context';
import { ContextTools } from '../src/contextTools';

test('registered_tools_do_not_duplicate_system_guidance', () => {
	const withTools = composeBeaconPrompt({ currentTime: 'fixed', toolNames: ['readCurrentCode', 'readBeCoderInfo'] });
	const without = composeBeaconPrompt({ currentTime: 'fixed', toolNames: [] });
	assert.equal(withTools.version, '2026-11-25.3');
	assert.equal(withTools.system, without.system);
	assert.ok(!withTools.system.includes('Capability:'));
	assert.ok(!withTools.sections.some(section => String(section.id) === 'capabilities'));
});

function stream(delta: object, finish = 'stop'): Response {
	return new Response('data: ' + JSON.stringify({ id: 'quality-wire', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'quality-wire', choices: [{ index: 0, delta: {}, finish_reason: finish }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}
test('product_info_is_an_ordinary_paired_tool_fact', async () => {
	let reads = 0, requests = 0;
	const bodies: { messages: { role: string; content: unknown }[]; tools?: unknown[] }[] = [];
	const client = new BeaconContextClient(async operation => operation === 'pages' ? [] : ({ slot: 'wire', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, recent: [] })); await client.refresh();
	const tools = new ContextTools(client, client.captureScope(), [], { readBeCoderInfo: async topic => { reads++; return { version: '2.1.1', topic, content: 'FACT UNIQUE: product facts only' }; } });
	const connection = { provider: 'deepseek' as const, baseURL: 'https://fixture.invalid', apiKey: 'synthetic', model: 'fixture', parameters: {}, capabilities: { purpose: 'chat' as const, vision: false, tools: true, reasoning: false, source: 'service' as const } };
	const generator = createGenerator(async () => connection, async (_url, init) => {
		const body = JSON.parse(String(init?.body)); bodies.push(body); requests++;
		return requests === 1 ? stream({ tool_calls: [{ index: 0, id: 'info-read', type: 'function', function: { name: 'readBeCoderInfo', arguments: '{"topic":"overview"}' } }] }, 'tool_calls') : stream({ content: 'answer' });
	}, 'none', [], false, undefined, {}, tools);
	const history = new ChatHistory(undefined, async value => value, () => {}, String);
	try {
		await history.session.send('当前版本是什么？', generator, connection);
		assert.equal(history.snapshot.error, '');
		assert.equal(reads, 1);
		assert.ok(bodies[1].messages.some(message => message.role === 'tool' && JSON.stringify(message.content).includes('FACT UNIQUE')));
		assert.ok(bodies.every(body => body.messages.filter(message => message.role === 'system').every(message => !JSON.stringify(message.content).includes('FACT UNIQUE'))));
		await history.session.send('只复述刚才已读的版本。', generator, connection);
		assert.equal(reads, 1);
		assert.ok(JSON.stringify(bodies.at(-1)).includes('2.1.1'));
	} finally { await history.dispose(); }
});

test('no_tools_keeps_mentor_core', async () => {
	const generator = createGenerator(async () => ({ provider: 'deepseek', baseURL: 'https://fixture.invalid', apiKey: 'synthetic', model: 'fixture', parameters: {}, capabilities: { purpose: 'chat', vision: false, tools: false, reasoning: false, source: 'service' } }), async (_url, init) => {
		const body = JSON.parse(String(init?.body)); assert.equal(body.tools, undefined);
		assert.ok(body.messages[0].content.includes('algorithm and programming tutor'));
		assert.ok(!body.messages[0].content.includes('CPH'));
		return stream({ content: '概念解释' });
	});
	for await (const item of generator([{ role: 'user', content: '解释前缀和。' }], new AbortController().signal, async input => ({ ok: false, path: input.path }))) { void item; }
});

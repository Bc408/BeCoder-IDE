/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeBeaconPrompt } from '../src/prompts';
import { createGenerator } from '../src/provider';
import { ChatHistory } from '../src/history';
import { BeaconContextClient } from '../src/context';
import { ContextTools } from '../src/contextTools';
import { ChatSession, fileModelOutput, type Message } from '../src/session';

test('host_scope_distinguishes_collection_from_read_access', async () => {
	for (const state of [
		{ root: 'C:/practice', usable: true, workspaceState: 'ready', mode: 'spot' },
		{ root: 'C:/practice', usable: true, workspaceState: 'ready', mode: 'flood' },
		{ root: 'C:/practice', usable: true, workspaceState: 'blackout', mode: 'blackout' },
		{ root: 'C:/practice', usable: false, workspaceState: 'unavailable', mode: 'blackout' },
		{ usable: false, workspaceState: 'none', mode: 'blackout' }
	]) {
		const calls: string[] = [];
		const client = new BeaconContextClient(async operation => { calls.push(operation); return operation === 'pages' ? [] : { ...state, slot: 'scope', epoch: 1, busy: false, runtimeBusy: false, collectionPending: false, recent: [] }; });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const metadata = JSON.parse(await tools.describe(new AbortController().signal));
		assert.equal(metadata.beaconMode, state.mode);
		assert.deepEqual(metadata.beaconWorkspace, 'root' in state ? { path: state.root, activityCollectionEligible: state.usable } : null);
		assert.deepEqual(calls, ['context', 'context', 'pages', 'context']);
		assert.doesNotMatch(JSON.stringify(metadata), /busy|recent|activeId|epoch/);
		assert.equal(tools.names.includes('readRunRecord'), state.mode !== 'blackout');
	}
	const prompt = composeBeaconPrompt({ currentTime: '2026-11-26T12:00:00Z', toolNames: [] });
	assert.doesNotMatch(prompt.system, /2026-11-26\.\d|beaconMode|beaconWorkspace/);
	assert.match(prompt.system, /currentTime/);
});

test('tool_images_keep_each_original_call_on_followup', async () => {
	const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6AAAAABJRU5ErkJggg==';
	const original: Message[] = [{ id: 1, role: 'user', text: 'old image question', activities: [], status: 'complete' }, { id: 2, role: 'assistant', text: 'old answer', activities: [], status: 'complete', protocol: [{ provider: 'ollama', baseURL: 'http://localhost:11434/v1', model: 'old-model', messages: [
		{ role: 'assistant', content: ['first', 'second'].map(id => ({ type: 'tool-call', toolCallId: id, toolName: 'inspectFile', input: { operation: 'read', path: id + '.png' } })) },
		{ role: 'tool', content: ['first', 'second'].map(id => ({ type: 'tool-result', toolCallId: id, toolName: 'inspectFile', output: fileModelOutput({ ok: true, path: id + '.png', kind: 'image', mediaType: 'image/png', contents: image }) })) },
		{ role: 'assistant', content: 'old answer' }
	] }] }];
	const before = structuredClone(original);
	const session = new ChatSession(() => {}, String); session.restore({ messages: original, error: '' });
	let calls = 0;
	const generator = createGenerator(async () => ({ provider: 'deepseek', baseURL: 'https://fixture.invalid', model: 'new-model', apiKey: 'synthetic', parameters: {}, capabilities: { purpose: 'chat', vision: true, tools: false, reasoning: false, source: 'service' } }), async (_url, init) => {
		calls++; const body = JSON.parse(String(init?.body));
		const media = body.messages.find((message: { role: string; content: unknown }) => message.role === 'user' && Array.isArray(message.content) && message.content.some((part: { type: string }) => part.type === 'image_url')).content;
		assert.equal(media.length, 4);
		for (const [index, id] of ['first', 'second'].entries()) {
			assert.match(media[index * 2].text, /preceding recorded tool result/);
			assert.match(media[index * 2].text, new RegExp(`"toolCallId":"${id}"`));
			assert.match(media[index * 2].text, /"toolName":"inspectFile"/);
			assert.equal(media[index * 2 + 1].image_url.url, 'data:image/png;base64,' + image);
		}
		assert.doesNotMatch(JSON.stringify(body.messages), /for the current question/);
		assert.ok(body.messages.filter((message: { role: string }) => message.role === 'tool').every((message: { content: string }) => !message.content.includes(image)));
		return stream({ content: 'use those earlier images' });
	}, 'none', [], false);
	await session.send('follow up', generator); assert.equal(session.snapshot.error, '');
	assert.equal(calls, 1); assert.deepEqual(original, before);
	assert.deepEqual(session.snapshot.messages[1].protocol, before[1].protocol);
});

test('registered_tools_do_not_duplicate_system_guidance', () => {
	const withTools = composeBeaconPrompt({ currentTime: 'fixed', toolNames: ['readCurrentCode', 'readBeCoderInfo'] });
	const without = composeBeaconPrompt({ currentTime: 'fixed', toolNames: [] });
	assert.equal(withTools.version, '2026-11-27.1');
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
	const client = new BeaconContextClient(async operation => operation === 'pages' ? [] : ({ slot: 'wire', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, collectionPending: false, recent: [] })); await client.refresh();
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

test('completed_readMaterial_history_replays_without_registration_or_private_material_reads', async () => {
	const connection = { provider: 'deepseek' as const, baseURL: 'https://fixture.invalid', apiKey: 'synthetic', model: 'fixture', parameters: {}, capabilities: { purpose: 'chat' as const, vision: false, tools: true, reasoning: false, source: 'service' as const } };
	const legacy = [{ key: 'page:closed:old:', raw: 'UNCONSUMED_PRIVATE_BODY' }, { oldShape: true }];
	const stored = {
		version: 1, activeId: 'legacy', conversations: [{ id: 'legacy', title: 'Old page discussion', updatedAt: 1, error: '', workspace: [], contextSnapshots: legacy, messages: [
			{ id: 1, role: 'user', text: 'Explain the previously opened page', status: 'complete', activities: [] },
			{ id: 2, role: 'assistant', text: 'Original answer', status: 'complete', activities: [], protocol: [{ provider: connection.provider, baseURL: connection.baseURL, model: connection.model, messages: [
				{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'old-material', toolName: 'readMaterial', input: { id: 'page:closed:old:' } }] },
				{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'old-material', toolName: 'readMaterial', output: { type: 'json', value: { ok: true, contents: 'ACTUAL_OLD_RETURNED_EXCERPT' } } }] },
				{ role: 'assistant', content: [{ type: 'text', text: 'Original answer' }] }
			] }] }
		] }]
	};
	const before = structuredClone(stored), operations: string[] = [];
	const client = new BeaconContextClient(async operation => {
		operations.push(operation);
		if (operation === 'context') { return { slot: 'legacy', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, collectionPending: false, recent: [] }; }
		if (operation === 'pages') { return []; }
		throw new Error('Unexpected source read: ' + operation);
	});
	await client.refresh(); const tools = new ContextTools(client, client.captureScope());
	let requests = 0;
	const generator = createGenerator(async () => connection, async (_url, init) => {
		requests++; const body = JSON.parse(String(init?.body));
		assert.ok(body.tools.every((tool: { function: { name: string } }) => tool.function.name !== 'readMaterial'));
		const call = body.messages.find((message: { tool_calls?: { id: string }[] }) => message.tool_calls?.some(item => item.id === 'old-material'));
		assert.equal(call.tool_calls[0].function.name, 'readMaterial');
		const result = body.messages.find((message: { role: string; tool_call_id?: string }) => message.role === 'tool' && message.tool_call_id === 'old-material');
		assert.match(result.content, /ACTUAL_OLD_RETURNED_EXCERPT/);
		assert.doesNotMatch(JSON.stringify(body), /UNCONSUMED_PRIVATE_BODY/);
		return stream({ content: 'Continue from the actual old excerpt' });
	}, 'none', [], false, undefined, {}, tools);
	const history = new ChatHistory(stored, async value => value, () => {}, String);
	try {
		await history.session.send('Continue after the page has closed', generator, connection);
		assert.equal(history.snapshot.error, '');
		assert.deepEqual(history.currentConversation?.contextSnapshots, legacy);
		assert.deepEqual(stored, before);
		const restored = new ChatHistory(history.checkpoint, async value => value, () => {}, String);
		try {
			await restored.session.send('Continue once more after restart', generator, connection);
			assert.equal(restored.snapshot.error, ''); assert.equal(requests, 2);
			assert.ok(operations.every(operation => operation === 'context' || operation === 'pages'));
			assert.deepEqual(restored.currentConversation?.contextSnapshots, legacy);
		} finally { await restored.dispose(); }
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createGenerator, inspectModel } from '../src/provider';
import { providers, type Connection } from '../src/connection';
import { ModelCapabilityError, resolveCapabilities, serviceCapabilities, unknownCapabilities } from '../src/models';
import { ProtocolRecorder, replayProtocol } from '../src/protocol';
import { ChatHistory, readHistory, type HistoryData } from '../src/history';
import type { Delta, Generate } from '../src/session';

function response(deltas: Record<string, unknown>[], finish = 'stop'): Response {
	const chunks = [...deltas, {}].map((delta, index) => 'data: ' + JSON.stringify({ id: 'capability-test', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: index === deltas.length ? finish : null }] }) + '\n\n');
	return new Response(chunks.join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}
async function collect(generate: Generate): Promise<Delta[]> {
	const parts: Delta[] = [];
	for await (const part of generate([{ role: 'user', content: 'question' }], new AbortController().signal, async input => ({ ok: true, path: input.path, kind: 'image', contents: 'private-image-data', mediaType: 'image/png' }))) { parts.push(part); }
	return parts;
}

suite('Beacon model capabilities', () => {
	test('official catalog is endpoint-bound; unknown names and explicit service metadata remain distinct', () => {
		assert.equal(resolveCapabilities('deepseek', providers.deepseek.baseURL, 'deepseek-flash').vision, 'supported');
		assert.equal(resolveCapabilities('deepseek', 'https://gateway.example/v1', 'deepseek-flash').source, 'unknown');
		assert.equal(resolveCapabilities('deepseek', providers.deepseek.baseURL, 'future-model').tools, 'unknown');
		assert.equal(resolveCapabilities('bailian', providers.bailian.baseURL, 'text-embedding-v4').purpose, 'embedding');
		assert.equal(resolveCapabilities('bailian', providers.bailian.baseURL, 'qwen3-vl-plus').vision, 'supported');
		assert.equal(serviceCapabilities({ owned_by: 'vision-tools-thinking' }), undefined);
		assert.deepStrictEqual(serviceCapabilities({ capabilities: ['embedding'] }), { ...unknownCapabilities, purpose: 'embedding', vision: 'unsupported', reasoning: 'unsupported', tools: 'unsupported', source: 'service' });
	});
	test('non-chat models, unsupported thinking and excessive output limits fail before fetching', async () => {
		const connection: Connection = { provider: 'bailian', ...providers.bailian, model: 'text-embedding-v4', apiKey: 'test', parameters: {} };
		const never: typeof fetch = async () => { assert.fail('Blocked request reached the service'); };
		await assert.rejects(collect(createGenerator(async () => connection, never)), (error: unknown) => error instanceof ModelCapabilityError && error.code === 'non-chat');
		connection.model = 'chat'; connection.capabilities = { ...unknownCapabilities, purpose: 'chat', maxOutputTokens: 1024 };
		connection.parameters = { maxOutputTokens: 1025 };
		await assert.rejects(collect(createGenerator(async () => connection, never)), (error: unknown) => error instanceof ModelCapabilityError && error.code === 'output-limit');
		connection.parameters = {}; connection.modelSettings = { thinking: 'enabled' };
		await assert.rejects(collect(createGenerator(async () => connection, never)), (error: unknown) => error instanceof ModelCapabilityError && error.code === 'thinking');
	});
	test('unknown tool support never registers tools; manual confirmation enables them under file permission', async () => {
		const connection: Connection = { provider: 'deepseek', ...providers.deepseek, model: 'custom', apiKey: 'test', parameters: {} };
		for (const support of ['unknown', 'unsupported', 'supported'] as const) {
			connection.capabilities = { ...unknownCapabilities, purpose: 'chat', tools: support };
			let requests = 0;
			await collect(createGenerator(async () => connection, async (_url, options) => {
				requests++;
				const body = JSON.parse(String(options?.body));
				assert.equal(!!body.tools, support === 'supported');
				return response([{ content: 'answer' }]);
			}, 'workspace'));
			assert.equal(requests, 1);
		}
	});
	test('thinking settings use each installed adapter\'s actual request format', async () => {
		for (const provider of ['deepseek', 'bailian', 'moonshot', 'ollama'] as const) {
			const connection: Connection = { provider, ...providers[provider], model: provider === 'deepseek' ? 'deepseek-v4-flash' : 'custom', apiKey: 'test', parameters: {}, capabilities: { ...unknownCapabilities, purpose: 'chat', reasoning: 'supported' }, modelSettings: { thinking: 'disabled', effort: 'high' } };
			let requests = 0;
			await collect(createGenerator(async () => connection, async (_url, options) => {
				requests++;
				const body = JSON.parse(String(options?.body));
				if (provider === 'deepseek' || provider === 'moonshot') { assert.deepStrictEqual(body.thinking, { type: 'disabled' }); }
				if (provider === 'bailian') { assert.equal(body.enable_thinking, false); }
				if (provider === 'ollama') { assert.equal(body.reasoning_effort, 'none'); }
				return response([{ content: 'answer' }]);
			}));
			assert.equal(requests, 1);
		}
	});
	test('Ollama inspects only the selected model and reads declared capabilities without changing runtime options', async () => {
		const result = await inspectModel({ provider: 'ollama', ...providers.ollama, model: 'local' }, new AbortController().signal, async (url, options) => {
			assert.equal(String(url), 'http://localhost:11434/api/show');
			assert.deepStrictEqual(JSON.parse(String(options?.body)), { model: 'local' });
			assert.equal(options?.redirect, 'error');
			return Response.json({ capabilities: ['completion', 'thinking', 'vision', 'tools'], model_info: { 'qwen.context_length': 131072 } });
		});
		assert.deepStrictEqual(result, { purpose: 'chat', vision: 'supported', reasoning: 'supported', tools: 'supported', source: 'service', contextWindow: 131072 });
	});
	test('non-vision file tools return an actionable error, never image bytes; saved images block before fetching', async () => {
		const connection: Connection = { provider: 'deepseek', ...providers.deepseek, model: 'deepseek-chat', apiKey: 'test', parameters: {} };
		let requests = 0;
		const parts = await collect(createGenerator(async () => connection, async (_url, options) => {
			requests++;
			const body = JSON.parse(String(options?.body));
			assert.ok(!JSON.stringify(body).includes('private-image-data'));
			if (requests === 1) { return response([{ tool_calls: [{ index: 0, id: 'image-call', type: 'function', function: { name: 'inspectFiles', arguments: '{"operation":"read","path":"image.png"}' } }] }], 'tool_calls'); }
			assert.ok(JSON.stringify(body.messages).includes('does not support image input'));
			return response([{ content: 'Select a vision model.' }]);
		}, 'workspace'));
		const file = parts.find(part => part.type === 'tool-result');
		assert.ok(file?.type === 'tool-result' && !file.result.output.ok);
		assert.equal(requests, 2);
		const generate = createGenerator(async () => connection, async () => { assert.fail('Historical image reached a non-vision service'); });
		await assert.rejects(async () => { for await (const part of generate([{ role: 'user', content: [{ type: 'image', image: 'aGVsbG8=', mediaType: 'image/png' }] }], new AbortController().signal, async input => ({ ok: false, path: input.path }))) { assert.fail(`Unexpected ${part.type} event`); } }, (error: unknown) => error instanceof ModelCapabilityError && error.code === 'vision');
	});
});

suite('Beacon durable protocol', () => {
	test('actual call IDs, parallel tool groups and reasoning survive disk reload and followup', async () => {
		let saved: HistoryData | undefined;
		let requests = 0;
		const source = { provider: 'deepseek', baseURL: providers.deepseek.baseURL, model: 'deepseek-v4-flash' };
		const connection: Connection = { ...source, provider: 'deepseek', apiKey: 'test', parameters: {} };
		const mock: typeof fetch = async (_url, options) => {
			requests++;
			const body = JSON.parse(String(options?.body));
			if (requests === 1) {
				return response([{ reasoning_content: 'inspect both files' }, { content: 'I will read them.' }, { tool_calls: ['left', 'right'].map((id, index) => ({ index, id, type: 'function', function: { name: 'inspectFiles', arguments: JSON.stringify({ operation: 'read', path: `${id}.cpp` }) } })) }], 'tool_calls');
			}
			const tools = body.messages.filter((message: { role: string }) => message.role === 'tool');
			assert.deepStrictEqual(tools.map((message: { tool_call_id: string }) => message.tool_call_id), ['left', 'right']);
			const called = body.messages.find((message: { tool_calls?: unknown }) => message.tool_calls);
			assert.equal(called.reasoning_content, 'inspect both files');
			assert.equal(called.content, 'I will read them.');
			if (requests === 3) {
				assert.equal(body.messages.filter((message: { role: string }) => message.role === 'assistant').at(-1).reasoning_content, 'now summarize');
			}
			return response([{ reasoning_content: 'now summarize' }, { content: 'Both files are C++.' }]);
		};
		const history = new ChatHistory(undefined, async data => { saved = JSON.parse(JSON.stringify(data)); }, () => {}, () => 'error');
		await history.session.send('Read both files', createGenerator(async () => connection, mock, 'workspace'), source, async input => ({ ok: true, path: input.path, contents: 'int main() {}' }));
		await history.flush();
		assert.equal(history.snapshot.error, '');
		assert.equal(history.snapshot.messages[1].text, 'I will read them.Both files are C++.');
		const recorded = saved?.conversations[0].messages[1].protocol?.[0].messages;
		assert.deepStrictEqual(recorded?.map(message => message.role), ['assistant', 'tool', 'assistant']);
		const finalAnswer = recorded?.at(-1);
		assert.ok(finalAnswer?.role === 'assistant' && Array.isArray(finalAnswer.content));
		assert.deepStrictEqual(finalAnswer.content.map(part => 'text' in part ? part.text : ''), ['now summarize', 'Both files are C++.']);
		const restored = new ChatHistory(saved, async () => {}, () => {}, () => 'error');
		await restored.session.send('Explain the result', createGenerator(async () => connection, mock, 'workspace'), source);
		assert.equal(restored.snapshot.error, '');
		assert.equal(requests, 3);
		await Promise.all([history.dispose(), restored.dispose()]);
	});
	test('partial reasoning/text checkpoint survives pause, reload and continuation on the same answer', async () => {
		let saved: HistoryData | undefined;
		const history: ChatHistory = new ChatHistory(undefined, async data => { saved = JSON.parse(JSON.stringify(data)); }, () => { if (history?.snapshot.messages.at(-1)?.text === 'prefix') { history.session.stop(); } }, () => 'error');
		const connection: Connection = { provider: 'deepseek', ...providers.deepseek, model: 'deepseek-v4-flash', parameters: {}, apiKey: 'test' };
		const source = { provider: connection.provider, baseURL: connection.baseURL, model: connection.model };
		await history.session.send('question', createGenerator(async () => connection, async () => response([{ reasoning_content: 'partial thought' }, { content: 'prefix' }, { content: 'ignored' }])), source);
		await history.flush();
		assert.equal(history.snapshot.messages[1].status, 'stopped');
		assert.equal(history.snapshot.messages[1].text, 'prefix');
		const restored = new ChatHistory(saved, async () => {}, () => {}, () => 'error');
		const id = restored.snapshot.messages[1].id;
		await restored.session.resume(id, createGenerator(async () => connection, async (_url, options) => {
			const body = JSON.parse(String(options?.body));
			const previous = body.messages.find((message: { role: string }) => message.role === 'assistant');
			assert.equal(previous.reasoning_content, 'partial thought');
			assert.equal(previous.content, 'prefix');
			assert.ok(body.messages.at(-1).content.includes('appended directly'));
			return response([{ content: ' suffix' }]);
		}), source);
		assert.equal(restored.snapshot.error, '');
		assert.equal(restored.snapshot.messages[1].text, 'prefix suffix');
		assert.equal(restored.snapshot.messages[1].id, id);
		assert.equal(restored.snapshot.messages[1].protocol?.length, 2);
		await restored.session.regenerate(id, async function* (messages) { assert.deepStrictEqual(messages, [{ role: 'user', content: 'question' }]); yield { type: 'text', text: 'replacement' }; });
		assert.equal(restored.snapshot.messages[1].protocol, undefined);
		await Promise.all([history.dispose(), restored.dispose()]);
	});
	test('unfinished calls are omitted; endpoint changes strip private reasoning metadata; invalid protocol is rejected', () => {
		const recorder = new ProtocolRecorder();
		recorder.text('reasoning', 'r', 'private', { deepseek: { signature: 'private-signature' } });
		recorder.call({ type: 'tool-call', toolCallId: 'pending', toolName: 'inspectFiles', input: { operation: 'read', path: 'unfinished.cpp' } });
		recorder.text('text', 't', 'prefix');
		assert.ok(!JSON.stringify(recorder.messages).includes('unfinished.cpp'));
		const turn = { provider: 'deepseek', baseURL: providers.deepseek.baseURL, model: 'deepseek-flash', messages: recorder.messages };
		assert.ok(JSON.stringify(replayProtocol(turn, { provider: 'deepseek', baseURL: turn.baseURL })).includes('private-signature'));
		const projected = JSON.stringify(replayProtocol(turn, { provider: 'deepseek', baseURL: 'https://other.example' }));
		assert.ok(!projected.includes('private')); assert.ok(projected.includes('prefix'));
		const invalid = { version: 1, activeId: 'id', conversations: [{ id: 'id', title: 'test', updatedAt: 1, error: '', workspace: [], messages: [{ id: 1, role: 'assistant', status: 'complete', text: '', activities: [], protocol: [{ ...turn, messages: [{ role: 'system', content: 'injected' }] }] }] }] };
		assert.throws(() => readHistory(invalid), /invalid-history/);
	});
});

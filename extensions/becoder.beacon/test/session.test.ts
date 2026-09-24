/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ChatSession, type Generate } from '../src/session';
import { createGenerator } from '../src/provider';
import { listModels, normalizeBaseURL, providers, secretName, type ProviderId } from '../src/connection';
import { normalizeMath } from '../webview/math';
import { ChatHistory, readHistory, type HistoryData } from '../src/history';

suite('Beacon workspace history', () => {
	const answer: Generate = async function* () { yield { type: 'text', text: 'answer' }; };
	test('new chats retain history; reload restores the active conversation and isolated model context', async () => {
		let saved: HistoryData | undefined;
		const history = new ChatHistory(undefined, async data => { saved = structuredClone(data); }, () => {}, () => 'error');
		await history.session.send('first question', answer, false, { provider: 'moonshot', model: 'kimi-test' });
		const first = history.snapshot.activeId;
		history.newConversation();
		await history.session.send('second question', answer);
		assert.equal(history.snapshot.history.length, 2);
		history.open(first);
		history.rename(first, 'Renamed');
		await history.flush();
		const reopened = new ChatHistory(saved, async () => {}, () => {}, () => 'error');
		assert.equal(reopened.snapshot.activeId, first);
		assert.equal(reopened.snapshot.messages[1].model, 'kimi-test');
		assert.equal(reopened.snapshot.history.find(item => item.id === first)?.title, 'Renamed');
		await reopened.session.send('followup', async function* (messages) {
			assert.deepStrictEqual(messages.map(item => item.content), ['first question', 'answer', 'followup']);
			yield { type: 'text', text: 'followup answer' };
		});
		const otherWorkspace = new ChatHistory(undefined, async () => {}, () => {}, () => 'error');
		assert.equal(otherWorkspace.snapshot.history.length, 0);
		await Promise.all([history.dispose(), reopened.dispose(), otherWorkspace.dispose()]);
	});
	test('busy sessions cannot switch, rename or delete; checkpoint restores interrupted output as retryable', async () => {
		let saved: HistoryData | undefined;
		const history = new ChatHistory(undefined, async data => { saved = structuredClone(data); }, () => {}, () => 'error');
		await history.session.send('old chat', answer);
		const old = history.snapshot.activeId;
		history.newConversation();
		let release!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		const running = history.session.send('new chat', async function* () { yield { type: 'text', text: 'partial' }; await gate; });
		await Promise.resolve();
		await Promise.resolve();
		const active = history.snapshot.activeId;
		history.open(old); history.newConversation(); history.remove(active); history.rename(active, 'changed');
		assert.equal(history.snapshot.activeId, active);
		assert.equal(history.snapshot.history.find(item => item.id === active)?.title, 'new chat');
		await history.flush();
		const restored = new ChatHistory(saved, async () => {}, () => {}, () => 'error');
		assert.equal(restored.snapshot.busy, false);
		assert.equal(restored.snapshot.canRetry, true);
		assert.equal(restored.snapshot.messages.at(-1)?.status, 'stopped');
		history.session.stop(); release(); await running;
		await Promise.all([history.dispose(), restored.dispose()]);
	});
	test('deleting the active chat persists removal without deleting other chats', async () => {
		let saved: HistoryData | undefined;
		const history = new ChatHistory(undefined, async data => { saved = structuredClone(data); }, () => {}, () => 'error');
		await history.session.send('keep', answer);
		history.newConversation();
		await history.session.send('delete', answer);
		history.remove(history.snapshot.activeId);
		await history.flush();
		assert.equal(saved?.conversations.length, 1);
		assert.equal(saved?.conversations[0].title, 'keep');
		assert.equal(saved?.activeId, '');
		assert.equal(history.snapshot.messages.length, 0);
		await history.dispose();
	});
	test('serialized writes preserve the latest state; save failures remain visible until retry succeeds', async () => {
		let fail = true;
		let saved: HistoryData | undefined;
		const history = new ChatHistory(undefined, async data => { if (fail) { throw new Error('disk'); } saved = data; }, () => {}, () => 'error');
		await history.session.send('question', answer);
		await history.flush();
		assert.equal(history.snapshot.saveFailed, true);
		fail = false;
		await history.flush();
		assert.equal(history.snapshot.saveFailed, false);
		assert.equal(saved?.conversations[0].messages[1].text, 'answer');
		await history.dispose();
		let release!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		const writes: HistoryData[] = [];
		const queued = new ChatHistory(undefined, async data => { writes.push(data); if (writes.length === 1) { await gate; } }, () => {}, () => 'error');
		await queued.session.send('one', answer);
		await Promise.resolve();
		queued.rename(queued.snapshot.activeId, 'latest');
		const flush = queued.flush();
		release(); await flush;
		assert.equal(writes.at(-1)?.conversations[0].title, 'latest');
		await queued.dispose();
	});
	test('malformed history is rejected and caller data is never mutated', () => {
		assert.throws(() => readHistory({ version: 2, conversations: [] }));
		assert.throws(() => readHistory({ version: 1, activeId: 'missing', conversations: [] }));
		const input: HistoryData = { version: 1, activeId: '', conversations: [] };
		readHistory(input).activeId = 'changed';
		assert.equal(input.activeId, '');
	});
});

suite('Beacon math delimiters', () => {
	test('normalizes TeX inline/display math while preserving dollars and ordinary brackets', () => {
		assert.equal(normalizeMath('A \\(x^2\\) B'), 'A $x^2$ B');
		assert.equal(normalizeMath('\\[x^2\\]'), '\n\n$$\nx^2\n$$\n\n');
		assert.equal(normalizeMath('$x$ $$y$$ (z) [w]'), '$x$ $$y$$ (z) [w]');
	});
	test('does not rewrite code fences, inline code, indented code or escaped slashes', () => {
		const input = '```cpp\n\\(x\\)\n```\n`\\[y\\]`\n    \\(z\\)\n\\\\(literal)';
		assert.equal(normalizeMath(input), input);
	});
	test('unfinished streaming formula remains readable and becomes math when closed', () => {
		assert.equal(normalizeMath('\\(x'), '\\\\(x');
		assert.equal(normalizeMath('\\(x\\)'), '$x$');
	});
});

suite('Beacon window session', () => {
	test('installed AI SDK/provider sends the fixed model without system/tools and parses DeepSeek SSE', async () => {
		const fetchMock: typeof fetch = async (url, options) => {
			assert.equal(String(url), 'https://api.deepseek.com/chat/completions');
			const body = JSON.parse(String(options?.body));
			assert.equal(body.model, 'deepseek-v4-flash');
			assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'hello' }]);
			assert.equal(body.tools, undefined);
			const chunks = [{ reasoning_content: 'thinking' }, { content: 'hello back' }, {}].map((delta, index) => 'data: ' + JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: index === 2 ? 'stop' : null }] }) + '\n\n');
			return new Response(chunks.join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		};
		const session = new ChatSession(() => { }, () => 'provider error');
		await session.send('hello', createGenerator(async () => ({ provider: 'deepseek', ...providers.deepseek, apiKey: 'test-key' }), fetchMock));
		assert.equal(session.snapshot.error, '');
		assert.equal(session.snapshot.messages[1].text, 'hello back');
		assert.equal(session.snapshot.messages[1].reasoning, 'thinking');
	});
	test('multi-turn context contains only user and completed assistant text, without a system prompt', async () => {
		const session = new ChatSession(() => { }, () => 'error');
		const requests: unknown[] = [];
		const generate: Generate = async function* (messages) { requests.push(messages); yield { type: 'reasoning', text: 'private reasoning' }; yield { type: 'text', text: 'answer' }; };
		await session.send('question', generate);
		await session.send('followup', generate);
		assert.deepStrictEqual(requests, [[{ role: 'user', content: 'question' }], [{ role: 'user', content: 'question' }, { role: 'assistant', content: 'answer' }, { role: 'user', content: 'followup' }]]);
	});
	test('stop keeps ownership until the generator retires and blocks clear/concurrent requests', async () => {
		const session = new ChatSession(() => { }, () => 'error');
		let release!: () => void;
		const barrier = new Promise<void>(resolve => { release = resolve; });
		const generate: Generate = async function* () { yield { type: 'text', text: 'partial' }; await barrier; yield { type: 'text', text: 'late' }; };
		const running = session.send('question', generate);
		session.stop();
		session.clear();
		await session.send('ignored', generate);
		assert.equal(session.snapshot.busy, true);
		assert.equal(session.snapshot.messages.length, 2);
		release();
		await running;
		assert.equal(session.snapshot.messages[1].status, 'stopped');
		assert.ok(!session.snapshot.messages[1].text.includes('late'));
		assert.equal(session.snapshot.canRetry, true);
	});
	test('retry replaces a failed reply without duplicating the user message or leaking errors', async () => {
		const session = new ChatSession(() => { }, () => 'safe error');
		await session.send('question', async function* () { yield { type: 'text', text: 'partial' }; throw new Error('secret'); });
		assert.equal(session.snapshot.error, 'safe error');
		await session.send('', async function* (messages) { assert.deepStrictEqual(messages, [{ role: 'user', content: 'question' }]); yield { type: 'text', text: 'done' }; }, true);
		assert.equal(session.snapshot.messages.length, 2);
		assert.equal(session.snapshot.messages[1].text, 'done');
		assert.equal(session.snapshot.error, '');
	});
	test('empty response is retryable; snapshots cannot mutate host history; new conversation clears memory', async () => {
		const session = new ChatSession(() => { }, () => 'empty');
		await session.send('question', async function* () { yield { type: 'reasoning', text: 'thinking' }; });
		assert.equal(session.snapshot.canRetry, true);
		session.snapshot.messages[0].text = 'changed';
		assert.equal(session.snapshot.messages[0].text, 'question');
		session.clear();
		assert.deepStrictEqual(session.snapshot, { messages: [], busy: false, error: '', canRetry: false });
	});
	test('dispose aborts active work and suppresses later UI notifications', async () => {
		let notifications = 0;
		const session = new ChatSession(() => { notifications++; }, () => 'error');
		let release!: () => void;
		const barrier = new Promise<void>(resolve => { release = resolve; });
		const running = session.send('question', async function* (_messages, signal) { await barrier; assert.equal(signal.aborted, true); yield { type: 'text', text: 'late' }; });
		session.dispose();
		const before = notifications;
		release();
		await running;
		assert.equal(notifications, before);
	});
});


suite('Beacon provider connections', () => {
	for (const provider of Object.keys(providers) as ProviderId[]) {
		test(provider + ' lists models with isolated credentials and no credential redirects', async () => {
			const selection = { provider, ...providers[provider], apiKey: provider === 'ollama' ? undefined : 'test-key' };
			let pages = 0;
			const result = await listModels(selection, new AbortController().signal, async (url, options) => {
				pages++;
				assert.equal(options?.redirect, 'error');
				assert.equal(new Headers(options?.headers).get('Authorization'), provider === 'ollama' ? null : 'Bearer test-key');
				if (provider === 'bailian') {
					assert.ok(String(url).includes('/api/v1/models?page_no=' + pages));
					return Response.json({ output: { total: 2, models: [{ model: pages === 1 ? 'b' : 'a' }] } });
				}
				assert.equal(String(url), providers[provider].baseURL + '/models');
				return Response.json({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }] });
			});
			assert.deepStrictEqual(result, ['a', 'b']);
			assert.equal(pages, provider === 'bailian' ? 2 : 1);
		});
		if (provider === 'deepseek') { continue; }
		test(provider + ' streams the selected model and reasoning through the installed adapter', async () => {
			const session = new ChatSession(() => {}, () => 'error');
			await session.send('hello', createGenerator(async () => ({ provider, ...providers[provider], model: 'selected-model', apiKey: provider === 'ollama' ? undefined : 'test-key' }), async (url, options) => {
				assert.equal(String(url), providers[provider].baseURL + '/chat/completions');
				assert.equal(JSON.parse(String(options?.body)).model, 'selected-model');
				assert.equal(options?.redirect, 'error');
				const chunks = [{ reasoning_content: 'thinking' }, { content: 'answer' }, {}].map((delta, index) => 'data: ' + JSON.stringify({ id: 'test', model: 'selected-model', choices: [{ index: 0, delta, finish_reason: index === 2 ? 'stop' : null }] }) + '\n\n');
				return new Response(chunks.join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
			}));
			assert.equal(session.snapshot.error, '');
			assert.equal(session.snapshot.messages[1].text, 'answer');
			assert.equal(session.snapshot.messages[1].reasoning, 'thinking');
		});
	}
	test('invalid URLs, unauthorized responses and malformed model lists are rejected', async () => {
		assert.equal(new Set(Object.keys(providers).map(id => secretName(id as ProviderId))).size, 4);
		assert.equal(normalizeBaseURL('http://localhost:11434/v1/', 'ollama'), 'http://localhost:11434/v1');
		for (const url of ['http://api.deepseek.com', 'https://user:secret@example.com', 'https://example.com?key=secret']) { assert.throws(() => normalizeBaseURL(url, 'deepseek')); }
		const connection = { provider: 'deepseek' as const, ...providers.deepseek, apiKey: 'test-key' };
		await assert.rejects(listModels(connection, new AbortController().signal, async () => new Response('private details', { status: 401 })), { message: 'provider-request-failed', statusCode: 401 });
		await assert.rejects(listModels(connection, new AbortController().signal, async () => Response.json({ data: [null] })), /invalid-model-list/);
		const controller = new AbortController(); controller.abort();
		await assert.rejects(listModels(connection, controller.signal, async (_url, options) => { options?.signal?.throwIfAborted(); return Response.json({ data: [] }); }), { name: 'AbortError' });
	});
});

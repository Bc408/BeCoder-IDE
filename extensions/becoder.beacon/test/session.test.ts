/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ChatSession, type Generate } from '../src/session';
import { createGenerator, listModels } from '../src/provider';
import { normalizeBaseURL, providers, readModelParameters, secretName, updateModelParameters, type ProviderId } from '../src/connection';
import { normalizeMath } from '../webview/math';
import { ChatHistory, readHistory, type HistoryData } from '../src/history';

suite('Beacon workspace history', () => {
	const answer: Generate = async function* () { yield { type: 'reasoning', text: 'short internal trace' }; yield { type: 'text', text: 'answer' }; };
	test('new chats retain history; reload restores the active conversation and isolated model context', async () => {
		let saved: HistoryData | undefined;
		const history = new ChatHistory(undefined, async data => { saved = structuredClone(data); }, () => {}, () => 'error');
		await history.session.send('first question', answer, { provider: 'moonshot', model: 'kimi-test' });
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
		assert.equal(reopened.snapshot.messages[1].reasoning, 'short internal trace');
		assert.equal(reopened.snapshot.history.find(item => item.id === first)?.title, 'Renamed');
		await reopened.session.send('followup', async function* (messages) {
			assert.deepStrictEqual(messages.map(item => item.content), ['first question', 'answer', 'followup']);
			yield { type: 'text', text: 'followup answer' };
		});
		const otherWorkspace = new ChatHistory(undefined, async () => {}, () => {}, () => 'error');
		assert.equal(otherWorkspace.snapshot.history.length, 0);
		await Promise.all([history.dispose(), reopened.dispose(), otherWorkspace.dispose()]);
	});
	test('busy sessions cannot switch, rename or delete; restored interrupted output is paused', async () => {
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
	test('moves multiline display delimiters onto their own lines without swallowing later prose', () => {
		const source = '$$f(x)=\\sum_{n=0}^{\\infty}x^n\n=f(0)+x+\\cdots$$\n\nFollowing paragraph.';
		assert.equal(normalizeMath(source), '$$\nf(x)=\\sum_{n=0}^{\\infty}x^n\n=f(0)+x+\\cdots\n$$\n\nFollowing paragraph.');
	});
	test('does not rewrite code fences, inline code, indented code or escaped slashes', () => {
		const input = '```cpp\n\\(x\\)\n```\n`\\[y\\]`\n    \\(z\\)\n\\\\(literal)';
		assert.equal(normalizeMath(input), input);
	});
	test('unfinished streaming formula remains readable and becomes math when closed', () => {
		assert.equal(normalizeMath('\\(x'), '\\\\(x');
		assert.equal(normalizeMath('\\(x\\)'), '$x$');
		assert.equal(normalizeMath('推导中：$x^2', true), '推导中：$x^2$');
		assert.equal(normalizeMath('$$\n\\sum_{i=1}^{n} i', true), '$$\n\\sum_{i=1}^{n} i\n$$');
		assert.equal(normalizeMath('当前行内式：\\[\\frac{a}{b}', true), '当前行内式：\n\n$$\n\\frac{a}{b}\n$$\n\n');
		assert.equal(normalizeMath('```cpp\n$notMath\n', true), '```cpp\n$notMath\n');
	});
});

suite('Beacon window session', () => {
	test('installed AI SDK/provider sends model parameters and read tool and parses DeepSeek SSE', async () => {
		const fetchMock: typeof fetch = async (url, options) => {
			assert.equal(String(url), 'https://api.deepseek.com/chat/completions');
			const body = JSON.parse(String(options?.body));
			assert.equal(body.model, 'deepseek-chat');
			assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'hello' }]);
			assert.deepStrictEqual(body.tools.map((entry: { function: { name: string } }) => entry.function.name), ['readWorkspaceFile']);
			assert.equal(body.temperature, 0.7);
			assert.equal(body.top_p, 0.9);
			assert.equal(body.max_tokens, 4096);
			const chunks = [{ reasoning_content: 'thinking' }, { content: 'hello back' }, {}].map((delta, index) => 'data: ' + JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: index === 2 ? 'stop' : null }] }) + '\n\n');
			return new Response(chunks.join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		};
		const session = new ChatSession(() => { }, () => 'provider error');
		await session.send('hello', createGenerator(async () => ({ provider: 'deepseek', ...providers.deepseek, model: 'deepseek-chat', parameters: { temperature: 0.7, topP: 0.9, maxOutputTokens: 4096 }, apiKey: 'test-key' }), fetchMock));
		assert.equal(session.snapshot.error, '');
		assert.equal(session.snapshot.messages[1].text, 'hello back');
		assert.equal(session.snapshot.messages[1].reasoning, 'thinking');
	});
	test('AI SDK persists completed workspace reads and replays native tool context on followup', async () => {
		let requestCount = 0;
		const contents = 'private source text';
		const session = new ChatSession(() => {}, () => 'error');
		const fetchMock: typeof fetch = async (_url, options) => {
			const body = JSON.parse(String(options?.body));
			requestCount++;
			if (requestCount === 1) {
				const chunks = [
					{ tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'readWorkspaceFile', arguments: '' } }] },
					{ tool_calls: [{ index: 0, function: { arguments: '{"path":"src/main.ts"}' } }] },
					{}
				].map((delta, index) => 'data: ' + JSON.stringify({ id: 'tool-test', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: index === 2 ? 'tool_calls' : null }] }) + '\n\n');
				return new Response(chunks.join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
			}
			assert.ok(body.messages.some((message: { content?: string }) => message.content?.includes(contents)));
			const chunks = [{ content: 'Here is the summary.' }, {}].map((delta, index) => 'data: ' + JSON.stringify({ id: 'tool-test', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: index === 1 ? 'stop' : null }] }) + '\n\n');
			return new Response(chunks.join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		};
		const generate = createGenerator(async () => ({ provider: 'deepseek', ...providers.deepseek, model: 'deepseek-chat', parameters: {}, apiKey: 'test-key' }), fetchMock);
		await session.send('Read src/main.ts', generate, undefined, async path => ({ path, content: contents }));
		assert.equal(requestCount, 2);
		assert.equal(session.snapshot.messages[1].text, 'Here is the summary.');
		assert.deepStrictEqual(session.snapshot.messages[1].activities, [{ id: 'call-1', type: 'read-workspace-file', path: 'src/main.ts', status: 'complete' }]);
		assert.deepStrictEqual(session.snapshot.messages[1].toolResults, [{ id: 'call-1', path: 'src/main.ts', output: { ok: true, path: 'src/main.ts', contents } }]);
		await session.send('What did that file contain?', generate);
		assert.equal(requestCount, 3);
	});
	test('multi-turn context contains only user and completed assistant text, without a system prompt', async () => {
		const session = new ChatSession(() => { }, () => 'error');
		const requests: unknown[] = [];
		const generate: Generate = async function* (messages) { requests.push(messages); yield { type: 'reasoning', text: 'private reasoning' }; yield { type: 'text', text: 'answer' }; };
		await session.send('question', generate);
		await session.send('followup', generate);
		assert.deepStrictEqual(requests, [[{ role: 'user', content: 'question' }], [{ role: 'user', content: 'question' }, { role: 'assistant', content: 'answer' }, { role: 'user', content: 'followup' }]]);
		assert.equal(session.snapshot.messages[1].reasoning, 'private reasoning');
	});
	test('workspace tool activity and reasoning are snapshotted separately from answer text', async () => {
		const session = new ChatSession(() => { }, () => 'error');
		await session.send('read package.json', async function* () {
			yield { type: 'activity', activity: { id: 'tool-1', type: 'read-workspace-file', path: 'package.json', status: 'running' } };
			yield { type: 'activity', activity: { id: 'tool-1', type: 'read-workspace-file', path: 'package.json', status: 'complete' } };
			yield { type: 'reasoning', text: 'checking the file' };
			yield { type: 'text', text: 'done' };
		});
		const snapshot = session.snapshot;
		assert.deepStrictEqual(snapshot.messages[1].activities, [{ id: 'tool-1', type: 'read-workspace-file', path: 'package.json', status: 'complete' }]);
		assert.equal(snapshot.messages[1].reasoning, 'checking the file');
		snapshot.messages[1].activities[0].path = 'mutated';
		assert.equal(session.snapshot.messages[1].activities[0].path, 'package.json');
	});
	test('editing a user turn and regenerating a response truncate later context', async () => {
		const session = new ChatSession(() => { }, () => 'error');
		const answer: Generate = async function* () { yield { type: 'text', text: 'answer' }; };
		await session.send('first', answer);
		const userId = session.snapshot.messages[0].id;
		const assistantId = session.snapshot.messages[1].id;
		await session.send('later', answer);
		await session.regenerate(assistantId, async function* (messages) {
			assert.deepStrictEqual(messages, [{ role: 'user', content: 'first' }]);
			yield { type: 'text', text: 'regenerated' };
		});
		assert.deepStrictEqual(session.snapshot.messages.map(message => message.text), ['first', 'regenerated']);
		await session.edit(userId, 'edited first', async function* (messages) {
			assert.deepStrictEqual(messages, [{ role: 'user', content: 'edited first' }]);
			yield { type: 'text', text: 'edited answer' };
		});
		assert.deepStrictEqual(session.snapshot.messages.map(message => message.text), ['edited first', 'edited answer']);
		assert.ok(Number.isFinite(session.snapshot.messages[0].createdAt));
		assert.ok(Number.isFinite(session.snapshot.messages[1].durationMs));
	});
	test('stop keeps ownership until the generator retires and blocks clear/concurrent requests', async () => {
		let resolvePartial!: () => void;
		const partialReady = new Promise<void>(resolve => { resolvePartial = resolve; });
		const session = new ChatSession(snapshot => { if (snapshot.messages.at(-1)?.text === 'partial') { resolvePartial(); } }, () => 'error');
		let release!: () => void;
		const barrier = new Promise<void>(resolve => { release = resolve; });
		const generate: Generate = async function* () { yield { type: 'text', text: 'partial' }; await barrier; yield { type: 'text', text: 'late' }; };
		const running = session.send('question', generate);
		await partialReady;
		session.stop();
		session.clear();
		await session.send('ignored', generate);
		assert.equal(session.snapshot.busy, true);
		assert.equal(session.snapshot.messages.length, 2);
		release();
		await running;
		assert.equal(session.snapshot.messages[1].status, 'stopped');
		assert.ok(!session.snapshot.messages[1].text.includes('late'));
		await session.send('followup', async function* (messages) {
			assert.deepStrictEqual(messages, [{ role: 'user', content: 'question' }, { role: 'assistant', content: 'partial' }, { role: 'user', content: 'followup' }]);
			yield { type: 'text', text: 'continued conversation' };
		});
		assert.deepStrictEqual(session.snapshot.messages.map(message => message.text), ['question', 'partial', 'followup', 'continued conversation']);
	});
	test('resume appends to the same answer, retains context and reasoning, and rejects stale or concurrent resumes', async () => {
		const session = new ChatSession(() => {}, () => 'safe error');
		await session.send('question', async function* () { yield { type: 'reasoning', text: 'trace' }; yield { type: 'text', text: '```cpp\nint ' }; session.stop(); });
		const id = session.snapshot.messages[1].id;
		let release!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		const running = session.resume(id, async function* (messages) {
			assert.deepStrictEqual(messages.slice(0, -1), [{ role: 'user', content: 'question' }, { role: 'assistant', content: '```cpp\nint ' }]);
			assert.equal(messages.at(-1)?.role, 'user');
			assert.ok(String(messages.at(-1)?.content).includes('appended directly'));
			yield { type: 'text', text: 'a;' };
			await gate;
			yield { type: 'text', text: '\n```' };
		});
		await session.resume(id, async function* () { assert.fail('duplicate resume started'); });
		await session.send('blocked', async function* () { assert.fail('concurrent send started'); });
		release(); await running;
		assert.deepStrictEqual(session.snapshot.messages.map(message => message.text), ['question', '```cpp\nint a;\n```']);
		assert.equal(session.snapshot.messages[1].id, id);
		assert.equal(session.snapshot.messages[1].reasoning, 'trace');
		assert.equal(session.snapshot.messages[1].status, 'complete');
		await session.resume(id, async function* () { assert.fail('completed answer resumed'); });
		await session.send('next', async function* () { yield { type: 'text', text: 'next answer' }; });
		await session.resume(id, async function* () { assert.fail('superseded answer resumed'); });
	});
	test('repeated pause, failed continuation, reload and regeneration preserve the correct prefix', async () => {
		const session = new ChatSession(() => {}, () => 'safe error');
		await session.send('question', async function* () { session.stop(); });
		const id = session.snapshot.messages[1].id;
		await session.resume(id, async function* () { yield { type: 'text', text: 'prefix' }; session.stop(); });
		assert.equal(session.snapshot.messages[1].text, 'prefix');
		assert.equal(session.snapshot.messages[1].status, 'stopped');
		await session.resume(id, async function* () { throw new Error('secret'); });
		assert.equal(session.snapshot.error, 'safe error');
		assert.equal(session.snapshot.messages[1].text, 'prefix');
		assert.equal(session.snapshot.messages[1].status, 'stopped');
		await session.resume(id, async function* () {});
		assert.equal(session.snapshot.messages[1].status, 'stopped', 'Empty continuation does not mark an unfinished answer complete');
		const restored = new ChatSession(() => {}, () => 'safe error');
		restored.restore(session.snapshot);
		await restored.resume(id, async function* () { yield { type: 'text', text: ' suffix' }; restored.stop(); });
		assert.equal(restored.snapshot.messages[1].text, 'prefix suffix');
		assert.equal(restored.snapshot.messages[1].id, id);
		await restored.regenerate(id, async function* (messages) {
			assert.deepStrictEqual(messages, [{ role: 'user', content: 'question' }]);
			yield { type: 'text', text: 'replacement' };
		});
		assert.deepStrictEqual(restored.snapshot.messages.map(message => message.text), ['question', 'replacement']);
	});
	test('completed tool results survive pause and reload without replaying interrupted tools or reasoning', async () => {
		let saved: HistoryData | undefined;
		const history = new ChatHistory(undefined, async data => { saved = data; }, () => {}, () => 'error');
		await history.session.send('read file', async function* () {
			yield { type: 'activity', activity: { id: 'call', type: 'read-workspace-file', path: 'main.cpp', status: 'complete' } };
			yield { type: 'tool-result', result: { id: 'call', path: 'main.cpp', output: { ok: true, path: 'main.cpp', contents: 'int main() {}' } } };
			yield { type: 'activity', activity: { id: 'unfinished', type: 'read-workspace-file', path: 'other.cpp', status: 'running' } };
			yield { type: 'reasoning', text: 'private reasoning' };
			yield { type: 'text', text: 'This file' };
			history.session.stop();
		});
		await history.flush();
		const restored = new ChatHistory(saved, async () => {}, () => {}, () => 'error');
		const id = restored.snapshot.messages[1].id;
		await restored.session.resume(id, async function* (messages) {
			assert.deepStrictEqual(messages.map(message => message.role), ['user', 'assistant', 'tool', 'assistant', 'user']);
			assert.ok(JSON.stringify(messages).includes('int main() {}'));
			assert.ok(!JSON.stringify(messages).includes('other.cpp'));
			assert.ok(!JSON.stringify(messages).includes('private reasoning'));
			yield { type: 'activity', activity: { id: 'call', type: 'read-workspace-file', path: 'new.cpp', status: 'complete' } };
			yield { type: 'text', text: ' is C++.' };
		});
		assert.equal(restored.snapshot.messages[1].activities.length, 3, 'Continued tool IDs do not replace previous activities');
		await Promise.all([history.dispose(), restored.dispose()]);
	});
	test('regenerate replaces a failed reply without duplicating the user message or leaking errors', async () => {
		const session = new ChatSession(() => { }, () => 'safe error');
		await session.send('question', async function* () { yield { type: 'text', text: 'partial' }; throw new Error('secret'); });
		assert.equal(session.snapshot.error, 'safe error');
		await session.regenerate(session.snapshot.messages.at(-1)!.id, async function* (messages) { assert.deepStrictEqual(messages, [{ role: 'user', content: 'question' }]); yield { type: 'text', text: 'done' }; });
		assert.equal(session.snapshot.messages.length, 2);
		assert.equal(session.snapshot.messages[1].text, 'done');
		assert.equal(session.snapshot.error, '');
	});
	test('empty response can be regenerated; snapshots cannot mutate host history; new conversation clears memory', async () => {
		const session = new ChatSession(() => { }, () => 'empty');
		await session.send('question', async function* () { });
		assert.equal(session.snapshot.messages[1].status, 'error');
		await session.regenerate(session.snapshot.messages[1].id, async function* () { yield { type: 'text', text: 'answer' }; });
		assert.equal(session.snapshot.messages.length, 2);
		assert.equal(session.snapshot.messages[1].status, 'complete');
		session.snapshot.messages[0].text = 'changed';
		assert.equal(session.snapshot.messages[0].text, 'question');
		session.clear();
		assert.deepStrictEqual(session.snapshot, { messages: [], busy: false, error: '' });
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
			const selection = { provider, ...providers[provider], parameters: {}, apiKey: provider === 'ollama' ? undefined : 'test-key' };
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
			assert.deepStrictEqual(result, [{ id: 'a', provider }, { id: 'b', provider }]);
			assert.equal(pages, provider === 'bailian' ? 2 : 1);
		});
		if (provider === 'deepseek') { continue; }
		test(provider + ' streams only answer text through the installed adapter', async () => {
			const session = new ChatSession(() => {}, () => 'error');
			await session.send('hello', createGenerator(async () => ({ provider, ...providers[provider], model: 'selected-model', parameters: {}, apiKey: provider === 'ollama' ? undefined : 'test-key' }), async (url, options) => {
				assert.equal(String(url), providers[provider].baseURL + '/chat/completions');
				const body = JSON.parse(String(options?.body));
				assert.equal(body.model, 'selected-model');
				assert.equal(body.temperature, undefined);
				assert.equal(body.top_p, undefined);
				assert.equal(body.max_tokens, undefined);
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
		const connection = { provider: 'deepseek' as const, ...providers.deepseek, parameters: {}, apiKey: 'test-key' };
		await assert.rejects(listModels(connection, new AbortController().signal, async () => new Response('private details', { status: 401 })), { message: 'provider-request-failed', statusCode: 401 });
		await assert.rejects(listModels(connection, new AbortController().signal, async () => Response.json({ data: [null] })), /invalid-model-list/);
		const controller = new AbortController(); controller.abort();
		await assert.rejects(listModels(connection, controller.signal, async (_url, options) => { options?.signal?.throwIfAborted(); return Response.json({ data: [] }); }), { name: 'AbortError' });
	});
	test('model parameters are isolated by provider and model and invalid values are ignored or rejected', () => {
		let stored: unknown = {};
		stored = updateModelParameters(stored, 'deepseek', 'chat', 'temperature', 0.6);
		stored = updateModelParameters(stored, 'deepseek', 'chat', 'maxOutputTokens', 4096);
		stored = updateModelParameters(stored, 'moonshot', 'chat', 'topP', 0.8);
		assert.deepStrictEqual(readModelParameters(stored, 'deepseek', 'chat'), { temperature: 0.6, maxOutputTokens: 4096 });
		assert.deepStrictEqual(readModelParameters(stored, 'moonshot', 'chat'), { topP: 0.8 });
		assert.deepStrictEqual(readModelParameters(stored, 'deepseek', 'other'), {});
		stored = updateModelParameters(stored, 'deepseek', 'chat', 'temperature', null);
		assert.deepStrictEqual(readModelParameters(stored, 'deepseek', 'chat'), { maxOutputTokens: 4096 });
		assert.throws(() => updateModelParameters(stored, 'deepseek', 'chat', 'topP', 2), /invalid-model-parameter/);
		assert.deepStrictEqual(readModelParameters({ 'deepseek:chat': { temperature: 'secret', maxOutputTokens: -1 } }, 'deepseek', 'chat'), {});
	});
});

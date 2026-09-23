/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ChatSession, type Generate } from '../src/session';
import { createGenerator } from '../src/provider';
import { normalizeMath } from '../webview/math';

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
		await session.send('hello', createGenerator(async () => 'test-key', fetchMock));
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

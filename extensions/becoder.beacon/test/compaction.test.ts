/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ModelMessage } from 'ai';
import { effectiveUnits, prefixFingerprint, selectCompaction, projectCompaction, compactBeaconContext, type BeaconCompaction } from '../src/compaction';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { Message } from '../src/session';
import { ChatHistory, type HistoryData } from '../src/history';
import { createGenerator } from '../src/provider';
import { defaultCapabilities } from '../src/models';

const response = (text: string) => new Response('data: ' + JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: { content: text }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });

const source = { provider: 'fixture', baseURL: 'https://fixture.example', model: 'one' };
const messages = (): Message[] => Array.from({ length: 4 }, (_, index) => ({ id: index + 1, role: index % 2 ? 'assistant' : 'user', text: `original ${index}`, activities: [], status: 'complete' }));
test('compaction supplies the retained current question once when it also belongs to the covered prefix', async () => {
	const question: ModelMessage = { role: 'user', content: 'CURRENT_QUESTION:' + 'x'.repeat(28500) };
	const units = [{ key: '1:user', messageId: 1, unitIndex: 0, isUserQuestion: true, messages: [question], fingerprint: 'current' }];
	let calls = 0;
	const model = createOpenAICompatible({ name: 'fixture', baseURL: 'https://fixture.example', apiKey: 'synthetic', fetch: async (_url, init) => {
		calls++; const body = JSON.parse(String(init?.body));
		assert.equal(JSON.stringify(body.messages).split('CURRENT_QUESTION:').length - 1, 1);
		return response('{"summary":"The original current question remains in the retained tail."}');
	} })('one');
	const result = await compactBeaconContext({ model, units, tail: [question, { role: 'tool', content: [] }], steps: { remaining: 20 }, prepared: { source, phase: 'compaction', limits: { contextWindow: 65536, maxInputTokens: 49152, maxOutputTokens: 4096 }, instructions: 'test', activeTools: [], messages: [], media: [], projectionFingerprint: 'p', contractFingerprint: 'c', unitFingerprints: [] } }, new AbortController().signal);
	assert.ok(result.summary); assert.equal(calls, 1);
});
test('summary is valid across tail edits and append, but invalid inside covered prefix', () => {
	const raw = messages(), units = effectiveUnits(raw, source);
	const checkpoint: BeaconCompaction = { schemaVersion: 1, summary: 'Earlier discussion', createdAt: 1, coveredThrough: { messageId: units[1].messageId, unit: units[1].unitIndex }, prefixSha256: prefixFingerprint(units.slice(0, 2)) };
	assert.deepEqual(selectCompaction(units, [checkpoint]), checkpoint);
	raw[3].text = 'tail edited'; raw.push({ id: 5, role: 'user', text: 'append', activities: [], status: 'complete' });
	assert.deepEqual(selectCompaction(effectiveUnits(raw, source), [checkpoint]), checkpoint);
	raw[0].text = 'changed permission'; assert.equal(selectCompaction(effectiveUnits(raw, source), [checkpoint]), undefined);
});
test('summary projection leaves raw messages untouched and retains current question', () => {
	const raw = messages(), before = structuredClone(raw), units = effectiveUnits(raw, source);
	const checkpoint: BeaconCompaction = { schemaVersion: 1, summary: 'earlier', createdAt: 1, coveredThrough: { messageId: units[2].messageId, unit: units[2].unitIndex }, prefixSha256: prefixFingerprint(units.slice(0, 3)) };
	const projected = JSON.stringify(projectCompaction(units, checkpoint));
	assert.ok(projected.includes('earlier')); assert.ok(projected.includes('original 2')); assert.deepEqual(raw, before);
});

for (const needsCompaction of [false, true]) {
	test(`resuming a compacted answer retains the original question and attachment (${needsCompaction ? 'another compaction' : 'saved summary'})`, async () => {
		const connection = { provider: 'deepseek' as const, baseURL: 'https://fixture.example', model: 'one', apiKey: 'synthetic', parameters: {}, capabilities: { ...defaultCapabilities, tools: true } };
		const question = 'Explain why the loop at line 17 skips the final element.';
		const attachment = 'User requirement: preserve the existing loop structure.';
		const protocol: ModelMessage[] = [];
		for (let index = 0; index < 2; index++) {
			protocol.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: `read-${index}`, toolName: 'inspectContext', input: { operation: 'currentCode' } }] }, { role: 'tool', content: [{ type: 'tool-result', toolCallId: `read-${index}`, toolName: 'inspectContext', output: { type: 'json', value: { ok: true, contents: index === 1 ? 'retained-tail-code:' + 'x'.repeat(needsCompaction ? 18000 : 20) : 'earlier code' } } }] });
		}
		protocol.push({ role: 'assistant', content: [{ type: 'text', text: 'accepted prefix' }] });
		const raw: Message[] = [
			{ id: 1, role: 'user', text: question, attachments: [{ id: 'note', name: 'note.txt', path: 'C:\\workspace\\note.txt', source: 'picker', kind: 'text', contents: attachment, truncated: false }], activities: [], status: 'complete' },
			{ id: 2, role: 'assistant', text: 'accepted prefix', activities: [], status: 'stopped', protocol: [{ provider: connection.provider, baseURL: connection.baseURL, model: connection.model, messages: protocol, stepEnds: [{ stepId: 'first', end: 2 }, { stepId: 'second', end: 4 }] }] }
		];
		const units = effectiveUnits(raw, connection);
		const checkpoint: BeaconCompaction = { schemaVersion: 1, summary: 'The first code inspection completed.', createdAt: 1, coveredThrough: { messageId: 2, unit: 0 }, prefixSha256: prefixFingerprint(units.slice(0, 2)) };
		const history = new ChatHistory({ version: 1, activeId: 'chat', conversations: [{ id: 'chat', title: 'paused answer', updatedAt: 1, error: '', workspace: [], messages: raw, compaction: checkpoint }] }, async data => data, () => { }, String);
		const summaryInputs: string[] = [], answerInputs: string[] = [];
		try {
			await history.session.resume(2, createGenerator(async () => connection, async (_url, init) => {
				const body = JSON.parse(String(init?.body)), input = JSON.stringify(body.messages);
				if (body.messages[0].content.startsWith('Summarize')) { summaryInputs.push(input); return response(JSON.stringify({ summary: 'The earlier code reads completed; the loop explanation is unfinished.' })); }
				answerInputs.push(input); return response(' suffix');
			}, 'none', [], false), connection);
			assert.equal(history.snapshot.error, '');
			assert.equal(summaryInputs.length, needsCompaction ? 1 : 0);
			assert.equal(answerInputs.length, 1);
			for (const input of [...summaryInputs, ...answerInputs]) {
				assert.ok(input.includes(question), 'Every prepared request retains the actual current user question');
				assert.ok(input.includes(attachment), 'The current question retains its original attachment');
				assert.ok(input.includes('appended directly'), 'The continuation instruction is retained alongside the question');
			}
			assert.equal(history.snapshot.messages[1].text, 'accepted prefix suffix');
		} finally { await history.dispose(); }
	});
}

for (const provider of ['deepseek', 'bailian'] as const) {
	test(`compaction respects unsupported model tools in the final SDK input (${provider})`, async () => {
		const history = new ChatHistory(undefined, async data => data, () => { }, String);
		const connection = { provider, baseURL: 'https://fixture.example', model: 'one', apiKey: 'synthetic', parameters: {}, capabilities: { ...defaultCapabilities, tools: false } };
		const requests: { summary: boolean; tools: unknown[] }[] = [];
		try {
			for (let index = 0; index < 4; index++) { await history.session.send('Q' + index + 'x'.repeat(2500), async function* () { yield { type: 'text', text: 'A' + index + 'y'.repeat(2500) }; }); }
			await history.session.send('current question', createGenerator(async () => connection, async (_url, init) => {
				const body = JSON.parse(String(init?.body)), summary = body.messages[0].content.startsWith('Summarize');
				requests.push({ summary, tools: body.tools ?? [] });
				return response(summary ? JSON.stringify({ summary: 'Earlier conceptual questions were explained.' }) : 'new answer');
			}, 'none', [], false, fetch, {}, {
				describe: async () => '', execute: async () => { throw new Error('No tool call is expected'); },
				compactionView: () => ({ operations: ['codeSnapshot'], describe: async () => '', execute: async () => { throw new Error('No compaction tool call is expected'); } })
			}), connection);
			assert.equal(history.snapshot.error, '');
			assert.deepEqual(requests.map(request => request.summary), [true, false]);
			assert.deepEqual(requests.map(request => request.tools), [[], []], 'Neither compaction nor the ordinary request may advertise unsupported tools');
			assert.equal(history.snapshot.messages.at(-1)?.text, 'new answer');
		} finally { await history.dispose(); }
	});
}
	test('compaction preserves an unknown image in the retained tail as a media part', async () => {
		let calls = 0, hasImage = false;
		const image = 'data:image/png;base64,' + 'A'.repeat(50000);
		const model = createOpenAICompatible({ name: 'fixture', baseURL: 'https://fixture.example', apiKey: 'synthetic', fetch: async (_url, init) => { calls++; const body = JSON.parse(String(init?.body)); hasImage = body.messages.some((message: { content: unknown }) => Array.isArray(message.content) && message.content.some((part: { type: string }) => part.type === 'image_url')); return response('{"summary":"earlier discussion"}'); } })('one');
		const units = effectiveUnits(messages().slice(0, 2), source);
		const result = await compactBeaconContext({ model, units, tail: [{ role: 'user', content: [{ type: 'text', text: 'current question with image' }, { type: 'image', image, mediaType: 'image/png' }] }], steps: { remaining: 20 }, prepared: { source, phase: 'compaction', limits: { contextWindow: 32768, maxInputTokens: 24576, maxOutputTokens: 8192 }, instructions: 'test', activeTools: [], messages: [], media: [], projectionFingerprint: 'p', contractFingerprint: 'c', unitFingerprints: [] } }, new AbortController().signal);
		assert.equal(result.summary, 'earlier discussion'); assert.equal(calls, 1); assert.equal(hasImage, true);
	});

test('real summary waits for confirmed save, keeps raw history and survives restart', async () => {
	let stored: HistoryData | undefined, release!: () => void, saving!: () => void;
	const saved = new Promise<void>(resolve => { saving = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
	const history = new ChatHistory(undefined, async data => { if (data.conversations[0]?.compaction) { saving(); await gate; } stored = structuredClone(data); return data; }, () => { }, String);
	for (let index = 0; index < 4; index++) { await history.session.send('Q' + index + 'x'.repeat(2500), async function* () { yield { type: 'text', text: 'A' + index + 'y'.repeat(2500) }; }); }
	const connection = { provider: 'deepseek' as const, baseURL: 'https://fixture.example', model: 'one', apiKey: 'synthetic', parameters: {}, capabilities: { ...defaultCapabilities, tools: false } };
	let summaries = 0, answers = 0;
	const request: typeof fetch = async (_url, init) => {
		const body = JSON.parse(String(init?.body)), system = body.messages[0].content as string;
		if (system.startsWith('Summarize')) { summaries++; return response(JSON.stringify({ summary: 'Earlier conceptual questions were explained. No extra user permissions.' })); }
		answers++; assert.ok(JSON.stringify(body.messages).includes('Earlier conceptual questions')); assert.ok(!JSON.stringify(body.messages).includes('x'.repeat(2500))); return response('new answer');
	};
	const pending = history.session.send('current question', createGenerator(async () => connection, request, 'none', [], false), connection);
	await saved; assert.equal(answers, 0); assert.equal(history.currentConversation?.compaction, undefined);
	release(); await pending; await history.flush();
	assert.equal(history.snapshot.error, ''); assert.equal(summaries, 1); assert.equal(answers, 1); assert.ok(stored?.conversations[0].messages[0].text.includes('x'.repeat(2500))); assert.ok(stored?.conversations[0].compaction);
	const restored = new ChatHistory(stored, async data => data, () => { }, String);
	await restored.session.send('another question', createGenerator(async () => connection, request, 'none', [], false), connection);
	assert.equal(restored.snapshot.error, ''); assert.equal(summaries, 1); await history.dispose(); await restored.dispose();
});

test('failed summary save stays absent from later ordinary flush and restart', async () => {
	let stored: HistoryData | undefined, rejected = false;
	const history = new ChatHistory(undefined, async data => { if (data.conversations[0]?.compaction) { rejected = true; throw new Error('disk-full'); } stored = structuredClone(data); return data; }, () => { }, String);
	for (let index = 0; index < 4; index++) { await history.session.send('Q' + index + 'x'.repeat(2500), async function* () { yield { type: 'text', text: 'A' + index + 'y'.repeat(2500) }; }); }
	const connection = { provider: 'deepseek' as const, baseURL: 'https://fixture.example', model: 'one', apiKey: 'synthetic', parameters: {}, capabilities: { ...defaultCapabilities, tools: false } };
	await history.session.send('current question', createGenerator(async () => connection, async () => response(JSON.stringify({ summary: 'short summary' })), 'none', [], false), connection);
	assert.equal(rejected, true); assert.ok(history.snapshot.error); assert.equal(history.currentConversation?.compaction, undefined);
	await history.flush(); assert.equal(stored?.conversations[0].compaction, undefined); assert.equal(new ChatHistory(stored, async () => { }, () => { }, String).currentConversation?.compaction, undefined); await history.dispose();
});

test('ordinary and compaction model steps share the same twenty-step ceiling', async () => {
	let calls = 0, summaries = 0, executions = 0;
	const history = new ChatHistory(undefined, async data => data, () => { }, String);
	const connection = { provider: 'deepseek' as const, baseURL: 'https://fixture.example', model: 'one', apiKey: 'synthetic', parameters: {}, capabilities: { ...defaultCapabilities, tools: true, contextWindow: 100000, maxInputTokens: 90000, maxOutputTokens: 8192 } };
	await history.session.send('Keep reading the actual material', createGenerator(async () => connection, async (_url, init) => {
		calls++; const body = JSON.parse(String(init?.body));
		if (body.messages[0].content.startsWith('Summarize')) { summaries++; return response(JSON.stringify({ summary: 'Earlier bounded material was read; no extra permissions.' })); }
		return new Response('data: ' + JSON.stringify({ id: 'loop', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'reused', type: 'function', function: { name: 'inspectContext', arguments: '{"operation":"currentCode"}' } }] }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'loop', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
	}, 'none', [], false, fetch, {}, { describe: async () => '', execute: async () => { executions++; return { ok: true, contents: `read ${executions}:` + 'x'.repeat(4000) }; } }), connection);
	assert.ok(summaries > 0); assert.ok(calls <= 20); assert.equal(calls, summaries + executions); assert.ok(history.snapshot.error); await history.dispose();
});

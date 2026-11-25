/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContextTools } from '../src/contextTools';
import { BeaconContextClient } from '../src/context';
import { createGenerator } from '../src/provider';
import { defaultCapabilities } from '../src/models';
import { contextToolNames, contextInputValid, type BeaconContextToolName } from '../src/contextToolContract';

const state = { slot: 'fixture', root: 'C:/practice', mode: 'spot', workspaceState: 'ready', usable: true, epoch: 1, busy: false, runtimeBusy: false, activeId: 'chat', recent: [] };
const signal = new AbortController().signal;
interface FixtureOutput { files: { code: string }[]; records: { program: { code?: string }; problem?: unknown }[]; record: { program: { code: string } }; error?: unknown }
const execute = (tools: ContextTools, name: string, input: object = {}) => tools.execute(name as BeaconContextToolName, input as Record<string, unknown>, signal) as unknown as Promise<FixtureOutput>;

test('semantic current code reads complete fresh visible files without any save operation', async () => {
	let code = 'x'.repeat(200000); const calls: string[] = [];
	const client = new BeaconContextClient(async operation => { if (operation === 'context') { return state; } calls.push(operation); if (operation === 'visibleCurrentCode') { return [{ fileName: 'A.cpp', filePath: 'C:/practice/A.cpp', isDirty: true, code }]; } throw new Error(operation); });
	await client.refresh(); const tools = new ContextTools(client, client.captureScope());
	assert.strictEqual((await execute(tools, 'readCurrentCode')).files[0].code.length, 200000);
	code = 'changed'; assert.strictEqual((await execute(tools, 'readCurrentCode')).files[0].code, 'changed');
	assert.deepStrictEqual(calls, ['visibleCurrentCode', 'visibleCurrentCode']);
});

test('record tools list on demand, read whole ID records, and pin only this answer without copying into private storage', async () => {
	let lists = 0, reads = 0, copies = 0;
	const record = { id: 'run', source: 'runner', operation: 'run', program: { filePath: 'C:/practice/A.cpp', code: 'original' }, compile: { status: 'succeeded' }, runs: [{ input: { mode: 'text', text: '' }, status: 'completed', output: { merged: '' } }], startedAt: 'time', endedAt: 'time', status: 'completed' };
	const client = new BeaconContextClient(async operation => { if (operation === 'context') { return state; } if (operation === 'pages') { return []; } if (operation === 'listRecords') { lists++; return [record]; } if (operation === 'readRecord') { reads++; return structuredClone(record); } throw new Error(operation); });
	await client.refresh(); const tools = new ContextTools(client, client.captureScope(), [], { capturePrivate: () => { copies++; } });
	await tools.describe(signal); assert.strictEqual(lists, 0);
	const listing = await execute(tools, 'readRunRecord'); assert.strictEqual(listing.records[0].program.code, undefined); assert.strictEqual(listing.records[0].problem, undefined);
	const first = await execute(tools, 'readRunRecord', { id: 'run' }); record.program.code = 'changed';
	assert.strictEqual((await execute(tools, 'readRunRecord', { id: 'run' })).record.program.code, first.record.program.code);
	assert.strictEqual(reads, 1); assert.strictEqual(copies, 0);
	const compact = tools.compactionView()!;
	assert.ok((await execute(compact as ContextTools, 'readRunRecord')).error);
	assert.ok((await execute(compact as ContextTools, 'readRunRecord', { id: 'other' })).error);
	assert.strictEqual((await execute(compact as ContextTools, 'readRunRecord', { id: 'run' })).record.program.code, 'original');
});

test('invalid selectors fail before reads and Blackout cannot consume queue records', async () => {
	let reads = 0;
	const client = new BeaconContextClient(async operation => { if (operation === 'context') { return { ...state, mode: 'blackout', workspaceState: 'blackout' }; } reads++; throw new Error(operation); });
	await client.refresh(); const tools = new ContextTools(client, client.captureScope());
	assert.ok((await execute(tools, 'readRunRecord', { id: 'r' })).error);
	assert.ok((await execute(tools, 'readCurrentCode', { pageId: 'r' })).error);
	assert.strictEqual(reads, 0);
});

test('provider registers independent semantic tools and no legacy writer or operation union', async () => {
	const client = new BeaconContextClient(async operation => operation === 'context' ? state : []); await client.refresh();
	const tools = new ContextTools(client, client.captureScope()); let names: string[] = [];
	const generator = createGenerator(async () => ({ provider: 'deepseek', baseURL: 'https://fixture.invalid', apiKey: 'synthetic', model: 'fixture', parameters: {}, capabilities: { ...defaultCapabilities, source: 'service' } }), async (_url, options) => {
		const body = JSON.parse(String(options?.body)); names = (body.tools ?? []).map((tool: { function: { name: string } }) => tool.function.name).sort();
		return new Response('data: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'one', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
	}, 'workspace', [{ name: 'practice', path: 'C:/practice' }], true, undefined, {}, tools);
	for await (const result of generator([{ role: 'user', content: 'Explain.' }], signal, async input => ({ ok: false, path: input.path, error: 'unused' }))) { void result; }
	assert.deepStrictEqual(names, ['browseWeb', 'fetchProblem', 'inspectFile', 'readCurrentCode', 'readMaterial', 'readPage', 'readProblemRecord', 'readRunRecord', 'readVerdictRecord'].sort());
});

test('each semantic schema accepts its own request and rejects nulls, selectors and unknown fields', () => {
	for (const name of contextToolNames) {
		const input = name === 'fetchProblem' ? { oj: 'luogu', problemId: 'P1001' } : name === 'readPage' ? { id: 'page', version: '1' } : name === 'readMaterial' ? { id: 'page:p:1:' } : {};
		assert.equal(contextInputValid(name, input), true);
		assert.equal(contextInputValid(name, { ...input, producer: 'runner' }), false);
		assert.equal(contextInputValid(name, null), false);
	}
	for (const value of [null, '', '   ', 1]) { assert.equal(contextInputValid('readRunRecord', { id: value }), false); }
	assert.equal(contextInputValid('fetchProblem', { oj: 'other', problemId: '1' }), false);
});

test('concurrent first reads share one fixed body and a failed first read can be retried', async () => {
	let reads = 0, reject = true;
	const client = new BeaconContextClient(async operation => {
		if (operation === 'context') { return state; }
		if (operation === 'readRecord') { reads++; await Promise.resolve(); if (reject) { throw new Error('missing'); } return { id: 'run', program: { code: 'fixed' } }; }
		throw new Error(operation);
	});
	await client.refresh(); const tools = new ContextTools(client, client.captureScope());
	assert.ok((await execute(tools, 'readRunRecord', { id: 'run' })).error); reject = false;
	const results = await Promise.all([execute(tools, 'readRunRecord', { id: 'run' }), execute(tools, 'readRunRecord', { id: 'run' })]);
	assert.equal(reads, 2); assert.deepEqual(results[0], results[1]);
});

test('compaction permits fixed material and records but never new code, directories or network', async () => {
	const client = new BeaconContextClient(async operation => operation === 'context' ? state : []);
	await client.refresh(); const tools = new ContextTools(client, client.captureScope()).compactionView();
	for (const [name, input] of [['readCurrentCode', {}], ['fetchProblem', { oj: 'luogu', problemId: 'P1001' }], ['readProblemRecord', {}], ['readVerdictRecord', { id: 'unknown' }]] as const) {
		assert.ok((await tools.execute(name, input, signal)).error);
	}
});

test('Blackout fetches canonical statements without saving records or requiring web search', async () => {
	const operations: string[] = [];
	const client = new BeaconContextClient(async operation => { operations.push(operation); if (operation === 'context') { return { ...state, mode: 'blackout', workspaceState: 'blackout' }; } return []; });
	await client.refresh(); let fetched = 0;
	const tools = new ContextTools(client, client.captureScope(), [], {
		resolveProblemId: async (oj, problemId) => ({ site: oj, nativeId: problemId, url: 'https://www.luogu.com.cn/problem/P1001' }),
		readProblem: async ref => { fetched++; return { ref, title: 'A+B', bodies: [], samples: [], limits: [], interactive: false }; }
	});
	const result = await tools.execute('fetchProblem', { oj: 'luogu', problemId: 'P1001' }, signal);
	assert.equal(result.error, undefined); assert.equal(fetched, 1); assert.ok(operations.every(name => name === 'context'));
	assert.deepEqual(tools.names, ['readCurrentCode', 'fetchProblem', 'readPage']);
});

test('cancellation and root replacement never fix or return a record body', async () => {
	for (const cancelled of [true, false]) {
		let current = { ...state }; const abort = new AbortController();
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return current; }
			if (cancelled) { abort.abort(); } else { current = { ...current, epoch: 2 }; }
			return { id: 'run', program: { code: 'must-not-deliver' } };
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		if (cancelled) { await assert.rejects(tools.execute('readRunRecord', { id: 'run' }, abort.signal)); }
		else { assert.ok((await tools.execute('readRunRecord', { id: 'run' }, signal)).error); }
		assert.ok((await tools.compactionView().execute('readRunRecord', { id: 'run' }, signal)).error);
	}
});

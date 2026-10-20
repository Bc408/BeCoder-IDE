/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BeaconContextClient, withPdfPages } from '../src/context';
import { ContextTools, redactContext, type ContextSnapshot } from '../src/contextTools';
import { NotebookTools } from '../src/notebookTools';
import { createGenerator } from '../src/provider';
import { ChatSession } from '../src/session';
import { readHistory } from '../src/history';
import { resolveCapabilities } from '../src/models';
import type { Connection } from '../src/connection';
import type { IBeaconContext } from '../../../src/vs/platform/beacon/common/beaconContextTypes';

const selected = (): IBeaconContext => ({ slot: 'one', root: 'C:\\chosen', usable: true, workspaceState: 'ready', mode: 'spot', epoch: 2, busy: false, runtimeBusy: false, activeId: 'conversation-one', recent: ['C:\\chosen'] });

suite('Beacon native context consumer', () => {
	test('request admission refreshes runtime activity without mistaking its own preparation for a run', async () => {
		let running = false;
		const client = new BeaconContextClient(async () => ({ ...selected(), busy: true, runtimeBusy: running }));
		await client.refreshForRequest();
		running = true;
		await assert.rejects(client.refreshForRequest(), /beacon-runtime-busy/);
		running = false;
		await client.refreshForRequest();
	});
	test('request admission blocks running producers even without a persistent workspace', async () => {
		const client = new BeaconContextClient(async () => ({ slot: 'one', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: true, runtimeBusy: true, recent: [] }));
		await assert.rejects(client.refreshForRequest(), /beacon-runtime-busy/);
	});
	test('page provenance pins the complete captured text across redacted range reads', async () => {
		const raw = 'api_key="private-token";\ncurrent dirty code';
		const page = { id: 'page', kind: 'text', title: 'main.cpp', uri: 'file:///C:/chosen/main.cpp', version: '2', dirty: true };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : operation === 'pages' ? [page] : { ...page, contents: raw, totalCharacters: raw.length });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		const first = await tools.execute({ operation: 'page', id: 'page', version: '2', limit: 5 }, signal);
		const next = await tools.execute({ operation: 'page', id: 'page', version: '2', offset: first.nextOffset as number }, signal);
		const source = first.source;
		assert.equal(source?.kind, 'page'); assert.equal(source?.id, 'page'); assert.equal(source?.version, '2');
		assert.equal(source?.origin, page.uri); assert.equal(source?.contentSha256, createHash('sha256').update(raw).digest('hex'));
		assert.equal(typeof source?.capturedAt, 'number'); assert.deepEqual(next.source, source);
		assert.equal(first.truncated, true); assert.equal(first.redacted, true); assert.equal(JSON.stringify([first, next]).includes('private-token'), false);
	});
	test('runtime provenance survives material rereads and distinguishes material hash from source hash', async () => {
		const sourceHash = 'a'.repeat(64);
		const record = { id: 'run', materialId: 'runner-run-3', revision: 3, startedAt: 1, sequence: 2, code: 'V1', events: [{ type: 'compile-attempt', sourceSnapshot: { originalPath: 'C:\\chosen\\main.cpp', sha256: sourceHash, complete: false } }] };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : record);
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		const first = await tools.execute({ operation: 'record', producer: 'runner', id: 'run', revision: 3, part: 'code' }, signal);
		const next = await tools.execute({ operation: 'material', id: record.materialId, part: 'events' }, signal);
		const source = first.source;
		assert.equal(source?.kind, 'runtime'); assert.equal(source?.producer, 'runner'); assert.equal(source?.id, 'run'); assert.equal(source?.revision, 3);
		assert.equal(source?.origin, 'C:\\chosen\\main.cpp'); assert.equal(source?.sourceSha256, sourceHash); assert.equal(source?.partial, true);
		assert.match(String(source?.contentSha256), /^[a-f0-9]{64}$/); assert.notEqual(source?.contentSha256, sourceHash); assert.deepEqual(next.source, source);
	});
	test('SDK context failures retain a safe actionable code in activity and saved history', async () => {
		const connection: Connection = { provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test', parameters: {}, capabilities: { ...resolveCapabilities('deepseek', 'https://api.deepseek.com/v1', 'deepseek-chat'), tools: 'supported' } };
		let requests = 0; const session = new ChatSession(() => {}, () => 'error');
		const generator = createGenerator(async () => connection, async () => {
			const delta = ++requests === 1 ? { tool_calls: [{ index: 0, id: 'context-failed', type: 'function', function: { name: 'inspectContext', arguments: JSON.stringify({ operation: 'page', id: 'page', version: '2' }) } }] } : { content: 'Please reopen the page.' };
			return new Response('data: ' + JSON.stringify({ id: 'test', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: requests === 1 ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		}, 'none', [], false, undefined, {}, { describe: async () => 'test context', execute: async () => ({ ok: false, code: 'beacon-page-closed', error: 'private-token must never enter the activity' }) });
		await session.send('Explain the page.', generator);
		assert.equal(session.snapshot.error, '');
		assert.deepEqual(session.snapshot.messages[1].activities, [{ id: 'context-failed', type: 'read', path: 'page', status: 'error', error: 'page-closed' }]);
		const history = readHistory({ version: 1, activeId: 'chat', conversations: [{ id: 'chat', title: 'test', updatedAt: 1, error: '', workspace: [], messages: session.snapshot.messages }] });
		assert.equal(history.conversations[0].messages[1].activities[0].error, 'page-closed');
		assert.equal(JSON.stringify(history.conversations[0].messages[1].activities).includes('private-token'), false);
		const missingActivities = structuredClone(history);
		delete (missingActivities.conversations[0].messages[1] as Partial<typeof session.snapshot.messages[number]>).activities;
		assert.throws(() => readHistory(missingActivities), /invalid-history/);
	});
	test('complete source capture does not hide omitted events or claim an unfinished run is complete', async () => {
		for (const [events, partial] of [
			[[{ type: 'partial-event', partial: true }], true],
			[[], undefined],
			[[{ type: 'finished', coverage: { truncated: false } }], false],
			[[{ type: 'finished', coverage: { truncated: true } }], true]
		] as const) {
			const record = { id: 'run', materialId: 'runner-run-1', revision: 1, startedAt: 1, sequence: 1, code: 'V1', events: [{ type: 'compile-attempt', sourceSnapshot: { complete: true } }, ...events] };
			const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : record);
			await client.refresh();
			const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'runner', id: 'run', revision: 1 }, new AbortController().signal);
			assert.equal(result.source?.partial, partial);
		}
	});
	test('late cancelled begin retains a failed cleanup handle until request retirement', async () => {
		const controller = new AbortController(); const actions: string[] = []; let cancels = 0;
		const tools = new NotebookTools(async () => ({ edit: async input => {
			actions.push(input.operation);
			if (input.operation === 'begin') { controller.abort(); return { handle: 'owned', revision: 1 }; }
			return ++cancels === 1 ? { released: false, error: 'release unavailable' } : { released: true };
		} }), selected());
		await assert.rejects(tools.execute({ operation: 'begin', path: 'note.bcnb' }, controller.signal));
		await tools.close();
		assert.deepEqual(actions, ['begin', 'cancel', 'cancel']);
	});
	test('cleanup continues through independent handles when one release fails', async () => {
		const cancelled: string[] = []; let next = 0; let fail = true;
		const tools = new NotebookTools(async () => ({ edit: async input => {
			if (input.operation === 'begin') { return { handle: String(++next), revision: 1 }; }
			cancelled.push(input.handle!);
			return input.handle === '1' && fail ? { released: false, error: 'release unavailable' } : { released: true };
		} }), selected());
		await tools.execute({ operation: 'begin', path: 'first.bcnb' }, new AbortController().signal);
		await tools.execute({ operation: 'begin', path: 'second.bcnb' }, new AbortController().signal);
		await assert.rejects(tools.close(), /release unavailable/);
		assert.deepEqual(cancelled, ['1', '2']);
		fail = false; await tools.close(); assert.deepEqual(cancelled, ['1', '2', '1']);
	});
	test('Notebook material budget counts UTF-8 bytes while ranges remain characters', async () => {
		const tools = new NotebookTools(async () => ({ edit: async input => input.operation === 'begin' ? { handle: 'one', revision: 1 } : input.operation === 'read' ? { text: '中'.repeat(131072) } : { released: true } }), selected());
		const signal = new AbortController().signal;
		await tools.execute({ operation: 'begin', path: 'note.bcnb' }, signal);
		for (let index = 0; index < 21; index++) { const result = await tools.execute({ operation: 'read', handle: 'one', limit: 131072 }, signal); assert.equal(result.ok, true); assert.equal(String(result.text).length, 131072); }
		const rejected = await tools.execute({ operation: 'read', handle: 'one', limit: 131072 }, signal);
		assert.equal(rejected.ok, false); assert.equal(rejected.error, 'notebook-context-budget'); await tools.close();
	});
	test('open PDF uses existing page tool in blackout, isolates page snapshots and checks access before extraction', async () => {
		let version = '0'; let opened = true; let denied = false; let reads = 0;
		const scope: IBeaconContext = { slot: 'one', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, recent: [] };
		const api = {
			listPages: () => opened ? [{ id: 'pdf:one', kind: 'pdf' as const, uri: 'file:///C:/outside/task.pdf', title: 'task.pdf', version, pageCount: 3 }] : [],
			readPage: async (_id: string, _version: string, pageNumber: number) => { reads++; return { ...api.listPages()[0], contents: pageNumber === 1 ? 'api_key=private-token\nfirst page' : 'second page', totalCharacters: 20 }; }
		};
		const client = new BeaconContextClient(withPdfPages(async operation => {
			if (operation === 'context') { return scope; }
			if (operation === 'pages') { return [{ id: 'native-duplicate', kind: 'unsupported', uri: 'file:///C:/outside/task.pdf', version: 'native', reason: 'beacon-page-provider-unavailable' }]; }
			if (operation === 'checkPageAccess') { if (denied) { throw new Error('beacon-protected-page'); } return; }
			throw new Error('unexpected backing-file or native page read');
		}, () => api));
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		const listed = await tools.execute({ operation: 'pages' }, signal); assert.equal((listed.pages as unknown[]).length, 1);
		assert.equal((await tools.execute({ operation: 'page', id: 'pdf:one', version }, signal)).ok, false);
		const first = await tools.execute({ operation: 'page', id: 'pdf:one', version, pageNumber: 1, limit: 3 }, signal); assert.equal(first.ok, true); assert.equal(first.pageNumber, 1); assert.equal(first.source?.pageNumber, 1);
		const all = await tools.execute({ operation: 'page', id: 'pdf:one', version, pageNumber: 1 }, signal); assert.equal(String(all.contents).includes('private-token'), false); assert.equal(reads, 1);
		const second = await tools.execute({ operation: 'page', id: 'pdf:one', version, pageNumber: 2 }, signal); assert.equal(second.contents, 'second page'); assert.equal(reads, 2);
		assert.equal((await tools.execute({ operation: 'page', id: 'pdf:one', version, pageNumber: 4 }, signal)).ok, false);
		denied = true; assert.equal((await tools.execute({ operation: 'page', id: 'pdf:one', version, pageNumber: 3 }, signal)).ok, false); assert.equal(reads, 2);
		denied = false; version = '1'; assert.equal((await tools.execute({ operation: 'page', id: 'pdf:one', version: '0', pageNumber: 1 }, signal)).code, 'beacon-page-changed');
		opened = false; assert.equal((await tools.execute({ operation: 'page', id: 'pdf:one', version, pageNumber: 1 }, signal)).code, 'beacon-page-closed');
	});
	test('real SDK advertises Notebook create and retains the actual saved result in conversation protocol', async () => {
		const connection: Connection = { provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test', parameters: {}, capabilities: { ...resolveCapabilities('deepseek', 'https://api.deepseek.com/v1', 'deepseek-chat'), tools: 'supported' } };
		let requests = 0; const actions: string[] = []; const session = new ChatSession(() => {}, () => 'error');
		const notebooks = new NotebookTools(async () => ({ edit: async input => { actions.push(input.operation); return { created: true, saved: true, opened: true, path: input.path }; } }), selected());
		const generator = createGenerator(async () => connection, async (_url, init) => {
			const body = JSON.parse(String(init?.body)); requests++;
			const tool = body.tools.find((item: { function: { name: string } }) => item.function.name === 'editNotebook');
			assert.ok(tool.function.parameters.properties.operation.enum.includes('create'));
			assert.ok(tool.function.parameters.properties.sourcePath);
			const delta = requests === 1 ? { tool_calls: [{ index: 0, id: 'create-call', type: 'function', function: { name: 'editNotebook', arguments: JSON.stringify({ operation: 'create', path: 'C:\\chosen\\note.bcnb', cells: [{ kind: 1, source: '# notes' }] }) } }] } : { content: 'Saved the note.' };
			return new Response('data: ' + JSON.stringify({ id: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: requests === 1 ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		}, 'workspace', [], false, undefined, {}, undefined, notebooks);
		await session.send('Create the requested note.', generator);
		assert.equal(session.snapshot.error, ''); assert.deepEqual(actions, ['create']);
		assert.ok(JSON.stringify(session.snapshot.messages[1].protocol).includes('"saved":true')); await notebooks.close();
	});
	test('Notebook create needs no rewrite handle and cancelled requests never start it', async () => {
		const actions: string[] = [];
		const tools = new NotebookTools(async () => ({ edit: async input => { actions.push(input.operation); return { created: true, saved: true, path: input.path }; } }), selected());
		const input = { operation: 'create', path: 'C:\\chosen\\new.bcnb', cells: [{ kind: 1, source: '# note' }] } as unknown as Parameters<NotebookTools['execute']>[0];
		assert.equal((await tools.execute(input, new AbortController().signal)).ok, true);
		assert.deepEqual(actions, ['create']);
		const aborted = new AbortController(); aborted.abort(); await assert.rejects(tools.execute(input, aborted.signal));
		assert.deepEqual(actions, ['create']); await tools.close();
		const blackout = new NotebookTools(async () => { throw new Error('must not load'); }, { ...selected(), usable: false, mode: 'blackout' });
		assert.equal((await blackout.execute(input, new AbortController().signal)).ok, false); await blackout.close();
	});
	test('a created Notebook with failed release retains a cleanup handle until request cleanup succeeds', async () => {
		const actions: string[] = [];
		const tools = new NotebookTools(async () => ({ edit: async input => { actions.push(input.operation); return input.operation === 'create' ? { handle: 'cleanup-only', created: true, saved: true, released: false, error: 'release failed' } : { released: true }; } }), selected());
		const result = await tools.execute({ operation: 'create', path: 'C:\\chosen\\new.bcnb', cells: [{ kind: 1, source: 'notes' }] }, new AbortController().signal);
		assert.equal(result.saved, true); assert.equal(result.ok, false); await tools.close(); assert.deepEqual(actions, ['create', 'cancel']);
	});
	test('Notebook request handles stay local and request retirement cancels a late begin', async () => {
		let finishBegin!: () => void; let beginStarted!: () => void; const started = new Promise<void>(resolve => { beginStarted = resolve; }); const ready = new Promise<void>(resolve => { finishBegin = resolve; }); const actions: string[] = [];
		const tools = new NotebookTools(async () => ({ edit: async input => { actions.push(input.operation); if (input.operation === 'begin') { beginStarted(); await ready; return { handle: 'owned', revision: 1 }; } return { applied: false, saved: false, dirty: true }; } }), selected());
		assert.equal((await tools.execute({ operation: 'apply', handle: 'foreign', revision: 1, cells: [] }, new AbortController().signal)).ok, false);
		const controller = new AbortController(); const begin = tools.execute({ operation: 'begin', path: 'C:\\chosen\\note.bcnb' }, controller.signal); await started; const retired = tools.close(); controller.abort(); finishBegin();
		await assert.rejects(begin); await retired; assert.deepEqual(actions, ['begin', 'cancel']);
		const blackout = new NotebookTools(async () => { throw new Error('not allowed'); }, { ...selected(), mode: 'blackout', usable: false }); assert.equal((await blackout.execute({ operation: 'begin', path: 'note.bcnb' }, new AbortController().signal)).ok, false); await blackout.close();
	});
	test('Notebook native-save false is honest feedback and cleanup releases unfinished edits', async () => {
		const actions: string[] = []; const tools = new NotebookTools(async () => ({ edit: async input => { actions.push(input.operation); return input.operation === 'begin' ? { handle: 'one', revision: 1 } : { applied: true, saved: false, dirty: true }; } }), selected());
		await tools.execute({ operation: 'begin', path: 'C:\\chosen\\note.bcnb' }, new AbortController().signal);
		const result = await tools.execute({ operation: 'finish', handle: 'one' }, new AbortController().signal); assert.equal(result.ok, false); assert.equal(result.applied, true); assert.equal(result.dirty, true); await tools.close(); assert.deepEqual(actions, ['begin', 'finish']);
	});
	test('Notebook source credentials are filtered before paging escaped JSON content', async () => {
		const tools = new NotebookTools(async () => ({ edit: async input => input.operation === 'begin' ? { handle: 'one', revision: 1 } : input.operation === 'read' ? { text: JSON.stringify({ cells: [{ source: 'api_key="private-value";' }] }) } : {} }), selected());
		await tools.execute({ operation: 'begin', path: 'C:\\chosen\\note.bcnb' }, new AbortController().signal); const result = await tools.execute({ operation: 'read', handle: 'one', limit: 131072 }, new AbortController().signal); assert.equal(JSON.stringify(result).includes('private-value'), false); await tools.close();
	});
	test('a failed release retains request ownership until end-of-request cleanup really completes', async () => {
		const actions: string[] = []; const tools = new NotebookTools(async () => ({ edit: async input => { actions.push(input.operation); return input.operation === 'begin' ? { handle: 'one', revision: 1 } : input.operation === 'finish' ? { error: 'release failed', released: false, applied: true, saved: true, dirty: false } : { released: true }; } }), selected());
		await tools.execute({ operation: 'begin', path: 'note.bcnb' }, new AbortController().signal); const result = await tools.execute({ operation: 'finish', handle: 'one' }, new AbortController().signal); assert.equal(result.ok, false); assert.equal(result.saved, true); await tools.close(); assert.deepEqual(actions, ['begin', 'finish', 'cancel']);
	});
	test('event entry reaches actual output without paging past large duplicated main code', async () => {
		const code = 'large-main-code'.repeat(10000);
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return selected(); }
			if (operation === 'runtimeRead') { return { id: 'run', materialId: 'runner-run-1', revision: 1, startedAt: 1, sequence: 0, code, events: [{ type: 'compile-attempt', sourceSnapshot: { bytesBase64: Buffer.from(code).toString('base64'), sha256: 'captured-hash', complete: true } }, { type: 'stream', phase: 'compiling', stream: 'stderr', bytesBase64: Buffer.from('actual compile error').toString('base64') }] }; }
			throw new Error('unexpected-operation');
		});
		await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'runner', id: 'run', revision: 1, part: 'events' }, new AbortController().signal);
		assert.equal(result.ok, true); assert.ok(result.contents?.includes('actual compile error')); assert.equal(result.contents?.includes(code), false);
	});
	test('record pagination follows the consumed revision after the live queue advances', async () => {
		let consumes = 0;
		const record = { id: 'run', materialId: 'runner-run-3', revision: 3, startedAt: 1, sequence: 2, code: 'V1 with enough content for pagination', events: [] };
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return selected(); }
			if (operation === 'runtimeRead') { if (++consumes > 1) { throw new Error('beacon-record-changed'); } return record; }
			if (operation === 'materialRead') { return record; }
			throw new Error('unexpected-operation');
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const first = await tools.execute({ operation: 'record', producer: 'runner', id: 'run', revision: 3, limit: 8 }, new AbortController().signal);
		assert.equal(first.ok, true);
		const next = await tools.execute({ operation: 'record', producer: 'runner', id: 'run', revision: 3, offset: first.nextOffset as number, limit: 8 }, new AbortController().signal);
		assert.equal(next.ok, true); assert.equal(next.materialId, first.materialId); assert.equal(consumes, 1);
	});
	test('credential filtering removes whole private keys and bearer tokens before pagination', () => {
		const result = redactContext('api_key="a-secret"\nAuthorization: Bearer token-value\n-----BEGIN PRIVATE KEY-----\nsecret-data\n-----END PRIVATE KEY-----');
		for (const secret of ['a-secret', 'token-value', 'secret-data']) { assert.equal(result.includes(secret), false); }
	});
	test('closure during native delivery discards the body instead of using a cached file fallback', async () => {
		let opened = true;
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return selected(); }
			if (operation === 'pages') { return opened ? [{ id: 'page', kind: 'text', title: 'code', version: '2' }] : []; }
			if (operation === 'page') { opened = false; return { contents: 'must-not-deliver' }; }
			throw new Error('unexpected');
		});
		await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'page', id: 'page', version: '2' }, new AbortController().signal);
		assert.equal(result.ok, false); assert.equal(result.contents, undefined);
	});
	test('real SDK registers context in blackout without file tools and retains completed tool protocol', async () => {
		const connection: Connection = { provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test', parameters: {}, capabilities: { ...resolveCapabilities('deepseek', 'https://api.deepseek.com/v1', 'deepseek-chat'), tools: 'supported' } };
		const session = new ChatSession(() => {}, () => 'error'); let requests = 0; let reads = 0;
		const generator = createGenerator(async () => connection, async (_url, init) => {
			const body = JSON.parse(String(init?.body)); requests++;
			assert.deepEqual(body.tools?.map((entry: { function: { name: string } }) => entry.function.name), ['inspectContext']);
			assert.ok(body.messages.some((message: { role: string; content: string }) => message.role === 'system' && message.content.includes('metadata-only-test')));
			const delta = requests === 1 ? { tool_calls: [{ index: 0, id: 'context-call', type: 'function', function: { name: 'inspectContext', arguments: JSON.stringify({ operation: 'page', id: 'page', version: '2' }) } }] } : { content: 'explanation' };
			if (requests > 1) { assert.ok(JSON.stringify(body.messages).includes('dirty V2')); }
			return new Response('data: ' + JSON.stringify({ id: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: requests === 1 ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		}, 'none', [], false, undefined, {}, { describe: async () => 'metadata-only-test', execute: async () => { reads++; return { ok: true, contents: 'dirty V2' }; } });
		await session.send('explain', generator);
		assert.equal(session.snapshot.error, ''); assert.equal(reads, 1);
		assert.ok(JSON.stringify(session.snapshot.messages[1].protocol).includes('dirty V2'));
		await session.send('continue', generator);
		assert.equal(session.snapshot.error, ''); assert.equal(reads, 1);
	});
	test('blackout reads only actual opened pages; full redaction precedes small range reads', async () => {
		const state: IBeaconContext = { slot: 'one', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, recent: [] };
		let opened = true; let records = 0;
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return state; }
			if (operation === 'pages') { return opened ? [{ id: 'page', kind: 'text', title: 'main.cpp', uri: 'file:///C:/outside/main.cpp', version: '2', dirty: true }] : []; }
			if (operation === 'page') { return { id: 'page', kind: 'text', title: 'main.cpp', uri: 'file:///C:/outside/main.cpp', version: '2', dirty: true, contents: 'api_key="secret-contents"; dirty V2', totalCharacters: 34 }; }
			records++; throw new Error('Unexpected disk/runtime access');
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const first = await tools.execute({ operation: 'page', id: 'page', version: '2', limit: 12 }, new AbortController().signal);
		assert.equal(first.ok, true); assert.equal(JSON.stringify(first).includes('secret-contents'), false);
		assert.equal((await tools.execute({ operation: 'records', producer: 'runner' }, new AbortController().signal)).ok, false);
		assert.equal(records, 0);
		opened = false;
		assert.equal((await tools.execute({ operation: 'page', id: 'page', version: '2' }, new AbortController().signal)).ok, false);
	});
	test('Blackout overview with a retained source lease lists open pages without workspace records', async () => {
		const state: IBeaconContext = { ...selected(), mode: 'blackout', workspaceState: 'blackout' };
		const operations: string[] = [];
		const page = { id: 'open', kind: 'text', title: 'main.cpp', version: '2', dirty: true };
		const client = new BeaconContextClient(async operation => {
			operations.push(operation);
			if (operation === 'context') { return state; }
			if (operation === 'pages') { return [page]; }
			if (operation === 'page') { return { ...page, contents: 'dirty source', totalCharacters: 12 }; }
			throw new Error('unexpected-workspace-access');
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		const overview = await tools.execute({ operation: 'overview' }, signal);
		assert.equal(overview.ok, true);
		assert.deepEqual(overview.pages, [page]);
		assert.deepEqual(overview.records, []);
		assert.equal(overview.runtimeUnavailable, 'blackout');
		assert.equal((await tools.execute({ operation: 'page', id: 'open', version: '2' }, signal)).contents, 'dirty source');
		assert.equal(operations.includes('runtimeList'), false);
	});

	test('Blackout retained ownership does not authorize direct runtime or material reads', async () => {
		const state: IBeaconContext = { ...selected(), mode: 'blackout', workspaceState: 'blackout' };
		const operations: string[] = [];
		const client = new BeaconContextClient(async operation => {
			operations.push(operation);
			if (operation === 'context') { return state; }
			throw new Error('unexpected-workspace-access');
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		for (const input of [{ operation: 'records', producer: 'runner' }, { operation: 'record', producer: 'runner', id: 'run', revision: 1 }, { operation: 'material', id: 'runner-run-1' }] as const) {
			const denied = await tools.execute(input, signal);
			assert.equal(denied.ok, false);
			assert.equal(denied.code, 'beacon-workspace-unavailable');
		}
		assert.equal(operations.some(operation => ['runtimeList', 'runtimeRead', 'materialRead'].includes(operation)), false);
	});

	test('captured complete page and runtime snapshots survive a Blackout fork without source reads', async () => {
		const snapshots: ContextSnapshot[] = []; const operations: string[] = [];
		let state = selected(); let pageOpen = true;
		const client = new BeaconContextClient(async operation => {
			operations.push(operation);
			if (operation === 'context') { return state; }
			if (operation === 'pages') { return pageOpen ? [{ id: 'page', kind: 'text', title: 'main.cpp', version: '2' }] : []; }
			if (operation === 'page') { return { contents: 'full page api_key=secret', totalCharacters: 24 }; }
			if (operation === 'runtimeRead') { return { id: 'run', materialId: 'runner-run-3', revision: 3, startedAt: 1, code: 'complete captured code', events: [{ type: 'output', text: 'complete observation' }] }; }
			throw new Error('source no longer exists');
		});
		await client.refresh(); const source = new ContextTools(client, client.captureScope(), [], [], snapshot => snapshots.push(snapshot)); const signal = new AbortController().signal;
		assert.equal((await source.execute({ operation: 'page', id: 'page', version: '2', limit: 4 }, signal)).contents, 'full');
		assert.equal((await source.execute({ operation: 'record', id: 'run', producer: 'runner', revision: 3, limit: 3 }, signal)).ok, true);
		assert.equal(snapshots.length, 2);
		assert.equal(snapshots[0].raw, 'full page api_key=secret');
		assert.ok(snapshots[1].raw.includes('complete captured code'));
		await source.execute({ operation: 'page', id: 'page', version: '2' }, signal);
		assert.equal(snapshots.length, 2);
		state = { ...state, mode: 'blackout', workspaceState: 'blackout', epoch: 3 }; pageOpen = false;
		await client.refresh(); const inherited = new ContextTools(client, client.captureScope(), [], structuredClone(snapshots));
		const overview = await inherited.execute({ operation: 'overview' }, signal);
		assert.equal(overview.ok, true);
		assert.deepEqual((overview.materials as { id: string }[]).map(item => item.id), ['page:page:2:', 'material:runner-run-3']);
		operations.length = 0;
		const page = await inherited.execute({ operation: 'material', id: 'page:page:2:' }, signal);
		assert.equal(page.ok, true); assert.equal(page.contents, 'full page api_key=[redacted]');
		const runtime = await inherited.execute({ operation: 'material', id: 'runner-run-3', part: 'code' }, signal);
		assert.equal(runtime.contents, 'complete captured code');
		assert.equal(operations.every(operation => operation === 'context'), true);
		assert.equal((await inherited.execute({ operation: 'page', id: 'page', version: '2' }, signal)).code, 'beacon-page-closed');
		state = { ...state, epoch: 4 };
		assert.equal((await inherited.execute({ operation: 'material', id: 'runner-run-3' }, signal)).code, 'beacon-context-changed');
	});

	test('runtime records pin native revision and return immutable own material, with decoded observations', async () => {
		let state = selected(); const operations: string[] = [];
		const client = new BeaconContextClient(async (operation, input) => {
			operations.push(operation);
			if (operation === 'context') { return state; }
			if (operation === 'runtimeRead') {
				assert.equal((input as { revision: number }).revision, 3);
				assert.equal((input as { scope: IBeaconContext }).scope.activeId, 'conversation-one');
				return { id: 'run', materialId: 'runner-run-3', revision: 3, startedAt: 1, sequence: 2, code: 'V1', events: [{ type: 'output', bytesBase64: Buffer.from('actual stderr').toString('base64') }] };
			}
			throw new Error('unexpected-operation');
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const result = await tools.execute({ operation: 'record', producer: 'runner', id: 'run', revision: 3 }, new AbortController().signal);
		assert.equal(result.ok, true); assert.equal(result.materialId, 'runner-run-3'); assert.ok(result.contents?.includes('actual stderr'));
		state = { ...state, activeId: 'conversation-two' };
		assert.equal((await tools.execute({ operation: 'material', id: 'runner-run-3' }, new AbortController().signal)).ok, false);
		assert.equal(operations.includes('materialRead'), false);
	});
	test('reads only the independently selected root and maps the qualified mode', async () => {
		const client = new BeaconContextClient(async () => selected());
		await client.refresh();
		assert.deepEqual(client.roots, [{ name: 'chosen', path: 'C:\\chosen' }]);
		assert.equal(client.permission, 'workspace');
	});

	test('manual Blackout keeps its selected root but binds no workspace assets', async () => {
		let historyReads = 0;
		const state: IBeaconContext = { ...selected(), workspaceState: 'blackout', mode: 'blackout', activeId: undefined };
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return state; }
			if (operation === 'history') { historyReads++; return []; }
			throw new Error('unexpected-operation');
		});
		const binding = await client.bindHistory();
		assert.deepEqual(client.roots, []);
		assert.equal(client.permission, 'none');
		assert.deepEqual(binding.data.conversations, []);
		assert.equal(historyReads, 0);
	});

	test('rejects a stale result when permission or workspace changes during reading', async () => {
		let current = selected();
		const client = new BeaconContextClient(async () => current);
		await client.refresh();
		const scope = client.captureScope();
		const result = await client.guardRead(scope, async () => { current = { ...current, epoch: 3, mode: 'flood' }; return { ok: true, path: 'C:\\chosen\\note.txt', contents: 'do-not-expose' }; }, { operation: 'read', path: 'note.txt' }, new AbortController().signal);
		assert.equal(result.ok, false);
		assert.equal(result.contents, undefined);
	});

	test('does not turn an invalid native qualification into broader file permission', async () => {
		const client = new BeaconContextClient(async () => ({ ...selected(), usable: false, mode: 'flood' }));
		await assert.rejects(client.refresh());
		assert.equal(client.permission, 'none');
	});
	test('a history binding cannot save its conversation after the selected root changes', async () => {
		let current = selected(); let saves = 0;
		const data = { id: 'conversation-one', title: 'chat', updatedAt: 1, messages: [], error: '', workspace: [{ name: 'chosen', path: current.root! }] };
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return current; }
			if (operation === 'history') { return [{ ...data, revision: 1 }]; }
			if (operation === 'open') { return { revision: 1, data }; }
			if (operation === 'save') { saves++; }
			throw new Error('unexpected-operation');
		});
		const binding = await client.bindHistory({ id: data.id });
		current = { ...current, root: 'C:\\other', epoch: 3 };
		await assert.rejects(binding.save({ ...binding.data, conversations: [{ ...data, title: 'changed' }] }), /owner/);
		assert.equal(saves, 0);
	});
	test('selecting a usable history does not open or create a chat; blackout stays in memory', async () => {
		const operations: string[] = [];
		let current = { ...selected(), activeId: undefined };
		const client = new BeaconContextClient(async operation => { operations.push(operation); return operation === 'context' ? current : []; });
		assert.equal((await client.bindHistory()).data.activeId, '');
		assert.equal(operations.includes('open'), false);
		current = { ...current, usable: false, workspaceState: 'unavailable', mode: 'blackout' };
		const temporary = await client.bindHistory();
		assert.equal(temporary.root, undefined);
		await temporary.save({ ...temporary.data, activeId: 'temporary', conversations: [] });
		assert.equal(operations.includes('save'), false);
	});
});

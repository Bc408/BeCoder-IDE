/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BeaconContextClient, withOjPages, withPdfPages } from '../src/context';
import { ContextTools, redactContext, redactValues } from '../src/contextTools';
import { createGenerator } from '../src/provider';
import { ChatSession } from '../src/session';
import { readHistory } from '../src/history';
import { resolveCapabilities } from '../src/models';
import type { Connection } from '../src/connection';
import type { IBeaconContext } from '../../../src/vs/platform/beacon/common/beaconContextTypes';

const selected = (): IBeaconContext => ({ slot: 'one', root: 'C:\\chosen', usable: true, workspaceState: 'ready', mode: 'spot', epoch: 2, busy: false, runtimeBusy: false, collectionPending: false, activeId: 'conversation-one', recent: ['C:\\chosen'] });

suite('Beacon native context consumer', () => {
	test('redacted page fragments preserve character limits and continuation coordinates', async () => {
		const page = { id: 'page', kind: 'text', title: 'password=metadata-secret', version: '1' };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : operation === 'pages' ? [page] : { ...page, contents: 'password=secret\nNEXT', totalCharacters: 20 });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		let contents = '', offset = 0;
		do {
			const result = await tools.execute('readPage', { id: page.id, offset, limit: 10 }, new AbortController().signal);
			assert.equal(result.ok, true);
			assert.ok(Array.from(result.contents!).length <= 10);
			assert.equal(result.title, 'password=[redacted]');
			assert.doesNotMatch(JSON.stringify(result), /metadata-secret/);
			contents += result.contents;
			offset = result.nextOffset as number;
		} while (offset !== undefined);
		assert.equal(contents, 'password=[redacted]\nNEXT');
	});

	test('pending collection rejects new requests independently of runtime and scope identity', async () => {
		let state = selected(); const client = new BeaconContextClient(async () => state);
		await client.refreshForRequest(); const scope = client.captureScope();
		state = { ...state, collectionPending: true };
		await assert.rejects(client.refreshForRequest(), /beacon-collection-pending/);
		assert.strictEqual(client.state.epoch, scope.epoch);
		state = { ...state, mode: 'blackout', workspaceState: 'blackout' };
		await assert.rejects(client.refreshForRequest(), /beacon-collection-pending/);
		state = { ...state, collectionPending: false }; await client.refreshForRequest();
	});
	test('an oversized run is a specific small error, not a failed workspace or network', async () => {
		const calls: string[] = [];
		const client = new BeaconContextClient(async operation => {
			calls.push(operation);
			if (operation === 'context') { return selected(); }
			if (operation === 'readRecord') { throw new Error('beacon-run-record-too-large'); }
			if (operation === 'listRecords') { return []; }
			throw new Error('unexpected');
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		const result = await tools.execute('readRunRecord', { id: 'large' }, signal);
		assert.deepStrictEqual(result.error, { code: 'too_large', message: 'This run record exceeds 32 KB and cannot be read. Other records remain available.' });
		assert.deepStrictEqual(await tools.execute('readRunRecord', {}, signal), { records: [] });
		assert.strictEqual(calls.includes('readRecord'), true);
	});
	test('cookie header lines preserve code outside the complete header value', () => {
		const cases = [
			['Cookie: sid=fixture-a; preference=fixture-b\r\nint after = 1;', 'Cookie: [redacted]\r\nint after = 1;'],
			['// sEt-CoOkIe: sid=fixture-c; Path=/; HttpOnly\nint cookie = 2;', '// sEt-CoOkIe: [redacted]\nint cookie = 2;'],
			['/* Cookie: sid=fixture-d; preference=fixture-e */ int after = 3;', '/* Cookie: [redacted] */ int after = 3;'],
			['const char* header = "Cookie: sid=fixture-f; preference=fixture-g"; int after = 4;', 'const char* header = "Cookie: [redacted]"; int after = 4;'],
			["headers = {'Set-Cookie': 'sid=fixture-h; Path=/'}; int after = 5;", "headers = {'Set-Cookie': '[redacted]'}; int after = 5;"],
			['const char* request = "GET / HTTP/1.1\\r\\nCookie: sid=fixture-i; preference=fixture-j\\r\\nAccept: text/plain\\r\\n"; int after = 6;', 'const char* request = "GET / HTTP/1.1\\r\\nCookie: [redacted]\\r\\nAccept: text/plain\\r\\n"; int after = 6;'],
			['Cookie: [redacted]\\nint cookie = 1;', 'Cookie: [redacted]\\nint cookie = 1;'],
			['int cookie = 1; int set_cookie = 2; auto cookies = "ordinary"; // keep this code', 'int cookie = 1; int set_cookie = 2; auto cookies = "ordinary"; // keep this code']
		];
		for (const [input, expected] of cases) { assert.equal(redactContext(input), expected); }
	});
	test('structured cookie header keys hide their entire values', () => {
		assert.deepEqual(redactValues({ headers: { Cookie: 'sid=fixture-a; preference=fixture-b', 'sEt-CoOkIe': ['sid=fixture-c; Path=/', 'other=fixture-d; HttpOnly'] }, cookieCount: 2, source: 'int cookie = 2;' }), {
			headers: { Cookie: '[redacted]', 'sEt-CoOkIe': '[redacted]' }, cookieCount: 2, source: 'int cookie = 2;'
		});
	});
	test('functional OJ and Notebook pages cannot provide alternative execution evidence', async () => {
		const pages = [{ id: 'oj:record', kind: 'oj-record', title: 'WA', version: '1' }, { id: 'notebook', kind: 'notebook', title: 'note', version: '1' }]; let reads = 0;
		const client = new BeaconContextClient(async operation => { if (operation === 'context') { return selected(); } if (operation === 'pages') { return pages; } reads++; return []; });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		assert.deepEqual((JSON.parse(await tools.describe(signal))).pages, [pages[1]]);
		for (const page of pages) { assert.equal((await tools.execute('readPage', { id: page.id }, signal)).error !== undefined, true); }
		assert.equal(reads, 0);
	});

	test('OJ pages use only a current, authorized publication', async () => {
		const page = { id: 'oj:one', kind: 'oj-record' as const, title: 'WA', version: '1', sourceUri: 'file:///C:/chosen/main.cpp' };
		let pages = [page];
		let blocked = false;
		let reads = 0;
		const api = {
			listBeaconPages: () => pages,
			readBeaconPage: () => { reads++; return { ...page, contents: 'WA', totalCharacters: 2 }; }
		};
		const transport = withOjPages(async op => {
			if (op === 'pages') { return []; }
			assert.equal(op, 'checkPageAccess');
			if (blocked) { throw new Error('beacon-protected-page'); }
			return undefined;
		}, () => api);
		assert.deepEqual(await transport('pages'), [page]);
		await assert.rejects(transport('page', { id: page.id, version: '0' }), /beacon-page-changed/);
		blocked = true;
		assert.deepEqual(await transport('pages'), []);
		await assert.rejects(transport('page', { id: page.id, version: '1' }), /beacon-protected-page/);
		blocked = false;
		await transport('page', { id: page.id, version: '1' });
		pages = [];
		await assert.rejects(transport('page', { id: page.id, version: '1' }), /beacon-page-closed/);
		assert.equal(reads, 1);
	});
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
		const client = new BeaconContextClient(async () => ({ slot: 'one', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: true, runtimeBusy: true, collectionPending: false, recent: [] }));
		await assert.rejects(client.refreshForRequest(), /beacon-runtime-busy/);
	});
	test('page provenance pins the complete captured text across redacted range reads', async () => {
		const raw = 'api_key="private-token";\ncurrent dirty code';
		const page = { id: 'page', kind: 'text', title: 'main.cpp', uri: 'file:///C:/chosen/main.cpp', version: '2', dirty: true };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : operation === 'pages' ? [page] : { ...page, contents: raw, totalCharacters: raw.length });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		const first = await tools.execute('readPage', { id: 'page', limit: 5 }, signal);
		const next = await tools.execute('readPage', { id: 'page', offset: first.nextOffset as number }, signal);
		const source = first.source;
		assert.equal(source?.kind, 'page'); assert.equal(source?.id, 'page'); assert.equal(source?.version, '2');
		assert.equal(source?.origin, page.uri); assert.equal(source?.contentSha256, createHash('sha256').update(raw).digest('hex'));
		assert.equal(typeof source?.capturedAt, 'number'); assert.equal(next.source?.contentSha256, source?.contentSha256);
		assert.equal(first.truncated, true); assert.equal(first.redacted, true); assert.equal(JSON.stringify([first, next]).includes('private-token'), false);
	});
	test('SDK context failures retain a safe actionable code in activity and saved history', async () => {
		const connection: Connection = { provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test', parameters: {}, capabilities: { ...resolveCapabilities('deepseek', 'https://api.deepseek.com/v1', 'deepseek-chat'), tools: true } };
		let requests = 0; const session = new ChatSession(() => {}, () => 'error');
		const generator = createGenerator(async () => connection, async () => {
			const delta = ++requests === 1 ? { tool_calls: [{ index: 0, id: 'context-failed', type: 'function', function: { name: 'readPage', arguments: JSON.stringify({ id: 'page' }) } }] } : { content: 'Please reopen the page.' };
			return new Response('data: ' + JSON.stringify({ id: 'test', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: requests === 1 ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		}, 'none', [], false, undefined, {}, { describe: async () => 'test context', execute: async () => ({ error: { code: 'not_found', message: 'private-token must never enter the activity' } }) });
		await session.send('Explain the page.', generator);
		assert.equal(session.snapshot.error, '');
		assert.deepEqual(session.snapshot.messages[1].activities, [{ id: 'context-failed', type: 'read', path: 'page', status: 'error', error: 'material-missing' }]);
		const history = readHistory({ version: 1, activeId: 'chat', conversations: [{ id: 'chat', title: 'test', updatedAt: 1, error: '', workspace: [], messages: session.snapshot.messages }] });
		assert.equal(history.conversations[0].messages[1].activities[0].error, 'material-missing');
		assert.equal(JSON.stringify(history.conversations[0].messages[1].activities).includes('private-token'), false);
		const missingActivities = structuredClone(history);
		delete (missingActivities.conversations[0].messages[1] as Partial<typeof session.snapshot.messages[number]>).activities;
		assert.throws(() => readHistory(missingActivities), /invalid-history/);
	});
	test('open PDF uses existing page tool in blackout, isolates page snapshots and checks access before extraction', async () => {
		let version = '0'; let opened = true; let denied = false; let reads = 0;
		const scope: IBeaconContext = { slot: 'one', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, collectionPending: false, recent: [] };
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
		const listed = JSON.parse(await tools.describe(signal)); assert.equal((listed.pages as unknown[]).length, 1);
		assert.equal((await tools.execute('readPage', { id: 'pdf:one' }, signal)).error !== undefined, true);
		const first = await tools.execute('readPage', { id: 'pdf:one', pageNumber: 1, limit: 3 }, signal); assert.equal(first.ok, true); assert.equal(first.pageNumber, 1); assert.equal(first.source?.pageNumber, 1);
		const all = await tools.execute('readPage', { id: 'pdf:one', pageNumber: 1 }, signal); assert.equal(String(all.contents).includes('private-token'), false); assert.equal(reads, 2);
		const second = await tools.execute('readPage', { id: 'pdf:one', pageNumber: 2 }, signal); assert.equal(second.contents, 'second page'); assert.equal(reads, 3);
		assert.equal((await tools.execute('readPage', { id: 'pdf:one', pageNumber: 4 }, signal)).error !== undefined, true);
		denied = true; assert.equal((await tools.execute('readPage', { id: 'pdf:one', pageNumber: 3 }, signal)).error !== undefined, true); assert.equal(reads, 3);
		denied = false; version = '1'; assert.equal((await tools.execute('readPage', { id: 'pdf:one', pageNumber: 1 }, signal)).source?.version, '1');
		opened = false; assert.equal((await tools.execute('readPage', { id: 'pdf:one', pageNumber: 1 }, signal)).error && true, true);
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
		const result = await new ContextTools(client, client.captureScope()).execute('readPage', { id: 'page', version: '2' }, new AbortController().signal);
		assert.equal(result.error !== undefined, true); assert.equal(result.contents, undefined);
	});
	test('real SDK registers context in blackout without file tools and retains completed tool protocol', async () => {
		const connection: Connection = { provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test', parameters: {}, capabilities: { ...resolveCapabilities('deepseek', 'https://api.deepseek.com/v1', 'deepseek-chat'), tools: true } };
		const session = new ChatSession(() => {}, () => 'error'); let requests = 0; let reads = 0;
		const generator = createGenerator(async () => connection, async (_url, init) => {
			const body = JSON.parse(String(init?.body)); requests++;
			assert.deepEqual(body.tools?.map((entry: { function: { name: string } }) => entry.function.name), ['readCurrentCode', 'fetchProblem', 'readPage']);
			assert.ok(body.messages.some((message: { role: string; content: string }) => message.role === 'system' && message.content.includes('metadata-only-test')));
			const delta = requests === 1 ? { tool_calls: [{ index: 0, id: 'context-call', type: 'function', function: { name: 'readPage', arguments: JSON.stringify({ id: 'page' }) } }] } : { content: 'explanation' };
			if (requests > 1) { assert.ok(JSON.stringify(body.messages).includes('dirty V2')); }
			return new Response('data: ' + JSON.stringify({ id: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: requests === 1 ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		}, 'none', [], false, undefined, {}, { names: ['readCurrentCode', 'fetchProblem', 'readPage'], describe: async () => 'metadata-only-test', execute: async () => { reads++; return { ok: true, contents: 'dirty V2' }; } });
		await session.send('explain', generator);
		assert.equal(session.snapshot.error, ''); assert.equal(reads, 1);
		assert.ok(JSON.stringify(session.snapshot.messages[1].protocol).includes('dirty V2'));
		await session.send('continue', generator);
		assert.equal(session.snapshot.error, ''); assert.equal(reads, 1);
	});
	test('blackout reads only actual opened pages; full redaction precedes small range reads', async () => {
		const state: IBeaconContext = { slot: 'one', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, collectionPending: false, recent: [] };
		let opened = true; let records = 0;
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return state; }
			if (operation === 'pages') { return opened ? [{ id: 'page', kind: 'text', title: 'main.cpp', uri: 'file:///C:/outside/main.cpp', version: '2', dirty: true }] : []; }
			if (operation === 'page') { return { id: 'page', kind: 'text', title: 'main.cpp', uri: 'file:///C:/outside/main.cpp', version: '2', dirty: true, contents: 'api_key="secret-contents"; dirty V2', totalCharacters: 34 }; }
			records++; throw new Error('Unexpected disk/runtime access');
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const first = await tools.execute('readPage', { id: 'page', limit: 12 }, new AbortController().signal);
		assert.equal(first.ok, true); assert.equal(JSON.stringify(first).includes('secret-contents'), false);
		assert.equal((await tools.execute('readRunRecord', {}, new AbortController().signal)).error !== undefined, true);
		assert.equal(records, 0);
		opened = false;
		assert.equal((await tools.execute('readPage', { id: 'page' }, new AbortController().signal)).error !== undefined, true);
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
		const overview = JSON.parse(await tools.describe(signal));

		assert.deepEqual(overview.pages, [page]);
		assert.equal(overview.records, undefined);

		assert.equal((await tools.execute('readPage', { id: 'open' }, signal)).contents, 'dirty source');
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
		for (const [name, input] of [['readRunRecord', {}], ['readRunRecord', { id: 'run' }]] as const) {
			const denied = await tools.execute(name, input, signal);
			assert.deepEqual(denied.error, { code: 'unavailable', message: 'This source is unavailable in the current Beacon mode.' });
		}
		assert.equal(operations.some(operation => ['runtimeList', 'runtimeRead', 'materialRead'].includes(operation)), false);
	});

	test('removed material capability cannot expose persistent data in Blackout', async () => {
		const client = new BeaconContextClient(async operation => { if (operation === 'context') { return { ...selected(), mode: 'blackout', workspaceState: 'blackout' }; } throw new Error('unexpected read'); });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		assert.equal((tools.names as readonly string[]).includes('readMaterial'), false);
		assert.equal((await tools.execute('readRunRecord', {}, new AbortController().signal)).error !== undefined, true);
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
		assert.equal(result.error !== undefined, true);
		assert.equal(result.contents, undefined);
		assert.equal(result.code, 'context-changed');
		assert.equal(result.failureCode, 'beacon-context-changed');
	});
	test('context verification failure does not claim the workspace changed or expose a completed read', async () => {
		for (const phase of ['before', 'after']) {
			let fail = false, reads = 0;
			const client = new BeaconContextClient(async () => { if (fail) { throw new Error('private IPC diagnostic'); } return selected(); });
			await client.refresh(); const scope = client.captureScope();
			if (phase === 'before') { fail = true; }
			const result = await client.guardRead(scope, async () => { reads++; fail = true; return { ok: true, path: 'note.txt', contents: 'must not be exposed without verification' }; }, { operation: 'read', path: 'note.txt' }, new AbortController().signal);
			assert.equal(result.code, 'unavailable'); assert.equal(result.failureCode, 'read_failed');
			assert.equal(result.contents, undefined); assert.equal(reads, phase === 'before' ? 0 : 1);
			assert.doesNotMatch(result.error!, /changed|private|IPC/);
		}
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BeaconContextClient, withOjPages, withPdfPages } from '../src/context';
import { ContextTools, redactContext, redactValues, type ContextSnapshot } from '../src/contextTools';
import { NotebookTools } from '../src/notebookTools';
import { createGenerator } from '../src/provider';
import { ChatSession } from '../src/session';
import { readHistory } from '../src/history';
import { resolveCapabilities } from '../src/models';
import type { Connection } from '../src/connection';
import type { IBeaconContext } from '../../../src/vs/platform/beacon/common/beaconContextTypes';

const selected = (): IBeaconContext => ({ slot: 'one', root: 'C:\\chosen', usable: true, workspaceState: 'ready', mode: 'spot', epoch: 2, busy: false, runtimeBusy: false, activeId: 'conversation-one', recent: ['C:\\chosen'] });

const recentRuntime = (record: { id: string; revision: number; code: string; events: unknown[]; startedAt: number; sequence?: number; materialId?: string }) => ({ producer: 'runner', id: record.id, revision: record.revision, capturedAt: record.startedAt, coverage: { channels: [] }, payload: { kind: 'runtime', activityId: record.id, code: record.code, events: record.events, startedAt: record.startedAt, lastEventSequence: record.sequence ?? 0 } });

suite('Beacon native context consumer', () => {
	test('invalid context input reports exact missing fields before native reads', async () => {
		let calls = 0;
		const client = new BeaconContextClient(async operation => { if (operation === 'context') { return selected(); } calls++; throw new Error(operation); });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		for (const [input, fields] of [
			[{ producer: 'runner', id: 'run', revision: 1 }, ['operation']],
			[{ operation: 'record', producer: 'runner', id: 'run' }, ['revision']],
			[{ operation: 'currentCode', offset: 1 }, ['id', 'version']],
			[{ operation: 'records', limit: 'many' }, ['limit']],
			[{ operation: 'currentCode', part: 'code' }, ['part']]
		] as const) {
			const result = await tools.execute(input as never, new AbortController().signal);
			assert.equal(result.ok, false); assert.equal(result.code, 'beacon-invalid-context-input');
			assert.deepEqual((result.issues as { field: string }[] | undefined)?.map(issue => issue.field), fields);
		}
		assert.equal(calls, 0);
	});
	test('unavailable operation is rejected by the advertised operation set', async () => {
		let calls = 0;
		const client = new BeaconContextClient(async operation => { if (operation === 'context') { return { ...selected(), mode: 'blackout', workspaceState: 'blackout' }; } calls++; throw new Error(operation); });
		await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'records', producer: 'runner' }, new AbortController().signal);
		assert.equal(result.ok, false); assert.equal(result.code, 'beacon-workspace-unavailable');
		assert.equal(calls, 0);
	});
	test('each live code call uses the model page choice or the active editor at call time', async () => {
		let active = 'a';
		const client = new BeaconContextClient(async (operation, raw) => {
			if (operation === 'context') { return { ...selected(), mode: 'blackout', workspaceState: 'blackout' }; }
			if (operation === 'currentCode') {
				const input = raw as { id?: string; target?: unknown };
				assert.equal(input.target, undefined);
				const id = input.id ?? active;
				return { sourceUri: `untitled:${id}.cpp`, fileName: `${id}.cpp`, pageId: id, version: '1', languageId: 'cpp', observedAt: 1, contents: `live ${id}` };
			}
			throw new Error(operation);
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()), signal = new AbortController().signal;
		assert.equal((await tools.execute({ operation: 'currentCode', id: 'b' }, signal)).contents, 'live b');
		assert.equal((await tools.execute({ operation: 'currentCode' }, signal)).contents, 'live a');
		active = 'b'; assert.equal((await tools.execute({ operation: 'currentCode' }, signal)).contents, 'live b');
	});
	test('sample text preserves int64 digits, JSON-looking text and trailing newlines', async () => {
		for (const value of ['9223372036854775807\n', '9007199254740993\n', 'null\n', '"label"\n', '{"value":9223372036854775807}\n']) {
			const row = { producer: 'cph', id: 'exact', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: value, events: [{ type: 'compile-attempt', details: { problem: { tests: [{ input: value, output: value }] } } }, { type: 'sample-finished', sampleId: '1', result: { stdout: value } }], startedAt: 1, lastEventSequence: 1 } };
			const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row);
			await client.refresh(); const tools = new ContextTools(client, client.captureScope()), signal = new AbortController().signal;
			for (const part of ['input', 'expected', 'actual', 'code'] as const) {
				const result = await tools.execute({ operation: 'record', producer: 'cph', id: 'exact', revision: 1, sampleIndex: 1, part }, signal);
				assert.equal(result.ok, true); assert.equal(result.contents, value);
			}
		}
	});
	test('a code snapshot write-lock failure still returns the successful live observation', async () => {
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return selected(); }
			if (operation === 'currentCode') { return { sourceUri: 'untitled:main.cpp', fileName: 'main.cpp', pageId: 'editor', version: '2', languageId: 'cpp', observedAt: 2, contents: 'int main(){}' }; }
			if (operation === 'saveCodeRead') { throw new Error('beacon-write-busy'); }
			throw new Error(operation);
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const result = await tools.execute({ operation: 'currentCode' }, new AbortController().signal);
		assert.equal(result.ok, true); assert.equal(result.contents, 'int main(){}');
		assert.deepEqual(result.snapshotSave, { state: 'not-saved', reason: 'save-failed' }); assert.equal(result.snapshotId, undefined);
	});
	test('snapshot save recovery rechecks scope and never converts cancellation or ownership loss into success', async () => {
		for (const failure of ['changed', 'owner', 'aborted'] as const) {
			let changed = false; const controller = new AbortController();
			const client = new BeaconContextClient(async operation => {
				if (operation === 'context') { return { ...selected(), epoch: changed ? 3 : 2 }; }
				if (operation === 'currentCode') { return { sourceUri: 'untitled:main.cpp', fileName: 'main.cpp', pageId: 'editor', version: '1', languageId: 'cpp', observedAt: 1, contents: 'read but retired' }; }
				if (operation === 'saveCodeRead') { changed = failure === 'changed'; if (failure === 'aborted') { controller.abort(); } throw new Error(failure === 'owner' ? 'beacon-conversation-owner' : 'beacon-write-busy'); }
				throw new Error(operation);
			});
			await client.refresh(); const tools = new ContextTools(client, client.captureScope());
			const result = tools.execute({ operation: 'currentCode' }, controller.signal);
			if (failure === 'aborted') { await assert.rejects(result, { name: 'AbortError' }); }
			else { const output = await result; assert.equal(output.ok, false); assert.equal(output.code, failure === 'owner' ? 'beacon-conversation-owner' : 'beacon-context-changed'); assert.equal(output.contents, undefined); }
		}
	});
	test('Notebook code selectors cannot return code from a different block or input', async () => {
		const row = { producer: 'notebook', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'block A code', events: [{ type: 'compile-attempt', details: { cellId: 'block-a', inputCellId: 'input-a', input: { text: 'A' } } }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row);
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()), signal = new AbortController().signal;
		for (const selectors of [{ blockId: 'block-b' }, { inputId: 'input-b' }, { blockId: 'block-b', inputId: 'input-b' }]) {
			const result = await tools.execute({ operation: 'record', producer: 'notebook', id: 'one', revision: 1, part: 'code', ...selectors }, signal);
			assert.equal(result.ok, false); assert.equal(result.code, 'beacon-part-unavailable');
		}
		assert.equal((await tools.execute({ operation: 'record', producer: 'notebook', id: 'one', revision: 1, part: 'code', blockId: 'block-a', inputId: 'input-a' }, signal)).contents, 'block A code');
	});
	test('network problem reads honor sample and section selectors in refresh and Blackout', async () => {
		const problem = { site: 'luogu' as const, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
		const document = { ref: problem, title: 'selected problem', bodies: [{ locale: 'zh-CN', sections: [{ content: 'first section', format: 'markdown' as const }, { content: 'second section', format: 'markdown' as const }] }], samples: [{ input: 'first input', output: 'first output' }, { input: '9223372036854775807\n', output: '9007199254740993\n' }], limits: [], interactive: false };
		for (const blackout of [false, true]) {
			const operations: string[] = [];
			const client = new BeaconContextClient(async operation => { operations.push(operation); if (operation === 'context') { return blackout ? { ...selected(), mode: 'blackout', workspaceState: 'blackout' } : selected(); } throw new Error(operation); });
			await client.refresh(); const tools = new ContextTools(client, client.captureScope(), [], { readProblem: async () => document }), signal = new AbortController().signal;
			const request = { operation: 'problem' as const, problem, refresh: !blackout };
			assert.equal((await tools.execute({ ...request, sampleIndex: 2, part: 'input', limit: 64 }, signal)).contents, '9223372036854775807\n');
			assert.equal((await tools.execute({ ...request, sampleIndex: 2, part: 'expected' }, signal)).contents, '9007199254740993\n');
			assert.equal((await tools.execute({ ...request, locale: 'zh-CN', sectionIndex: 2 }, signal)).contents, 'second section');
			assert.equal((await tools.execute({ ...request, sampleIndex: 3, part: 'input' }, signal)).code, 'beacon-part-unavailable');
			assert.equal((await tools.execute({ ...request, locale: 'missing', sectionIndex: 1 }, signal)).code, 'beacon-part-unavailable');
			assert.ok(operations.every(operation => operation === 'context'));
		}
	});
	test('initial directory remains bounded with full shared queues and keeps explicit listing available', async () => {
		const client = new BeaconContextClient(async (operation, raw) => {
			if (operation === 'context') { return selected(); } if (operation === 'pages' || operation === 'listCodeSnapshots') { return []; }
			if (operation === 'listRecent') { const { producer } = raw as { producer: string }; return Array.from({ length: 20 }, (_, index) => ({ producer, id: `record-${index}`, revision: 1, capturedAt: index, sourceUri: 'file:///C:/chosen/main.cpp', dedupKey: 'unused identity'.repeat(100), coverage: { channels: [] }, state: 'finished' })); }
			throw new Error(operation);
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()), signal = new AbortController().signal;
		const overview = await tools.execute({ operation: 'overview' }, signal);
		assert.equal((overview.records as unknown[]).length, 15); assert.ok(JSON.stringify(overview).length < 8192);
		assert.deepEqual((overview.records as { producer: string; id: string }[]).filter(record => record.producer === 'runner').map(record => record.id), ['record-19', 'record-18', 'record-17']);
		assert.equal(((await tools.execute({ operation: 'records', producer: 'runner' }, signal)).records as unknown[]).length, 20);
	});
	test('model input allowance bounds returned code while persisting the complete observation', async () => {
		const full = 'x'.repeat(5000); let saved = '';
		const client = new BeaconContextClient(async (operation, raw) => {
			if (operation === 'context') { return selected(); }
			if (operation === 'currentCode') { return { sourceUri: 'untitled:main.cpp', fileName: 'main.cpp', pageId: 'editor', version: '1', languageId: 'cpp', observedAt: 1, contents: full }; }
			if (operation === 'saveCodeRead') { saved = (raw as { observation: { contents: string } }).observation.contents; return { state: 'saved', id: 'full-original', reused: false }; }
			throw new Error(operation);
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); tools.setResultBudget(4096);
		const result = await tools.execute({ operation: 'currentCode' }, new AbortController().signal);
		assert.equal(result.ok, true); assert.equal(saved, full); assert.ok(result.contents!.length < full.length); assert.equal(result.snapshotId, 'full-original'); assert.ok(result.nextOffset);
	});
	test('a small actual code return fits a 1500-byte remainder without a fixed 2KiB minimum', async () => {
		const client = new BeaconContextClient(async operation => { if (operation === 'context') { return selected(); } if (operation === 'currentCode') { return { sourceUri: 'untitled:main.cpp', fileName: 'main.cpp', pageId: 'editor', version: '1', languageId: 'cpp', observedAt: 1, contents: 'V1' }; } if (operation === 'saveCodeRead') { return { state: 'saved', id: 'one', reused: false }; } throw new Error(operation); });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); tools.setResultBudget(1500);
		const result = await tools.execute({ operation: 'currentCode' }, new AbortController().signal);
		assert.equal(result.ok, true); assert.equal(result.contents, 'V1'); assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 1500);
	});
	test('saved statements are exact by file while network refresh never calls persistence', async () => {
		const problem = { site: 'luogu' as const, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, calls: string[] = [];
		const record = (file: string, id: string) => ({ producer: 'problem', id, revision: 1, sourceUri: file, viewedAt: id === 'one' ? 10 : 20, capturedAt: 1, problem, coverage: { channels: [] }, payload: { kind: 'problem', document: { ref: problem, title: id, bodies: [{ locale: 'zh-CN', sections: [{ content: `body for ${id}`, format: 'markdown' as const }] }], samples: [], limits: [], interactive: false } } });
		const rows = [record('file:///C:/chosen/a.cpp', 'one'), record('file:///C:/chosen/b code.cpp', 'two')];
		const client = new BeaconContextClient(async (operation, input) => { calls.push(operation); if (operation === 'context') { return selected(); } if (operation === 'listRecent') { return rows; } if (operation === 'readRecent') { return rows.find(row => row.id === (input as { ref: { id: string } }).ref.id); } throw new Error(operation); });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope(), [], { readProblem: async () => ({ ...rows[0].payload.document, title: 'network only' }) }); const signal = new AbortController().signal;
		assert.equal((await tools.execute({ operation: 'problem', problem }, signal)).selectionRequired, true);
		const saved = await tools.execute({ operation: 'problem', problem, sourceUri: rows[1].sourceUri.replace(' ', '%20') }, signal); assert.equal(saved.viewedAt, 20); assert.ok(saved.contents?.includes('body for two'));
		calls.length = 0; const fresh = await tools.execute({ operation: 'problem', problem, refresh: true }, signal); assert.ok(fresh.contents?.includes('network only')); assert.ok(calls.every(call => call === 'context'));
	});
	test('file-selected problem pin is reused by its normalized exact ref after eviction', async () => {
		const problem = { site: 'luogu' as const, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }; let exists = true, reads = 0;
		const row = { producer: 'problem', id: 'one', revision: 1, capturedAt: 1, viewedAt: 10, sourceUri: 'file:///C:/chosen/main.cpp', problem, coverage: { channels: [] }, payload: { kind: 'problem', document: { ref: problem, title: 'saved body', bodies: [], samples: [], limits: [], interactive: false } } };
		const client = new BeaconContextClient(async operation => { if (operation === 'context') { return selected(); } if (operation === 'listRecent') { return exists ? [row] : []; } if (operation === 'readRecent') { reads++; if (!exists) { throw new Error('beacon-record-evicted'); } return row; } throw new Error(operation); });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()), signal = new AbortController().signal;
		const first = await tools.execute({ operation: 'problem', sourceUri: row.sourceUri }, signal);
		assert.equal(first.ok, true); assert.deepEqual(first.ref, { producer: 'problem', id: 'one', revision: 1 }); exists = false;
		const ref = first.ref as { id: string; revision: number };
		const exact = await tools.execute({ operation: 'problem', id: ref.id, revision: ref.revision }, signal);
		assert.equal(exact.ok, true); assert.ok(exact.contents?.includes('saved body')); assert.equal(reads, 1);
	});
	test('missing execution selector is unavailable rather than a successful empty output', async () => {
		const row = { producer: 'notebook', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'code', events: [{ type: 'stream', blockId: 'exists', phase: 'running', stream: 'stdout', bytesBase64: '' }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh(); const tools = new ContextTools(client, client.captureScope()), signal = new AbortController().signal;
		assert.equal((await tools.execute({ operation: 'record', producer: 'notebook', id: 'one', revision: 1, blockId: 'missing', part: 'output' }, signal)).code, 'beacon-part-unavailable');
		assert.equal((await tools.execute({ operation: 'record', producer: 'notebook', id: 'one', revision: 1, blockId: 'exists', part: 'output' }, signal)).ok, true);
	});
	test('actual Notebook header selectors retain input and prove empty output without a synthetic stream', async () => {
		const row = { producer: 'notebook', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'int main(){}', events: [{ type: 'compile-attempt', details: { cellId: 'code-one', inputCellId: 'input-one', input: { name: 'data', text: '123' } } }, { type: 'compiled', exitCode: 0 }, { type: 'finished', outcome: { status: 'completed' }, coverage: { truncated: false } }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh(); const tools = new ContextTools(client, client.captureScope()), signal = new AbortController().signal;
		const input = await tools.execute({ operation: 'record', producer: 'notebook', id: 'one', revision: 1, blockId: 'code-one', inputId: 'input-one', part: 'input' }, signal);
		assert.equal(input.ok, true); assert.ok(input.contents?.includes('123'));
		const output = await tools.execute({ operation: 'record', producer: 'notebook', id: 'one', revision: 1, blockId: 'code-one', inputId: 'input-one', part: 'output' }, signal);
		assert.equal(output.ok, true); assert.equal(output.contents, '');
		assert.equal((await tools.execute({ operation: 'record', producer: 'notebook', id: 'one', revision: 1, blockId: 'missing', part: 'input' }, signal)).code, 'beacon-part-unavailable');
	});
	test('selected CPH input uses its original ordinal rather than its local batch position', async () => {
		const row = { producer: 'cph', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'code', events: [{ type: 'compile-attempt', details: { sampleNumbers: [2], problem: { tests: [{ input: 'second sample', output: 'expected' }] } } }, { type: 'sample-finished', sampleId: '2', result: { stdout: '' } }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh(); const tools = new ContextTools(client, client.captureScope()), signal = new AbortController().signal;
		assert.equal((await tools.execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, sampleIndex: 2, part: 'input' }, signal)).contents, 'second sample');
		assert.equal((await tools.execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, sampleIndex: 2, part: 'actual' }, signal)).contents, '');
		assert.equal((await tools.execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, sampleIndex: 2, part: 'actual', stream: 'stdout' }, signal)).contents, '');
		assert.equal((await tools.execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, sampleIndex: 2, part: 'actual', stream: 'missing' }, signal)).code, 'beacon-part-unavailable');
	});
	test('whole CPH actual output preserves later failing samples instead of choosing the first', async () => {
		const row = { producer: 'cph', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'code', events: [{ type: 'sample-finished', sampleId: '1', index: 0, result: { stdout: 'FIRST PASSED' }, verdict: 'passed' }, { type: 'sample-finished', sampleId: '2', index: 1, result: { stdout: 'SECOND WRONG OUTPUT' }, verdict: 'wrong-answer' }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh(); const tools = new ContextTools(client, client.captureScope()), signal = new AbortController().signal;
		for (const part of ['output', 'actual'] as const) { const result = await tools.execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, part }, signal); assert.equal(result.ok, true); assert.ok(result.contents?.includes('FIRST PASSED')); assert.ok(result.contents?.includes('SECOND WRONG OUTPUT')); }
	});
	test('shared record first read pins the revision only for this answer without private copying', async () => {
		let reads = 0, exists = true; const privateCopies: unknown[] = [];
		const record = { producer: 'runner', id: 'run', revision: 1, state: 'finished', capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', activityId: 'a', code: 'captured', events: [{ type: 'finished' }] } };
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return selected(); }
			if (operation === 'readRecent') { reads++; if (!exists) { throw new Error('beacon-record-evicted'); } return record; }
			throw new Error(operation);
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope(), [], { capturePrivate: value => privateCopies.push(value) }); const signal = new AbortController().signal;
		assert.equal((await tools.execute({ operation: 'record', producer: 'runner', id: 'run', revision: 1, part: 'code' }, signal)).contents, 'captured');
		exists = false;
		assert.equal((await tools.execute({ operation: 'record', producer: 'runner', id: 'run', revision: 1, part: 'events' }, signal)).ok, true);
		assert.equal(reads, 1); assert.equal(privateCopies.length, 0);
		assert.equal((await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'runner', id: 'run', revision: 1 }, signal)).ok, false);
	});
	test('selected CPH all contains original input expected and result from the same sample', async () => {
		const row = { producer: 'cph', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'compiled source', events: [{ type: 'compile-attempt', details: { sampleNumbers: [2], problem: { tests: [{ input: '9223372036854775807\n', output: '' }] } } }, { type: 'sample-finished', sampleId: '2', index: 0, result: { stdout: '', stderr: 'debug\n' }, verdict: 'passed' }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, sampleIndex: 2, part: 'all' }, new AbortController().signal);
		assert.equal(result.ok, true);
		const sample = JSON.parse(result.contents!);
		assert.equal(sample.sampleNumber, 2); assert.equal(sample.input, '9223372036854775807\n'); assert.equal(sample.expected, '');
		assert.equal(sample.actual, ''); assert.equal(sample.stderr, 'debug\n'); assert.equal(sample.verdict, 'passed');
		assert.deepEqual(result.selection, { part: 'all', sampleIndex: 2 });
		assert.ok((result.availableParts as string[]).includes('input'));
		assert.deepEqual(result.sampleNumbers, [2]);
	});
	test('compaction directory listing does not receive invalid pagination parameters', async () => {
		const client = new BeaconContextClient(async operation => { if (operation === 'context') { return selected(); } if (operation === 'listCodeSnapshots') { return []; } throw new Error(operation); });
		await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).compactionView()!.execute({ operation: 'codeSnapshots' }, new AbortController().signal);
		assert.equal(result.ok, true); assert.deepEqual(result.snapshots, []);
	});
	test('sample stream selection is either honored or explicitly rejected and not advertised as complete all', async () => {
		const row = { producer: 'cph', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'code', events: [{ type: 'compile-attempt', details: { sampleNumbers: [2], problem: { tests: [{ input: 'in', output: 'expected' }] } } }, { type: 'sample-finished', sampleId: '2', result: { stdout: 'wrong output', stderr: 'debug trace' }, verdict: 'wrong-answer' }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, sampleIndex: 2, part: 'all', stream: 'stderr' }, new AbortController().signal);
		assert.equal(result.ok, false); assert.equal((result.issues as {field:string}[])[0].field, 'stream');
	});
	test('available sample verdict is not borrowed from another completed sample', async () => {
		const row = { producer: 'cph', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'code', events: [{ type: 'compile-attempt', details: { sampleNumbers: [1, 2], problem: { tests: [{ input: 'a', output: 'a' }, { input: 'b', output: 'b' }] } } }, { type: 'sample-finished', sampleId: '1', verdict: 'passed', result: { stdout: 'a' } }, { type: 'sample-started', sampleId: '2' }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, sampleIndex: 2 }, new AbortController().signal);
		assert.equal(result.ok, true); assert.equal((result.availableParts as string[]).includes('verdict'), false);
	});
	test('CPH combined sample decodes retained byte ranges before redaction', async () => {
		const bytes = Buffer.from('api_key="synthetic-value-that-must-be-redacted"\n');
		const bounded = { partial: true, observedBytes: bytes.length + 100, ranges: [{ offset: 0, bytesBase64: bytes.toString('base64') }] };
		const row = { producer: 'cph', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'code', events: [{ type: 'compile-attempt', details: { sampleNumbers: [2], problem: { tests: [{ input: 'input', output: 'expected' }] } } }, { type: 'sample-finished', sampleId: '2', result: { stdout: bounded, stderr: '' }, verdict: 'wrong-answer' }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, sampleIndex: 2, part: 'all' }, new AbortController().signal);
		assert.equal(result.ok, true); assert.ok(!JSON.stringify(result).includes(bytes.toString('base64')));
		assert.ok(!JSON.stringify(result).includes('synthetic-value-that-must-be-redacted'));
		assert.ok(result.contents?.includes('[redacted]')); assert.ok(!result.contents?.includes('bytesBase64'));
	});
	test('individual CPH bounded input expected and actual use the same decoded representation', async () => {
		const bytes = Buffer.from('api_key="individual-synthetic-secret"\n');
		const bounded = { partial: true, ranges: [{ offset: 0, bytesBase64: bytes.toString('base64') }] };
		const row = { producer: 'cph', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'code', events: [{ type: 'compile-attempt', details: { sampleNumbers: [2], problem: { tests: [{ input: bounded, output: bounded }] } } }, { type: 'sample-finished', sampleId: '2', result: { stdout: bounded }, verdict: 'wrong-answer' }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh();
		const tools = new ContextTools(client, client.captureScope());
		for (const part of ['input', 'expected', 'actual'] as const) {
			const result = await tools.execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, sampleIndex: 2, part }, new AbortController().signal);
			assert.equal(result.ok, true); assert.ok(!result.contents?.includes('bytesBase64'));
			assert.ok(result.contents?.includes('[redacted]')); assert.ok(!result.contents?.includes('individual-synthetic-secret'));
		}
		const allActual = await tools.execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, part: 'actual' }, new AbortController().signal);
		assert.equal(allActual.ok, true); assert.ok(!allActual.contents?.includes('bytesBase64'));
		assert.ok(allActual.contents?.includes('[redacted]'));
	});
	test('CPH combined sample retains stream when checker fails before sample-finished', async () => {
		const row = { producer: 'cph', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'code', events: [{ type: 'compile-attempt', details: { sampleNumbers: [2], problem: { tests: [{ input: 'in', output: 'expected' }] } } }, { type: 'sample-started', sampleId: '2' }, { type: 'stream', phase: 'running', stream: 'stdout', sampleId: '2', bytesBase64: Buffer.from('CAPTURED_PARTIAL').toString('base64') }, { type: 'finished', outcome: { status: 'failed' } }], startedAt: 1, lastEventSequence: 1 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'cph', id: 'one', revision: 1, sampleIndex: 2, part: 'all' }, new AbortController().signal);
		assert.equal(result.ok, true); assert.ok(result.contents?.includes('CAPTURED_PARTIAL'));
		assert.ok(!JSON.parse(result.contents!).verdict);
	});
	test('concurrent first selectors share the same record fixation', async () => {
		let reads = 0, release!: () => void, started!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		const reading = new Promise<void>(resolve => { started = resolve; });
		const row = recentRuntime({ id: 'one', revision: 1, startedAt: 1, code: 'old code', events: [{ type: 'compile-attempt', details: { input: 'old input' } }] });
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return selected(); }
			if (operation === 'readRecent') { reads++; if (reads > 1) { throw new Error('beacon-record-changed'); } started(); await gate; return row; }
			throw new Error(operation);
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()), signal = new AbortController().signal;
		const first = tools.execute({ operation: 'record', producer: 'runner', id: 'one', revision: 1, part: 'code' }, signal);
		await reading;
		const second = tools.execute({ operation: 'record', producer: 'runner', id: 'one', revision: 1, part: 'input' }, signal);
		await new Promise<void>(resolve => setImmediate(resolve)); release();
		const results = await Promise.all([first, second]);
		assert.equal(reads, 1); assert.deepEqual(results.map(result => result.ok), [true, true]);
		assert.deepEqual(results.map(result => result.contents), ['old code', 'old input']);
	});
	test('an aborted first fixation cannot populate a later read of that ref', async () => {
		let reads = 0, release!: () => void, started!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; }), reading = new Promise<void>(resolve => { started = resolve; });
		const row = recentRuntime({ id: 'one', revision: 1, startedAt: 1, code: 'must-not-pin', events: [] });
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return selected(); }
			if (operation === 'readRecent') { reads++; if (reads > 1) { throw new Error('beacon-record-evicted'); } started(); await gate; return row; }
			throw new Error(operation);
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()), controller = new AbortController();
		const first = tools.execute({ operation: 'record', producer: 'runner', id: 'one', revision: 1, part: 'code' }, controller.signal);
		await reading; controller.abort(); release(); await assert.rejects(first);
		const next = await tools.execute({ operation: 'record', producer: 'runner', id: 'one', revision: 1, part: 'code' }, new AbortController().signal);
		assert.equal(next.ok, false); assert.equal(reads, 2);
	});
	test('problem hint availability does not pretend an unmatched query has a problem', async () => {
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return selected(); }
			if (operation === 'pages') { return [{ id: 'one', kind: 'text', active: true, title: 'plain.cpp', uri: 'file:///C:/chosen/plain.cpp', version: '1' }]; }
			if (operation === 'listRecent') { return []; }
			throw new Error(operation);
		});
		await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'problemHints' }, new AbortController().signal);
		assert.equal(result.ok, true); assert.deepEqual(result.hints, []);
		assert.equal((result.sources as Record<string, string>).getProblem, 'no-match');
		assert.equal((result.sources as Record<string, string>).cph, 'unavailable');
	});
	test('saved problem records retain section and locale selectors through validation', async () => {
		const row = { producer: 'problem', id: 'one', revision: 1, capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'problem', document: { ref: { site: 'luogu', nativeId: 'P1', url: 'https://www.luogu.com.cn/problem/P1' }, title: 'synthetic', bodies: [{ locale: 'zh-CN', sections: [{ format: 'markdown', content: 'first' }, { format: 'markdown', content: 'second' }] }], samples: [], limits: [], interactive: false } } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'problem', id: 'one', revision: 1, locale: 'zh-CN', sectionIndex: 2 }, new AbortController().signal);
		assert.equal(result.ok, true); assert.equal(result.contents, 'second');
	});
	test('SDK returns field issues and pairs an invalid call before the corrected code read', async () => {
		let requests = 0, reads = 0;
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return { ...selected(), mode: 'blackout', workspaceState: 'blackout' }; }
			if (operation === 'pages') { return []; }
			if (operation === 'currentCode') { reads++; return { sourceUri: 'untitled:a.cpp', fileName: 'a.cpp', pageId: 'a', version: '1', languageId: 'cpp', observedAt: 1, contents: 'int main(){return 0;}' }; }
			throw new Error(operation);
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const connection: Connection = { provider: 'deepseek', baseURL: 'https://provider.invalid', model: 'synthetic', apiKey: 'synthetic', parameters: {}, capabilities: resolveCapabilities('deepseek', 'https://provider.invalid', 'synthetic') };
		const generator = createGenerator(async () => connection, async (_url, init) => {
			const body = JSON.parse(String(init?.body)); requests++;
			if (requests === 2) { const result = JSON.parse(body.messages.find((message: { role: string }) => message.role === 'tool').content); assert.equal(result.issues[0].field, 'operation'); }
			const delta = requests <= 2 ? { tool_calls: [{ index: 0, id: `call-${requests}`, type: 'function', function: { name: 'inspectContext', arguments: JSON.stringify(requests === 1 ? {} : { operation: 'currentCode' }) } }] } : { content: '只返回0。' };
			return new Response('data: ' + JSON.stringify({ id: 'test', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: requests <= 2 ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		}, 'none', [], false, undefined, {}, tools);
		const session = new ChatSession(() => {}, () => 'failed'); await session.send('看当前代码。', generator);
		assert.equal(session.snapshot.error, ''); assert.equal(reads, 1); assert.equal(requests, 3);
		const protocol = JSON.stringify(session.snapshot.messages.at(-1)?.protocol);
		assert.ok(protocol.includes('call-1')); assert.ok(protocol.includes('operation')); assert.ok(protocol.includes('call-2'));
	});
	test('live read names conversation snapshot saving and supplies a complete continuation', async () => {
		let saves = 0;
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return selected(); }
			if (operation === 'currentCode') { return { sourceUri: 'untitled:main.cpp', fileName: 'main.cpp', pageId: 'editor', version: '2', languageId: 'cpp', observedAt: 2, contents: 'abcdef' }; }
			if (operation === 'saveCodeRead') { saves++; return { state: 'saved', id: 'kept', reused: false }; }
			throw new Error(operation);
		});
		await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'currentCode', limit: 2 }, new AbortController().signal);
		assert.equal(result.save, undefined);
		assert.deepEqual(result.snapshotSave, { state: 'saved', id: 'kept', reused: false });
		assert.deepEqual(result.continuation, { operation: 'codeSnapshot', id: 'kept', offset: 2, limit: 2 });
		assert.equal(result.contents, 'ab'); assert.equal(result.totalCharacters, 6); assert.equal(saves, 1);
	});
	test('shared evidence cannot bypass protected source paths', async () => {
		const row = { producer: 'runner', id: 'one', revision: 1, sourceUri: 'file:///C:/chosen/.env/main.cpp', capturedAt: 1, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'private body', events: [], startedAt: 1, lastEventSequence: 0 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : row); await client.refresh();
		const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'runner', id: 'one', revision: 1, part: 'code' }, new AbortController().signal);
		assert.equal(result.ok, false); assert.equal(result.code, 'beacon-protected-page'); assert.equal(result.contents, undefined);
	});
	test('live current code reads dirty edits and saves exactly the observation returned by the owner', async () => {
		let text = 'V1', version = '1'; const saved: unknown[] = [];
		const client = new BeaconContextClient(async (operation, input) => {
			if (operation === 'context') { return selected(); }
			if (operation === 'currentCode') {
				const observed = { sourceUri: 'file:///C:/chosen/main.cpp', fileName: 'main.cpp', filePath: 'C:/chosen/main.cpp', pageId: 'editor', version, languageId: 'cpp', observedAt: Number(version), contents: text };
				text = 'later'; version = '2'; return observed;
			}
			if (operation === 'saveCodeRead') { saved.push((input as { observation: unknown }).observation); return { state: 'saved', id: 'snapshot-' + saved.length, reused: false }; }
			throw new Error(operation);
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		assert.equal(saved.length, 0);
		const first = await tools.execute({ operation: 'currentCode' } as never, signal);
		assert.equal(first.ok, true); assert.equal(first.contents, 'V1');
		assert.equal((saved[0] as { contents: string }).contents, 'V1');
		const next = await tools.execute({ operation: 'currentCode' } as never, signal);
		assert.equal(next.contents, 'later'); assert.equal((saved[1] as { version: string }).version, '2');
	});
	test('Blackout reads live code with no persistent owner calls', async () => {
		const state = { ...selected(), mode: 'blackout', workspaceState: 'blackout' }; const calls: string[] = [];
		const client = new BeaconContextClient(async operation => {
			calls.push(operation); if (operation === 'context') { return state; }
			if (operation === 'currentCode') { return { sourceUri: 'untitled:main.cpp', fileName: 'main.cpp', pageId: 'editor', version: '1', languageId: 'cpp', observedAt: 1, contents: 'dirty' }; }
			throw new Error(operation);
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		const read = await tools.execute({ operation: 'currentCode' } as never, signal);
		assert.equal(read.ok, true); assert.equal(read.contents, 'dirty'); assert.deepEqual(read.snapshotSave, { state: 'disabled', reason: 'blackout' });
		assert.equal((await tools.execute({ operation: 'codeSnapshots' } as never, signal)).ok, false);
		assert.ok(calls.every(call => ['context', 'currentCode'].includes(call)));
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
	test('OJ records filter source and compiler credentials before pagination', async () => {
		const ref = { problem: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, id: '1', url: 'https://www.luogu.com.cn/record/1' };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : { producer: 'oj', id: 'one', revision: 1, coverage: { channels: [] }, payload: { kind: 'oj', record: { ref, phase: 'finished', rawStatus: 'CE', sourceVerification: 'not-checked', source: '// Cookie: private=secret\nint cookie = 1;', compileMessage: 'Bearer private-token' } } });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		const result = await tools.execute({ operation: 'record', producer: 'oj', id: 'one', revision: 1 }, signal);
		assert.equal(result.ok, true); assert.ok(result.contents?.includes('int cookie = 1')); assert.equal(result.contents?.includes('private-token'), false); assert.equal(result.contents?.includes('private=secret'), false);
	});

	test('functional OJ and Notebook pages cannot provide alternative execution evidence', async () => {
		const pages = [{ id: 'oj:record', kind: 'oj-record', title: 'WA', version: '1' }, { id: 'notebook', kind: 'notebook', title: 'note', version: '1' }]; let reads = 0;
		const client = new BeaconContextClient(async operation => { if (operation === 'context') { return selected(); } if (operation === 'pages') { return pages; } reads++; return []; });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		assert.deepEqual((await tools.execute({ operation: 'pages' }, signal)).pages, []);
		for (const page of pages) { assert.equal((await tools.execute({ operation: 'page', id: page.id, version: '1' }, signal)).ok, false); }
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
	test('runtime returns shared source identity and coverage without conversation material writes', async () => {
		const record = { producer: 'runner', id: 'run', revision: 3, capturedAt: 1, sourceUri: 'file:///C:/chosen/main.cpp', sourceDigest: { value: 'a'.repeat(64), representation: 'compiler-bytes' }, coverage: { channels: [] }, payload: { kind: 'runtime', code: 'V1', events: [], startedAt: 1, lastEventSequence: 0 } };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : record);
		await client.refresh(); const tools = new ContextTools(client, client.captureScope()); const signal = new AbortController().signal;
		const first = await tools.execute({ operation: 'record', producer: 'runner', id: 'run', revision: 3, part: 'code' }, signal);
		assert.equal(first.contents, 'V1'); assert.deepEqual(first.sourceDigest, record.sourceDigest); assert.deepEqual(first.coverage, record.coverage);
		assert.equal((await tools.execute({ operation: 'material', id: 'runner-run-3' }, signal)).ok, false);
	});

	test('SDK context failures retain a safe actionable code in activity and saved history', async () => {
		const connection: Connection = { provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test', parameters: {}, capabilities: { ...resolveCapabilities('deepseek', 'https://api.deepseek.com/v1', 'deepseek-chat'), tools: true } };
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
	test('runtime coverage reflects the producer without inventing completeness', async () => {
		const coverage = { channels: [], complete: false };
		const client = new BeaconContextClient(async operation => operation === 'context' ? selected() : { producer: 'runner', id: 'run', revision: 1, coverage, payload: { kind: 'runtime', code: 'V1', events: [], startedAt: 1, lastEventSequence: 0 } });
		await client.refresh(); const result = await new ContextTools(client, client.captureScope()).execute({ operation: 'record', producer: 'runner', id: 'run', revision: 1 }, new AbortController().signal);
		assert.deepEqual(result.coverage, coverage);
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
		const connection: Connection = { provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test', parameters: {}, capabilities: { ...resolveCapabilities('deepseek', 'https://api.deepseek.com/v1', 'deepseek-chat'), tools: true } };
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
			if (operation === 'readRecent') { return recentRuntime({ id: 'run', materialId: 'runner-run-1', revision: 1, startedAt: 1, sequence: 0, code, events: [{ type: 'compile-attempt', sourceSnapshot: { bytesBase64: Buffer.from(code).toString('base64'), sha256: 'captured-hash', complete: true } }, { type: 'stream', phase: 'compiling', stream: 'stderr', bytesBase64: Buffer.from('actual compile error').toString('base64') }] }); }
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
			if (operation === 'readRecent') { if (++consumes > 1) { throw new Error('beacon-record-changed'); } return recentRuntime(record); }
			if (operation === 'materialRead') { return record; }
			throw new Error('unexpected-operation');
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const first = await tools.execute({ operation: 'record', producer: 'runner', id: 'run', revision: 3, limit: 8 }, new AbortController().signal);
		assert.equal(first.ok, true);
		const next = await tools.execute({ operation: 'record', producer: 'runner', id: 'run', revision: 3, offset: first.nextOffset as number, limit: 8 }, new AbortController().signal);
		assert.equal(next.ok, true); assert.deepEqual(next.ref, first.ref); assert.equal(consumes, 1);
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
		const connection: Connection = { provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'test', parameters: {}, capabilities: { ...resolveCapabilities('deepseek', 'https://api.deepseek.com/v1', 'deepseek-chat'), tools: true } };
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
		assert.equal(overview.records, undefined);
		assert.equal(overview.mode, 'blackout');
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

	test('Blackout cannot reread even preloaded private persistent context', async () => {
		const snapshot: ContextSnapshot = { key: 'page:old:1:', raw: 'private old body', metadata: { source: { kind: 'page', id: 'old', version: '1', capturedAt: 1, contentSha256: 'a'.repeat(64), representation: 'captured' } } };
		const calls: string[] = []; const client = new BeaconContextClient(async operation => { calls.push(operation); if (operation === 'context') { return { ...selected(), mode: 'blackout', workspaceState: 'blackout' }; } return []; });
		await client.refresh(); const tools = new ContextTools(client, client.captureScope(), [], { privateSnapshots: [snapshot] }); const signal = new AbortController().signal;
		assert.equal((await tools.execute({ operation: 'material', id: snapshot.key }, signal)).ok, false);
		assert.equal((await tools.execute({ operation: 'codeSnapshots' }, signal)).ok, false);
		assert.equal((await tools.execute({ operation: 'records' }, signal)).ok, false);
		assert.ok(calls.every(operation => operation === 'context'));
	});

	test('runtime records pin native revision and return immutable own material, with decoded observations', async () => {
		let state = selected(); const operations: string[] = [];
		const client = new BeaconContextClient(async (operation, input) => {
			operations.push(operation);
			if (operation === 'context') { return state; }
			if (operation === 'readRecent') {
				assert.equal((input as { ref: { revision: number } }).ref.revision, 3);
				assert.equal((input as { scope: IBeaconContext }).scope.activeId, 'conversation-one');
				return recentRuntime({ id: 'run', revision: 3, startedAt: 1, sequence: 2, code: 'V1', events: [{ type: 'output', bytesBase64: Buffer.from('actual stderr').toString('base64') }] });
			}
			throw new Error('unexpected-operation');
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const result = await tools.execute({ operation: 'record', producer: 'runner', id: 'run', revision: 3 }, new AbortController().signal);
		assert.equal(result.ok, true); assert.deepEqual(result.ref, { producer: 'runner', id: 'run', revision: 3 }); assert.ok(result.contents?.includes('actual stderr'));
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

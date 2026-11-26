/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BeaconContextClient } from '../src/context';
import { ContextTools } from '../src/contextTools';
import { contextInputValid, contextToolNames } from '../src/contextToolContract';
import { createGenerator } from '../src/provider';
import type { IBeaconRunRecord, IBeaconVerdictRecord } from 'becoder-beacon';

const signal = new AbortController().signal;
const state = { slot: 'one', root: 'C:\\chosen', usable: true, workspaceState: 'ready' as const, mode: 'spot' as const, epoch: 2, busy: false, runtimeBusy: false, collectionPending: false, activeId: 'conversation', recent: ['C:\\chosen'] };
const run = (id: string, filePath = 'C:/chosen/A.cpp'): IBeaconRunRecord => ({ id, source: 'runner', operation: 'run', startedAt: '2026-11-26T00:00:00.123Z', endedAt: '2026-11-26T00:00:02Z', status: 'completed', program: { filePath, language: 'cpp', code: 'int main() {}\r\n' }, compile: { status: 'succeeded', args: ['-O2', '-DDEBUG', '-std=c++20', '-o', 'temp.exe'], compiler: 'private/g++.exe', durationMs: 1234.5, workingDirectory: 'private' }, command: 'run A.cpp', runs: [{ input: { mode: 'interactive', text: null }, status: 'completed', durationMs: 7.8, exitCode: 0 }], gaps: ['Input is unknown.'] });

async function setup(records: IBeaconRunRecord[] = [run('one')], verdicts: IBeaconVerdictRecord[] = []) {
	const client = new BeaconContextClient(async (op, raw) => {
		const input = raw as { kind?: string; id?: string };
		if (op === 'context') { return state; }
		if (op === 'pages') { return []; }
		if (op === 'listRecords') { return structuredClone(input.kind === 'verdict' ? verdicts : records); }
		if (op === 'readRecord') { return structuredClone((input.kind === 'verdict' ? verdicts : records).find(item => item.id === input.id)); }
		if (op === 'visibleCurrentCode') { return [{ fileName: 'A.cpp', filePath: 'C:/chosen/A.cpp', isDirty: true, code: 'int main() {}\n' }]; }
		throw new Error('unexpected operation');
	});
	await client.refresh(); return new ContextTools(client, client.captureScope());
}

suite('Beacon concise tool information', () => {
	test('record selectors are consistent and mutually exclusive', () => {
		for (const name of ['readRunRecord', 'readProblemRecord', 'readVerdictRecord'] as const) {
			for (const value of [{}, { id: 'one' }, { latest: true }, { filePath: 'A.cpp', latest: true }]) { assert.equal(contextInputValid(name, value), true); }
			for (const value of [{ latest: false }, { id: 'one', latest: true }, { id: 'one', filePath: 'A.cpp' }, { filePath: '' }, { part: 'code' }]) { assert.equal(contextInputValid(name, value), false); }
		}
	});
	test('all three queues select the latest matching historical path without opening a file', async () => {
		const client = new BeaconContextClient(async (operation, raw) => {
			if (operation === 'context') { return state; }
			if (operation !== 'listRecords') { throw new Error('Unexpected lookup or file access'); }
			const kind = (raw as { kind: string }).kind;
			return ['A', 'B', 'A'].map((file, index) => kind === 'run' ? run('item' + index, `C:/chosen/deleted/${file}.cpp`) : kind === 'problem'
				? { id: 'item' + index, filePath: `C:/chosen/deleted/${file}.cpp`, problem: { oj: 'luogu', problemId: 'P1001' }, viewedAt: '2026-11-26T00:00:00Z' }
				: { id: 'item' + index, filePath: `C:/chosen/deleted/${file}.cpp`, problem: { oj: 'luogu', problemId: 'P1001' }, observedAt: '2026-11-26T00:00:00Z', submission: {}, result: { rawStatus: 'AC' } });
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		for (const name of ['readProblemRecord', 'readRunRecord', 'readVerdictRecord'] as const) {
			assert.equal(((await tools.execute(name, { filePath: 'deleted\\a.cpp', latest: true }, signal)).record as { id: string }).id, 'item2');
			assert.deepEqual(((await tools.execute(name, { filePath: 'deleted/A.cpp' }, signal)).records as { id: string }[]).map(item => item.id), ['item2', 'item0']);
		}
	});
	test('page ranges count Unicode characters and read the call-time version internally', async () => {
		let version = '1';
		const client = new BeaconContextClient(async (operation, raw) => {
			const page = { id: 'page', kind: 'text', title: 'note', version };
			if (operation === 'context') { return state; }
			if (operation === 'pages') { return [page]; }
			if (operation === 'page') { assert.equal((raw as { version: string }).version, version); return { ...page, contents: '中😀x\n', totalCharacters: 5 }; }
			throw new Error('unexpected read');
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const first = await tools.execute('readPage', { id: 'page', limit: 2 }, signal);
		assert.equal(first.contents, '中😀'); assert.equal(first.nextOffset, 2);
		version = '2'; const next = await tools.execute('readPage', { id: 'page', offset: 2 }, signal);
		assert.equal(next.contents, 'x\n'); assert.equal(next.source?.version, '2');
		assert.deepEqual(JSON.parse(await tools.describe(signal)), { pages: [{ id: 'page', kind: 'text', title: 'note', version: '2' }] });
	});
	test('latest selects after file filtering and remains a real ID, not a pinned discussion object', async () => {
		const records = [run('old'), run('other', 'C:/chosen/B.cpp'), run('last')];
		const tools = await setup(records);
		const result = await tools.execute('readRunRecord', { filePath: 'a.cpp', latest: true }, signal);
		assert.equal((result.record as { id: string }).id, 'last');
		records.push(run('new'));
		assert.equal(((await tools.execute('readRunRecord', { latest: true }, signal)).record as { id: string }).id, 'new');
		assert.equal(((await tools.execute('readRunRecord', { id: 'last' }, signal)).record as { id: string }).id, 'last');
		assert.deepEqual(await tools.execute('readRunRecord', { filePath: 'missing.cpp' }, signal), { records: [] });
		assert.equal(((await tools.execute('readRunRecord', { filePath: 'missing.cpp', latest: true }, signal)).error as { code: string }).code, 'not_found');
	});
	test('run model view hides compiler mechanics and rounds only measured runtime', async () => {
		const tools = await setup(); const value = (await tools.execute('readRunRecord', { id: 'one' }, signal)).record as Record<string, unknown>;
		assert.deepEqual(value.compile, { status: 'succeeded', standard: 'c++20', optimization: 'O2' });
		assert.equal(value.startedAt, '2026-11-26T00:00:00Z');
		assert.equal(Object.hasOwn(value, 'endedAt'), false); assert.equal(Object.hasOwn(value, 'command'), false);
		assert.equal((value.runs as { durationMs: number }[])[0].durationMs, 8);
		assert.equal((value.program as { codeHash: string }).codeHash, createHash('sha256').update('int main() {}\n').digest('hex'));
	});
	test('compile failure leaves planned CPH inputs unexecuted and check results unavailable', async () => {
		const record: IBeaconRunRecord = { ...run('compile'), source: 'cph', operation: 'test-one', status: 'compile-failed', compile: { status: 'failed', output: { stdout: '', stderr: 'compile error' } }, runs: [{ input: { mode: 'text', text: '1' }, testCaseNumber: 1, status: 'not-run', skipReason: 'compile-failed' }] };
		const tools = await setup([record]);
		const result = await tools.execute('readRunRecord', {}, signal);
		assert.equal((result.records as { summary: string }[])[0].summary, 'Compile: failed; 0 input(s) executed; 1 input(s) not executed; no check results available.');
	});
	test('Runner and Notebook execution summaries distinguish unstarted inputs from execution without automatic checking', async () => {
		for (const source of ['runner', 'notebook'] as const) {
			const record: IBeaconRunRecord = { ...run(source), source, ...(source === 'notebook' ? { operation: 'run-inputs', program: { ...run(source).program, codeCellNumber: 2 } } : {}) };
			const tools = await setup([record]);
			assert.equal(((await tools.execute('readRunRecord', {}, signal)).records as { summary: string }[])[0].summary, 'Compile: succeeded; 1 input(s) executed; 0 input(s) not executed; no automatic answer checking.');
			record.status = 'cancelled';
			record.runs = ['completed', 'runtime-error', 'timed-out', 'output-limit', 'cancelled', 'start-failed', 'not-run'].map(status => ({ input: { mode: 'text', text: '' }, status } as IBeaconRunRecord['runs'][number]));
			const changed = await setup([record]);
			assert.equal(((await changed.execute('readRunRecord', {}, signal)).records as { summary: string }[])[0].summary, 'Compile: succeeded; 5 input(s) executed; 2 input(s) not executed; no automatic answer checking.');
		}
	});
	test('CPH counts actual independent checks without inferring them from process completion', async () => {
		const record: IBeaconRunRecord = { ...run('checks'), source: 'cph', operation: 'test-all', runs: [1, 2, 3].map(testCaseNumber => ({ input: { mode: 'text', text: '1' }, testCaseNumber, status: 'completed', check: 'passed' })) };
		const tools = await setup([record]);
		assert.equal(((await tools.execute('readRunRecord', {}, signal)).records as { summary: string }[])[0].summary, 'Compile: succeeded; 3 input(s) executed; 0 input(s) not executed; Checks: 3 passed.');
		delete record.runs[2].check;
		record.runs[1].check = 'wrong-answer';
		const partial = await setup([record]);
		assert.equal(((await partial.execute('readRunRecord', {}, signal)).records as { summary: string }[])[0].summary, 'Compile: succeeded; 3 input(s) executed; 0 input(s) not executed; Checks: 1 passed, 1 wrong-answer; 1 input(s) without check results.');
		for (const item of record.runs) { delete item.check; }
		const unchecked = await setup([record]);
		assert.equal(((await unchecked.execute('readRunRecord', {}, signal)).records as { summary: string }[])[0].summary, 'Compile: succeeded; 3 input(s) executed; 0 input(s) not executed; no check results available.');
	});
	test('CPH checker errors and cancellation remain independent of execution counts', async () => {
		const record: IBeaconRunRecord = { ...run('checker'), source: 'cph', operation: 'test-all', status: 'cancelled', runs: ['output-limit', 'cancelled', 'time-limit', 'runtime-error', 'wrong-answer', 'passed'].map(check => ({ input: { mode: 'text', text: '' }, status: 'completed', check } as IBeaconRunRecord['runs'][number])) };
		record.runs.push({ input: { mode: 'text', text: '' }, status: 'not-run', skipReason: 'cancelled' });
		const tools = await setup([record]);
		assert.equal(((await tools.execute('readRunRecord', {}, signal)).records as { summary: string }[])[0].summary, 'Compile: succeeded; 6 input(s) executed; 1 input(s) not executed; Checks: 1 passed, 1 wrong-answer, 1 runtime-error, 1 time-limit, 1 cancelled, 1 output-limit; 1 input(s) without check results.');
		const detail = (await tools.execute('readRunRecord', { id: record.id }, signal)).record as IBeaconRunRecord;
		assert.equal(detail.runs[0].status, 'completed');
		assert.equal(detail.runs[0].check, 'output-limit');
		assert.equal(detail.runs[6].check, undefined);
	});
	test('registered descriptions explain visible notebooks and source-specific checking without adding workflow rules', async () => {
		let requests = 0;
		const connection = { provider: 'deepseek' as const, baseURL: 'https://fixture.invalid', apiKey: 'synthetic', model: 'fixture', parameters: {}, capabilities: { purpose: 'chat' as const, vision: false, tools: true, reasoning: false, source: 'service' as const } };
		const generator = createGenerator(async () => connection, async (_url, init) => {
			requests++;
			const body = JSON.parse(String(init?.body)) as { tools: { function: { name: string; description: string } }[] };
			const descriptions = Object.fromEntries(body.tools.map(tool => [tool.function.name, tool.function.description]));
			assert.match(descriptions.readCurrentCode, /currently visible C\/C\+\+ documents and BeCoder notebooks/);
			assert.match(descriptions.readCurrentCode, /Each document appears once/);
			assert.match(descriptions.readCurrentCode, /all numbered content cells/);
			assert.match(descriptions.readCurrentCode, /Execution results are excluded/);
			assert.match(descriptions.readRunRecord, /Runner and Notebook execute without automatic answer checking/);
			assert.match(descriptions.readRunRecord, /CPH provides local check results when checking completes/);
			assert.match(descriptions.readRunRecord, /output is merged for Runner\/Notebook and separate for CPH/);
			return new Response('data: ' + JSON.stringify({ id: 'information', choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		}, 'none', [], false, undefined, {}, await setup());
		for await (const delta of generator([{ role: 'user', content: 'Explain the available evidence.' }], signal, async input => ({ ok: false, path: input.path, error: 'disabled' }))) { void delta; }
		assert.equal(requests, 1);
	});
	test('live and historical code use the same normalized hash without hashing a legacy prefix', async () => {
		const records = [run('full'), { ...run('prefix'), program: { ...run('prefix').program, code: { text: 'int', truncated: true as const } } }];
		const tools = await setup(records);
		const live = (await tools.execute('readCurrentCode', {}, signal)).files as { codeHash: string }[];
		assert.match(live[0].codeHash, /^[a-f0-9]{64}$/);
		assert.equal(((await tools.execute('readRunRecord', { id: 'full' }, signal)).record as IBeaconRunRecord).program.codeHash, live[0].codeHash);
		assert.equal(((await tools.execute('readRunRecord', { id: 'prefix' }, signal)).record as IBeaconRunRecord).program.codeHash, undefined);
	});
	test('legacy notebook ordinal is not renamed into a whole-notebook coordinate', async () => {
		const old = { ...run('old'), source: 'notebook' as const, operation: 'run-inputs' as const, program: { ...run('old').program, codeBlockNumber: 2 } };
		const tools = await setup([old]); const value = (await tools.execute('readRunRecord', { id: 'old' }, signal)).record as IBeaconRunRecord;
		assert.equal(value.program.codeCellNumber, undefined); assert.equal(value.program.codeBlockNumber, undefined); assert.ok(value.gaps?.length);
	});
	test('old oversized latest does not silently fall back to an older body', async () => {
		const large = run('large'); large.runs[0].input.text = 'x'.repeat(40000);
		const tools = await setup([run('old'), large]);
		assert.equal(((await tools.execute('readRunRecord', { latest: true }, signal)).error as { code: string }).code, 'too_large');
		assert.equal(((await tools.execute('readRunRecord', { id: 'old' }, signal)).record as { id: string }).id, 'old');
	});
	test('mismatch stays unavailable and five-site test rows have their actual meanings', async () => {
		const verdict = (oj: IBeaconVerdictRecord['problem']['oj'], rows: string[][]): IBeaconVerdictRecord => ({ id: oj, problem: { oj, problemId: 'p' }, filePath: 'C:/chosen/A.cpp', observedAt: '2026-11-26T00:00:00Z', submission: { code: 'int main() {}\n', sourceVerification: 'not-checked' }, result: { rawStatus: 'AC', groups: [{ name: 'tests', rows }] } });
		const bad = verdict('luogu', []); bad.id = 'bad'; bad.submission.sourceVerification = 'mismatch';
		const records = [verdict('luogu', [['1', 'AC', '0 ms', '1 KiB', 'ok', 'Score: 0', '', 'Exit with code 0']]), verdict('codeforces', [['2', 'OK', '1 ms', '2 B', 'Exit with code -1']]), verdict('atcoder', [['sample_01', 'AC', '1 ms', '2 KB', 'extra']]), verdict('lanqiao', [['1', 'AC', '0 ms', '0 kb']]), verdict('nowcoder', []), bad];
		const tools = await setup([], records);
		const read = async (id: string) => (await tools.execute('readVerdictRecord', { id }, signal)).record as unknown as { submission: object; result: { groups: { rows: Record<string, unknown>[] }[] } };
		assert.equal(((await tools.execute('readVerdictRecord', { id: 'bad' }, signal)).error as { code: string }).code, 'unavailable');
		assert.equal((await tools.execute('readVerdictRecord', {}, signal)).records instanceof Array, true);
		const lg = await read('luogu'); assert.equal(Object.hasOwn(lg.submission, 'sourceVerification'), false); assert.equal(lg.result.groups[0].rows[0].score, 'Score: 0');
		assert.equal((await read('codeforces')).result.groups[0].rows[0].exitCode, 'Exit with code -1');
		assert.deepEqual((await read('atcoder')).result.groups[0].rows[0].extraColumns, ['extra']);
		assert.equal((await read('lanqiao')).result.groups[0].rows[0].memory, '0 kb');
	});
	test('readMaterial is absent and page version is internal', () => {
		assert.equal((contextToolNames as readonly string[]).includes('readMaterial'), false);
		assert.equal(contextInputValid('readPage', { id: 'page' }), true);
		assert.equal(contextInputValid('readPage', { id: 'page', version: 'old' }), false);
	});
});

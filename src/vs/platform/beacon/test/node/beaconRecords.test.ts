/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import * as path from '../../../../base/common/path.js';
import { tmpdir } from 'os';
import { BeaconStore, prepareBeaconWorkspace } from '../../node/beaconStore.js';
import { BeaconCoordinator } from '../../node/beaconCoordinator.js';
import type { IBeaconWindowSelection } from '../../common/beaconContextTypes.js';
import { BeaconPages } from '../../common/beaconPages.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { appendBeaconRecord, validateBeaconRecord } from '../../common/beaconRecords.js';
// eslint-disable-next-line local/code-import-patterns -- Internal transport fixture.
import type { IBeaconProblemRecord, IBeaconRunRecord, IBeaconVerdictRecord } from 'becoder-beacon';

const at = '2026-11-24T00:00:00.000Z';
const problem = (id: string, filePath: string | null = 'C:/A.cpp'): IBeaconProblemRecord => ({ id, problem: { oj: 'luogu', problemId: 'P1001' }, filePath, viewedAt: at });
const run = (id: string): IBeaconRunRecord => ({ id, source: 'runner', operation: 'run', startedAt: at, endedAt: at, status: 'completed', program: { filePath: 'C:/A.cpp', code: 'int main(){}', language: 'cpp' }, compile: { status: 'succeeded' }, runs: [{ input: { mode: 'interactive', text: null }, status: 'completed', output: { merged: '' } }], gaps: ['Input unavailable.'] });
const verdict = (id: string, code?: string): IBeaconVerdictRecord => ({ id, problem: { oj: 'luogu', problemId: 'P1001' }, filePath: 'C:/A.cpp', observedAt: at, submission: { ...(code !== undefined ? { code } : {}) }, result: { rawStatus: 'Accepted', score: '100', time: '0 ms' } });

suite('Beacon semantic records', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('reads complete dirty visible code and untitled pages without reading a background tab', async () => {
		let backgroundReads = 0;
		const sources = [
			{ key: {}, kind: 'text' as const, title: 'A.cpp', uri: 'file:///C:/practice/A.cpp', languageId: 'cpp', visible: true, dirty: true, version: '1', read: async () => 'dirty\n'.repeat(10000) },
			{ key: {}, kind: 'text' as const, title: 'Untitled-1', uri: 'untitled:Untitled-1', languageId: 'c', visible: true, dirty: true, version: '1', read: async () => 'int main(){}' },
			{ key: {}, kind: 'text' as const, title: 'B.cpp', uri: 'file:///C:/practice/B.cpp', languageId: 'cpp', visible: false, dirty: false, version: '1', read: async () => { backgroundReads++; return 'background'; } }
		];
		const pages = new BeaconPages(() => sources);
		const read = Reflect.get(pages, 'readVisibleCurrentCode') as () => Promise<{ fileName: string; filePath: string | null; isDirty: boolean; code: string }[]>;
		assert.strictEqual(typeof read, 'function');
		const result = await read.call(pages);
		assert.strictEqual(result.length, 2); assert.strictEqual(result[0].code.length, 60000); assert.strictEqual(result[0].isDirty, true);
		assert.strictEqual(result[1].filePath, null); assert.strictEqual(backgroundReads, 0);
	});
	test('problem replaces exact problem and path with a new ID at tail', () => {
		const next = appendBeaconRecord('problem', [problem('old'), problem('other', 'C:/B.cpp')], problem('ignored'), 'new');
		assert.deepStrictEqual(next.map(row => row.id), ['other', 'new']);
		assert.deepStrictEqual(appendBeaconRecord('problem', [problem('old', null)], problem('ignored', null), 'new').map(row => row.id), ['new']);
	});
	test('visible code unavailable or replaced during reading fails without a partial batch', async () => {
		const key = {}, source = { key, kind: 'text' as const, title: 'A.cpp', uri: 'file:///C:/practice/A.cpp', visible: true, version: '1', reason: 'beacon-page-provider-unavailable', read: async () => '' };
		await assert.rejects(new BeaconPages(() => [source]).readVisibleCurrentCode(), /unavailable/);
		let version = '1';
		await assert.rejects(new BeaconPages(() => [{ ...source, reason: undefined, languageId: 'cpp', version, read: async () => { version = '2'; return 'old'; } }]).readVisibleCurrentCode(), /changed/);
	});
	test('problem retains thirteen and run retains thirty without code deduplication', () => {
		let problems: IBeaconProblemRecord[] = [], runs: IBeaconRunRecord[] = [];
		for (let index = 0; index < 32; index++) {
			problems = appendBeaconRecord('problem', problems, problem('ignored', `C:/${index}.cpp`), `p${index}`);
			runs = appendBeaconRecord('run', runs, run('ignored'), `r${index}`);
		}
		assert.strictEqual(problems.length, 13); assert.strictEqual(problems[0].id, 'p19');
		assert.strictEqual(runs.length, 30); assert.strictEqual(runs[0].id, 'r2');
	});
	test('verdict compares exact submitted code only inside the same problem', () => {
		const rows = [verdict('same', 'int main(){}'), verdict('space', 'int main(){} '), verdict('unknown'), { ...verdict('other', 'int main(){}'), problem: { oj: 'luogu' as const, problemId: 'P1002' } }];
		const next = appendBeaconRecord('verdict', rows, verdict('ignored', 'int main(){}'), 'new');
		assert.deepStrictEqual(next.map(row => row.id), ['space', 'unknown', 'other', 'new']);
		assert.strictEqual(appendBeaconRecord('verdict', next, verdict('ignored'), 'missing').length, 5);
		assert.strictEqual(appendBeaconRecord('verdict', Array.from({ length: 20 }, (_, i) => verdict(`v${i}`)), verdict('ignored'), 'last').length, 20);
	});
	test('rejects extra topic, runtime limits, checker details, invalid status and malformed output', () => {
		for (const [key, value] of Object.entries({ problem: {}, runtimeLimits: {}, checkerRun: {}, events: [], status: 'active' })) {
			assert.throws(() => validateBeaconRecord('run', { ...run('one'), [key]: value }));
		}
		assert.throws(() => validateBeaconRecord('run', { ...run('one'), runs: [{ ...run('one').runs[0], output: { merged: { head: 'a', tail: 'b', omittedBytes: -1 } } }] }));
		assert.throws(() => validateBeaconRecord('problem', { ...problem('one'), viewedAt: 'yesterday' }));
	});
	test('preserves empty outputs and decimal text while rejecting checker fields outside CPH', () => {
		validateBeaconRecord('run', run('one'));
		const large = verdict('v'); large.result.score = '9223372036854775807';
		validateBeaconRecord('verdict', large); assert.strictEqual(large.result.score, '9223372036854775807');
		assert.throws(() => validateBeaconRecord('run', { ...run('one'), runs: [{ ...run('one').runs[0], check: 'passed' }] }));
	});
	test('Store publishes a single semantic queue atomically without changing legacy data', async () => {
		const root = await fs.mkdtemp(path.join(tmpdir(), 'beacon-records-'));
		try {
			const binding = await prepareBeaconWorkspace(root, true), store = new BeaconStore(binding);
			const legacy = path.join(binding.assetsPath, 'cache', 'runner'); await fs.mkdir(legacy, { recursive: true });
			await fs.writeFile(path.join(legacy, 'records.json'), 'legacy bytes');
			const append = Reflect.get(store, 'appendRecord') as (kind: 'problem', value: IBeaconProblemRecord) => Promise<string>;
			assert.strictEqual(typeof append, 'function', 'Store must expose semantic queue publication');
			const read = Reflect.get(store, 'listRecords') as (kind: 'problem') => Promise<IBeaconProblemRecord[]>;
			assert.deepStrictEqual(await read.call(store, 'problem'), []);
			const id = await append.call(store, 'problem', problem('unused'));
			assert.strictEqual((await read.call(store, 'problem'))[0].id, id);
			const failing = new BeaconStore(binding, { rename: async () => { throw new Error('publication failed'); }, unlink: fs.unlink });
			await assert.rejects(append.call(failing, 'problem', problem('unused')), /publication failed/);
			assert.strictEqual((await read.call(store, 'problem'))[0].id, id);
			assert.strictEqual(await fs.readFile(path.join(legacy, 'records.json'), 'utf8'), 'legacy bytes');
			assert.strictEqual((await fs.readdir(path.join(binding.assetsPath, 'cache', 'context'))).filter(file => file.endsWith('.tmp')).length, 0);
		} finally { await fs.rm(root, { recursive: true, force: true }); }
	});
	test('semantic collection survives Blackout while consumption is denied and root changes reject old scope', async () => {
		const root = await fs.mkdtemp(path.join(tmpdir(), 'beacon-scope-'));
		const selections = new Map<number, IBeaconWindowSelection>([[1, { slot: 'one', mode: 'blackout' }], [2, { slot: 'two', mode: 'blackout' }]]);
		const service = new BeaconCoordinator({ getSelection: id => selections.get(id), saveSelection: (id, value) => { selections.set(id, value); }, getRecent: () => [], saveRecent: () => { }, changed: () => { } });
		try {
			assert.strictEqual(await service.captureCollectionScope(1), undefined);
			const source = path.join(root, 'A #.cpp'); await fs.writeFile(source, 'code');
			await service.selectWorkspace(1, root); await service.selectWorkspace(2, root);
			const scope = (await service.captureCollectionScope(1))!; await service.setMode(1, 'blackout');
			const data = { ...run('unused'), program: { ...run('unused').program, filePath: source } };
			const first = (await service.beginActivity(1, source, scope))!;
			const second = (await service.beginActivity(2, source, await service.captureCollectionScope(2)))!;
			const ids = await Promise.all([service.captureRun(1, first, data), service.captureRun(2, second, data)]);
			assert.notStrictEqual(ids[0], ids[1]); assert.strictEqual(await service.captureRun(1, first, data), ids[0]);
			await service.captureProblemRecord(1, { ...problem('unused'), filePath: source }, scope);
			const store = new BeaconStore(await prepareBeaconWorkspace(root, false));
			assert.strictEqual((await store.listRecords('run')).length, 2);
			await assert.rejects(service.listRecords(1, 'run', await service.getContext(1)));
			await service.endActivity(1, first); await service.endActivity(2, second);
			await service.setMode(1, 'spot'); await service.openConversation(1, 'chat', true);
			assert.strictEqual((await service.listRecords(1, 'run', await service.getContext(1))).length, 2);
			await service.clearWorkspace(1);
			await assert.rejects(service.captureProblemRecord(1, { ...problem('unused'), filePath: source }, scope));
			assert.strictEqual((await store.listRecords('problem')).length, 1);
		} finally { await service.dispose(); await fs.rm(root, { recursive: true, force: true }); }
	});
	test('terminal publication and context refresh keep the same valid collection scope', async () => {
		const root = await fs.mkdtemp(path.join(tmpdir(), 'beacon-refresh-'));
		const selected = new Map<number, IBeaconWindowSelection>([[1, { slot: 'one', mode: 'blackout' }]]);
		const service = new BeaconCoordinator({ getSelection: id => selected.get(id), saveSelection: (id, value) => { selected.set(id, value); }, getRecent: () => [], saveRecent: () => { }, changed: () => { } });
		try {
			const source = path.join(root, 'A.cpp'); await fs.writeFile(source, 'code'); await service.selectWorkspace(1, root);
			const scope = (await service.captureCollectionScope(1))!, before = await service.getContext(1);
			const handle = (await service.beginActivity(1, source, scope))!;
			const [id, observed] = await Promise.all([
				service.captureRun(1, handle, { ...run('ignored'), program: { ...run('ignored').program, filePath: source } }),
				service.getContext(1)
			]);
			assert.strictEqual(observed.epoch, before.epoch);
			assert.strictEqual(observed.usable, true);
			assert.deepStrictEqual(await service.captureCollectionScope(1), scope);
			assert.strictEqual((await new BeaconStore(await prepareBeaconWorkspace(root, false)).listRecords('run'))[0].id, id);
			await service.endActivity(1, handle);
		} finally { await service.dispose(); await fs.rm(root, { recursive: true, force: true }); }
	});
	test('a pending terminal publication does not hold runtime retirement, new execution or root switches', async () => {
		const root = await fs.mkdtemp(path.join(tmpdir(), 'beacon-retirement-'));
		const selected = new Map<number, IBeaconWindowSelection>([[1, { slot: 'one', mode: 'blackout' }]]);
		const service = new BeaconCoordinator({ getSelection: id => selected.get(id), saveSelection: (id, value) => { selected.set(id, value); }, getRecent: () => [], saveRecent: () => { }, changed: () => { } });
		const original = BeaconStore.prototype.appendRecord;
		let release!: () => void, entered!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
		let saving: Promise<string> | undefined;
		try {
			const source = path.join(root, 'A.cpp'); await fs.writeFile(source, 'code'); await service.selectWorkspace(1, root);
			const scope = await service.captureCollectionScope(1), handle = (await service.beginActivity(1, source, scope))!;
			const runtime = service.beginRuntimeActivity(1);
			BeaconStore.prototype.appendRecord = async function (kind, record) { entered(); await gate; return original.call(this, kind, record); };
			saving = service.captureRun(1, handle, { ...run('ignored'), program: { ...run('ignored').program, filePath: source } });
			await ready;
			const retired = service.endActivity(1, handle).then(() => true);
			assert.strictEqual(await Promise.race([retired, new Promise<false>(resolve => setTimeout(() => resolve(false), 100))]), true);
			service.endRuntimeActivity(1, runtime); assert.strictEqual((await service.getContext(1)).busy, false);
			const next = await service.beginActivity(1, source, scope); assert.ok(next); await service.endActivity(1, next!);
			await service.clearWorkspace(1);
			release(); await saving;
			assert.strictEqual((await new BeaconStore(await prepareBeaconWorkspace(root, false)).listRecords('run')).length, 1);
		} finally { release(); await saving?.catch(() => { }); BeaconStore.prototype.appendRecord = original; await service.dispose(); await fs.rm(root, { recursive: true, force: true }); }
	});
});

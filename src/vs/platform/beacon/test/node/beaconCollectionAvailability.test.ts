/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import * as path from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BeaconCoordinator } from '../../node/beaconCoordinator.js';
import { BeaconStore, prepareBeaconWorkspace } from '../../node/beaconStore.js';
import type { IBeaconWindowSelection } from '../../common/beaconContextTypes.js';
// eslint-disable-next-line local/code-import-patterns -- Internal type-only transport fixtures.
import type { IBeaconRecordWrite } from 'becoder-beacon';

const signal = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
async function fixture(action: (service: BeaconCoordinator, root: string) => Promise<void>): Promise<void> {
	const root = await fs.mkdtemp(path.join(tmpdir(), 'beacon-collection-'));
	const selections = new Map<number, IBeaconWindowSelection>([1, 2, 3].map(id => [id, { slot: String(id), mode: 'blackout' }]));
	const service = new BeaconCoordinator({ getSelection: id => selections.get(id), saveSelection: (id, value) => { selections.set(id, value); }, getRecent: () => [], saveRecent: () => { }, changed: () => { } });
	try { await fs.writeFile(path.join(root, 'A.cpp'), 'int main(){}'); await service.selectWorkspace(1, root); await service.selectWorkspace(2, root); await action(service, root); }
	finally { await service.dispose(); await fs.rm(root, { recursive: true, force: true }); }
}
const run = (filePath: string): IBeaconRecordWrite<'run'> => ({ source: 'runner', operation: 'run', startedAt: '2026-11-26T00:00:00Z', endedAt: '2026-11-26T00:00:01Z', status: 'completed', program: { filePath, language: 'cpp', code: 'int main(){}' }, compile: { status: 'succeeded' }, runs: [{ input: { mode: 'text', text: '' }, status: 'completed', output: { merged: '' } }] });

suite('Beacon collection availability', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('failed qualification releases reservations and excluded sources never reserve a root', async () => fixture(async (service, root) => {
		const scope = await service.captureCollectionScope(1), missing = path.join(root, 'missing.cpp');
		await assert.rejects(service.beginCollection(1, scope, path.join(root, 'invalid\0.cpp')));
		assert.strictEqual((await service.getContext(2)).collectionPending, false);
		await assert.rejects(service.beginActivity(1, missing, scope), /ENOENT/);
		assert.strictEqual((await service.getContext(2)).collectionPending, false);
		assert.strictEqual(await service.beginCollection(1, scope, path.join(path.dirname(root), 'outside.cpp')), undefined);
		assert.strictEqual(await service.beginActivity(1, path.join(path.dirname(root), 'outside.cpp'), scope), undefined);
		assert.strictEqual((await service.getContext(2)).collectionPending, false);
	}));
	for (const operation of ['beginCollection', 'beginActivity'] as const) {
		test(`${operation} reserves the valid scope before asynchronous qualification in another window`, async () => fixture(async (service, root) => {
			const owner = service as unknown as { collectionStore(...args: unknown[]): Promise<BeaconStore> };
			const original = owner.collectionStore.bind(service), entered = signal(), release = signal();
			let start: Promise<string | undefined> | undefined;
			try {
				const scope = await service.captureCollectionScope(1);
				owner.collectionStore = async (...args) => { entered.resolve(); await release.promise; return original(...args); };
				start = operation === 'beginCollection' ? service.beginCollection(1, scope, path.join(root, 'A.cpp')) : service.beginActivity(1, path.join(root, 'A.cpp'), scope);
				await entered.promise;
				assert.strictEqual((await service.getContext(2)).collectionPending, true);
				release.resolve(); const handle = (await start)!;
				if (operation === 'beginCollection') { service.endCollection(1, handle); } else { await service.endActivity(1, handle); }
				assert.strictEqual((await service.getContext(2)).collectionPending, false);
			} finally { release.resolve(); await start?.catch(() => { }); owner.collectionStore = original; }
		}));
	}
	test('adaptation handles overlap, ignore foreign releases, and retire with their window generation', async () => fixture(async (service, root) => {
		const scope = await service.captureCollectionScope(1);
		assert.strictEqual(await service.beginCollection(3, undefined), undefined);
		const first = (await service.beginCollection(1, scope, path.join(root, 'A.cpp')))!;
		const second = (await service.beginCollection(1, scope))!;
		service.endCollection(2, first); assert.strictEqual((await service.getContext(2)).collectionPending, true);
		service.endCollection(1, first); assert.strictEqual((await service.getContext(2)).collectionPending, true);
		await service.setMode(1, 'blackout'); assert.strictEqual((await service.getContext(2)).collectionPending, true);
		await service.resetWindow(1); assert.strictEqual((await service.getContext(2)).collectionPending, false);
		service.endCollection(1, second);
		await assert.rejects(service.captureProblemRecord(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: null, viewedAt: '2026-11-26T00:00:00Z' }, scope!), /beacon-context-changed/);
		assert.strictEqual((await service.getContext(2)).collectionPending, false);
	}));
	for (const kind of ['problem', 'verdict'] as const) {
		test(`${kind} publication stays observable while the owning window can retire`, async () => fixture(async (service, root) => {
			const entered = signal(), release = signal(), original = BeaconStore.prototype.appendRecord;
			let saving: Promise<string> | undefined;
			try {
				const scope = (await service.captureCollectionScope(1))!;
				BeaconStore.prototype.appendRecord = async function (kind, input) { entered.resolve(); await release.promise; return original.call(this, kind, input); };
				saving = kind === 'problem'
					? service.captureProblemRecord(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: null, viewedAt: '2026-11-26T00:00:00Z' }, scope)
					: service.captureVerdict(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: null, observedAt: '2026-11-26T00:00:00Z', submission: {}, result: { rawStatus: 'Accepted' } }, scope);
				await entered.promise;
				assert.strictEqual((await service.getContext(1)).collectionPending, true);
				assert.strictEqual((await service.getContext(2)).collectionPending, true);
				await service.closeWindow(1); assert.strictEqual((await service.getContext(2)).collectionPending, true);
				release.resolve(); const id = await saving;
				assert.strictEqual((await service.getContext(2)).collectionPending, false);
				assert.strictEqual((await new BeaconStore(await prepareBeaconWorkspace(root, false)).listRecords(kind))[0].id, id);
			} finally { release.resolve(); await saving?.catch(() => { }); BeaconStore.prototype.appendRecord = original; }
		}));
	}
	test('record publication confirmation failure is explicit and never rolls back a published name', async () => fixture(async (_service, root) => {
		const binding = await prepareBeaconWorkspace(root, false);
		const saved = new BeaconStore(binding, {
			unlink: fs.unlink, rename: async (from, to) => {
				await fs.rename(from, to);
				await fs.rename(to, `${to}.observed`); await fs.writeFile(to, 'replacement-owned-content');
			}
		});
		await assert.rejects(saved.appendRecord('run', run(path.join(root, 'A.cpp'))), /beacon-record-publication-uncertain/);
		assert.strictEqual(await fs.readFile(path.join(root, '.beaconWork', 'cache', 'context', 'run.json'), 'utf8'), 'replacement-owned-content');
	}));
	test('pending publication survives execution retirement and is shared only by the selected root', async () => fixture(async (service, root) => {
		const entered = signal(), release = signal(), original = BeaconStore.prototype.appendRecord;
		let saving: Promise<string> | undefined;
		try {
			const scope = await service.captureCollectionScope(1), source = path.join(root, 'A.cpp');
			const handle = (await service.beginActivity(1, source, scope))!;
			const runtime = service.beginRuntimeActivity(1);
			const before = await service.getContext(2);
			BeaconStore.prototype.appendRecord = async function (kind, input) { entered.resolve(); await release.promise; return original.call(this, kind, input); };
			saving = service.captureRun(1, handle, run(source)); await entered.promise;
			await service.endActivity(1, handle); service.endRuntimeActivity(1, runtime);
			assert.strictEqual((await service.getContext(1)).runtimeBusy, false);
			assert.strictEqual((await service.getContext(1)).collectionPending, true);
			assert.strictEqual((await service.getContext(2)).collectionPending, true);
			assert.strictEqual((await service.getContext(3)).collectionPending, false);
			assert.strictEqual((await service.getContext(2)).epoch, before.epoch);
			const next = (await service.beginActivity(1, source, scope))!; assert.ok(next); await service.endActivity(1, next);
			release.resolve(); const id = await saving;
			assert.strictEqual((await service.getContext(1)).collectionPending, false);
			assert.strictEqual((await service.getContext(2)).collectionPending, false);
			const store = new BeaconStore(await prepareBeaconWorkspace(root, false)); assert.strictEqual((await store.listRecords('run'))[0].id, id);
			await service.openConversation(2, 'consumer', true);
			const readScope = await service.getContext(2);
			assert.strictEqual((await service.listRecords(2, 'run', readScope))[0].id, id);
			assert.strictEqual((await service.readRecord(2, 'run', id, readScope)).program.code, 'int main(){}');
		} finally { release.resolve(); await saving?.catch(() => { }); BeaconStore.prototype.appendRecord = original; }
	}));
	test('adaptation ownership is pending in Blackout and ends after a failed or unstarted attempt', async () => fixture(async (service, root) => {
		await service.setMode(1, 'blackout');
		const scope = await service.captureCollectionScope(1), handle = (await service.beginActivity(1, path.join(root, 'A.cpp'), scope))!;
		assert.strictEqual((await service.getContext(1)).collectionPending, true);
		assert.strictEqual((await service.getContext(2)).collectionPending, true);
		await service.endActivity(1, handle);
		assert.strictEqual((await service.getContext(1)).collectionPending, false);
		assert.strictEqual((await service.getContext(2)).collectionPending, false);
	}));
	test('publication rejection releases pending and preserves the existing queue', async () => fixture(async (service, root) => {
		const original = BeaconStore.prototype.appendRecord;
		try {
			const source = path.join(root, 'A.cpp'), scope = await service.captureCollectionScope(1);
			const first = (await service.beginActivity(1, source, scope))!; const id = await service.captureRun(1, first, run(source)); await service.endActivity(1, first);
			BeaconStore.prototype.appendRecord = async () => { throw new Error('write-failed'); };
			const handle = (await service.beginActivity(1, source, scope))!;
			await assert.rejects(service.captureRun(1, handle, run(source)), /write-failed/); await service.endActivity(1, handle);
			assert.strictEqual((await service.getContext(2)).collectionPending, false);
			assert.strictEqual((await new BeaconStore(await prepareBeaconWorkspace(root, false)).listRecords('run'))[0].id, id);
		} finally { BeaconStore.prototype.appendRecord = original; }
	}));
	for (const kind of ['problem', 'verdict'] as const) {
		for (const parentMissing of [false, true]) {
			test(`${kind} captures its historical path after the ${parentMissing ? 'parent' : 'source'} was renamed`, async () => fixture(async (service, root) => {
				const directory = path.join(root, 'history', 'contest'); await fs.mkdir(directory, { recursive: true });
				const source = path.join(directory, 'A.cpp'); await fs.writeFile(source, 'int main(){}');
				const scope = (await service.captureCollectionScope(1))!;
				await fs.rename(parentMissing ? path.dirname(directory) : source, path.join(root, 'renamed'));
				const handle = (await service.beginCollection(1, scope, source))!;
				assert.ok(handle);
				try {
					assert.strictEqual((await service.getContext(2)).collectionPending, true);
					const id = kind === 'problem'
						? await service.captureProblemRecord(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: source, viewedAt: '2026-11-26T00:00:00Z' }, scope)
						: await service.captureVerdict(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: source, observedAt: '2026-11-26T00:00:00Z', submission: { code: 'int main(){}' }, result: { rawStatus: 'Accepted' } }, scope);
					const records = await new BeaconStore(await prepareBeaconWorkspace(root, false)).listRecords(kind);
					assert.strictEqual(records[0].id, id); assert.strictEqual(records[0].filePath, source);
					await assert.rejects(fs.lstat(source), /ENOENT/);
				} finally { service.endCollection(1, handle); }
				assert.strictEqual((await service.getContext(2)).collectionPending, false);
			}));
		}
	}
	test('historical paths through an existing in-root junction remain eligible', async () => fixture(async (service, root) => {
		const directory = path.join(root, 'history'); await fs.mkdir(directory);
		const linked = path.join(root, 'linked'); await fs.symlink(directory, linked, 'junction');
		const source = path.join(linked, 'missing', 'A.cpp'), scope = (await service.captureCollectionScope(1))!;
		const handle = (await service.beginCollection(1, scope, source))!;
		assert.ok(handle);
		try {
			await service.captureVerdict(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: source, observedAt: '2026-11-26T00:00:00Z', submission: {}, result: { rawStatus: 'Accepted' } }, scope);
		} finally { service.endCollection(1, handle); }
		assert.strictEqual((await new BeaconStore(await prepareBeaconWorkspace(root, false)).listRecords('verdict'))[0].filePath, source);
	}));
	for (const dangling of [false, true]) {
		test(`historical paths reject a ${dangling ? 'dangling' : 'root-external'} junction without publishing`, async () => fixture(async (service, root) => {
			const outside = await fs.mkdtemp(path.join(tmpdir(), 'beacon-history-outside-'));
			try {
				const link = path.join(root, 'history');
				await fs.symlink(dangling ? path.join(outside, 'absent') : outside, link, 'junction');
				const source = path.join(link, 'missing', 'A.cpp'), scope = (await service.captureCollectionScope(1))!;
				if (dangling) { await assert.rejects(service.beginCollection(1, scope, source)); }
				else { assert.strictEqual(await service.beginCollection(1, scope, source).catch(() => undefined), undefined); }
				await assert.rejects(service.captureVerdict(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: source, observedAt: '2026-11-26T00:00:00Z', submission: {}, result: { rawStatus: 'Accepted' } }, scope));
				assert.strictEqual((await service.getContext(2)).collectionPending, false);
				assert.deepStrictEqual(await new BeaconStore(await prepareBeaconWorkspace(root, false)).listRecords('verdict'), []);
			} finally { await fs.rm(outside, { recursive: true, force: true }); }
		}));
	}
	test('missing historical paths do not grant root-external capture or runtime source eligibility', async () => fixture(async (service, root) => {
		const scope = (await service.captureCollectionScope(1))!, missing = path.join(root, 'missing.cpp');
		await assert.rejects(service.beginActivity(1, missing, scope), /ENOENT/);
		await assert.rejects(service.beginCollection(1, scope, path.join(root, 'A.cpp', 'child.cpp')));
		const outside = path.join(path.dirname(root), 'missing-history', 'A.cpp');
		assert.strictEqual(await service.beginCollection(1, scope, outside), undefined);
		await assert.rejects(service.captureProblemRecord(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: outside, viewedAt: '2026-11-26T00:00:00Z' }, scope));
		assert.strictEqual((await service.getContext(2)).collectionPending, false);
	}));
	test('historical capture rechecks a source ancestor redirected after registration', async () => fixture(async (service, root) => {
		const outside = await fs.mkdtemp(path.join(tmpdir(), 'beacon-history-redirect-'));
		const directory = path.join(root, 'history'); await fs.mkdir(directory);
		const source = path.join(directory, 'A.cpp'); await fs.writeFile(source, 'int main(){}');
		const scope = (await service.captureCollectionScope(1))!, handle = (await service.beginCollection(1, scope, source))!;
		try {
			await fs.rename(directory, path.join(root, 'original-history')); await fs.symlink(outside, directory, 'junction');
			await assert.rejects(service.captureVerdict(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: source, observedAt: '2026-11-26T00:00:00Z', submission: {}, result: { rawStatus: 'Accepted' } }, scope), /beacon-invalid-source/);
			assert.deepStrictEqual(await new BeaconStore(await prepareBeaconWorkspace(root, false)).listRecords('verdict'), []);
		} finally { service.endCollection(1, handle); await fs.rm(outside, { recursive: true, force: true }); }
		assert.strictEqual((await service.getContext(2)).collectionPending, false);
	}));
	test('a replaced assets root still rejects historical capture under the old scope', async () => fixture(async (service, root) => {
		const scope = (await service.captureCollectionScope(1))!, source = path.join(root, 'missing.cpp');
		const assets = path.join(root, '.beaconWork'); await fs.rename(assets, path.join(root, 'previous-assets')); await fs.mkdir(assets);
		await assert.rejects(service.beginCollection(1, scope, source), /beacon-context-changed/);
		await assert.rejects(service.captureVerdict(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: source, observedAt: '2026-11-26T00:00:00Z', submission: {}, result: { rawStatus: 'Accepted' } }, scope), /beacon-context-changed/);
		assert.strictEqual((await service.getContext(1)).collectionPending, false);
		assert.deepStrictEqual(await fs.readdir(assets), []);
	}));
});

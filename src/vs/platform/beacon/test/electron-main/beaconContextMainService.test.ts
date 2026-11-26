/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import * as path from '../../../../base/common/path.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { ILogService } from '../../../log/common/log.js';
import type { IStateService } from '../../../state/node/state.js';
import type { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import type { ILifecycleMainService, ShutdownEvent } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { BeaconContextMainService } from '../../electron-main/beaconContextMainService.js';
import { BeaconStore, prepareBeaconWorkspace } from '../../node/beaconStore.js';
import type { IBeaconRecordWrite, IBeaconWindowSelection } from '../../common/beaconContextTypes.js';

const signal = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));

suite('Beacon application shutdown publication', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	for (const reject of [false, true]) {
		test(`application shutdown waits for started publications to ${reject ? 'fail' : 'complete'} after normal window retirement`, async () => {
			const root = await fs.mkdtemp(path.join(tmpdir(), 'beacon-shutdown-'));
			const disposables = new DisposableStore();
			const event = <T>() => disposables.add(new Emitter<T>()).event;
			const closed = disposables.add(new Emitter<void>());
			const shutdown = disposables.add(new Emitter<ShutdownEvent>());
			const window = { id: 1, config: { beaconSelection: { slot: 'one', mode: 'blackout' } as IBeaconWindowSelection }, onDidClose: closed.event, onWillLoad: event<void>() };
			const windows = new Map([[1, window], [2, { ...window, id: 2, config: { beaconSelection: { slot: 'two', mode: 'blackout' } as IBeaconWindowSelection }, onDidClose: event<void>() }]]);
			const service = disposables.add(new BeaconContextMainService({
				getWindows: () => [...windows.values()], getWindowById: (id: number) => windows.get(id),
				updateBeaconWindowSelection: (id: number, value: IBeaconWindowSelection) => { windows.get(id)!.config.beaconSelection = value; },
				onDidOpenWindow: event<never>(), onDidDestroyWindow: event<never>()
			} as unknown as IWindowsMainService, { getItem: () => [], setItem: () => { } } as unknown as IStateService,
				{ onWillShutdown: shutdown.event } as ILifecycleMainService, { error: () => { } } as unknown as ILogService));
			const original = BeaconStore.prototype.appendRecord, entered = signal();
			const releases = [signal(), signal(), signal()];
			const publications: Promise<string>[] = [];
			let arrivals = 0;
			let saving: Promise<PromiseSettledResult<string>[]> | undefined;
			let quitting: Promise<void> | undefined;
			try {
				const source = path.join(root, 'A.cpp'); await fs.writeFile(source, 'int main(){}');
				await service.selectWorkspace(1, root); await service.selectWorkspace(2, root);
				const scope = (await service.captureCollectionScope(1))!;
				const activity = (await service.beginActivity(1, source, scope))!;
				const runtime = await service.beginRuntimeActivity(1);
				BeaconStore.prototype.appendRecord = async function (kind, input) {
					const index = { run: 0, problem: 1, verdict: 2 }[kind]; if (++arrivals === releases.length) { entered.resolve(); }
					await releases[index].promise;
					if (reject) { throw new Error('publication-failed'); }
					return original.call(this, kind, input);
				};
				const run: IBeaconRecordWrite<'run'> = { source: 'runner', operation: 'run', startedAt: '2026-11-26T00:00:00Z', endedAt: '2026-11-26T00:00:01Z', status: 'completed', program: { filePath: source, language: 'cpp', code: 'int main(){}' }, compile: { status: 'succeeded' }, runs: [] };
				publications.push(
					service.captureRun(1, activity, run),
					service.captureProblemRecord(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: source, viewedAt: '2026-11-26T00:00:00Z' }, scope),
					service.captureVerdict(1, { problem: { oj: 'luogu', problemId: 'P1001' }, filePath: source, observedAt: '2026-11-26T00:00:00Z', submission: {}, result: { rawStatus: 'Accepted' } }, scope)
				);
				saving = Promise.allSettled(publications);
				await entered.promise;
				await service.endActivity(1, activity); await service.endRuntimeActivity(1, runtime);
				assert.strictEqual((await service.getContext(1)).runtimeBusy, false);
				const next = (await service.beginActivity(1, source, scope))!; await service.endActivity(1, next);
				closed.fire(); windows.delete(1);
				await service.getResume(2);
				assert.strictEqual((await service.getContext(2)).collectionPending, true, 'ordinary window close must retire before the pending publications');
				const joined: Promise<void>[] = [];
				shutdown.fire({ join: (_id: string, promise: Promise<void>) => { joined.push(promise); } } as ShutdownEvent);
				assert.ok(joined.length);
				let done = false; quitting = Promise.all(joined).then(() => { done = true; });
				await nextTurn();
				assert.strictEqual(done, false, 'application shutdown must join started publications');
				releases[0].resolve(); releases[1].resolve(); await Promise.allSettled(publications.slice(0, 2)); await nextTurn();
				assert.strictEqual(done, false, 'another started record publication is still pending');
				releases[2].resolve(); await quitting;
				const results = await saving;
				assert.deepStrictEqual(results.map(result => result.status), Array(3).fill(reject ? 'rejected' : 'fulfilled'));
				const store = new BeaconStore(await prepareBeaconWorkspace(root, false));
				for (const kind of ['problem', 'run', 'verdict'] as const) { assert.strictEqual((await store.listRecords(kind)).length, reject ? 0 : 1); }
				assert.strictEqual((await service.getContext(2)).collectionPending, false);
			} finally {
				for (const release of releases) { release.resolve(); }
				await saving; await quitting;
				BeaconStore.prototype.appendRecord = original;
				disposables.dispose(); await nextTurn();
				await fs.rm(root, { recursive: true, force: true });
			}
		});
	}
});

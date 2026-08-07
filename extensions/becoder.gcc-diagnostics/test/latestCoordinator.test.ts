/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import { CoordinatorClock, LatestRequestCoordinator, RequestResult, VersionedTarget } from '../src/latestCoordinator';

interface Scheduled {
	readonly id: number;
	readonly due: number;
	readonly callback: () => void;
}

class FakeClock implements CoordinatorClock {
	private current = 0;
	private nextId = 0;
	private readonly scheduled = new Map<number, Scheduled>();

	now(): number {
		return this.current;
	}

	setTimeout(callback: () => void, delayMs: number): unknown {
		const id = ++this.nextId;
		this.scheduled.set(id, { id, due: this.current + delayMs, callback });
		return id;
	}

	clearTimeout(handle: unknown): void {
		this.scheduled.delete(handle as number);
	}

	advance(milliseconds: number): void {
		this.current += milliseconds;
		for (const item of [...this.scheduled.values()].sort((left, right) => left.due - right.due)) {
			if (item.due <= this.current && this.scheduled.delete(item.id)) {
				item.callback();
			}
		}
	}
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(resolvePromise => resolve = resolvePromise);
	return { promise, resolve };
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

suite('latest request coordinator', () => {
	test('debounces pending work and starts only the latest target', async () => {
		const clock = new FakeClock();
		const started: string[] = [];
		const published: string[] = [];
		const coordinator = new LatestRequestCoordinator<VersionedTarget, string>(
			async target => {
				started.push(target.uri);
				return { kind: 'success', value: target.uri };
			},
			(_target, value) => published.push(value),
			() => undefined,
			clock
		);

		coordinator.schedule({ uri: 'a', version: 1 }, 800);
		coordinator.schedule({ uri: 'b', version: 1 }, 800);
		clock.advance(799);
		assert.deepStrictEqual(started, []);
		clock.advance(1);
		await flush();
		assert.deepStrictEqual(started, ['b']);
		assert.deepStrictEqual(published, ['b']);
	});

	test('cancels active work and never publishes the superseded result', async () => {
		const clock = new FakeClock();
		const requests = new Map<string, Deferred<RequestResult<string>>>();
		const signals = new Map<string, AbortSignal>();
		const published: string[] = [];
		const coordinator = new LatestRequestCoordinator<VersionedTarget, string>(
			(target, signal) => {
				signals.set(target.uri, signal);
				const request = deferred<RequestResult<string>>();
				requests.set(target.uri, request);
				return request.promise;
			},
			(_target, value) => published.push(value),
			() => undefined,
			clock
		);

		coordinator.schedule({ uri: 'a', version: 1 }, 0);
		clock.advance(0);
		coordinator.schedule({ uri: 'b', version: 1 }, 0);
		assert.strictEqual(signals.get('a')?.aborted, true);
		assert.strictEqual(coordinator.cancellationCount, 1);
		clock.advance(0);
		assert.strictEqual(requests.has('b'), false);
		requests.get('a')?.resolve({ kind: 'success', value: 'stale' });
		await flush();
		assert.strictEqual(requests.has('b'), true);
		requests.get('b')?.resolve({ kind: 'success', value: 'fresh' });
		await flush();
		assert.deepStrictEqual(published, ['fresh']);
	});

	test('starts only the latest slot after a canceled active request retires', async () => {
		const clock = new FakeClock();
		const requests = new Map<string, Deferred<RequestResult<string>>>();
		const started: string[] = [];
		const coordinator = new LatestRequestCoordinator<VersionedTarget, string>(
			target => {
				started.push(target.uri);
				const request = deferred<RequestResult<string>>();
				requests.set(target.uri, request);
				return request.promise;
			},
			() => undefined,
			() => undefined,
			clock
		);

		coordinator.schedule({ uri: 'a', version: 1 }, 0);
		clock.advance(0);
		coordinator.schedule({ uri: 'b', version: 1 }, 0);
		clock.advance(0);
		coordinator.schedule({ uri: 'c', version: 1 }, 0);
		clock.advance(0);
		assert.deepStrictEqual(started, ['a']);

		requests.get('a')?.resolve({ kind: 'success', value: 'stale' });
		await flush();
		assert.deepStrictEqual(started, ['a', 'c']);
		assert.strictEqual(requests.has('b'), false);
	});

	test('lets an immediate save replace a pending edit of the same version', async () => {
		const clock = new FakeClock();
		const waits: number[] = [];
		const coordinator = new LatestRequestCoordinator<VersionedTarget, string>(
			async (_target, _signal, waitMs) => {
				waits.push(waitMs);
				return { kind: 'success', value: 'done' };
			},
			() => undefined,
			() => undefined,
			clock
		);

		const target = { uri: 'a', version: 2 };
		coordinator.schedule(target, 800);
		clock.advance(100);
		coordinator.schedule(target, 0);
		clock.advance(0);
		await flush();
		assert.deepStrictEqual(waits, [0]);
	});

	test('does not rerun a successfully completed document version', async () => {
		const clock = new FakeClock();
		let starts = 0;
		const coordinator = new LatestRequestCoordinator<VersionedTarget, string>(
			async () => {
				starts++;
				return { kind: 'success', value: 'done' };
			},
			() => undefined,
			() => undefined,
			clock
		);

		const target = { uri: 'a', version: 3 };
		coordinator.schedule(target, 0);
		clock.advance(0);
		await flush();
		coordinator.schedule(target, 0);
		clock.advance(0);
		await flush();
		assert.strictEqual(starts, 1);
	});

	test('force reruns an unchanged translation unit after a dependency changes', async () => {
		const clock = new FakeClock();
		let starts = 0;
		const coordinator = new LatestRequestCoordinator<VersionedTarget, string>(
			async () => {
				starts++;
				return { kind: 'success', value: 'done' };
			},
			() => undefined,
			() => undefined,
			clock
		);

		const target = { uri: 'source.cpp', version: 1 };
		coordinator.schedule(target, 0);
		clock.advance(0);
		await flush();
		coordinator.schedule(target, 0, true);
		clock.advance(0);
		await flush();
		assert.strictEqual(starts, 2);
	});
});

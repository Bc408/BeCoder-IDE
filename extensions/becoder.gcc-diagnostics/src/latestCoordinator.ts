/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface VersionedTarget {
	readonly uri: string;
	readonly version: number;
}

export type RequestResult<T> =
	| { readonly kind: 'success'; readonly value: T }
	| { readonly kind: 'failure'; readonly reason: string };

export interface CoordinatorClock {
	now(): number;
	setTimeout(callback: () => void, delayMs: number): unknown;
	clearTimeout(handle: unknown): void;
}

const systemClock: CoordinatorClock = {
	now: () => Date.now(),
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout)
};

interface Pending<T extends VersionedTarget> {
	readonly target: T;
	readonly generation: number;
	readonly requestedAt: number;
	readonly ready: boolean;
	readonly handle?: unknown;
}

interface Active<T extends VersionedTarget> {
	readonly target: T;
	readonly generation: number;
	readonly controller: AbortController;
}

export class LatestRequestCoordinator<T extends VersionedTarget, R> {
	private generation = 0;
	private pending: Pending<T> | undefined;
	private active: Active<T> | undefined;
	private disposed = false;
	private readonly completedVersions = new Map<string, number>();
	private cancellationTotal = 0;

	constructor(
		private readonly startRequest: (target: T, signal: AbortSignal, waitMs: number) => Promise<RequestResult<R>>,
		private readonly publish: (target: T, result: R) => void,
		private readonly failed: (target: T, reason: string) => void,
		private readonly clock: CoordinatorClock = systemClock
	) { }

	get cancellationCount(): number {
		return this.cancellationTotal;
	}

	schedule(target: T, delayMs: number, force = false): void {
		if (this.disposed || (!force && this.completedVersions.get(target.uri) === target.version)) {
			return;
		}
		if (!force && this.active?.target.uri === target.uri && this.active.target.version === target.version
			&& !this.active.controller.signal.aborted) {
			return;
		}
		if (force) {
			this.completedVersions.delete(target.uri);
		}
		this.cancelPending();
		this.cancelActive();

		const generation = ++this.generation;
		const requestedAt = this.clock.now();
		const handle = this.clock.setTimeout(
			() => this.markReady(generation), Math.max(0, delayMs));
		this.pending = { target, generation, requestedAt, ready: false, handle };
	}

	cancelUri(uri: string): void {
		this.completedVersions.delete(uri);
		if (this.pending?.target.uri === uri) {
			this.cancelPending();
		}
		if (this.active?.target.uri === uri) {
			this.cancelActive();
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.generation++;
		this.cancelPending();
		this.cancelActive();
		this.completedVersions.clear();
	}

	private cancelPending(): void {
		if (!this.pending) {
			return;
		}
		if (this.pending.handle !== undefined) {
			this.clock.clearTimeout(this.pending.handle);
		}
		this.pending = undefined;
	}

	private cancelActive(): void {
		if (!this.active) {
			return;
		}
		if (!this.active.controller.signal.aborted) {
			this.cancellationTotal++;
			this.active.controller.abort();
		}
	}

	private markReady(generation: number): void {
		if (this.disposed || this.pending?.generation !== generation) {
			return;
		}
		this.pending = { ...this.pending, ready: true, handle: undefined };
		this.beginLatest();
	}

	private beginLatest(): void {
		if (this.disposed || this.active || !this.pending?.ready) {
			return;
		}
		const { target, generation, requestedAt } = this.pending;
		this.pending = undefined;
		const controller = new AbortController();
		this.active = { target, generation, controller };
		void this.runActive(target, generation, requestedAt, controller);
	}

	private async runActive(target: T, generation: number, requestedAt: number, controller: AbortController): Promise<void> {
		let result: RequestResult<R>;
		try {
			result = await this.startRequest(
				target, controller.signal, Math.max(0, this.clock.now() - requestedAt));
		} catch (error) {
			result = { kind: 'failure', reason: error instanceof Error ? error.message : String(error) };
		}
		if (this.active?.generation === generation) {
			this.active = undefined;
		}
		if (!this.disposed && !controller.signal.aborted && generation === this.generation) {
			if (result.kind === 'failure') {
				this.failed(target, result.reason);
			} else {
				this.completedVersions.set(target.uri, target.version);
				this.publish(target, result.value);
			}
		}
		this.beginLatest();
	}
}

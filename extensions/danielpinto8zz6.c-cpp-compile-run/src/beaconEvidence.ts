/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CompilationSourceSnapshot } from './compilationSnapshot';

export interface RuntimeEvidence {
	start(snapshot: CompilationSourceSnapshot, metadata: unknown): void;
	event(value: unknown): void;
	finish(outcome: unknown): Promise<void>;
}

/** Observes user execution only; cache failures never control the user's program. */
export class BeaconEvidence implements RuntimeEvidence {
	private tail: Promise<void> = Promise.resolve();
	private pending: unknown[] = [];
	private pendingBytes = 0;
	private timer: NodeJS.Timeout | undefined;
	private started = false;
	private disabled: boolean;
	private sequence = 0;
	private remaining: number;
	private omittedEvents = 0;
	private omittedBytes = 0;

	constructor(
		private readonly handle: string | undefined,
		private readonly producer: 'runner' | 'cph' | 'notebook',
		private readonly invoke: (operation: string, input: unknown) => PromiseLike<unknown>,
		private readonly failed: (error: unknown) => void,
		private readonly capacity = 8 * 1024 * 1024
	) { this.disabled = !handle; this.remaining = capacity; }

	start(snapshot: CompilationSourceSnapshot, metadata: unknown): void {
		if (this.disabled || this.started) { return; }
		this.started = true;
		const bytes = Buffer.from(snapshot.bytesBase64, 'base64');
		// Leave room for JSON escaping, the byte copy and the final status.
		const saved = bytes.subarray(0, Math.min(2 * 1024 * 1024, Math.floor(this.capacity / 8)));
		if (saved.length < bytes.length) { this.omittedEvents++; this.omittedBytes += bytes.length - saved.length; }
		const code = saved.toString('utf8');
		const sourceSnapshot = { ...snapshot, bytesBase64: saved.toString('base64'), storedBytes: saved.length, complete: saved.length === bytes.length };
		this.remaining -= Buffer.byteLength(JSON.stringify({ code, sourceSnapshot })) + 512;
		const details = this.bound(metadata);
		const events = [{ type: 'compile-attempt', at: Date.now(), sourceSnapshot, details }];
		this.send('startRuntime', { handle: this.handle, producer: this.producer, source: snapshot.originalPath, code, events });
	}

	event(value: unknown): void {
		if (!this.started || this.disabled) { return; }
		const accepted = this.bound(value);
		if (accepted === undefined) { return; }
		this.pending.push(accepted); this.pendingBytes += Buffer.byteLength(JSON.stringify(accepted));
		if (this.pendingBytes >= 64 * 1024) { this.flush(); }
		else if (!this.timer) { this.timer = setTimeout(() => this.flush(), 250); this.timer.unref(); }
	}

	async finish(outcome: unknown): Promise<void> {
		if (this.started && !this.disabled) {
			this.pending.push({ type: 'finished', at: Date.now(), outcome: structuredClone(outcome), coverage: { truncated: this.omittedEvents > 0, omittedEvents: this.omittedEvents, omittedBytes: this.omittedBytes } });
		}
		this.flush(); await this.tail; this.disabled = true;
	}

	private bound(value: unknown): unknown {
		const bytes = Buffer.from(JSON.stringify(value) ?? 'null');
		if (bytes.length <= this.remaining) { this.remaining -= bytes.length; return JSON.parse(bytes.toString('utf8')); }
		this.omittedEvents++; this.omittedBytes += bytes.length;
		if (this.remaining < 512) { return undefined; }
		const prefix = bytes.subarray(0, Math.floor((this.remaining - 256) / 6));
		this.omittedBytes -= prefix.length;
		const partial = { type: 'partial-event', partial: true, originalBytes: bytes.length, jsonPrefix: prefix.toString('utf8') };
		this.remaining -= Buffer.byteLength(JSON.stringify(partial));
		return partial;
	}

	private flush(): void {
		if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
		if (this.disabled || !this.pending.length) { this.pending = []; return; }
		const events = this.pending; this.pending = []; this.pendingBytes = 0;
		this.send('appendRuntime', { handle: this.handle, sequence: ++this.sequence, events });
	}

	private send(operation: string, input: unknown): void {
		this.tail = this.tail.then(async () => {
			if (this.disabled) { return; }
			if (await this.invoke(operation, input) === false) { this.disabled = true; }
		}).catch(error => {
			this.disabled = true;
			if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
			this.pending = [];
			try { this.failed(error); } catch { /* Observation never interrupts execution. */ }
		});
	}
}

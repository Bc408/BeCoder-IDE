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

interface EvidenceChannel {
	key: string; phase: string; stream: string; sampleId?: string; blockId?: string; inputId?: string;
	byteRepresentation: 'process-bytes' | 'utf8-observed-text'; observedBytes: number; sourceOmittedBytes: number;
	head: Buffer; tail: Buffer; sequence: number;
}

/** Retain field structure and byte ranges; never serialize a broken JSON prefix. */
function boundedFields(value: unknown, allowance: number): unknown {
	const lengths: number[] = [];
	const visit = (item: unknown): void => {
		if (typeof item === 'string') { lengths.push(Buffer.byteLength(item)); }
		else if (item && typeof item === 'object') { Object.values(item).forEach(visit); }
	};
	visit(value);
	const perField = Math.max(16, Math.floor(allowance / Math.max(1, lengths.length) / 6));
	const trim = (item: unknown): unknown => {
		if (typeof item === 'string') {
			const bytes = Buffer.from(item);
			if (bytes.length <= perField) { return item; }
			const half = Math.floor(perField / 2);
			return { partial: true, byteRepresentation: 'utf8-observed-text', observedBytes: bytes.length, ranges: [{ offset: 0, bytesBase64: bytes.subarray(0, half).toString('base64') }, { offset: bytes.length - half, bytesBase64: bytes.subarray(-half).toString('base64') }] };
		}
		if (Array.isArray(item)) { return item.map(trim); }
		if (item && typeof item === 'object') { return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, trim(child)])); }
		return item;
	};
	return trim(value);
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
	private readonly channels = new Map<string, EvidenceChannel>();
	private channelSequence = 0;
	private channelDirty = false;
	private streamCapacity = 0;

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
		const details = boundedFields(metadata, Math.max(128, Math.floor(this.capacity / 6)));
		this.remaining -= Buffer.byteLength(JSON.stringify(details));
		this.streamCapacity = Math.max(0, Math.min(Math.floor(this.capacity / 8), Math.floor(this.remaining / 4)));
		this.remaining -= this.streamCapacity * 2 + Math.min(65536, Math.floor(this.capacity / 8));
		const events = [{ type: 'compile-attempt', at: Date.now(), sourceSnapshot, details }];
		this.send('startRuntime', { handle: this.handle, producer: this.producer, source: snapshot.originalPath, code, events });
	}

	event(value: unknown): void {
		if (!this.started || this.disabled) { return; }
		const event = value as Record<string, unknown> | undefined;
		if (event?.type === 'stream' && typeof event.phase === 'string' && typeof event.stream === 'string' && (typeof event.bytesBase64 === 'string' || typeof event.text === 'string')) {
			this.stream(event); return;
		}
		const accepted = this.bound(value);
		if (accepted === undefined) { return; }
		this.pending.push(accepted); this.pendingBytes += Buffer.byteLength(JSON.stringify(accepted));
		if (this.pendingBytes >= 64 * 1024) { this.flush(); }
		else if (!this.timer) { this.timer = setTimeout(() => this.flush(), 250); this.timer.unref(); }
	}

	async finish(outcome: unknown): Promise<void> {
		if (this.started && !this.disabled) {
			const omittedChannels = [...this.channels.values()].filter(channel => channel.observedBytes > channel.head.length + channel.tail.length || channel.sourceOmittedBytes > 0);
			this.pending.push({ type: 'finished', at: Date.now(), outcome: boundedFields(outcome, 32768), coverage: { truncated: this.omittedEvents > 0 || omittedChannels.length > 0, omittedEvents: this.omittedEvents + omittedChannels.length, omittedBytes: this.omittedBytes + omittedChannels.reduce((total, channel) => total + channel.observedBytes - channel.head.length - channel.tail.length, 0) } });
		}
		this.flush(); await this.tail; this.disabled = true; this.channels.clear();
	}

	private bound(value: unknown): unknown {
		const bytes = Buffer.from(JSON.stringify(value) ?? 'null');
		if (bytes.length <= this.remaining) { this.remaining -= bytes.length; return JSON.parse(bytes.toString('utf8')); }
		this.omittedEvents++; this.omittedBytes += bytes.length;
		if (this.remaining < 512) { return undefined; }
		const partial = boundedFields(value, this.remaining - 256);
		this.remaining -= Buffer.byteLength(JSON.stringify(partial));
		return partial;
	}

	private stream(event: Record<string, unknown>): void {
		const key = JSON.stringify([event.phase, event.stream, event.sampleId, event.blockId, event.inputId]);
		const representation = typeof event.bytesBase64 === 'string' ? 'process-bytes' : 'utf8-observed-text';
		let channel = this.channels.get(key);
		if (!channel) {
			if (this.channels.size >= 256) { this.omittedEvents++; return; }
			channel = { key, phase: event.phase as string, stream: event.stream as string, ...(typeof event.sampleId === 'string' ? { sampleId: event.sampleId } : {}), ...(typeof event.blockId === 'string' ? { blockId: event.blockId } : {}), ...(typeof event.inputId === 'string' ? { inputId: event.inputId } : {}), byteRepresentation: representation, observedBytes: 0, sourceOmittedBytes: 0, head: Buffer.alloc(0), tail: Buffer.alloc(0), sequence: 0 };
			this.channels.set(key, channel);
		}
		const half = Math.max(1, Math.floor(this.streamCapacity / this.channels.size / 2));
		for (const existing of this.channels.values()) {
			const tailLength = Math.min(half, Math.max(0, existing.observedBytes - half));
			// A short stream can still have its latest bytes only in the old head.
			existing.tail = tailLength ? (existing.tail.length >= tailLength ? existing.tail : Buffer.concat([existing.head, existing.tail])).subarray(-tailLength) : Buffer.alloc(0);
			existing.head = existing.head.subarray(0, half);
		}
		const bytes = typeof event.bytesBase64 === 'string' ? Buffer.from(event.bytesBase64, 'base64') : Buffer.from(event.text as string);
		const oldTotal = channel.observedBytes;
		if (oldTotal < half) { channel.head = Buffer.concat([channel.head, bytes.subarray(0, half - oldTotal)]); }
		const tailLength = Math.min(half, Math.max(0, oldTotal + bytes.length - channel.head.length));
		channel.tail = tailLength ? Buffer.concat([channel.tail, bytes]).subarray(-tailLength) : Buffer.alloc(0);
		channel.observedBytes += bytes.length; channel.sequence = ++this.channelSequence;
		if (Number.isSafeInteger(event.sourceOmittedBytes) && Number(event.sourceOmittedBytes) > 0) { channel.sourceOmittedBytes += Number(event.sourceOmittedBytes); }
		this.channelDirty = true; this.pendingBytes += bytes.length;
		if (this.pendingBytes >= 64 * 1024) { this.flush(); }
		else if (!this.timer) { this.timer = setTimeout(() => this.flush(), 250); this.timer.unref(); }
	}

	private flush(): void {
		if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
		if (this.channelDirty && !this.disabled) {
			const streams = [...this.channels.values()].map(channel => {
				const { head, tail, key, ...metadata } = channel;
				const ranges = [{ offset: 0, bytesBase64: head.toString('base64') }, ...(tail.length ? [{ offset: channel.observedBytes - tail.length, bytesBase64: tail.toString('base64') }] : [])];
				return { type: 'stream', channelId: key, ...metadata, ranges, sourceTruncated: channel.sourceOmittedBytes > 0 };
			});
			const finished = this.pending.findIndex(value => (value as { type?: string })?.type === 'finished');
			this.pending.splice(finished < 0 ? this.pending.length : finished, 0, ...streams);
			this.channelDirty = false;
		}
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

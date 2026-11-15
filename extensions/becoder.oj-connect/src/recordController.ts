/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { type RecordRef, type RecordSnapshot, validateRecord, validateRecordRef } from './domain';
import { OperationError } from './operationError';

function pause(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) { reject(signal.reason); return; }
		const abort = () => { clearTimeout(timer); reject(signal.reason); };
		const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
		signal.addEventListener('abort', abort, { once: true });
	});
}
interface TrackingOptions { intervalMs?: number; timeoutMs?: number; now?: () => number; sleep?: (ms: number, signal: AbortSignal) => Promise<void> }

export class RecordController {
	constructor(private readonly read: (record: RecordRef, signal: AbortSignal) => Promise<RecordSnapshot>, private readonly options: TrackingOptions = {}) { }
	async track(input: RecordRef, onUpdate: (value: RecordSnapshot) => void, signal: AbortSignal): Promise<void> {
		const ref = validateRecordRef(input);
		if (signal.aborted) { return; }
		const now = this.options.now ?? Date.now, started = now(), limit = this.options.timeoutMs ?? 120000;
		const deadline = new AbortController();
		const timer = setTimeout(() => deadline.abort(new Error('Result tracking timed out. Continue querying the existing record.')), limit);
		const combined = AbortSignal.any([signal, deadline.signal]);
		try {
			while (!combined.aborted) {
				if (now() - started >= limit) { throw new Error('Result tracking timed out. Continue querying the existing record.'); }
				let abort!: () => void;
				let value: RecordSnapshot;
				try {
					value = await Promise.race([this.read(ref, combined), new Promise<never>((_resolve, reject) => { abort = () => reject(combined.reason); combined.addEventListener('abort', abort, { once: true }); })]);
				} finally { combined.removeEventListener('abort', abort); }
				combined.throwIfAborted();
				const snapshot = validateRecord(value);
				if (snapshot.ref.url !== ref.url || snapshot.ref.problem.url !== ref.problem.url) { throw new Error('The record identity changed during tracking.'); }
				onUpdate(snapshot);
				if (snapshot.phase === 'finished') { return; }
				await (this.options.sleep ?? pause)(this.options.intervalMs ?? 2000, combined);
			}
			combined.throwIfAborted();
		} catch (error) {
			if (signal.aborted) { return; }
			throw new OperationError('track', 'record', error instanceof Error ? error.message : String(error), ref);
		} finally { clearTimeout(timer); }
	}
}

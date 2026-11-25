/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringDecoder } from 'string_decoder';
import { stripVTControlCharacters } from 'util';
import type { BeaconOutputText, IBeaconOutput, IBeaconRecordWrite } from 'becoder-beacon';

/** Bounded decoded stream; no raw event history and no split UTF-8 characters. */
export class ObservedOutput {
	private readonly decoder = new StringDecoder('utf8');
	private head = '';
	private tail = '';
	private bytes = 0;
	private sourceOmitted = 0;
	append(bytes: Buffer, omitted = 0): void {
		this.sourceOmitted += omitted;
		const text = stripVTControlCharacters(this.decoder.write(bytes));
		this.accept(text);
	}
	private accept(text: string): void {
		this.bytes += Buffer.byteLength(text);
		this.head = utf8Prefix(this.head + text, 8192);
		this.tail = utf8Suffix(this.tail + text, 8192);
	}
	finish(): void { this.accept(stripVTControlCharacters(this.decoder.end())); }
	get length(): number { return this.bytes; }
	retain(limit: number): BeaconOutputText {
		if (this.bytes <= limit && this.sourceOmitted === 0) { return this.head; }
		const head = utf8Prefix(this.head, Math.min(Math.ceil(limit / 2), this.bytes));
		const tail = utf8Suffix(this.tail, Math.min(Math.floor(limit / 2), this.bytes - Buffer.byteLength(head)));
		return { head, tail, omittedBytes: this.bytes - Buffer.byteLength(head + tail), ...(this.sourceOmitted ? { sourceOmittedBytesAtLeast: this.sourceOmitted } : {}) };
	}
}
function utf8Prefix(text: string, limit: number): string {
	const bytes = Buffer.from(text); let end = Math.min(limit, bytes.length);
	while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) { end--; }
	return bytes.subarray(0, end).toString('utf8');
}
function utf8Suffix(text: string, limit: number): string {
	const bytes = Buffer.from(text); let start = Math.max(0, bytes.length - limit);
	while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) { start++; }
	return bytes.subarray(start).toString('utf8');
}
export interface OutputTarget { output: IBeaconOutput; stream: keyof IBeaconOutput; observed: ObservedOutput }

export function retainRunOutput(record: IBeaconRecordWrite<'run'>, channels: readonly OutputTarget[], maximumBytes = 8192): IBeaconRecordWrite<'run'> {
	const allocations = channels.map(() => 0); let remaining = maximumBytes;
	let pending = channels.map((_, index) => index).filter(index => channels[index].observed.length > 0);
	while (pending.length && remaining > 0) {
		const each = Math.floor(remaining / pending.length), extra = remaining % pending.length;
		const next: number[] = [];
		for (const [position, index] of pending.entries()) {
			const take = Math.min(channels[index].observed.length - allocations[index], each + (position < extra ? 1 : 0));
			allocations[index] += take; remaining -= take;
			if (allocations[index] < channels[index].observed.length) { next.push(index); }
		}
		pending = next;
	}
	for (const [index, channel] of channels.entries()) { channel.output[channel.stream] = channel.observed.retain(allocations[index]); }
	return record;
}

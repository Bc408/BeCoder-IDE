/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringDecoder } from 'string_decoder';
import { stripVTControlCharacters } from 'util';
import type { BeaconRunText, IBeaconOutput } from 'becoder-beacon';
import { beaconRunLimits, truncateRunText } from '../../../src/vs/platform/beacon/common/beaconRunRecord';

/** One bounded decoded prefix per stream, with no shared quota or raw event history. */
export class ObservedOutput {
	private readonly decoder = new StringDecoder('utf8');
	private prefix: BeaconRunText = '';
	append(bytes: Buffer, omitted = 0): void {
		this.accept(stripVTControlCharacters(this.decoder.write(bytes)), omitted > 0);
	}
	private accept(text: string, omitted = false): void {
		if (typeof this.prefix !== 'string') { return; }
		const prefix = this.prefix;
		const next = truncateRunText(prefix + text, beaconRunLimits.text);
		this.prefix = omitted ? { text: typeof next === 'string' ? next : next.text, truncated: true } : next;
	}
	finish(): void { this.accept(stripVTControlCharacters(this.decoder.end())); }
	retain(): BeaconRunText { return this.prefix; }
}
export interface OutputTarget { output: IBeaconOutput; stream: keyof IBeaconOutput; observed: ObservedOutput }

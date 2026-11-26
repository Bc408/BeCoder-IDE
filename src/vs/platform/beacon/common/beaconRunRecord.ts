/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal transport shared with bundled extensions.
import type { BeaconRunText, IBeaconOutput, IBeaconRecordWrite } from 'becoder-beacon';

export const beaconRunLimits = { code: 8192, text: 4096, error: 1024, bytes: 32768 } as const;

export function isRunRecordTooLarge(error: unknown): boolean { return error instanceof Error && error.message.includes('beacon-run-record-too-large'); }

/** Count Unicode code points, preserving the original prefix without splitting surrogate pairs. */
export function truncateRunText(value: BeaconRunText, limit: number): BeaconRunText {
	const text = typeof value === 'string' ? value : value.text;
	let end = 0, count = 0;
	for (const character of text) {
		if (count === limit) { return { text: text.slice(0, end), truncated: true }; }
		end += character.length; count++;
	}
	return typeof value === 'string' ? value : { text, truncated: true };
}

function truncateOutput(value: IBeaconOutput | undefined): IBeaconOutput | undefined {
	if (!value) { return undefined; }
	return Object.fromEntries(Object.entries(value).map(([stream, text]) => [stream, typeof text === 'object' && Object.hasOwn(text, 'head')
		? truncateRunText({ text: (text as { head: string }).head, truncated: true }, beaconRunLimits.text)
		: truncateRunText(text, beaconRunLimits.text)]));
}

/** Normalize evidence copies only; never pass these prefixes back to an execution owner. */
export function normalizeRunRecord<T extends IBeaconRecordWrite<'run'>>(value: T): T {
	return {
		...value,
		program: { ...value.program, code: truncateRunText(value.program.code, beaconRunLimits.code) },
		compile: { ...value.compile, ...(value.compile.output ? { output: truncateOutput(value.compile.output) } : {}), ...(value.compile.error !== undefined ? { error: truncateRunText(value.compile.error, beaconRunLimits.error) } : {}) },
		runs: value.runs.map(run => ({
			...run, input: { ...run.input, text: run.input.text === null ? null : truncateRunText(run.input.text, beaconRunLimits.text) },
			...(run.expectedOutput !== undefined ? { expectedOutput: truncateRunText(run.expectedOutput, beaconRunLimits.text) } : {}),
			...(run.output ? { output: truncateOutput(run.output) } : {}),
			...(run.error !== undefined ? { error: truncateRunText(run.error, beaconRunLimits.error) } : {})
		})),
		...(value.error !== undefined ? { error: truncateRunText(value.error, beaconRunLimits.error) } : {})
	};
}

export function checkRunRecordSize(record: IBeaconRecordWrite<'run'>): void {
	if (new TextEncoder().encode(JSON.stringify(record)).length > beaconRunLimits.bytes) { throw new Error('beacon-run-record-too-large'); }
}

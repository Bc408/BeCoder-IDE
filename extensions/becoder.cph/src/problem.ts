/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the GPL-3.0-or-later License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Sample {
	readonly input: string;
	readonly output: string;
}

/** Page data only. Local paths and compiler options never come from a page. */
export interface ImportedProblem {
	readonly name: string;
	readonly group: string;
	readonly url: string;
	readonly timeLimit: number;
	readonly memoryLimit: number;
	readonly interactive: boolean;
	readonly tests: readonly Sample[];
	readonly batch: { readonly id: string; readonly size: number };
	readonly input: { readonly type: 'stdin' };
	readonly output: { readonly type: 'stdout' };
	readonly testType: 'single';
	readonly local?: boolean;
}

const maximumPayloadBytes = 8 * 1024 * 1024;
const maximumSamples = 100;

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Invalid problem object.');
	}
	return value as Record<string, unknown>;
}

function text(value: unknown, maximumLength: number, allowEmpty = false): string {
	if (typeof value !== 'string' || value.length > maximumLength || (!allowEmpty && !value.trim())) {
		throw new Error('Invalid problem text.');
	}
	return value;
}

function positiveNumber(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 2147483647) {
		throw new Error('Invalid problem limit.');
	}
	return value;
}

/** Canonical identity within the selected workspace; query parameters remain significant. */
export function problemIdentity(value: string): string {
	const url = new URL(value);
	if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
		throw new Error('Invalid problem URL.');
	}
	url.hash = '';
	return url.href;
}

function sampleText(value: unknown): string {
	const data = text(value, maximumPayloadBytes, true).replace(/\r\n/g, '\n');
	// Preserve empty input (real EOF) and meaningful spaces/blank lines.
	return !data || data.endsWith('\n') ? data : `${data}\n`;
}

/** Validate again in the extension host, even when the browser already validated. */
export function parseImportedProblem(json: string, expectedUrl: string): ImportedProblem {
	if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > maximumPayloadBytes) {
		throw new Error('Problem payload exceeds the import limit.');
	}
	const value = record(JSON.parse(json));
	const url = problemIdentity(text(value.url, 8192));
	if (url !== problemIdentity(expectedUrl)) {
		throw new Error('The problem page changed during import.');
	}
	if (typeof value.interactive !== 'boolean') {
		throw new Error('Missing problem interaction type.');
	}
	if (value.interactive) {
		throw new Error('Interactive problems are not supported.');
	}
	if (record(value.input).type !== 'stdin' || record(value.output).type !== 'stdout' || value.testType !== 'single') {
		throw new Error('Only standard input/output sample tests are supported.');
	}
	if (!Array.isArray(value.tests) || value.tests.length > maximumSamples) {
		throw new Error('Invalid sample list.');
	}
	const batch = record(value.batch);
	if (batch.size !== 1) {
		throw new Error('Only a single problem can be imported at a time.');
	}
	return {
		name: text(value.name, 1024),
		group: text(value.group, 1024, true),
		url,
		timeLimit: positiveNumber(value.timeLimit),
		memoryLimit: positiveNumber(value.memoryLimit),
		interactive: false,
		tests: value.tests.map(item => {
			const sample = record(item);
			return { input: sampleText(sample.input), output: sampleText(sample.output) };
		}),
		batch: { id: text(batch.id, 128), size: 1 },
		input: { type: 'stdin' },
		output: { type: 'stdout' },
		testType: 'single'
	};
}

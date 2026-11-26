/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { ContextOutput } from './contextTools';
import type { BeaconContextToolName } from './contextToolContract';
import type { FileOutput } from './fileTools';
import type { WebOutput } from './webTools';

const hashNote = 'codeHash identifies the complete captured code after CRLF-to-LF normalization.';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const objects = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(object) : [];
const has = (value: unknown, field: string) => object(value) && Object.hasOwn(value, field);

/** Inspect representation keys only. Student text never becomes application guidance. */
function truncationNotes(value: unknown): string[] {
	let prefix = false, legacy = false, omitted = false, limited = false;
	const visit = (item: unknown): void => {
		if (Array.isArray(item)) { item.forEach(visit); }
		else if (object(item)) {
			if (typeof item.text === 'string' && item.truncated === true) { prefix = true; }
			if (typeof item.head === 'string' || typeof item.tail === 'string') { legacy = true; }
			if (typeof item.omittedBytes === 'number' && item.omittedBytes > 0 || typeof item.sourceOmittedBytesAtLeast === 'number' && item.sourceOmittedBytesAtLeast > 0) { omitted = true; }
			if (item.status === 'output-limit' || item.check === 'output-limit') { limited = true; }
			Object.values(item).forEach(visit);
		}
	};
	visit(value);
	return [
		...(prefix ? ['Values marked truncated are saved prefixes; their omitted suffixes are not available through this record.'] : []),
		...(legacy ? ['This legacy output stores head and tail separately.'] : []),
		...(omitted ? ['Output counted by omittedBytes or sourceOmittedBytesAtLeast is unavailable through this record.'] : []),
		...(limited && (prefix || omitted) ? ['Text truncation describes retained evidence; output-limit describes the process outcome.'] : [])
	];
}

export function contextResultNotes(name: BeaconContextToolName, output: ContextOutput): readonly string[] {
	if (output.error || output.ok === false) { return []; }
	if (Array.isArray(output.records)) {
		return ['These are currently available recent records, newest first, not a complete activity history.',
			...(name === 'readRunRecord' || name === 'readVerdictRecord' ? ['Entries are summaries; id reads the corresponding retained record.'] : []),
			...(!output.records.length ? ['No matching record is available in this recent queue.'] : [])];
	}
	if (name === 'readCurrentCode') {
		const files = objects(output.files), cells = files.flatMap(file => objects(file.cells));
		return [...(!files.length ? ["No C/C++ document or BeCoder notebook is currently displayed in this window's editor panes."] : []),
			...(files.some(file => has(file, 'codeHash')) || cells.some(cell => has(cell, 'codeHash')) ? [hashNote] : []),
			...(files.some(file => file.kind === 'notebook') ? ['cellNumber is the 1-based position among all cells in the notebook as read by this call.'] : [])];
	}
	if (name === 'readPage') { return rangeNotes(output); }
	if (!object(output.record)) { return []; }
	const record = output.record;
	if (name === 'readVerdictRecord') {
		const result = object(record.result) ? record.result : {};
		return [...(has(record.submission, 'codeHash') ? [hashNote] : []),
			...(Array.isArray(result.groups) && result.groups.length || result.testCaseSummary !== undefined ? ['This result describes the recorded submission. Per-test outcomes are judging results, not the underlying test inputs.'] : [])];
	}
	if (name !== 'readRunRecord') { return []; }
	const runs = objects(record.runs);
	return [
		'record.status describes the overall operation; compile.status and runs[].status describe compilation and individual process outcomes.',
		...(record.source === 'cph' ? ['check records answer checking separately from process status; an absent check supplies no answer verdict.'] : record.source === 'runner' || record.source === 'notebook' ? [`${record.source === 'runner' ? 'Runner' : 'Notebook'} does not automatically check answers.`] : []),
		...(runs.some(run => has(run.output, 'merged')) ? ['Program output.merged combines stdout and stderr; these streams are not separated in this result.'] : []),
		...(runs.some(run => has(run.output, 'stdout') || has(run.output, 'stderr')) ? ['Program output.stdout and output.stderr are separate captured streams.'] : []),
		...(runs.some(run => run.status === 'not-run' || run.status === 'start-failed') ? ['Inputs marked not-run or start-failed were not executed.'] : []),
		...(runs.some(run => object(run.input) && run.input.text === null) ? ['input.text is unknown where it is null; an empty string means known empty input.'] : []),
		...(has(record.program, 'codeHash') ? [hashNote] : []),
		...(record.source === 'notebook' && (has(record.program, 'codeCellNumber') || runs.some(run => has(run, 'inputCellNumber'))) ? ['Recorded cell numbers are 1-based positions among all notebook cells at execution time.'] : []),
		...(has(record, 'workingDirectory') ? ['workingDirectory is the directory used by this recorded execution.'] : []),
		...truncationNotes(record)
	];
}

function rangeNotes(output: { [key: string]: unknown }): string[] {
	return [...(output.kind === 'binary' ? ['contents contains hexadecimal bytes; offset and nextOffset use byte positions.'] : []),
		...(output.representation === 'notebook-content' ? ['Notebook text contains numbered content cells, without execution results.'] : []),
		...(typeof output.nextOffset === 'number' ? [typeof output.pageNumber === 'number' ? `To read the next text range on this PDF page, keep pageNumber=${output.pageNumber} and use offset=${output.nextOffset}.` : `To read the next range, use offset=${output.nextOffset}.`] : []),
		...((output.kind === 'entries' || output.kind === 'matches') && output.truncated === true ? ['This listing or search is incomplete; it provides no continuation cursor.'] : [])];
}

export function fileResultNotes(output: FileOutput): readonly string[] { return output.ok && output.kind !== 'image' ? rangeNotes({ ...output }) : []; }

export function webResultNotes(output: WebOutput): readonly string[] {
	if (!output.ok) { return []; }
	return [...(output.sources.some(source => source.kind === 'search') ? ['Search text contains excerpts, not full webpage content.'] : []),
		...(output.sourcesOmittedByBudget ? ['Some sources were omitted because the remaining web lookup budget could not accommodate them.'] : []),
		...(output.sources.some(source => source.truncated) ? ['Some returned source text is incomplete; no continuation offset is provided.'] : []),
		...(!output.sources.length ? ['No sources were returned by this lookup.'] : [])];
}

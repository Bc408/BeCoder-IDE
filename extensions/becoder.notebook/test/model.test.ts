/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { encodeNotebook, decodeNotebook, associatedNotebook, prepareAssociationLocation, inputCommandTarget, notebookCreationTarget, type NotebookData } from '../src/model';
import { CellOutputQueue } from '../src/outputQueue';
import { formatBeCoderRunHeading } from '../../../src/vs/workbench/contrib/becoder/common/beCoderNotebook';

test('Notebook output heading uses actual phase timings and English states', () => {
	assert.equal(typeof formatBeCoderRunHeading, 'function');
	assert.equal(formatBeCoderRunHeading({ status: 'completed', compileMs: 592.4, runMs: 7 }), 'OK | compile 592 ms | run 7 ms');
	assert.equal(formatBeCoderRunHeading({ status: 'compile-error', compileMs: 15 }), 'CE | compile 15 ms');
	assert.equal(formatBeCoderRunHeading({ status: 'runtime-error', compileMs: 15, runMs: 8, exitCode: 2 }), 'RE (exit code 2) | compile 15 ms | run 8 ms');
	assert.equal(formatBeCoderRunHeading({ status: 'timed-out', compileMs: 500, runMs: 5000 }), 'TLE | compile 500 ms | run 5000 ms');
	assert.equal(formatBeCoderRunHeading({ status: 'output-limit', compileMs: 500, runMs: 12 }), 'OLE | compile 500 ms | run 12 ms');
	assert.equal(formatBeCoderRunHeading({ status: 'cancelled' }), 'Stopped');
	assert.equal(formatBeCoderRunHeading({ status: 'running' }), 'Running');
});

test('Notebook accepts only complete supported cell types and registers input identity', () => {
	assert.throws(() => encodeNotebook({ cells: [{ kind: 2, value: 'print(1)', languageId: 'python' }] }), /unsupported-cell/);
	const input = decodeNotebook(encodeNotebook({ cells: [{ kind: 2, value: '1\n', languageId: 'becoder-input' }] })).cells[0];
	assert.equal((input.metadata?.becoder as { role: string }).role, 'input');
	assert.throws(() => encodeNotebook({ cells: [{ kind: 2, value: 'old input', languageId: 'plaintext', metadata: { becoder: { role: 'input' } } }] }), /unsupported-cell/);
});

test('a new empty bcnb file opens as a native blank Notebook', () => {
	const notebook = decodeNotebook(new Uint8Array());
	assert.equal(notebook.cells.length, 1);
	assert.equal(notebook.cells[0].languageId, 'markdown');
	assert.equal(notebook.cells[0].value, '');
	assert.doesNotThrow(() => decodeNotebook(encodeNotebook(notebook)));
});

test('changing an input into a program clears input execution presentation without mutating the original', () => {
	const original: NotebookData = { cells: [{ kind: 2, languageId: 'becoder-input', value: '77', metadata: { becoder: { id: 'case', role: 'input', attempt: { status: 'completed' } } }, outputs: [{ items: [{ mime: 'text/plain', data: new Uint8Array([65]) }] }], executionSummary: { success: true } }] };
	const next = notebookContent(original, [{ id: 'case', kind: 2, language: 'cpp', source: 'program' }]);
	assert.deepEqual(next.cells[0].outputs, []);
	assert.equal((next.cells[0].metadata?.becoder as { attempt?: unknown }).attempt, undefined);
	assert.equal(next.cells[0].executionSummary, undefined);
	assert.equal(original.cells[0].outputs?.length, 1);
});
import { notebookContent, type ContentCell } from '../src/edits';
import { NotebookEditOwner, createNotebook, type NotebookEditPort } from '../src/editOwner';
import { writeNotebookBackup } from '../src/backup';
import { imageAttachment } from '../src/images';
import * as notebookModel from '../src/model';
import * as outputModule from '../src/outputQueue';
import * as notebookMetadata from '../../../src/vs/workbench/contrib/becoder/common/beCoderNotebook';
import type { NotebookCell, NotebookEditor } from 'vscode';

test('input run numbers only preceding C/C++ program blocks', () => {
	const data = decodeNotebook(encodeNotebook({ cells: [
		{ kind: 1, languageId: 'markdown', value: 'notes' },
		{ kind: 2, languageId: 'cpp', value: 'first' },
		{ kind: 2, languageId: 'becoder-input', value: '1' },
		{ kind: 1, languageId: 'markdown', value: 'more notes' },
		{ kind: 2, languageId: 'c', value: 'second' },
		{ kind: 2, languageId: 'becoder-input', value: '2' }
	] }));
	assert.equal((notebookModel.captureInputRun(data, 5) as { codeNumber?: number }).codeNumber, 2);
});

test('creation resolves source association from opened roots and asks for the parent folder before creating nested assets', async () => {
	const root = await fs.mkdtemp(path.join(tmpdir(), 'becoder-create-target-'));
	try {
		const child = path.join(root, 'contest'); await fs.mkdir(child);
		await assert.rejects(notebookCreationTarget([], { path: path.join(root, 'note.bcnb') }), /open-folder/);
		assert.deepEqual(await notebookCreationTarget([root], { sourcePath: path.join(child, 'A.cpp') }, root), { path: path.join(root, '.notebook', 'contest', 'A.cpp.bcnb'), associationRoot: root });
		await fs.mkdir(path.join(root, '.notebook'));
		await assert.rejects(notebookCreationTarget([child], { sourcePath: path.join(child, 'A.cpp') }, root), /open-parent-folder/);
		await assert.rejects(fs.stat(path.join(child, '.notebook')), /ENOENT/);
		await assert.rejects(notebookCreationTarget([child], { sourcePath: path.join(root, 'A.cpp') }), /source-outside/);
		await assert.rejects(notebookCreationTarget([root], { path: 'relative.bcnb' }), /invalid-target/);
		await assert.rejects(notebookCreationTarget([root], { path: path.join(root, 'a.bcnb'), sourcePath: path.join(root, 'a.cpp') }), /ambiguous-target/);
	} finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('new Notebook creation waits for complete content and cancellation before publication leaves no file', async () => {
	const calls: string[] = []; let bytes: Uint8Array | undefined;
	const port = { begin: async () => { calls.push('begin'); }, prepare: async () => { calls.push('prepare'); }, verify: async () => { calls.push('verify'); }, create: async (data: Uint8Array) => { calls.push('create'); bytes = data; return true; }, open: async () => { calls.push('open'); }, release: async () => { calls.push('release'); } };
	const result = await createNotebook([{ kind: 1, source: '# notes' }, { kind: 2, language: 'cpp', source: 'teaching code' }, { kind: 2, language: 'becoder-input', source: '2\n', name: 'sample' }], port);
	assert.equal(result.saved, true); assert.equal(result.created, true); assert.equal(result.released, true);
	assert.deepEqual(calls, ['begin', 'prepare', 'verify', 'create', 'open', 'release']);
	const data = decodeNotebook(bytes!); assert.equal(data.cells.length, 3); assert.equal(data.cells[2].value, '2\n'); assert.deepEqual(data.cells.map(cell => cell.outputs), [[], [], []]);
	calls.length = 0; const controller = new AbortController();
	const cancelled = await createNotebook([{ kind: 1, source: 'unfinished' }], { ...port, begin: async () => { calls.push('begin'); controller.abort(); } }, controller.signal);
	assert.equal(cancelled.saved, false); assert.deepEqual(calls, ['begin', 'release']);
	calls.length = 0;
	await assert.rejects(createNotebook([{ kind: 2, source: 'fake', outputs: [] } as unknown as ContentCell], port), /forbidden/);
	assert.deepEqual(calls, []);
});

test('new Notebook native-create and open failures report actual publication and never delete or back up', async () => {
	const port = { begin: async () => {}, prepare: async () => {}, verify: async () => {}, create: async () => false, open: async () => { throw new Error('open failed'); }, release: async () => {} };
	const failed = await createNotebook([{ kind: 1, source: 'notes' }], port); assert.equal(failed.saved, false); assert.match(String(failed.error), /not-applied/); assert.equal(failed.released, true);
	const opened = await createNotebook([{ kind: 1, source: 'notes' }], { ...port, create: async () => true }); assert.equal(opened.created, true); assert.equal(opened.saved, true); assert.match(String(opened.error), /open failed/);
	const release = await createNotebook([{ kind: 1, source: 'notes' }], { ...port, create: async () => true, open: async () => {}, release: async () => { throw new Error('release failed'); } });
	assert.equal(release.saved, true); assert.equal(release.released, false); assert.match(String(release.error), /release failed/);
});

test('input commands target the clicked cell instead of another selected cell', () => {
	const cells: NotebookCell[] = [];
	const notebook = { notebookType: 'becoder-notebook', isClosed: false, cellCount: 2, getCells: () => cells, cellAt: (index: number) => cells[index] };
	const selected = { kind: 2, metadata: { becoder: { role: 'input' } }, notebook, index: 0 } as unknown as NotebookCell;
	const clicked = { kind: 2, metadata: { becoder: { role: 'input' } }, notebook, index: 1 } as unknown as NotebookCell;
	cells.push(selected, clicked);
	const editor = { notebook, selections: [{ start: 0, end: 1 }] } as unknown as NotebookEditor;
	assert.equal(inputCommandTarget(clicked, editor), clicked);
	assert.equal(inputCommandTarget(undefined, editor), selected);
	cells.reverse(); // Native cell handles survive reordering; indices change.
	assert.equal(inputCommandTarget(clicked, editor), clicked);
	cells.splice(cells.indexOf(clicked), 1);
	assert.equal(inputCommandTarget(clicked, editor), undefined); // Never silently rename the selection instead.
	notebook.isClosed = true;
	assert.equal(inputCommandTarget(selected, editor), undefined);
});

test('input commands reject program and foreign Notebook cells without falling back', () => {
	const cells: NotebookCell[] = [];
	const notebook = { notebookType: 'becoder-notebook', isClosed: false, cellCount: 1, getCells: () => cells, cellAt: (index: number) => cells[index] };
	const program = { kind: 2, metadata: { becoder: {} }, notebook } as unknown as NotebookCell;
	cells.push(program);
	assert.equal(inputCommandTarget(program), undefined);
	const foreign = { ...program, metadata: { becoder: { role: 'input' } }, notebook: { ...notebook, notebookType: 'jupyter-notebook' } } as unknown as NotebookCell;
	cells.push(foreign);
	assert.equal(inputCommandTarget(foreign), undefined);
	assert.equal(inputCommandTarget(undefined, { notebook, selections: [{ start: 1, end: 1 }] } as unknown as NotebookEditor), undefined);
});

// The browser helper is compiled separately; its production types belong to the core checker.
interface OutputBytes { buffer: Uint8Array; byteLength: number; slice(start: number, end?: number): OutputBytes }
const { copyCellOutput, VSBuffer } = require('./coreOutputFixture.cjs') as {
	VSBuffer: { fromString(text: string): OutputBytes };
	copyCellOutput(mime: string, output: { model: { outputs: { mime: string; data: OutputBytes }[] } }, clipboard: { writeText(text: string): Promise<void> }, log: { error(error: unknown): void }): Promise<void>;
};

test('development formats are rejected and saving does not rewrite Markdown image syntax', () => {
	assert.throws(() => decodeNotebook(Buffer.from(JSON.stringify({ format: 'becoder-notebook', version: 1, cells: [] }))), /unsupported/);
	const source = '![example](data:image/png;base64,AQID)';
	const data = decodeNotebook(encodeNotebook({ cells: [{ kind: 1, value: source, languageId: 'markdown' }] }));
	assert.equal(data.cells[0].value, source);
	assert.equal(data.cells[0].metadata?.attachments, undefined);
});

test('model can edit an input text cell while retaining its actual result and preserving Markdown attachments', () => {
	const original: NotebookData = { cells: [{ kind: 2, value: 'old input', languageId: 'becoder-input', metadata: { becoder: { id: 'input', role: 'input', name: 'case 1', attempt: { status: 'completed' } } }, outputs: [{ items: [{ mime: 'text/plain', data: new Uint8Array([65]) }] }] }, { kind: 1, value: '![x](attachment:x.png)', languageId: 'markdown', metadata: { becoder: { id: 'text' }, attachments: { 'x.png': { 'image/png': 'AQID' } } } }] };
	const next = notebookContent(original, [{ id: 'input', kind: 2, source: 'new input', language: 'becoder-input' as ContentCell['language'] }, { id: 'text', kind: 1 }]);
	assert.equal(next.cells[0].value, 'new input');
	assert.equal((next.cells[0].metadata?.becoder as Record<string, unknown>).role, 'input');
	assert.deepEqual(next.cells[0].outputs, original.cells[0].outputs);
	assert.deepEqual(next.cells[1].metadata?.attachments, { 'x.png': { 'image/png': 'AQID' } });
});

test('image references avoid payload text and a filename collision never replaces another picture', () => {
	const metadata = { attachments: { '截图.png': { 'image/png': 'AA==' } } };
	const edit = imageAttachment(metadata, '截图.png', 'image/png', new Uint8Array([1, 2, 3]));
	assert.doesNotMatch(edit.source, /base64|AQID/);
	assert.match(edit.source, /attachment:/);
	assert.deepEqual(edit.metadata.attachments, { '截图.png': { 'image/png': 'AA==' }, '截图.png-2': { 'image/png': 'AQID' } });
	assert.deepEqual(metadata.attachments, { '截图.png': { 'image/png': 'AA==' } });
});

test('input execution captures the nearest preceding C/C++ block across prose and other input cells', () => {
	const capture = (notebookModel as unknown as { captureInputRun?: (data: NotebookData, index: number) => { code: string; input: string; codeCellId: string; inputCellId: string } }).captureInputRun;
	assert.equal(typeof capture, 'function');
	const data: NotebookData = { cells: [{ kind: 2, value: 'first code', languageId: 'c', metadata: { becoder: { id: 'first' } } }, { kind: 2, value: 'nearest dirty code', languageId: 'cpp', metadata: { becoder: { id: 'nearest' } } }, { kind: 1, value: 'explanation', languageId: 'markdown' }, { kind: 2, value: 'other input', languageId: 'becoder-input', metadata: { becoder: { id: 'other', role: 'input' } } }, { kind: 2, value: '2 3\n', languageId: 'becoder-input', metadata: { becoder: { id: 'selected', role: 'input' } } }] };
	const result = capture!(data, 4);
	data.cells[1].value = 'later edit'; data.cells[4].value = 'later input';
	assert.deepEqual({ code: result.code, input: result.input, codeCellId: result.codeCellId, inputCellId: result.inputCellId }, { code: 'nearest dirty code', input: '2 3\n', codeCellId: 'nearest', inputCellId: 'selected' });
	assert.throws(() => capture!({ cells: [data.cells[4]] }, 0), /no-program/);
});

test('ANSI stream retains purple across batches and holds incomplete escape sequences until complete', () => {
	const Stream = (outputModule as unknown as { AnsiStream?: new () => { append(text: string): string } }).AnsiStream;
	assert.equal(typeof Stream, 'function');
	const stream = new Stream!();
	assert.equal(stream.append('plain\u001b['), 'plain');
	assert.equal(stream.append('35mdebug'), '\u001b[35mdebug');
	assert.equal(stream.append(' continues\u001b[0'), '\u001b[35m continues');
	assert.equal(stream.append('mnormal'), '\u001b[35m\u001b[0mnormal');
	assert.equal(stream.append(' default cerr'), ' default cerr');
});

test('Notebook page metadata describes image attachments without dumping their base64 into model context', () => {
	const describe = (notebookMetadata as unknown as { describeNotebookMetadata?: (metadata: Record<string, unknown>) => Record<string, unknown> }).describeNotebookMetadata;
	assert.equal(typeof describe, 'function');
	const original = { becoder: { id: 'text' }, attachments: { 'x.png': { 'image/png': 'AQID' } } };
	const result = describe!(original);
	assert.doesNotMatch(JSON.stringify(result), /AQID/);
	assert.deepEqual(result.attachments, { 'x.png': { mimeTypes: ['image/png'], byteLength: 3 } });
	assert.deepEqual(original.attachments, { 'x.png': { 'image/png': 'AQID' } });
});

test('copying a BeCoder stream returns visible plain text with its original whitespace', async () => {
	let copied: string | undefined;
	const output = { model: { outputs: [{ mime: 'application/vnd.becoder.notebook.stream', data: VSBuffer.fromString('  normal\n\u001b[35mdebug\u001b[0m\n') }] } };
	await copyCellOutput('application/vnd.becoder.notebook.stream', output, { writeText: async text => { copied = text; } }, { error: () => assert.fail('clipboard error') });
	assert.equal(copied, '  normal\ndebug\n');
});

test('single file roundtrip retains attachments, dirty code, input and actual result bytes', () => {
	const data: NotebookData = { cells: [{ kind: 1, value: '![x](attachment:x.png)', languageId: 'markdown', metadata: { attachments: { 'x.png': { 'image/png': 'AQID' } } } }, { kind: 2, value: 'dirty code', languageId: 'cpp' }, { kind: 2, value: '2\n', languageId: 'becoder-input', metadata: { becoder: { id: 'input', role: 'input', attempt: { status: 'completed' } } }, outputs: [{ items: [{ mime: 'text/plain', data: new Uint8Array([0, 1, 255]) }] }], executionSummary: { success: true } }] };
	const decoded = decodeNotebook(encodeNotebook(data));
	assert.equal(decoded.cells.length, 3);
	assert.deepEqual(decoded.cells[0].metadata?.attachments, data.cells[0].metadata?.attachments);
	assert.equal(decoded.cells[1].value, 'dirty code');
	assert.equal(decoded.cells[2].value, '2\n');
	assert.deepEqual(decoded.cells[2].outputs?.[0].items[0].data, new Uint8Array([0, 1, 255]));
	assert.deepEqual(decoded.cells[2].executionSummary, { success: true });
});
test('bad JSON or unknown versions fail open rather than returning an empty document', () => {
	for (const source of ['{broken', '{"format":"becoder-notebook","version":3,"cells":[]}', '{"format":"becoder-notebook","version":1,"cells":[{"kind":9}]}']) { assert.throws(() => decodeNotebook(Buffer.from(source))); }
});
test('association mirrors full source filename and does not guess an outside root', () => {
	assert.equal(associatedNotebook('C:\\root', 'C:\\root\\比赛\\A.cpp'), 'C:\\root\\.notebook\\比赛\\A.cpp.bcnb');
	assert.notEqual(associatedNotebook('C:\\root', 'C:\\root\\main.c'), associatedNotebook('C:\\root', 'C:\\root\\main.cpp'));
	assert.equal(associatedNotebook('C:\\root', 'C:\\other\\main.cpp'), undefined);
});
test('association creates only its own nested directory and refuses a redirected ancestor before writing', async () => {
	const fixture = await fs.mkdtemp(path.join(tmpdir(), 'becoder-notebook-association-'));
	try {
		const root = path.join(fixture, 'root'); const outside = path.join(fixture, 'outside');
		await fs.mkdir(root); await fs.mkdir(outside);
		const target = associatedNotebook(root, path.join(root, 'contest', 'A.cpp'))!;
		assert.equal(await prepareAssociationLocation(root, target), target);
		assert.ok((await fs.stat(path.dirname(target))).isDirectory());
		await fs.rm(path.join(root, '.notebook'), { recursive: true });
		await fs.symlink(outside, path.join(root, '.notebook'), 'junction');
		await assert.rejects(prepareAssociationLocation(root, target), /redirected/);
		assert.deepEqual(await fs.readdir(outside), []);
	} finally { await fs.rm(fixture, { recursive: true }); }
});
test('clearing output discards pending prefixes while later output still arrives in order', async () => {
	const observed: string[] = [];
	const queue = new CellOutputQueue(async parts => { observed.push(...parts.map(part => part.text)); });
	queue.append({ phase: 'running', stream: 'stdout', text: 'old-prefix' });
	queue.clear(); queue.append({ phase: 'running', stream: 'stderr', text: 'new-output' });
	await queue.flush(); assert.deepEqual(observed, ['new-output']);
});
test('output queue reports an asynchronous native write failure without an unhandled rejection', async () => {
	const queue = new CellOutputQueue(async () => { throw new Error('native output failed'); });
	queue.append({ phase: 'compiling', stream: 'stderr', text: 'diagnostic' });
	await assert.rejects(queue.flush(), /native output failed/);
});
test('model content retains real output and attempt while new blocks cannot invent execution facts', () => {
	const original: NotebookData = { cells: [{ kind: 2, value: 'old', languageId: 'becoder-input', metadata: { becoder: { id: 'one', role: 'input', attempt: { status: 'completed', code: 'actual old' } } }, outputs: [{ items: [{ mime: 'text/plain', data: new Uint8Array([65]) }] }] }] };
	const next = notebookContent(original, [{ id: 'one', kind: 2, source: 'new', language: 'becoder-input' }, { kind: 2, source: 'unverified', language: 'c' }]);
	assert.deepEqual(next.cells[0].outputs, original.cells[0].outputs); assert.equal(((next.cells[0].metadata?.becoder as Record<string, unknown>).attempt as Record<string, unknown>).status, 'completed');
	assert.deepEqual(next.cells[1].outputs, []); assert.equal((next.cells[1].metadata?.becoder as Record<string, unknown>).attempt, undefined);
	assert.throws(() => notebookContent(original, [{ id: 'one', kind: 2, source: 'new', outputs: [] } as unknown as ContentCell]), /field/);
});
test('latest dirty snapshot is backed up before applying; failed native save keeps edits and returns dirty', async () => {
	let data: NotebookData = { cells: [{ kind: 1, value: 'dirty original', languageId: 'markdown', metadata: { becoder: { id: 'one' } } }] }; let revision = 3; const order: string[] = [];
	const port: NotebookEditPort = { snapshot: () => structuredClone(data), version: () => revision, dirty: () => true, closed: () => false, verify: async () => {}, backup: async snapshot => { order.push('backup:' + snapshot.cells[0].value); return 'note.bcnb-backup'; }, apply: async next => { order.push('apply'); data = next; revision++; }, save: async () => { order.push('save'); return false; }, release: async () => { order.push('release'); } };
	const owner = new NotebookEditOwner(port); const opened = await owner.begin(); assert.equal(opened.revision, 3);
	await owner.apply([{ id: 'one', kind: 1, source: 'new' }], opened.revision); const result = await owner.finish();
	assert.deepEqual(order, ['backup:dirty original', 'apply', 'save', 'release']); assert.deepEqual(result, { applied: true, saved: false, dirty: true }); assert.equal(data.cells[0].value, 'new');
});
test('backup failure releases occupancy and never starts content edits or original save', async () => {
	const operations: string[] = [];
	const owner = new NotebookEditOwner({ snapshot: () => ({ cells: [] }), version: () => 1, dirty: () => true, closed: () => false, verify: async () => {}, backup: async () => { throw new Error('backup failed'); }, apply: async () => { operations.push('apply'); }, save: async () => { operations.push('save'); return true; }, release: async () => { operations.push('release'); } });
	await assert.rejects(owner.begin(), /backup failed/); assert.deepEqual(operations, ['release']);
});
test('latest complete backup replaces only its ordinary destination, never a redirected file or original', async () => {
	const fixture = await fs.mkdtemp(path.join(tmpdir(), 'becoder-notebook-backup-'));
	try {
		const file = path.join(fixture, 'A.cpp.bcnb'); const backup = path.join(fixture, 'A.cpp.bcnb-backup'); const unrelated = path.join(fixture, 'unrelated'); await fs.writeFile(file, 'disk original');
		const bytes = encodeNotebook({ cells: [{ kind: 1, value: 'dirty image ![x](data:image/png;base64,AQID)', languageId: 'markdown' }] });
		assert.equal(await writeNotebookBackup(file, bytes, async () => {}), backup); assert.deepEqual(await fs.readFile(backup), Buffer.from(bytes));
		await fs.writeFile(unrelated, 'keep'); await fs.unlink(backup); await fs.symlink(unrelated, backup);
		await assert.rejects(writeNotebookBackup(file, bytes, async () => {}), /backup/); assert.equal(await fs.readFile(unrelated, 'utf8'), 'keep'); assert.equal(await fs.readFile(file, 'utf8'), 'disk original');
	} finally { await fs.rm(fixture, { recursive: true }); }
});
test('late document change after capture cannot be applied against the old backup revision', async () => {
	let version = 1; let applied = false; let released = false;
	const owner = new NotebookEditOwner({ snapshot: () => ({ cells: [] }), version: () => version, dirty: () => true, closed: () => false, verify: async () => {}, backup: async () => { version++; return 'backup'; }, apply: async () => { applied = true; }, save: async () => true, release: async () => { released = true; } });
	await assert.rejects(owner.begin(), /changed/); assert.equal(applied, false); assert.equal(released, true);
});
test('partial native application is reported and a completed save is not reclassified by later cancellation', async () => {
	let version = 1; let partial = true;
	const owner = new NotebookEditOwner({ snapshot: () => ({ cells: [] }), version: () => version, dirty: () => false, closed: () => false, verify: async () => {}, backup: async () => 'backup', apply: async () => { version++; if (partial) { throw new Error('native partial failure'); } }, save: async () => true, release: async () => {} });
	await owner.begin(); await assert.rejects(owner.apply([], 1), /partial/); assert.equal(owner.status().applied, true);
	partial = false; await owner.finish(); assert.equal((await owner.cancel()).saved, true);
});

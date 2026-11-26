/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activate, deactivate } from '../src/extension';
import { state, notices, commands, workspace, Uri } from './executionMock';
import * as path from 'node:path';
import nativeFs, * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NotebookEdits } from '../src/editApi';
import { encodeNotebook } from '../src/model';
import { FileTools } from '../../becoder.beacon/src/fileTools';
import { runNotebookProgramGroup } from '../../danielpinto8zz6.c-cpp-compile-run/src/notebookProcess';
import { BeaconEvidence } from '../../danielpinto8zz6.c-cpp-compile-run/src/beaconEvidence';

const contentUri = (file: string) => ({ scheme: 'file', fsPath: file, toString: () => pathToFileURL(file).toString() });

for (const alias of ['junction', 'case'] as const) {
	test(`Notebook ${alias} identity retains the loaded dirty content through ordinary file reads`, async t => {
		const root = await fs.mkdtemp(path.join(tmpdir(), 'becoder-notebook-owner-'));
		const owner = new NotebookEdits(async () => {}, new Set());
		t.mock.method(Uri, 'parse', (value: string) => contentUri(fileURLToPath(value)));
		try {
			const actual = path.join(root, 'actual'); await fs.mkdir(actual);
			const file = path.join(actual, 'notes.bcnb');
			await fs.writeFile(file, encodeNotebook({ cells: [{ kind: 2, languageId: 'cpp', value: 'saved program' }] }));
			const linked = path.join(root, 'alias');
			if (alias === 'junction') { await fs.symlink(actual, linked, 'junction'); }
			const document = { uri: contentUri(alias === 'junction' ? path.join(linked, 'notes.bcnb') : file.toUpperCase()), version: 1, isClosed: false, notebookType: 'becoder-notebook', metadata: {}, getCells: () => [{ kind: 2, document: { languageId: 'cpp', getText: () => 'dirty program' }, metadata: {}, outputs: [] }] };
			workspace.notebookDocuments = [document];
			const reader = new FileTools('workspace', [{ name: 'root', path: root }], undefined, { readRepresentation: (canonical, signal) => owner.readBeaconContent(contentUri(canonical).toString(), signal) });
			const result = await reader.execute({ operation: 'read', path: file }, new AbortController().signal);
			assert.equal(result.ok, true); assert.equal(JSON.parse(result.contents!).cells[0].source, 'dirty program');
		} finally { workspace.notebookDocuments = []; await owner.dispose(); assert.ok(root.startsWith(path.join(tmpdir(), 'becoder-notebook-owner-'))); await fs.rm(root, { recursive: true, force: true }); }
	});
}

for (const change of ['edit', 'close', 'replace'] as const) {
	test(`Notebook loaded owner ${change} during final verification rejects stale content`, async t => {
		const root = await fs.mkdtemp(path.join(tmpdir(), 'becoder-notebook-owner-'));
		const owner = new NotebookEdits(async () => {}, new Set());
		t.mock.method(Uri, 'parse', (value: string) => contentUri(fileURLToPath(value)));
		try {
			const file = path.join(root, 'notes.bcnb'); await fs.writeFile(file, encodeNotebook({ cells: [{ kind: 2, languageId: 'cpp', value: 'saved program' }] }));
			let captured = false;
			const document = { uri: contentUri(file), version: 1, isClosed: false, notebookType: 'becoder-notebook', metadata: {}, getCells: () => [{ kind: 2, document: { languageId: 'cpp', getText: () => { captured = true; return 'dirty program'; } }, metadata: {}, outputs: [] }] };
			workspace.notebookDocuments = [document];
			const stat = nativeFs.stat;
			t.mock.method(nativeFs, 'stat', async (...args: Parameters<typeof fs.stat>) => {
				const result = await stat(...args);
				if (captured) {
					if (change === 'edit') { document.version++; }
					if (change === 'close') { document.isClosed = true; }
					if (change === 'replace') { workspace.notebookDocuments = [{ ...document }]; }
				}
				return result;
			});
			const reader = new FileTools('workspace', [{ name: 'root', path: root }], undefined, { readRepresentation: (canonical, signal) => owner.readBeaconContent(contentUri(canonical).toString(), signal) });
			const result = await reader.execute({ operation: 'read', path: file }, new AbortController().signal);
			assert.equal(result.ok, false); assert.equal(result.code, 'conflict'); assert.equal(result.contents, undefined);
		} finally { workspace.notebookDocuments = []; await owner.dispose(); assert.ok(root.startsWith(path.join(tmpdir(), 'becoder-notebook-owner-'))); await fs.rm(root, { recursive: true, force: true }); }
	});
}

for (const scenario of ['scope-error', 'no-root', 'outside-root'] as const) {
	test(`Notebook collection scope ${scenario} preserves independent execution and the correct notification`, async t => {
		const uri = (value: string) => ({ scheme: 'file', fsPath: value, path: value, toString: () => value });
		const document: any = { uri: uri('C:/practice/scope.bcnb'), isClosed: false, notebookType: 'becoder-notebook', getCells: () => cells };
		const cells = ['cpp', 'becoder-input', 'cpp', 'becoder-input'].map((languageId, index) => ({ kind: 2, index, notebook: document, metadata: { becoder: { id: 'scope-' + index, ...(index % 2 ? { role: 'input', name: 'input' } : {}) } }, document: { uri: uri('scope-cell:' + index), languageId, getText: () => index % 2 ? '1' : 'int main(){}' }, outputs: [] }));
		const execute = commands.executeCommand;
		t.mock.method(commands, 'executeCommand', async (id: string, operation?: string) => {
			if (id === '_becoder.beacon.context' && operation === 'captureCollectionScope') {
				if (scenario === 'scope-error') { throw new Error('collection scope unavailable'); }
				return scenario === 'no-root' ? undefined : { slot: 'chosen', root: 'C:/other', workspaceIdentity: 'root', rootSelectionEpoch: 1 };
			}
			if (id === '_becoder.beacon.context' && operation === 'beginActivity') { return undefined; }
			return execute(id, operation);
		});
		let executions = 0;
		state.runner = { createEvidence: () => assert.fail('an excluded or failed collection has no evidence handle'), runNotebookProgramGroup: async () => { executions++; return { status: 'completed', results: [] }; } };
		const context = { subscriptions: [] as { dispose(): void }[] };
		try {
			notices.length = 0; activate(context as never);
			for (const count of [1, 2]) {
				await state.controller.executeHandler([cells[1], cells[3]], document);
				assert.equal(executions, count * 2, 'every frozen program still runs and the next action remains available');
				assert.equal(notices.length, scenario === 'scope-error' ? count : 0);
			}
			if (scenario === 'scope-error') { assert.equal(notices[0], 'This Notebook run record could not be saved to Beacon. Program execution is unaffected.'); }
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
	});
}

test('a failed Notebook evidence capture warns once and leaves execution available', async () => {
	const uri = (value: string) => ({ scheme: 'file', fsPath: value, path: value, toString: () => value });
	const document: any = { uri: uri('C:/practice/failure.bcnb'), isClosed: false, notebookType: 'becoder-notebook', getCells: () => cells };
	const cells = ['cpp', 'becoder-input'].map((languageId, index) => ({ kind: 2, index, notebook: document, metadata: { becoder: { id: 'failure-' + index, ...(index ? { role: 'input', name: 'input' } : {}) } }, document: { uri: uri('failure-cell:' + index), languageId, getText: () => index ? '1' : 'int main(){}' }, outputs: [] }));
	let executions = 0;
	state.collect = true;
	state.runner = {
		createEvidence: (_handle: string, _producer: string, failed: (error: unknown) => void) => { failed(new Error('disk unavailable')); failed(new Error('disk unavailable')); return undefined; },
		runNotebookProgramGroup: async () => { executions++; return { status: 'completed', results: [] }; }
	};
	const context = { subscriptions: [] as { dispose(): void }[] };
	try {
		notices.length = 0; activate(context as never); await state.controller.executeHandler([cells[1]], document);
		assert.strictEqual(executions, 1); assert.strictEqual(notices.length, 1);
		assert.match(notices[0], /Notebook run record.*Beacon/);
		await state.controller.executeHandler([cells[1]], document); assert.strictEqual(executions, 2);
	} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } state.collect = false; }
});

test('selected input sends whole Notebook coordinates to Runner while retaining its internal program ordinal', async () => {
	const uri = (value: string) => ({ scheme: 'file', fsPath: value, path: value, toString: () => value });
	const document: any = { uri: uri('C:/practice/numbered.bcnb'), isClosed: false, notebookType: 'becoder-notebook', getCells: () => original };
	const cell = (index: number, languageId: string, value: string) => ({ kind: languageId === 'markdown' ? 1 : 2, index, notebook: document, metadata: { becoder: { id: 'numbered-' + index, ...(languageId === 'becoder-input' ? { role: 'input', name: 'same name' } : {}) } }, document: { uri: uri('numbered-cell:' + index), languageId, getText: () => value }, outputs: [] });
	const original = [cell(0, 'markdown', 'notes'), cell(1, 'cpp', 'first'), cell(2, 'becoder-input', '1'), cell(3, 'markdown', 'more'), cell(4, 'cpp', 'second'), cell(5, 'becoder-input', '2')];
	const observed: unknown[] = [];
	state.runner = { runNotebookProgramGroup: async (request: any) => { observed.push([request.code, request.codeNumber, request.codeCellNumber, request.inputs.map((input: any) => [input.text, input.cellNumber])]); return { status: 'completed', results: [] }; } };
	const context = { subscriptions: [] as { dispose(): void }[] };
	try { notices.length = 0; activate(context as never); await state.controller.executeHandler([original[5]], document); assert.deepEqual(observed, [['second', 2, 5, [['2', 6]]]], notices.join('\n')); }
	finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
});

for (const laterProgram of [false, true]) {
	test(`deleting an input during execution preserves the frozen ${laterProgram ? 'later program' : 'same program'} plan`, async () => {
		const uri = (value: string) => ({ scheme: 'file', fsPath: value, path: value, toString: () => value });
		const document: any = { uri: uri('C:/practice/study.bcnb'), isClosed: false, notebookType: 'becoder-notebook', getCells: () => present };
		const cell = (index: number, languageId: string, value: string) => ({ kind: 2, index, notebook: document, metadata: { becoder: { id: 'cell-' + index, ...(languageId === 'becoder-input' ? { role: 'input', name: 'input-' + index } : {}) } }, document: { uri: uri('cell:' + index), languageId, getText: () => value }, outputs: [] });
		const original = [cell(0, 'cpp', 'program-one'), cell(1, 'becoder-input', 'first'), ...(laterProgram ? [cell(2, 'cpp', 'program-two')] : []), cell(laterProgram ? 3 : 2, 'becoder-input', 'second')];
		let present = [...original], deleted = false; const executed: string[] = [];
		state.runner = { runNotebookProgramGroup: async (request: any, signal: AbortSignal, callbacks: any) => {
			for (const [index, input] of request.inputs.entries()) {
				if (!deleted) { deleted = true; const removed = original.at(-1)!; present = present.filter(cell => cell !== removed); state.changed?.({ notebook: document, contentChanges: [{ removedCells: [removed] }], cellChanges: [] }); }
				assert.equal(signal.aborted, false, 'Deleting an output destination is not a user stop');
				executed.push(input.text); callbacks.finished(index, { status: 'completed', input: input.text, output: '', truncated: false, omittedBytes: 0, endedAt: Date.now() });
			}
			return { status: 'completed', results: [] };
		} };
		const context = { subscriptions: [] as { dispose(): void }[] };
		try { notices.length = 0; activate(context as never); await state.controller.executeHandler(original.filter(cell => cell.document.languageId === 'becoder-input'), document); assert.deepEqual(executed, ['first', 'second'], notices.join('\n')); }
		finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
	});
}

for (const action of ['delete-current', 'delete-pending', 'stop', 'stop-delete', 'close'] as const) {
	test(`native ${action} cancellation preserves the correct frozen batch boundary`, async () => {
		const uri = (value: string) => ({ scheme: 'file', fsPath: value, path: value, toString: () => value });
		const document: any = { uri: uri(path.join(process.cwd(), 'cancellation.bcnb')), isClosed: false, notebookType: 'becoder-notebook', getCells: () => present };
		const cell = (index: number, languageId: string, value: string) => ({ kind: 2, index, notebook: document, metadata: { becoder: { id: 'cancel-' + index, ...(languageId === 'becoder-input' ? { role: 'input', name: 'input-' + index } : {}) } }, document: { uri: uri('cancel-cell:' + index), languageId, getText: () => value }, outputs: [] });
		const original = [cell(0, 'cpp', 'captured program'), cell(1, 'becoder-input', 'first'), cell(2, 'becoder-input', 'second')];
		let present = [...original], acted = false;
		const records: any[] = [], groups: Awaited<ReturnType<typeof runNotebookProgramGroup>>[] = [];
		const helperScript = `const fs=require('fs'),net=require('net');const socket=net.createConnection(process.argv[3]);socket.on('connect',()=>socket.write(JSON.stringify({type:'started',pid:process.pid})+'\\n'));socket.once('data',()=>{process.stdout.write(fs.readFileSync(process.argv[2],'utf8'));setTimeout(()=>{socket.write(JSON.stringify({type:'exit',code:0,runMs:100})+'\\n');socket.end();},100);});`;
		state.collect = true;
		state.runner = {
			createEvidence: (handle: string, producer: 'notebook', failed: (error: unknown) => void) => new BeaconEvidence(handle, producer, async (_operation, value: any) => { records.push(value.record); }, failed),
			runNotebookProgramGroup: async (request: any, signal: AbortSignal, callbacks: any) => {
				const result = await runNotebookProgramGroup(request, signal, {
					...callbacks,
					output: (index, phase, stream, text) => {
						callbacks.output(index, phase, stream, text);
						if (phase !== 'running' || !text || acted) { return; } acted = true;
						if (action === 'close') { document.isClosed = true; state.closed?.(document); }
						else {
							const target = original[action === 'delete-pending' ? 2 : 1];
							if (action === 'stop' || action === 'stop-delete') {
								state.cancellations.get(target.document.uri.toString())!();
								assert.equal(signal.aborted, true, 'An explicit stop must cancel immediately, before any deletion or RPC');
							}
							if (action !== 'stop') {
								// The native BeCoder deletion listener does not issue a cancellation token.
								present = present.filter(cell => cell !== target); state.changed?.({ notebook: document, contentChanges: [{ removedCells: [target] }], cellChanges: [] });
							}
						}
					}
				}, process.execPath, (_source, output) => ({ compiler: process.execPath, args: ['-e', 'require("fs").writeFileSync(process.argv[1],process.argv[2])', output, helperScript], environment: { ...process.env } as Record<string, string> }));
				groups.push(result); return result;
			}
		};
		const context = { subscriptions: [] as { dispose(): void }[] };
		try {
			notices.length = 0; activate(context as never);
			await state.controller.executeHandler(original.slice(1), document);
			assert.ok(acted, 'The real helper reached program execution');
			assert.equal(groups.length, 1, notices.join('\n')); assert.equal(records.length, 1, notices.join('\n'));
			const cancelled = action === 'stop' || action === 'stop-delete' || action === 'close';
			assert.equal(groups[0].status, cancelled ? 'cancelled' : 'completed');
			assert.deepEqual(groups[0].results.map(result => result.status), cancelled ? ['cancelled'] : ['completed', 'completed']);
			assert.equal(records[0].status, cancelled ? 'cancelled' : 'completed');
			assert.deepEqual(records[0].runs.map((run: any) => [run.status, run.skipReason]), cancelled ? [['cancelled', undefined], ['not-run', 'cancelled']] : [['completed', undefined], ['completed', undefined]]);
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } state.collect = false; state.cancellations.clear(); }
	});
}

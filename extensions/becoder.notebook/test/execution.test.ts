/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activate, deactivate } from '../src/extension';
import { state, notices } from './executionMock';
import * as path from 'node:path';
import { runNotebookProgramGroup } from '../../danielpinto8zz6.c-cpp-compile-run/src/notebookProcess';
import { BeaconEvidence } from '../../danielpinto8zz6.c-cpp-compile-run/src/beaconEvidence';

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

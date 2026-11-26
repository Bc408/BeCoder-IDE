/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { BeaconContextClient } from '../src/context';
import { ContextTools } from '../src/contextTools';

const signal = new AbortController().signal;
const state = { slot: 'one', root: 'C:/chosen', usable: true, workspaceState: 'ready', mode: 'spot', epoch: 1, busy: false, runtimeBusy: false, collectionPending: false, activeId: 'chat', recent: [] };

test('visible Notebook works in every mode and without a root, with per-cell full-source hashes and fresh observations', async () => {
	for (const mode of ['blackout', 'spot', 'flood', 'no-root']) {
		let source = 'int main() {}\r\n'.repeat(20000);
		const client = new BeaconContextClient(async operation => {
			if (operation === 'context') { return { ...state, mode: mode === 'no-root' ? 'blackout' : mode, workspaceState: mode === 'no-root' ? 'none' : mode === 'blackout' ? 'blackout' : 'ready', ...(mode === 'no-root' ? { root: undefined, usable: false } : {}) }; }
			assert.equal(operation, 'visibleCurrentCode');
			return [{ kind: 'code', fileName: 'A.cpp', filePath: 'C:/outside/A.cpp', isDirty: true, code: source }, { kind: 'notebook', fileName: 'Untitled-1', filePath: null, isDirty: true, cells: [
				{ cellNumber: 1, kind: 'markdown', language: 'markdown', source: 'notes' },
				{ cellNumber: 2, kind: 'code', language: 'cpp', source },
				{ cellNumber: 3, kind: 'input', language: 'becoder-input', source: '1', name: 'sample' },
				{ cellNumber: 4, kind: 'code', language: 'c', source }
			] }];
		});
		await client.refresh(); const tools = new ContextTools(client, client.captureScope());
		const result = await tools.execute('readCurrentCode', {}, signal);
		assert.equal(result.error, undefined);
		const files = result.files as { kind: string; codeHash?: string; cells: { cellNumber: number; codeHash?: string; source: string }[] }[];
		const hash = createHash('sha256').update('int main() {}\n'.repeat(20000)).digest('hex');
		assert.equal(files[0].kind, 'code'); assert.equal(files[0].codeHash, hash);
		assert.equal(files[1].kind, 'notebook'); assert.equal(files[1].codeHash, undefined);
		assert.deepEqual(files[1].cells.map(cell => [cell.cellNumber, cell.codeHash]), [[1, undefined], [2, hash], [3, undefined], [4, hash]]);
		source = 'changed';
		const next = await tools.execute('readCurrentCode', {}, signal);
		assert.equal((next.files as typeof files)[1].cells[1].source, 'changed');
		assert.notEqual((next.files as typeof files)[1].cells[1].codeHash, hash);
	}
});

test('Notebook identity is in host metadata while readPage cannot read its content or results', async () => {
	let pageReads = 0;
	const client = new BeaconContextClient(async operation => {
		if (operation === 'context') { return state; }
		if (operation === 'pages') { return [{ id: 'notebook', kind: 'notebook', title: 'notes.bcnb', uri: 'file:///C:/outside/notes.bcnb', version: '2', active: true, dirty: true }, { id: 'private', kind: 'notebook', title: 'private.bcnb', uri: 'file:///C:/chosen/.beaconWork/private.bcnb', version: '1' }]; }
		pageReads++; throw new Error('readPage must not reach the Notebook owner');
	});
	await client.refresh(); const tools = new ContextTools(client, client.captureScope());
	const metadata = JSON.parse(await tools.describe(signal));
	assert.deepEqual(metadata.pages.map((page: { id: string }) => page.id), ['notebook']);
	assert.equal(metadata.pages[0].active, true);
	assert.ok((await tools.execute('readPage', { id: 'notebook' }, signal)).error);
	assert.equal(pageReads, 0);
});

test('the live tool exposes only content fields and never accepts execution fields or non-code hashes', async () => {
	const client = new BeaconContextClient(async operation => operation === 'context' ? state : [{ kind: 'notebook', fileName: 'note.bcnb', filePath: 'C:/outside/note.bcnb', isDirty: true, codeHash: 'invalid-whole-notebook-hash', executionSummary: { status: 'private' }, cells: [
		{ cellNumber: 1, kind: 'markdown', language: 'markdown', source: 'notes', codeHash: 'invalid-markdown-hash', metadata: { attempt: 'private' }, outputs: ['private'] },
		{ cellNumber: 2, kind: 'input', language: 'becoder-input', source: '1', name: 'sample', codeHash: 'invalid-input-hash' }
	] }]);
	await client.refresh(); const tools = new ContextTools(client, client.captureScope());
	const result = await tools.execute('readCurrentCode', {}, signal);
	assert.equal(result.error, undefined);
	assert.doesNotMatch(JSON.stringify(result), /private|outputs|attempt|metadata|executionSummary|codeHash/);
});

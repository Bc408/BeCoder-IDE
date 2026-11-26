/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IBeaconContextService } from '../../../../../platform/beacon/common/beaconContext.js';
import { IBrowserViewService } from '../../../../../platform/browserView/common/browserView.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';
import { BeaconWorkbenchPages } from '../../electron-browser/beaconPages.js';

class PageInput extends EditorInput {
	constructor(override readonly resource: URI) { super(); }
	override get typeId(): string { return 'beacon-page-test'; }
	override getName(): string { return this.resource.path.split('/').at(-1)!; }
	override isDirty(): boolean { return true; }
}

function fixture(uri: URI, viewType = 'becoder-notebook') {
	const first = new PageInput(uri), second = new PageInput(uri);
	let reads = 0, checks = 0;
	const cells = [{ cellKind: 1, language: 'markdown', metadata: { becoder: { attempt: { status: 'private' } } }, getValue: () => { reads++; return 'dirty notes'; } }, { cellKind: 2, language: 'cpp', metadata: {}, getValue: () => { reads++; return 'dirty program\r\n'; } }, { cellKind: 2, language: 'becoder-input', metadata: { becoder: { role: 'input', name: 'sample' } }, getValue: () => { reads++; return '123'; } }];
	const model = { viewType, uri, versionId: 1, cells } as unknown as NotebookTextModel;
	let loaded: NotebookTextModel | undefined = model;
	const editors = { editors: [first, second], visibleEditors: [first, second], activeEditor: second, onDidCloseEditor: Event.None };
	const service = new BeaconWorkbenchPages(editors as unknown as IEditorService, { getModel: () => null } as unknown as IModelService, {} as IBrowserViewService, { checkPageAccess: async () => { checks++; } } as unknown as IBeaconContextService, 1, { getNotebookTextModel: () => loaded } as unknown as INotebookService);
	return { service, model, editors, close: () => { loaded = undefined; }, counts: () => ({ reads, checks }), dispose: () => { service.dispose(); first.dispose(); second.dispose(); } };
}

suite('Beacon loaded Notebook pages', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('a visible expected Notebook without a loaded owner fails instead of disappearing', async () => {
		const owner = fixture(URI.file('C:/outside/notes.bcnb'));
		try {
			owner.close();
			await assert.rejects(owner.service.readVisibleCurrentCode(), /notebook-content-owner/);
			assert.strictEqual(owner.counts().reads, 0);
		} finally { owner.dispose(); }
	});
	test('a background Notebook without a loaded owner is excluded without opening it', async () => {
		const owner = fixture(URI.file('C:/outside/notes.bcnb'));
		try {
			owner.close(); owner.editors.visibleEditors.splice(0);
			assert.deepStrictEqual(await owner.service.readVisibleCurrentCode(), []);
			assert.strictEqual(owner.counts().reads, 0);
		} finally { owner.dispose(); }
	});
	test('uses the loaded Notebook type, returns dirty full content once, and keeps the surviving split', async () => {
		for (const uri of [URI.file('C:/outside/notes.txt'), URI.parse('untitled:Notebook-1')]) {
			const owner = fixture(uri);
			try {
				const listing = owner.service.pages.list();
				assert.strictEqual(listing.length, 1); assert.strictEqual(listing[0].kind, 'notebook'); assert.strictEqual(listing[0].active, true);
				const files = await owner.service.readVisibleCurrentCode();
				assert.strictEqual(files.length, 1);
				assert.strictEqual(files[0].kind, 'notebook'); assert.strictEqual(files[0].isDirty, true);
				assert.deepStrictEqual(Reflect.get(files[0], 'cells').map((cell: { kind: string; source: string }) => [cell.kind, cell.source]), [['markdown', 'dirty notes'], ['code', 'dirty program\r\n'], ['input', '123']]);
				assert.doesNotMatch(JSON.stringify(files), /private|attempt|outputs|executionSummary/);
				assert.strictEqual(owner.counts().reads, 3);
				owner.editors.editors.splice(0, 1); owner.editors.visibleEditors.splice(0, 1);
				assert.strictEqual(owner.service.pages.list()[0].id, listing[0].id);
				assert.strictEqual((await owner.service.readVisibleCurrentCode()).length, 1);
			} finally { owner.dispose(); }
		}
	});

	test('a foreign loaded notebook never becomes BeCoder content because of its extension', async () => {
		const owner = fixture(URI.file('C:/outside/notes.bcnb'), 'jupyter-notebook');
		try { assert.deepStrictEqual(await owner.service.readVisibleCurrentCode(), []); assert.strictEqual(owner.counts().reads, 0); } finally { owner.dispose(); }
	});

	test('closing the loaded model while a live read is awaiting access rejects instead of falling back', async () => {
		const owner = fixture(URI.file('C:/outside/notes.bcnb'));
		try {
			const reading = owner.service.readVisibleCurrentCode(); owner.close();
			await assert.rejects(reading, /page-changed/);
		} finally { owner.dispose(); }
	});
});

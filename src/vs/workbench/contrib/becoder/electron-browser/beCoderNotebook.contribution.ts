/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { beaconContextChannel, IBeaconContextService } from '../../../../platform/beacon/common/beaconContext.js';
import type { IBeaconContext } from '../../../../platform/beacon/common/beaconContextTypes.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { CellEditType, CellUri } from '../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { beCoderNotebookType } from '../common/beCoderNotebook.js';
import { beCoderNotebookLocks } from '../common/beCoderNotebookLocks.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

CommandsRegistry.registerCommand('_becoder.notebook.resource', async (accessor, operation: string, input: { file?: string; handle?: string; scope?: IBeaconContext }) => {
	const service = ProxyChannel.toService<IBeaconContextService>(accessor.get(IMainProcessService).getChannel(beaconContextChannel)); const id = mainWindow.vscodeWindowId;
	if (operation === 'beginRun' && typeof input?.file === 'string') { return service.beginNotebookRun(id, input.file); }
	if (operation === 'beginCreate' && typeof input?.file === 'string' && input.scope) {
		if (!accessor.get(IWorkspaceContextService).getWorkspace().folders.length) { throw new Error('notebook-open-folder-required'); }
		const uri = URI.file(input.file);
		const open = () => !!accessor.get(INotebookService).getNotebookTextModel(uri) || accessor.get(IWorkingCopyService).workingCopies.some(copy => copy.resource.toString() === uri.toString());
		if (open()) { throw new Error('notebook-target-open'); }
		const handle = await service.beginNotebookCreate(id, input.file, input.scope);
		if (open()) { await service.endNotebookResource(id, handle); throw new Error('notebook-target-open'); }
		return handle;
	}
	if (operation === 'beginEdit' && typeof input?.file === 'string' && input.scope) {
		const handle = await service.beginNotebookEdit(id, input.file, input.scope); beCoderNotebookLocks.set(URI.file(input.file).toString(), true); return handle;
	}
	if (operation === 'verify' && typeof input?.handle === 'string') { return service.verifyNotebookEdit(id, input.handle); }
	if (operation === 'release' && typeof input?.handle === 'string') { return service.endNotebookResource(id, input.handle); }
	throw new Error('notebook-invalid-operation');
});

class BeCoderNotebookResourceContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.becoderNotebookResources';
	constructor(@INotebookService notebooks: INotebookService, @IEditorService editors: IEditorService, @IWorkingCopyService copies: IWorkingCopyService, @IMainProcessService main: IMainProcessService, @ILogService log: ILogService) {
		super();
		const service = ProxyChannel.toService<IBeaconContextService>(main.getChannel(beaconContextChannel)); let tail = Promise.resolve(); let alive = true; const known = new Set<string>();
		const refresh = () => {
			tail = tail.then(async () => {
				if (!alive) { return; }
				const models = [...notebooks.getNotebookTextModels()].filter(model => model.viewType === beCoderNotebookType && model.uri.scheme === 'file');
				await service.reportNotebooks(mainWindow.vscodeWindowId, models.map(model => ({ file: model.uri.fsPath, dirty: copies.workingCopies.some(copy => copy.resource.toString() === model.uri.toString() && copy.isDirty()) })));
				const states = await service.notebookReadonly(mainWindow.vscodeWindowId, models.map(model => model.uri.fsPath)); if (!alive) { return; }
				const present = new Set(models.map(model => model.uri.toString())); for (const uri of known) { if (!present.has(uri)) { beCoderNotebookLocks.set(uri, false); known.delete(uri); } }
				for (const [index, model] of models.entries()) { const uri = model.uri.toString(); known.add(uri); beCoderNotebookLocks.set(uri, states[index]); }
			}).catch(error => log.error('Notebook resource state', error));
		};
		this._register(service.onDidChange(refresh)); this._register(notebooks.onDidAddNotebookDocument(refresh)); this._register(notebooks.onDidRemoveNotebookDocument(refresh)); this._register(editors.onDidEditorsChange(refresh)); this._register(copies.onDidChangeDirty(refresh));
		this._register({ dispose: () => { alive = false; for (const uri of known) { beCoderNotebookLocks.set(uri, false); } } }); refresh();
	}
}
registerWorkbenchContribution2(BeCoderNotebookResourceContribution.ID, BeCoderNotebookResourceContribution, WorkbenchPhase.AfterRestored);

CommandsRegistry.registerCommand('_becoder.notebook.editable', (accessor, uri: string) => {
	const model = accessor.get(INotebookService).getNotebookTextModel(URI.parse(uri));
	return !!model && model.viewType === beCoderNotebookType && !beCoderNotebookLocks.isReadonly(uri);
});

// Runs against the latest native metadata, so async host callbacks never replace
// input edits made meanwhile. This is an internal execution-owner command, no model tool.
CommandsRegistry.registerCommand('_becoder.notebook.cellMetadata', (accessor, cellURI: string, patch: { id?: string; attempt?: Record<string, unknown>; clearAttempt?: boolean }) => {
	const parsed = CellUri.parse(URI.parse(cellURI));
	if (!parsed) { throw new Error('notebook-invalid-cell'); }
	const notebook = accessor.get(INotebookService).getNotebookTextModel(parsed.notebook);
	if (!notebook || notebook.viewType !== beCoderNotebookType) { return false; }
	const index = notebook.cells.findIndex(cell => cell.handle === parsed.handle);
	if (index < 0) { return false; }
	const metadata = notebook.cells[index].metadata;
	const value = { ...(metadata.becoder as Record<string, unknown> | undefined) };
	if (typeof patch.id === 'string') { value.id = patch.id; }
	if (patch.clearAttempt) { delete value.attempt; }
	if (patch.attempt) { value.attempt = structuredClone(patch.attempt); }
	notebook.applyEdits([{ editType: CellEditType.Metadata, index, metadata: { ...metadata, becoder: value } }], true, undefined, () => undefined, undefined, false);
	return true;
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { encodeNotebook, decodeNotebook, associatedNotebook, prepareAssociationLocation, captureNotebookRunPlan, inputCommandTarget, type NotebookData } from './model';
import { imageAttachment, imageMimeTypes } from './images';
import { CellOutputQueue } from './outputQueue';
import { NotebookEdits, type NotebookEditApi } from './editApi';
import { beCoderNotebookType, beCoderNotebookStreamMime, beCoderNotebookStatusMime, isBeCoderInputCell, readBeCoderCellMetadata } from '../../../src/vs/workbench/contrib/becoder/common/beCoderNotebook';
import type { RunnerCompilerApi } from '../../danielpinto8zz6.c-cpp-compile-run/src/extension';
import type { NotebookRunResult } from '../../danielpinto8zz6.c-cpp-compile-run/src/notebookProcess';

const running = new Map<string, AbortController>();
const runDocuments = new Map<AbortController, vscode.NotebookDocument>();
const settling = new Map<string, Promise<void>>();
const outputQueues = new Map<string, CellOutputQueue>();
const outputContainers = new Map<string, vscode.NotebookCellOutput>();
let retired = false;
let notebookEdits: NotebookEdits | undefined;

export async function deactivate(): Promise<void> { retired = true; for (const controller of running.values()) { controller.abort(); } await Promise.all(settling.values()); await notebookEdits?.dispose(); }

export function activate(context: vscode.ExtensionContext): NotebookEditApi {
	retired = false;
	const patch = (cell: vscode.NotebookCell, value: object) => vscode.commands.executeCommand<boolean>('_becoder.notebook.cellMetadata', cell.document.uri.toString(), value);
	const report = (error: unknown) => { void vscode.window.showWarningMessage(vscode.l10n.t('Notebook update failed: {0}', String(error))); };
	const documents = new WeakMap<vscode.NotebookDocument, Map<string, string>>();
	const editing = new Set<vscode.NotebookDocument>();
	const creationRoots = new WeakMap<vscode.NotebookDocument, string>();
	const ensureIds = async (document: vscode.NotebookDocument) => {
		let knownIds = documents.get(document); if (!knownIds) { knownIds = new Map(); documents.set(document, knownIds); }
		const present = new Set(document.getCells().map(cell => cell.document.uri.toString())); for (const uri of knownIds.keys()) { if (!present.has(uri)) { knownIds.delete(uri); } }
		for (const cell of document.getCells()) {
			const uri = cell.document.uri.toString();
			const old = readBeCoderCellMetadata(cell.metadata).id;
			const id = knownIds.get(uri) ?? (old && ![...knownIds.entries()].some(([owner, id]) => owner !== uri && id === old) ? old : randomUUID());
			knownIds.set(uri, id); if (old !== id) { await patch(cell, { id }); }
		}
	};
	context.subscriptions.push(vscode.workspace.registerNotebookSerializer(beCoderNotebookType, {
		deserializeNotebook(bytes) {
			const decoded = decodeNotebook(bytes);
			const data = new vscode.NotebookData(decoded.cells.map(cell => {
				const value = new vscode.NotebookCellData(cell.kind, cell.value, cell.languageId); value.metadata = cell.metadata;
				value.outputs = cell.outputs?.map(output => new vscode.NotebookCellOutput(output.items.map(item => new vscode.NotebookCellOutputItem(item.data, item.mime)), output.metadata));
				value.executionSummary = cell.executionSummary; return value;
			})); data.metadata = decoded.metadata; return data;
		},
		serializeNotebook(data) { return encodeNotebook(data as NotebookData); }
	}, { transientOutputs: false }));
	const controller = vscode.notebooks.createNotebookController('becoder-gcc', beCoderNotebookType, vscode.l10n.t('BeCoder C/C++'));
	context.subscriptions.push(controller); controller.supportedLanguages = ['cpp', 'c', 'becoder-input'];
	const selectController = (document: vscode.NotebookDocument) => { if (document.notebookType === beCoderNotebookType) { controller.updateNotebookAffinity(document, vscode.NotebookControllerAffinity.Preferred); void ensureIds(document).catch(report); } };
	context.subscriptions.push(vscode.workspace.onDidOpenNotebookDocument(selectController));
	for (const document of vscode.workspace.notebookDocuments) { selectController(document); }
	context.subscriptions.push(vscode.workspace.onDidCloseNotebookDocument(document => { for (const [controller, owner] of runDocuments) { if (owner === document) { controller.abort(); } } documents.delete(document); }));
	context.subscriptions.push(vscode.workspace.onDidChangeNotebookDocument(event => {
		if (event.notebook.notebookType !== beCoderNotebookType) { return; }
		if (event.contentChanges.length) { void ensureIds(event.notebook).catch(report); }
		for (const change of event.cellChanges) { if (change.outputs?.length === 0 && !editing.has(event.notebook)) { const key = change.cell.document.uri.toString(); outputQueues.get(key)?.clear(); outputContainers.delete(key); if (!running.has(key)) { void Promise.resolve(patch(change.cell, { clearAttempt: true })).catch(report); } } }
	}));
	controller.executeHandler = async (cells, document) => {
		if (!vscode.workspace.isTrusted || retired || document.isClosed) { return; }
		const selected = cells.filter(cell => isBeCoderInputCell(cell.metadata));
		if (!selected.length) { void vscode.window.showInformationMessage(vscode.l10n.t('Run an input cell below the C/C++ program block.')); return; }
		if (selected.some(cell => running.has(cell.document.uri.toString()))) { return; }
		// Freeze all programs, inputs and original cell identities before the first await.
		const originalCells = document.getCells();
		let plan: ReturnType<typeof captureNotebookRunPlan>;
		try { plan = captureNotebookRunPlan({ cells: originalCells.map(cell => ({ kind: cell.kind, value: cell.document.getText(), languageId: cell.document.languageId, metadata: cell.metadata })) }, selected.map(cell => originalCells.indexOf(cell))); }
		catch { void vscode.window.showInformationMessage(vscode.l10n.t('Add a C/C++ program block above this input before running.')); return; }
		const abort = new AbortController(), keys = selected.map(cell => cell.document.uri.toString());
		runDocuments.set(abort, document);
		let settle!: () => void; const completion = new Promise<void>(resolve => { settle = resolve; });
		for (const key of keys) { running.set(key, abort); settling.set(key, completion); }
		let resource: string | undefined, runtimeActivity: string | undefined;
		const notebookPath = document.uri.scheme === 'file' ? document.uri.fsPath : undefined;
		try {
			let collectionScope: unknown;
			try { collectionScope = await vscode.commands.executeCommand('_becoder.beacon.context', 'captureCollectionScope'); } catch { /* Optional collection. */ }
			if (abort.signal.aborted || document.isClosed || retired) { return; }
			if (notebookPath) { resource = await vscode.commands.executeCommand<string>('_becoder.notebook.resource', 'beginRun', { file: notebookPath }); }
			try { runtimeActivity = await vscode.commands.executeCommand<string>('_becoder.beacon.context', 'beginRuntimeActivity'); } catch { /* Independent execution. */ }
			let cwd = notebookPath ? path.dirname(notebookPath) : creationRoots.get(document);
			if (!cwd) { cwd = await chooseCreationRoot(); if (cwd) { creationRoots.set(document, cwd); } }
			if (!cwd) { throw new Error(vscode.l10n.t('Open a folder to choose the execution base for this unsaved notebook.')); }
			const runner = await vscode.extensions.getExtension<RunnerCompilerApi>('becoder.runner')?.activate();
			if (!runner) { throw new Error(vscode.l10n.t('The BeCoder Runner extension is unavailable.')); }
			await ensureIds(document);
			for (const program of plan.programs) {
				if (abort.signal.aborted || document.isClosed || retired) { break; }
				let activity: string | undefined;
				if (notebookPath) { try { activity = await vscode.commands.executeCommand<string>('_becoder.beacon.context', 'beginActivity', { source: notebookPath, collectionScope }); } catch { /* Execution does not depend on collection. */ } }
				const entries: ({ cell: vscode.NotebookCell; key: string; execution: vscode.NotebookCellExecution; cancellation: vscode.Disposable; status: vscode.NotebookCellOutput; attempt: Record<string, unknown>; queue: CellOutputQueue; result?: NotebookRunResult } | undefined)[] = [];
				let tail = Promise.resolve();
				const enqueue = (operation: () => Promise<unknown>) => { tail = tail.then(operation).then(() => { }, error => { report(error); }); };
				try {
					for (const input of program.inputs) {
						const cell = originalCells[input.inputIndex];
						if (!document.getCells().includes(cell)) { entries.push(undefined); continue; }
						const key = cell.document.uri.toString(), execution = controller.createNotebookCellExecution(cell);
						execution.start(Date.now());
						const cancellation = execution.token.onCancellationRequested(() => abort.abort()), status = new vscode.NotebookCellOutput([]);
						const attempt = { id: randomUUID(), code: program.code, codeCellId: program.codeCellId, input: input.text, inputName: input.name, startedAt: Date.now(), status: 'preparing' };
						const alive = () => !retired && !document.isClosed && document.getCells().includes(cell);
						const queue = new CellOutputQueue(async parts => {
							if (!alive()) { return; }
							const item = vscode.NotebookCellOutputItem.text(parts.map(part => part.text).join(''), beCoderNotebookStreamMime), output = outputContainers.get(key);
							if (output) { await execution.appendOutputItems(item, output); }
							else { const next = new vscode.NotebookCellOutput([item]); outputContainers.set(key, next); await execution.appendOutput(next); }
						});
						entries.push({ cell, key, execution, cancellation, status, attempt, queue }); outputQueues.set(key, queue);
						if (alive()) { await execution.replaceOutput([status]); await patch(cell, { attempt }); }
					}
					if (abort.signal.aborted) { break; }
					const update = (index: number, facts: Record<string, unknown>) => enqueue(async () => {
						const entry = entries[index]; if (!entry || retired || document.isClosed || !document.getCells().includes(entry.cell)) { return; }
						const attempt = { ...entry.attempt, ...facts };
						await patch(entry.cell, { attempt });
						await entry.execution.replaceOutputItems([vscode.NotebookCellOutputItem.text(JSON.stringify(attempt), beCoderNotebookStatusMime)], entry.status);
					});
					const evidence = activity ? runner.createEvidence(activity, 'notebook', report) : undefined;
					const result = await runner.runNotebookProgramGroup({ code: program.code, language: program.language, cellId: program.codeCellId || originalCells[program.codeIndex].document.uri.toString(), codeNumber: program.codeNumber, cwd, notebookPath, notebookName: path.basename(document.uri.path), inputs: program.inputs }, abort.signal, {
						evidence,
						phase: (index, status) => update(index, { status }),
						output: (index, phase, stream, text) => { if (text) { entries[index]?.queue.append({ phase, stream, text }); } },
						finished: (index, result) => {
							const entry = entries[index]; if (entry) { entry.result = result; }
							update(index, { status: result.status, compileMs: result.compileMs, compileShared: result.compileShared, runMs: result.runMs, exitCode: result.exitCode, endedAt: result.endedAt, error: result.error, truncated: result.truncated, omittedBytes: result.omittedBytes });
						}
					});
					for (const [index, entry] of entries.entries()) { if (entry && !entry.result) { update(index, { status: 'not-run', reason: result.status }); } }
					await tail;
					for (const entry of entries) {
						if (!entry) { continue; }
						await entry.queue.flush();
						if (entry.result && !document.isClosed && document.getCells().includes(entry.cell)) {
							const message = describeResult(entry.result); if (message) { await entry.execution.appendOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(message)])); }
						}
					}
				} finally {
					for (const entry of entries) { if (entry) { entry.cancellation.dispose(); entry.queue.clear(); outputQueues.delete(entry.key); outputContainers.delete(entry.key); entry.execution.end(entry.result?.status === 'completed', entry.result?.endedAt ?? Date.now()); } }
					if (activity) { await Promise.resolve(vscode.commands.executeCommand('_becoder.beacon.context', 'endActivity', { handle: activity })).catch(report); }
				}
			}
		} catch (error) { report(error); }
		finally {
			try { if (resource) { await vscode.commands.executeCommand('_becoder.notebook.resource', 'release', { handle: resource }); } }
			finally {
				try { if (runtimeActivity) { await vscode.commands.executeCommand('_becoder.beacon.context', 'endRuntimeActivity', { handle: runtimeActivity }); } }
				finally { runDocuments.delete(abort); for (const key of keys) { running.delete(key); settling.delete(key); } settle(); }
			}
		}
	};
	context.subscriptions.push(vscode.commands.registerCommand('becoder.notebook.addInput', async () => {
		const editor = vscode.window.activeNotebookEditor;
		if (!editor || editor.notebook.notebookType !== beCoderNotebookType || !await vscode.commands.executeCommand<boolean>('_becoder.notebook.editable', editor.notebook.uri.toString())) { return; }
		const index = editor.selections[0]?.end ?? editor.notebook.cellCount;
		const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '', 'becoder-input');
		cell.metadata = { becoder: { id: randomUUID(), role: 'input', name: 'input ' + (editor.notebook.getCells().filter(cell => isBeCoderInputCell(cell.metadata)).length + 1) } };
		const edit = new vscode.WorkspaceEdit(); edit.set(editor.notebook.uri, [vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(index, index), [cell])]);
		if (await vscode.workspace.applyEdit(edit)) { editor.selections = [new vscode.NotebookRange(index, index + 1)]; editor.revealRange(editor.selections[0]); }
	}));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.notebook.renameInput', async (target?: vscode.NotebookCell) => {
		const cell = inputCommandTarget(target, vscode.window.activeNotebookEditor);
		if (!cell || !await vscode.commands.executeCommand<boolean>('_becoder.notebook.editable', cell.notebook.uri.toString()) || !inputCommandTarget(cell)) { return; }
		const name = await vscode.window.showInputBox({ prompt: vscode.l10n.t('Input name'), value: (cell.metadata.becoder as { name?: string }).name ?? 'input' });
		if (name === undefined || !inputCommandTarget(cell) || !await vscode.commands.executeCommand<boolean>('_becoder.notebook.editable', cell.notebook.uri.toString()) || !inputCommandTarget(cell)) { return; }
		const edit = new vscode.WorkspaceEdit(); edit.set(cell.notebook.uri, [vscode.NotebookEdit.updateCellMetadata(cell.index, { ...cell.metadata, becoder: { ...cell.metadata.becoder, name } })]); await vscode.workspace.applyEdit(edit);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.notebook.new', async () => {
		const document = await vscode.workspace.openNotebookDocument(beCoderNotebookType, new vscode.NotebookData([new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, '', 'markdown')]));
		await vscode.window.showNotebookDocument(document);
	}));
	const associate = async () => {
		if (!hasFolder()) { return; }
		const source = vscode.window.activeTextEditor?.document;
		if (!source || source.uri.scheme !== 'file') { return; }
		const folder = vscode.workspace.getWorkspaceFolder(source.uri);
		const requested = folder && associatedNotebook(folder.uri.fsPath, source.uri.fsPath);
		if (!folder || !requested) { void vscode.window.showInformationMessage(vscode.l10n.t('Open or add the folder containing this source file.')); return; }
		const target = await prepareAssociationLocation(folder.uri.fsPath, requested);
		try {
			await fs.stat(target);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
			try { await fs.writeFile(target, encodeNotebook({ cells: [{ kind: 2, languageId: source.languageId, value: source.getText(), outputs: [] }, { kind: 2, languageId: 'becoder-input', value: '', metadata: { becoder: { role: 'input', name: 'input' } }, outputs: [] }] }), { flag: 'wx' }); }
			catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; } }
		}
		await vscode.window.showNotebookDocument(await vscode.workspace.openNotebookDocument(vscode.Uri.file(target)));
	};
	for (const command of ['becoder.notebook.createAssociated', 'becoder.notebook.openAssociated']) { context.subscriptions.push(vscode.commands.registerCommand(command, associate)); }
	const refreshAssociation = async () => {
		const document = vscode.window.activeTextEditor?.document; const folder = document && vscode.workspace.getWorkspaceFolder(document.uri);
		const target = document?.uri.scheme === 'file' && folder ? associatedNotebook(folder.uri.fsPath, document.uri.fsPath) : undefined;
		let exists = false; if (target) { try { exists = (await fs.stat(target)).isFile(); } catch { } }
		if (vscode.window.activeTextEditor?.document === document) { await vscode.commands.executeCommand('setContext', 'becoder.notebook.hasAssociated', exists); }
	};
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => { void refreshAssociation(); }));
	const watcher = vscode.workspace.createFileSystemWatcher('**/*.bcnb'); context.subscriptions.push(watcher, watcher.onDidCreate(refreshAssociation), watcher.onDidDelete(refreshAssociation)); void refreshAssociation();
	const imageTarget = (document: vscode.TextDocument) => {
		for (const notebook of vscode.workspace.notebookDocuments) {
			if (notebook.notebookType !== beCoderNotebookType || notebook.isClosed) { continue; }
			const cell = notebook.getCells().find(cell => cell.kind === vscode.NotebookCellKind.Markup && cell.document === document);
			if (cell) { return cell; }
		}
		return undefined;
	};
	const attachmentEdit = (cell: vscode.NotebookCell, name: string, mime: string, bytes: Uint8Array) => {
		const attachment = imageAttachment(cell.metadata, name, mime, bytes);
		const edit = new vscode.WorkspaceEdit();
		edit.set(cell.notebook.uri, [vscode.NotebookEdit.updateCellMetadata(cell.index, attachment.metadata)]);
		return { edit, source: attachment.source };
	};
	context.subscriptions.push(vscode.languages.registerDocumentPasteEditProvider({ notebookType: beCoderNotebookType, language: 'markdown' }, {
		provideDocumentPasteEdits: async (document, _ranges, transfer, _context, token) => {
			if (!vscode.workspace.getConfiguration('becoder.notebook', document.uri).get('pasteImagesAsAttachments.enabled', true)) { return; }
			const version = document.version;
			for (const mime of imageMimeTypes) {
				const image = transfer.get(mime)?.asFile();
				if (!image) { continue; }
				const bytes = await image.data();
				const cell = imageTarget(document);
				if (!cell || document.version !== version || token.isCancellationRequested || !await vscode.commands.executeCommand<boolean>('_becoder.notebook.editable', cell.notebook.uri.toString())) { return; }
				const { edit, source } = attachmentEdit(cell, image.name, mime, bytes);
				const paste = new vscode.DocumentPasteEdit(source, vscode.l10n.t('Insert Image'), vscode.DocumentDropOrPasteEditKind.Empty.append('image'));
				paste.additionalEdit = edit;
				return [paste];
			}
			return;
		}
	}, { pasteMimeTypes: imageMimeTypes, providedPasteEditKinds: [vscode.DocumentDropOrPasteEditKind.Empty.append('image')] }));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.notebook.settings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:becoder.notebook')));

	return notebookEdits = new NotebookEdits(ensureIds, editing);
}

function hasFolder(): boolean {
	if (vscode.workspace.workspaceFolders?.length) { return true; }
	void vscode.window.showInformationMessage(vscode.l10n.t('Open a folder before associating a Notebook.')); return false;
}
async function chooseCreationRoot(): Promise<string | undefined> {
	const folders = vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file') ?? [];
	return folders.length === 1 ? folders[0].uri.fsPath : folders.length ? (await vscode.window.showWorkspaceFolderPick({ placeHolder: vscode.l10n.t('Choose the folder used by this unsaved Notebook when running programs.') }))?.uri.fsPath : undefined;
}
function describeResult(result: NotebookRunResult): string {
	const limitMessage = result.status === 'timed-out' ? vscode.l10n.t('Program stopped after reaching the {0} ms runtime limit.', result.runtimeLimitMs)
		: result.status === 'output-limit' ? vscode.l10n.t('Program stopped after exceeding the {0} byte output limit; at least {1} observed bytes were not retained.', result.outputLimitBytes, result.omittedBytes)
			: result.truncated ? vscode.l10n.t('Output was truncated by {0} bytes.', result.omittedBytes) : '';
	return [limitMessage, result.error, result.cleanupError].filter(Boolean).join('\n');
}

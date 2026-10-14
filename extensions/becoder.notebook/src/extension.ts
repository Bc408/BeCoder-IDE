/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { encodeNotebook, decodeNotebook, associatedNotebook, prepareAssociationLocation, captureInputRun, inputCommandTarget, type NotebookData } from './model';
import { imageAttachment, imageMimeTypes } from './images';
import { CellOutputQueue } from './outputQueue';
import { NotebookEdits, type NotebookEditApi } from './editApi';
import { beCoderNotebookType, beCoderNotebookStreamMime, beCoderNotebookStatusMime, isBeCoderInputCell, readBeCoderCellMetadata } from '../../../src/vs/workbench/contrib/becoder/common/beCoderNotebook';
import type { RunnerCompilerApi } from '../../danielpinto8zz6.c-cpp-compile-run/src/extension';
import type { NotebookRunResult } from '../../danielpinto8zz6.c-cpp-compile-run/src/notebookProcess';

const running = new Map<string, AbortController>();
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
	context.subscriptions.push(vscode.workspace.onDidCloseNotebookDocument(document => { for (const cell of document.getCells()) { running.get(cell.document.uri.toString())?.abort(); } documents.delete(document); }));
	context.subscriptions.push(vscode.workspace.onDidChangeNotebookDocument(event => {
		if (event.notebook.notebookType !== beCoderNotebookType) { return; }
		for (const change of event.contentChanges) { for (const cell of change.removedCells) { if (!event.notebook.getCells().includes(cell)) { running.get(cell.document.uri.toString())?.abort(); } } }
		if (event.contentChanges.length) { void ensureIds(event.notebook).catch(report); }
		for (const change of event.cellChanges) { if (change.outputs?.length === 0 && !editing.has(event.notebook)) { const key = change.cell.document.uri.toString(); outputQueues.get(key)?.clear(); outputContainers.delete(key); if (!running.has(key)) { void Promise.resolve(patch(change.cell, { clearAttempt: true })).catch(report); } } }
	}));
	const runInput = async (cell: vscode.NotebookCell, document: vscode.NotebookDocument) => {
		if (!vscode.workspace.isTrusted) { void vscode.window.showInformationMessage(vscode.l10n.t('Trust this workspace before running a program.')); return; }
		const key = cell.document.uri.toString();
		if (retired || running.has(key)) { return; }
		let captured: ReturnType<typeof captureInputRun>;
		try { captured = captureInputRun({ cells: document.getCells().map(value => ({ kind: value.kind, value: value.document.getText(), languageId: value.document.languageId, metadata: value.metadata })) }, cell.index); }
		catch { void vscode.window.showInformationMessage(vscode.l10n.t('Add a C/C++ program block above this input before running.')); return; }
		const programCell = document.cellAt(captured.codeIndex);
		let resource: string | undefined;
		if (document.uri.scheme === 'file') {
			try { resource = await vscode.commands.executeCommand<string>('_becoder.notebook.resource', 'beginRun', { file: document.uri.fsPath }); }
			catch (error) { void vscode.window.showInformationMessage(vscode.l10n.t('This Notebook is busy or unavailable: {0}', String(error))); return; }
			if (document.isClosed || !document.getCells().includes(cell) || running.has(key)) { await vscode.commands.executeCommand('_becoder.notebook.resource', 'release', { handle: resource }); return; }
		}
		let execution: vscode.NotebookCellExecution;
		try { execution = controller.createNotebookCellExecution(cell); execution.start(Date.now()); }
		catch (error) { if (resource) { await vscode.commands.executeCommand('_becoder.notebook.resource', 'release', { handle: resource }); } throw error; }
		const abort = new AbortController(); running.set(key, abort);
		let settle!: () => void; settling.set(key, new Promise<void>(resolve => { settle = resolve; }));
		const cancellation = execution.token.onCancellationRequested(() => abort.abort());
		let activity: string | undefined;
		const statusOutput = new vscode.NotebookCellOutput([]);
		const showStatus = (attempt: object) => execution.replaceOutputItems([vscode.NotebookCellOutputItem.text(JSON.stringify(attempt), beCoderNotebookStatusMime)], statusOutput);
		let currentAttempt: Record<string, unknown> | undefined; let completedResult: NotebookRunResult | undefined;
		const alive = () => !retired && !document.isClosed && document.getCells().includes(cell);
		try {
			await execution.replaceOutput([statusOutput]); await showStatus({ status: 'preparing' }); await patch(cell, { clearAttempt: true }); await ensureIds(document);
			const meta = readBeCoderCellMetadata(cell.metadata);
			captured.codeCellId = readBeCoderCellMetadata(programCell.metadata).id || programCell.document.uri.toString();
			const notebookPath = document.uri.scheme === 'file' ? document.uri.fsPath : undefined;
			let root = notebookPath ? path.dirname(notebookPath) : creationRoots.get(document);
			if (!notebookPath && !vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme === 'file' && folder.uri.fsPath === root)) { root = await chooseCreationRoot(); if (root) { creationRoots.set(document, root); } }
			if (!root) { throw new Error(vscode.l10n.t('Open a folder to choose the execution base for this unsaved notebook.')); }
			const request = { ...captured, cellId: captured.codeCellId, inputCellId: meta.id, cwd: root, notebookPath, notebookName: path.basename(document.uri.path) };
			const attempt = { id: randomUUID(), code: captured.code, codeCellId: captured.codeCellId, input: request.input, inputName: request.inputName, startedAt: Date.now(), status: 'preparing' };
			currentAttempt = attempt;
			await patch(cell, { attempt });
			if (notebookPath) { try { activity = await vscode.commands.executeCommand<string | undefined>('_becoder.beacon.context', 'beginActivity', { source: notebookPath }); } catch { await execution.appendOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(vscode.l10n.t('Beacon evidence is unavailable for this execution.'))])); } }
			const runnerExtension = vscode.extensions.getExtension<RunnerCompilerApi>('becoder.runner');
			if (!runnerExtension) { throw new Error(vscode.l10n.t('The BeCoder Runner extension is unavailable.')); }
			const runner = await runnerExtension.activate();
			const evidence = activity ? runner.createEvidence(activity, 'notebook', () => { if (alive()) { void Promise.resolve(execution.appendOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(vscode.l10n.t('Beacon evidence could not be saved.'))]))).catch(report); } }) : undefined;
			const queue = new CellOutputQueue(async parts => {
				if (!alive()) { return; }
				const item = vscode.NotebookCellOutputItem.text(parts.map(part => part.text).join(''), beCoderNotebookStreamMime);
				const output = outputContainers.get(key);
				if (!output) { const next = new vscode.NotebookCellOutput([item]); outputContainers.set(key, next); await execution.appendOutput(next); }
				else { await execution.appendOutputItems(item, output); }
			});
			outputQueues.set(key, queue);
			let tail = Promise.resolve(); let presentationError: unknown;
			const result = await runner.runNotebook(request, abort.signal, {
				evidence,
				phase: status => { tail = tail.then(async () => { if (alive()) { await patch(cell, { attempt: { ...attempt, status } }); await showStatus({ ...attempt, status }); } }).catch(error => { presentationError = error; }); },
				output: (phase, stream, text) => { if (text && alive()) { queue.append({ phase, stream, text }); } }
			});
			completedResult = result;
			await tail; try { await queue.flush(); } catch (error) { presentationError = error; }
			if (alive()) {
				const facts = { status: result.status, exitCode: result.exitCode, compileMs: result.compileMs, runMs: result.runMs, endedAt: result.endedAt, truncated: result.truncated, omittedBytes: result.omittedBytes, error: result.error, cleanupError: result.cleanupError, presentationError: presentationError ? String(presentationError) : undefined, sourceSha256: result.sourceSnapshot?.sha256 };
				await patch(cell, { attempt: { ...attempt, ...facts } });
				await showStatus(facts);
				const message = describeResult(result) + (presentationError ? '\n' + String(presentationError) : '');
				if (message) { await execution.appendOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(message)])); }
			}
			execution.end(result.status === 'completed', Date.now());
			return result.status;
		} catch (error) {
			try { if (alive()) { await execution.appendOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(error instanceof Error ? error.message : String(error))])); await patch(cell, { attempt: { ...currentAttempt, status: completedResult?.status ?? (abort.signal.aborted ? 'cancelled' : 'unable-to-start'), exitCode: completedResult?.exitCode, endedAt: completedResult?.endedAt ?? Date.now(), error: completedResult?.error, presentationError: String(error) } }); } }
			finally {
				try { if (alive()) { await showStatus({ status: completedResult?.status ?? (abort.signal.aborted ? 'cancelled' : 'unable-to-start'), compileMs: completedResult?.compileMs, runMs: completedResult?.runMs }); } }
				finally { execution.end(completedResult?.status === 'completed', Date.now()); }
			}
			return completedResult?.status ?? (abort.signal.aborted ? 'cancelled' : 'unable-to-start');
		} finally { cancellation.dispose(); outputQueues.get(key)?.clear(); outputQueues.delete(key); outputContainers.delete(key); running.delete(key); try { if (activity) { await vscode.commands.executeCommand('_becoder.beacon.context', 'endActivity', { handle: activity }); } } finally { try { if (resource) { await vscode.commands.executeCommand('_becoder.notebook.resource', 'release', { handle: resource }); } } finally { settle(); settling.delete(key); } } }
	};
	controller.executeHandler = async (cells, document) => {
		const inputs = cells.filter(cell => isBeCoderInputCell(cell.metadata));
		if (!inputs.length) { void vscode.window.showInformationMessage(vscode.l10n.t('Run an input cell below the C/C++ program block.')); return; }
		for (const cell of inputs) { if (document.isClosed || retired) { break; } if (await runInput(cell, document) === 'cancelled') { break; } }
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
		if (!hasFolder()) { return; }
		const root = await chooseCreationRoot(); if (!root) { return; }
		const document = await vscode.workspace.openNotebookDocument(beCoderNotebookType, new vscode.NotebookData([new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, '', 'markdown')])); creationRoots.set(document, root);
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
	void vscode.window.showInformationMessage(vscode.l10n.t('Open a folder before creating or associating a Notebook.')); return false;
}
async function chooseCreationRoot(): Promise<string | undefined> {
	const folders = vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file') ?? [];
	return folders.length === 1 ? folders[0].uri.fsPath : folders.length ? (await vscode.window.showWorkspaceFolderPick({ placeHolder: vscode.l10n.t('Choose the folder used by this unsaved Notebook when running programs.') }))?.uri.fsPath : undefined;
}
function describeResult(result: NotebookRunResult): string {
	return [result.truncated ? vscode.l10n.t('Output was truncated by {0} bytes. The program was not stopped for this limit.', result.omittedBytes) : '', result.error, result.cleanupError].filter(Boolean).join('\n');
}

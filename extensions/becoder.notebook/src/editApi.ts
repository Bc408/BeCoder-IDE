/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import type { IBeaconContext } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import { beCoderNotebookType, beCoderNotebookStreamMime, isBeCoderInputCell, describeNotebookMetadata } from '../../../src/vs/workbench/contrib/becoder/common/beCoderNotebook';
import { type NotebookData, encodeNotebook, notebookCreationTarget, prepareAssociationLocation } from './model';
import { type ContentCell } from './edits';
import { NotebookEditOwner, createNotebook } from './editOwner';
import { writeNotebookBackup } from './backup';

export interface NotebookEditInput { operation: 'create' | 'begin' | 'read' | 'apply' | 'finish' | 'cancel'; path?: string; sourcePath?: string; handle?: string; revision?: number; cells?: ContentCell[]; cellId?: string; part?: 'content' | 'outputs' | 'attempt' }
export interface NotebookEditApi { edit(input: NotebookEditInput, scope: IBeaconContext, signal?: AbortSignal): Promise<Record<string, unknown>> }
const nativeCells = (data: NotebookData) => data.cells.map(cell => {
	const value = new vscode.NotebookCellData(cell.kind, cell.value, cell.languageId); value.metadata = cell.metadata;
	value.outputs = cell.outputs?.map(output => new vscode.NotebookCellOutput(output.items.map(item => new vscode.NotebookCellOutputItem(item.data, item.mime)), output.metadata)); value.executionSummary = cell.executionSummary; return value;
});
const snapshot = (document: vscode.NotebookDocument): NotebookData => ({ metadata: structuredClone(document.metadata), cells: document.getCells().map(cell => ({ kind: cell.kind, value: cell.document.getText(), languageId: cell.document.languageId, metadata: structuredClone(cell.metadata), outputs: cell.outputs.map(output => ({ metadata: structuredClone(output.metadata), items: output.items.map(item => ({ mime: item.mime, data: new Uint8Array(item.data) })) })), executionSummary: structuredClone(cell.executionSummary) })) });

export class NotebookEdits implements NotebookEditApi {
	private readonly sessions = new Map<string, { owner: NotebookEditOwner; path: string; scope: IBeaconContext; tail: Promise<unknown> }>();
	private readonly creations = new Map<string, string>();
	private readonly pendingCreations = new Set<Promise<Record<string, unknown>>>();
	private disposed = false;
	constructor(private readonly ensureIds: (document: vscode.NotebookDocument) => Promise<void>, private readonly editing: Set<vscode.NotebookDocument>) { }
	private resource<T>(operation: string, input: object): PromiseLike<T> { return vscode.commands.executeCommand<T>('_becoder.notebook.resource', operation, input); }
	async edit(input: NotebookEditInput, scope: IBeaconContext, signal?: AbortSignal): Promise<Record<string, unknown>> {
		if (this.disposed) { throw new Error('notebook-closed'); }
		if (input.operation === 'create') {
			if (!scope.usable || !['spot', 'flood'].includes(scope.mode) || !Array.isArray(input.cells)) { throw new Error('notebook-write-denied'); }
			const roots = vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath) ?? [];
			const target = await notebookCreationTarget(roots, input, scope.root); const uri = vscode.Uri.file(target.path); let resource: string; const handle = randomUUID();
			if (this.disposed) { throw new Error('notebook-closed'); }
			const operation = createNotebook(input.cells, {
				begin: async () => { resource = await this.resource<string>('beginCreate', { file: target.path, scope }); this.creations.set(handle, resource); },
				prepare: async () => { if (target.associationRoot) { await prepareAssociationLocation(target.associationRoot, target.path); } },
				verify: async () => {
					if (this.disposed) { throw new Error('notebook-closed'); }
					await notebookCreationTarget(vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath) ?? [], input, scope.root).then(now => { if (now.path !== target.path || now.associationRoot !== target.associationRoot) { throw new Error('notebook-editor-roots-changed'); } });
					await this.resource('verify', { handle: resource });
				},
				create: async bytes => { const edit = new vscode.WorkspaceEdit(); edit.createFile(uri, { overwrite: false, ignoreIfExists: false, contents: bytes }); return vscode.workspace.applyEdit(edit); },
				open: async () => { await vscode.window.showNotebookDocument(await vscode.workspace.openNotebookDocument(uri)); },
				release: async () => { await this.resource('release', { handle: resource }); this.creations.delete(handle); }
			}, signal);
			this.pendingCreations.add(operation);
			try { const result = await operation; return { path: target.path, ...result, ...(result.released === false ? { handle } : {}) }; } finally { this.pendingCreations.delete(operation); }
		}
		if (input.operation === 'cancel' && input.handle && this.creations.has(input.handle)) {
			try { await this.resource('release', { handle: this.creations.get(input.handle) }); this.creations.delete(input.handle); return { released: true }; }
			catch (error) { return { error: String(error), released: false }; }
		}
		if (input.operation === 'begin') {
			if (!input.path || !scope.usable || !['spot', 'flood'].includes(scope.mode)) { throw new Error('notebook-write-denied'); }
			const resource = await this.resource<string>('beginEdit', { file: input.path, scope }); let owner: NotebookEditOwner | undefined; let document: vscode.NotebookDocument | undefined;
			try {
				document = await vscode.workspace.openNotebookDocument(vscode.Uri.file(input.path)); if (document.notebookType !== beCoderNotebookType) { throw new Error('notebook-invalid-type'); }
				const target = document; this.editing.add(target); await this.ensureIds(target);
				owner = new NotebookEditOwner({ snapshot: () => snapshot(target), version: () => target.version, dirty: () => target.isDirty, closed: () => target.isClosed,
					verify: async () => { await this.resource('verify', { handle: resource }); },
					backup: data => writeNotebookBackup(input.path!, encodeNotebook(data), async () => { await this.resource('verify', { handle: resource }); }),
					apply: async data => { const edit = new vscode.WorkspaceEdit(); edit.set(target.uri, [vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(0, target.cellCount), nativeCells(data))]); if (!await vscode.workspace.applyEdit(edit)) { throw new Error('notebook-edit-not-applied'); } await this.ensureIds(target); },
					save: () => Promise.resolve(target.save()), release: async () => { this.editing.delete(target); await this.resource('release', { handle: resource }); }
				});
				const result = await owner.begin(); await vscode.window.showNotebookDocument(target);
				const handle = randomUUID(); this.sessions.set(handle, { owner, path: input.path, scope: structuredClone(scope), tail: Promise.resolve() }); return { handle, path: input.path, ...result, cells: target.getCells().map(cell => ({ id: (cell.metadata.becoder as { id?: string } | undefined)?.id, kind: cell.kind, language: cell.document.languageId, sourceCharacters: cell.document.getText().length })) };
			} catch (error) { if (document) { this.editing.delete(document); } if (owner) { await owner.cancel(); } else { await this.resource('release', { handle: resource }); } throw error; }
		}
		const session = input.handle && this.sessions.get(input.handle); if (!session) { throw new Error('notebook-owner'); }
		if (input.operation !== 'cancel' && (['slot', 'root', 'mode', 'epoch', 'activeId'] as const).some(key => scope[key] !== session.scope[key])) { throw new Error('beacon-context-changed'); }
		const result = session.tail.then(async () => {
			switch (input.operation) {
				case 'read': {
					const data = await session.owner.read(); const cells = input.cellId ? data.cells.filter(cell => (cell.metadata?.becoder as { id?: string } | undefined)?.id === input.cellId) : data.cells;
					if (input.cellId && !cells.length) { throw new Error('notebook-unknown-cell'); }
					const visible = cells.map(cell => {
						const metadata = cell.metadata?.becoder as { id?: string; name?: string; attempt?: unknown } | undefined; const identity = { id: metadata?.id, kind: cell.kind, language: cell.languageId, role: isBeCoderInputCell(cell.metadata) ? 'input' : undefined, name: metadata?.name };
						if (input.part === 'attempt') { return { ...identity, attempt: metadata?.attempt, executionSummary: cell.executionSummary }; }
						if (input.part === 'outputs') { return { ...identity, outputs: cell.outputs?.map(output => ({ items: output.items.map(item => ({ mime: item.mime, ...(item.mime === beCoderNotebookStreamMime || item.mime.startsWith('text/') || item.mime.includes('stdout') || item.mime.includes('stderr') ? { text: Buffer.from(item.data).toString('utf8') } : { byteLength: item.data.length }) })) })) }; }
						return { ...identity, attachments: describeNotebookMetadata(cell.metadata ?? {}).attachments, source: cell.value };
					});
					return { path: session.path, text: JSON.stringify({ cells: visible }, null, 2), representation: 'captured native Notebook contents; attachments remain in native cell metadata; actual prior outputs remain host owned' };
				}
				case 'apply': {
					if (!Array.isArray(input.cells) || !Number.isSafeInteger(input.revision)) { throw new Error('notebook-invalid-edit'); }
					return { path: session.path, ...await session.owner.apply(input.cells, input.revision!), applied: true, saved: false };
				}
				case 'finish': try { return { path: session.path, ...await session.owner.finish(), released: session.owner.isReleased }; } finally { if (session.owner.isReleased) { this.sessions.delete(input.handle!); } }
				case 'cancel': try { return { path: session.path, ...await session.owner.cancel(), released: session.owner.isReleased }; } finally { if (session.owner.isReleased) { this.sessions.delete(input.handle!); } }
				default: throw new Error('notebook-invalid-operation');
			}
		}); session.tail = result.catch(() => {}); try { return await result; } catch (error) { return { error: String(error), ...session.owner.status(), released: session.owner.isReleased }; }
	}
	async dispose(): Promise<void> {
		this.disposed = true; await Promise.allSettled(this.pendingCreations);
		for (const [handle, session] of this.sessions) { await session.tail; await session.owner.cancel(); this.sessions.delete(handle); }
		for (const [handle, resource] of this.creations) { await this.resource('release', { handle: resource }); this.creations.delete(handle); }
	}
}

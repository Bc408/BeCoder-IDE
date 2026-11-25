/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const disposable = () => ({ dispose() { } });
export const state: { controller?: any; changed?: (event: any) => void; closed?: (document: any) => void; runner?: any; collect?: boolean; cancellations: Map<string, () => void>; commands: Map<string, (...args: any[]) => unknown> } = { commands: new Map(), cancellations: new Map() };
export const notices: string[] = [];
export const NotebookCellKind = { Markup: 1, Code: 2 };
export const NotebookControllerAffinity = { Preferred: 2 };
export const workspace = {
	isTrusted: true, notebookDocuments: [] as any[],
	registerNotebookSerializer: disposable, onDidOpenNotebookDocument: disposable,
	onDidCloseNotebookDocument: (callback: (document: any) => void) => { state.closed = callback; return disposable(); },
	onDidChangeNotebookDocument: (callback: (event: any) => void) => { state.changed = callback; return disposable(); },
	getWorkspaceFolder: () => undefined,
	createFileSystemWatcher: () => ({ ...disposable(), onDidCreate: disposable, onDidDelete: disposable })
};
export const window = { activeTextEditor: undefined, showWarningMessage: (message: string) => { notices.push(message); return Promise.resolve(); }, showInformationMessage: (message: string) => { notices.push(message); return Promise.resolve(); }, onDidChangeActiveTextEditor: disposable };
export const languages = { registerDocumentPasteEditProvider: disposable };
export const commands = {
	registerCommand: (id: string, handler: (...args: any[]) => unknown) => { state.commands.set(id, handler); return disposable(); },
	executeCommand: async (id: string, operation?: string) => {
		return id === '_becoder.notebook.resource' ? 'resource' : id === '_becoder.beacon.context' ? state.collect && operation === 'beginActivity' ? 'activity' : undefined : true;
	}
};
export const extensions = { getExtension: () => ({ activate: async () => state.runner }) };
export const notebooks = {
	createNotebookController: () => state.controller = {
		...disposable(), updateNotebookAffinity() { }, createNotebookCellExecution: (cell: any) => ({
			start() { }, end() { }, token: { onCancellationRequested: (callback: () => void) => { const key = cell.document.uri.toString(); state.cancellations.set(key, callback); return { dispose() { state.cancellations.delete(key); } }; } },
			replaceOutput: async () => { }, replaceOutputItems: async () => { }, appendOutput: async () => { }, appendOutputItems: async () => { }
		})
	}
};
export class NotebookCellOutput { constructor(public items: unknown[], public metadata?: unknown) { } }
export const NotebookCellOutputItem = { text: (text: string, mime = 'text/plain') => ({ data: new TextEncoder().encode(text), mime }) };
export const l10n = { t: (message: string, ...args: unknown[]) => message.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)])) };
export const DocumentDropOrPasteEditKind = { Empty: { append: () => ({}) } };
export class NotebookData { constructor(public cells: unknown[]) { } }
export class NotebookCellData { constructor(public kind: number, public value: string, public languageId: string) { } }
export class NotebookRange { constructor(public start: number, public end: number) { } }
export class WorkspaceEdit { set() { throw new Error('Unexpected document mutation'); } }
export const NotebookEdit = { updateCellMetadata: () => { throw new Error('Unexpected cell metadata mutation'); }, replaceCells: () => { throw new Error('Unexpected cell mutation'); } };
export const Uri = { file: () => { throw new Error('Unexpected file open'); }, parse: () => { throw new Error('Unexpected URI resolution'); } };
export class DocumentPasteEdit { constructor() { throw new Error('Unexpected paste'); } }

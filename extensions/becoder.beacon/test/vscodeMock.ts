/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { emptyConfiguration } from '../src/modelConfiguration';
import { secretName } from '../src/connection';
import type { IBeaconContext, IBeaconStoredConversation, IBeaconConversation, IBeaconResume } from '../../../src/vs/platform/beacon/common/beaconContextTypes';

function event<T>() {
	const listeners = new Set<(value: T) => void>();
	return { listen: (listener: (value: T) => void) => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; }, fire: (value: T) => { for (const listener of listeners) { listener(value); } }, clear: () => listeners.clear() };
}
const configuration = event<{ affectsConfiguration(key: string): boolean }>();
export const values = new Map<string, unknown>();
export const controls: { updateError?: Error; secretError?: Error } = {};
export const commandHandlers = new Map<string, (...args: unknown[]) => unknown>();
export let beaconContext: IBeaconContext = { slot: 'test-window', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, recent: [] };
export const beaconConversations = new Map<string, IBeaconStoredConversation>();
export const beaconResumes = new Map<string, IBeaconResume>();
export const commandCalls: { id: string; args: unknown[] }[] = [];
export const panels: ReturnType<typeof makePanel>[] = [];
export const textPreviews: { content: string; language: string }[] = [];
export const ViewColumn = { Active: -1 };
export const viewProviders = new Map<string, { resolveWebviewView(view: ReturnType<typeof makeView>): void }>();
export const Uri = {
	file: (file: string) => ({ scheme: 'file', fsPath: path.resolve(file), toString: () => 'file://' + file }),
	joinPath: (uri: { fsPath: string }, ...segments: string[]) => Uri.file(path.join(uri.fsPath, ...segments)),
	parse: (url: string) => url.startsWith('file://') ? Uri.file(url.slice(7)) : { scheme: 'https', fsPath: '', toString: () => url }
};
export const ConfigurationTarget = { Global: 1 };
export const extensions = { getExtension: (_id?: string): { activate(): Promise<unknown> } | undefined => undefined };
export const l10n = { t: (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)])) };
export const workspace = {
	openTextDocument: async (options: { content: string; language: string }) => { textPreviews.push(options); return { uri: Uri.parse('untitled:selection'), ...options }; },
	notebookDocuments: [] as { uri: ReturnType<typeof Uri.file>; getCells(): { document: unknown }[] }[],
	workspaceFolders: [] as { name: string; uri: ReturnType<typeof Uri.file> }[],
	textDocuments: [] as { uri: ReturnType<typeof Uri.file>; isClosed: boolean; getText(): string }[],
	getConfiguration: () => ({ get: <T>(key: string, fallback?: T): T => (values.get(key) ?? fallback) as T, update: async (key: string, value: unknown) => { if (controls.updateError) { throw controls.updateError; } values.set(key, value); configuration.fire({ affectsConfiguration: field => field === 'beacon' || field === 'beacon.' + key }); } }),
	onDidChangeConfiguration: configuration.listen
};
export const env = { language: 'zh-cn', clipboard: { writeText: async () => {} }, openExternal: async () => true };
export const commands = { registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => { commandHandlers.set(id, handler); return { dispose: () => commandHandlers.delete(id) }; }, executeCommand: async (id: string, ...args: unknown[]) => { commandCalls.push({ id, args }); return commandHandlers.get(id)?.(...args); } };
export const window = {
	activeTextEditor: undefined as { selection: { isEmpty: boolean }; document: { uri: ReturnType<typeof Uri.file>; isClosed: boolean; getText(selection?: unknown): string } } | undefined,
	showInformationMessage: async (_message: string) => undefined,
	showTextDocument: async (_document: unknown, _options: unknown) => undefined,
	createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
	createWebviewPanel: () => { const panel = makePanel(); panels.push(panel); return panel; },
	onDidChangeWindowState: () => ({ dispose() {} }),
	registerWebviewViewProvider: (id: string, provider: typeof viewProviders extends Map<string, infer T> ? T : never) => { viewProviders.set(id, provider); return { dispose: () => viewProviders.delete(id) }; },
	showOpenDialog: async (): Promise<ReturnType<typeof Uri.file>[] | undefined> => undefined,
	showInputBox: async () => undefined,
	showQuickPick: async () => undefined
};
function makePanel() {
	const view = makeView();
	const disposed = event<void>();
	return { ...view, reveal() {}, dispose() { disposed.fire(); }, onDidDispose: disposed.listen };
}
export function makeView() {
	const received = event<unknown>();
	const dropped = event<{ uris: ReturnType<typeof Uri.file>[]; isExternal: boolean }>();
	const messages: Record<string, unknown>[] = [];
	return { visible: true, receive: received.fire, drop: (value: { uris: ReturnType<typeof Uri.file>[]; source: 'internal' | 'external' }) => dropped.fire({ uris: value.uris, isExternal: value.source !== 'internal' }), messages, onDidDispose: () => ({ dispose() {} }), webview: { html: '', options: {}, cspSource: 'self', asWebviewUri: (uri: unknown) => uri, postMessage: async (message: Record<string, unknown>) => { messages.push(structuredClone(message)); return true; }, onDidReceiveMessage: received.listen, onDidDropResources: dropped.listen } };
}
export function reset(directory: string) {
	extensions.getExtension = () => undefined;
	configuration.clear(); values.clear(); viewProviders.clear(); commandHandlers.clear(); commandCalls.length = 0; panels.length = 0; textPreviews.length = 0; window.activeTextEditor = undefined; workspace.notebookDocuments = []; delete controls.updateError; delete controls.secretError;
	const data = emptyConfiguration();
	data.providers.deepseek.models = ['deepseek-flash', 'deepseek-chat'].map(id => ({ id, name: id, enabled: true, parameters: {}, settings: {} }));
	data.selection = { provider: 'deepseek', model: 'deepseek-flash' };
	values.set('modelConfiguration', data); values.set('webEnabled', false); values.set('filePermission', 'workspace');
	workspace.workspaceFolders = [{ name: 'root', uri: Uri.file(directory) }]; workspace.textDocuments = [];
	beaconContext = { slot: 'test-window', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, recent: [] }; beaconConversations.clear(); beaconResumes.clear();
	commandHandlers.set('_becoder.beacon.context', (operation, argument) => {
		const input = argument as { root: string; busy: boolean; mode: IBeaconContext['mode']; retainConversation?: boolean; id: string; create: boolean; data: IBeaconConversation; revision: number; title: string };
		const key = (id: string) => `${beaconContext.root}:${id}`;
		switch (operation) {
			case 'checkPageAccess': return;
			case 'context': return structuredClone(beaconContext);
			case 'busy': beaconContext.busy = input.busy; return;
			case 'release': delete beaconContext.activeId; return;
			case 'resume': return structuredClone(beaconResumes.get(beaconContext.root!));
			case 'view': {
				const view = (argument as { view: IBeaconResume }).view;
				if (!view || (view.screen === 'home' && view.id !== undefined) || (view.screen === 'conversation' && !view.id)) { throw new Error('beacon-invalid-view'); }
				beaconResumes.set(beaconContext.root!, structuredClone(view)); return;
			}
			case 'select': if (beaconContext.busy) { throw new Error('beacon-busy'); } { const mode = beaconContext.root ? beaconContext.mode : 'spot'; beaconContext = { ...beaconContext, root: input.root, usable: true, workspaceState: mode === 'blackout' ? 'blackout' : 'ready', mode, activeId: undefined, epoch: beaconContext.epoch + 1, recent: [input.root, ...beaconContext.recent.filter(value => value !== input.root)] }; } return structuredClone(beaconContext);
			case 'mode': if (!beaconContext.usable && input.mode !== 'blackout') { throw new Error('beacon-mode-unavailable'); } beaconContext.mode = input.mode; beaconContext.workspaceState = !beaconContext.root ? 'none' : !beaconContext.usable ? 'unavailable' : input.mode === 'blackout' ? 'blackout' : 'ready'; beaconContext.epoch++; if (input.mode === 'blackout' && !input.retainConversation) { delete beaconContext.activeId; } return structuredClone(beaconContext);
			case 'consumeDraft': {
				const stored = beaconConversations.get(key(input.id));
				if (beaconContext.activeId !== input.id || !stored || stored.revision !== input.revision) { throw new Error('beacon-history-conflict'); }
				stored.data.draft = { text: '', attachments: [] }; stored.revision++; return;
			}
			case 'clearWorkspace': { const root = beaconContext.root; beaconContext = { ...beaconContext, root: undefined, usable: false, workspaceState: 'none', mode: 'blackout', activeId: undefined, epoch: beaconContext.epoch + 1, recent: root ? [root, ...beaconContext.recent.filter(value => value !== root)] : beaconContext.recent }; return structuredClone(beaconContext); }
			case 'removeRecentWorkspace': if (beaconContext.root === input.root) { const root = beaconContext.root; beaconContext = { ...beaconContext, root: undefined, usable: false, workspaceState: 'none', mode: 'blackout', activeId: undefined, epoch: beaconContext.epoch + 1, recent: [root, ...beaconContext.recent.filter(value => value !== root)] }; } else { beaconContext.recent = beaconContext.recent.filter(value => value !== input.root); } return structuredClone(beaconContext);
			case 'history': return [...beaconConversations.entries()].filter(([id, stored]) => id.startsWith(`${beaconContext.root}:`) && !stored.data.draftOnly).map(([, stored]) => ({ ...stored.data, revision: stored.revision, messages: undefined }));
			case 'open': {
				if (beaconContext.busy && (!input.create || beaconContext.activeId)) { throw new Error('beacon-busy'); }
				let stored = beaconConversations.get(key(input.id));
				if (!stored && input.create) { stored = { revision: 1, data: { id: input.id, title: '', updatedAt: Date.now(), messages: [], error: '', workspace: [{ name: 'selected', path: beaconContext.root! }], draftOnly: true } }; beaconConversations.set(key(input.id), stored); }
				if (!stored) { throw new Error('beacon-missing-conversation'); } beaconContext.activeId = input.id; return structuredClone(stored);
			}
			case 'save': {
				if (!beaconContext.usable || beaconContext.mode === 'blackout') { throw new Error('beacon-mode-unavailable'); }
				if (input.data.id !== beaconContext.activeId || beaconConversations.get(key(input.data.id))?.revision !== input.revision) { throw new Error('beacon-history-conflict'); }
				const stored = { data: structuredClone(input.data), revision: input.revision + 1 }; beaconConversations.set(key(input.data.id), stored); return structuredClone(stored);
			}
			case 'rename': { const stored = beaconConversations.get(key(input.id))!; stored.data.title = input.title; stored.revision++; return; }
			case 'delete': beaconConversations.delete(key(input.id)); if (input.id === beaconContext.activeId) { delete beaconContext.activeId; } return;
		}
		throw new Error('beacon-invalid-command');
	});
	const secretChanged = event<{ key: string }>();
	const secrets = new Map([[secretName('deepseek'), 'mock-secret']]);
	return { subscriptions: [] as { dispose(): unknown }[], extensionUri: Uri.file(path.resolve('.')), globalStorageUri: Uri.file(path.join(directory, 'storage')), secrets: { get: async (key: string) => secrets.get(key), store: async (key: string, value: string) => { if (controls.secretError) { throw controls.secretError; } secrets.set(key, value); secretChanged.fire({ key }); }, delete: async (key: string) => { if (controls.secretError) { throw controls.secretError; } secrets.delete(key); secretChanged.fire({ key }); }, onDidChange: secretChanged.listen } };
}
export async function selectModel(id: string) {
	const data = structuredClone(values.get('modelConfiguration')) as ReturnType<typeof emptyConfiguration>;
	data.selection = { provider: 'deepseek', model: id };
	await workspace.getConfiguration().update('modelConfiguration', data);
}

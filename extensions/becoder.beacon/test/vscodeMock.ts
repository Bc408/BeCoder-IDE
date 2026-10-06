/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { emptyConfiguration } from '../src/modelConfiguration';
import { secretName } from '../src/connection';

function event<T>() {
	const listeners = new Set<(value: T) => void>();
	return { listen: (listener: (value: T) => void) => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; }, fire: (value: T) => { for (const listener of listeners) { listener(value); } }, clear: () => listeners.clear() };
}
const configuration = event<{ affectsConfiguration(key: string): boolean }>();
export const values = new Map<string, unknown>();
export const controls: { updateError?: Error; secretError?: Error } = {};
export const commandHandlers = new Map<string, () => void>();
export const commandCalls: { id: string; args: unknown[] }[] = [];
export const panels: ReturnType<typeof makePanel>[] = [];
export const ViewColumn = { Active: -1 };
export const viewProviders = new Map<string, { resolveWebviewView(view: ReturnType<typeof makeView>): void }>();
export const Uri = {
	file: (file: string) => ({ scheme: 'file', fsPath: path.resolve(file), toString: () => 'file://' + file }),
	joinPath: (uri: { fsPath: string }, ...segments: string[]) => Uri.file(path.join(uri.fsPath, ...segments)),
	parse: (url: string) => ({ scheme: 'https', fsPath: '', toString: () => url })
};
export const ConfigurationTarget = { Global: 1 };
export const l10n = { t: (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)])) };
export const workspace = {
	workspaceFolders: [] as { name: string; uri: ReturnType<typeof Uri.file> }[],
	textDocuments: [] as { uri: ReturnType<typeof Uri.file>; isClosed: boolean; getText(): string }[],
	getConfiguration: () => ({ get: <T>(key: string, fallback?: T): T => (values.get(key) ?? fallback) as T, update: async (key: string, value: unknown) => { if (controls.updateError) { throw controls.updateError; } values.set(key, value); configuration.fire({ affectsConfiguration: field => field === 'beacon' || field === 'beacon.' + key }); } }),
	onDidChangeConfiguration: configuration.listen
};
export const env = { language: 'zh-cn', clipboard: { writeText: async () => {} }, openExternal: async () => true };
export const commands = { registerCommand: (id: string, handler: () => void) => { commandHandlers.set(id, handler); return { dispose: () => commandHandlers.delete(id) }; }, executeCommand: async (id: string, ...args: unknown[]) => { commandCalls.push({ id, args }); commandHandlers.get(id)?.(); } };
export const window = {
	createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
	createWebviewPanel: () => { const panel = makePanel(); panels.push(panel); return panel; },
	onDidChangeWindowState: () => ({ dispose() {} }),
	registerWebviewViewProvider: (id: string, provider: typeof viewProviders extends Map<string, infer T> ? T : never) => { viewProviders.set(id, provider); return { dispose: () => viewProviders.delete(id) }; },
	showOpenDialog: async (): Promise<ReturnType<typeof Uri.file>[] | undefined> => undefined,
	showInputBox: async () => undefined
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
	configuration.clear(); values.clear(); viewProviders.clear(); commandHandlers.clear(); commandCalls.length = 0; panels.length = 0; delete controls.updateError; delete controls.secretError;
	const data = emptyConfiguration();
	data.providers.deepseek.models = ['deepseek-flash', 'deepseek-chat'].map(id => ({ id, name: id, enabled: true, parameters: {}, settings: {} }));
	data.selection = { provider: 'deepseek', model: 'deepseek-flash' };
	values.set('modelConfiguration', data); values.set('webEnabled', false); values.set('filePermission', 'workspace');
	workspace.workspaceFolders = [{ name: 'root', uri: Uri.file(directory) }]; workspace.textDocuments = [];
	const secretChanged = event<{ key: string }>();
	const secrets = new Map([[secretName('deepseek'), 'mock-secret']]);
	return { subscriptions: [] as { dispose(): unknown }[], extensionUri: Uri.file(path.resolve('.')), globalStorageUri: Uri.file(path.join(directory, 'storage')), secrets: { get: async (key: string) => secrets.get(key), store: async (key: string, value: string) => { if (controls.secretError) { throw controls.secretError; } secrets.set(key, value); secretChanged.fire({ key }); }, delete: async (key: string) => { if (controls.secretError) { throw controls.secretError; } secrets.delete(key); secretChanged.fire({ key }); }, onDidChange: secretChanged.listen } };
}
export async function selectModel(id: string) {
	const data = structuredClone(values.get('modelConfiguration')) as ReturnType<typeof emptyConfiguration>;
	data.selection = { provider: 'deepseek', model: id };
	await workspace.getConfiguration().update('modelConfiguration', data);
}

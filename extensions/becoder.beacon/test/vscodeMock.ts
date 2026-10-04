/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';

function event<T>() {
	const listeners = new Set<(value: T) => void>();
	return { listen: (listener: (value: T) => void) => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; }, fire: (value: T) => { for (const listener of listeners) { listener(value); } }, clear: () => listeners.clear() };
}
const configuration = event<{ affectsConfiguration(key: string): boolean }>();
export const values = new Map<string, unknown>();
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
	getConfiguration: () => ({ get: <T>(key: string, fallback?: T): T => (values.get(key) ?? fallback) as T, update: async (key: string, value: unknown) => { values.set(key, value); configuration.fire({ affectsConfiguration: field => field === 'beacon' || field === 'beacon.' + key }); } }),
	onDidChangeConfiguration: configuration.listen
};
export const env = { language: 'zh-cn', clipboard: { writeText: async () => {} }, openExternal: async () => true };
export const commands = { registerCommand: () => ({ dispose() {} }), executeCommand: async () => {} };
export const window = {
	onDidChangeWindowState: () => ({ dispose() {} }),
	registerWebviewViewProvider: (id: string, provider: typeof viewProviders extends Map<string, infer T> ? T : never) => { viewProviders.set(id, provider); return { dispose: () => viewProviders.delete(id) }; },
	showOpenDialog: async (): Promise<ReturnType<typeof Uri.file>[] | undefined> => undefined,
	showInputBox: async () => undefined
};
export function makeView() {
	const received = event<unknown>();
	const dropped = event<{ uris: ReturnType<typeof Uri.file>[]; isExternal: boolean }>();
	const messages: Record<string, unknown>[] = [];
	return { visible: true, receive: received.fire, drop: (value: { uris: ReturnType<typeof Uri.file>[]; source: 'internal' | 'external' }) => dropped.fire({ uris: value.uris, isExternal: value.source !== 'internal' }), messages, onDidDispose: () => ({ dispose() {} }), webview: { html: '', options: {}, cspSource: 'self', asWebviewUri: (uri: unknown) => uri, postMessage: async (message: Record<string, unknown>) => { messages.push(structuredClone(message)); return true; }, onDidReceiveMessage: received.listen, onDidDropResources: dropped.listen } };
}
export function reset(directory: string) {
	configuration.clear(); values.clear(); viewProviders.clear();
	values.set('provider', 'deepseek'); values.set('deepseek.model', 'deepseek-flash'); values.set('webEnabled', false); values.set('filePermission', 'workspace');
	workspace.workspaceFolders = [{ name: 'root', uri: Uri.file(directory) }]; workspace.textDocuments = [];
	return { subscriptions: [] as { dispose(): unknown }[], extensionUri: Uri.file(path.resolve('.')), globalStorageUri: Uri.file(path.join(directory, 'storage')), secrets: { get: async () => 'mock-secret', onDidChange: () => ({ dispose() {} }) } };
}

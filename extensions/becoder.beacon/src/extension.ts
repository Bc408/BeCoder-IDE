/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { ChatHistory } from './history';
import { Connections, connectionError } from './connections';

const historyKey = 'beacon.history.v1';
let shutdown: (() => Promise<void>) | undefined;

export function deactivate(): Promise<void> | undefined { return shutdown?.(); }

export function activate(context: vscode.ExtensionContext): void {
	let view: vscode.WebviewView | undefined;
	let configurationView: vscode.WebviewView | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let alive = true;
	const describeError = connectionError;
	let historyUnreadable = false;
	let history: ChatHistory;
	try {
		history = new ChatHistory(context.workspaceState.get(historyKey), data => context.workspaceState.update(historyKey, data), schedule, describeError);
	} catch {
		historyUnreadable = true;
		history = new ChatHistory(undefined, async () => { throw new Error('unreadable-history'); }, schedule, describeError);
	}
	const session = history.session;
	const connections = new Connections(context, () => session.snapshot.busy, schedule);
	let closing: Promise<void> | undefined;
	shutdown = () => {
		alive = false;
		connections.dispose();
		if (timer) { clearTimeout(timer); }
		return closing ??= history.dispose();
	};
	const publish = () => {
		if (alive) {
			const message = { type: 'snapshot', ...history.snapshot, configured: connections.configured, connection: connections.snapshot, historyUnreadable };
			void view?.webview.postMessage(message);
			void configurationView?.webview.postMessage({ type: 'snapshot', configured: connections.configured, connection: connections.snapshot, busy: session.snapshot.busy });
		}
	};
	function schedule(): void {
		if (!timer && alive) { timer = setTimeout(() => { timer = undefined; publish(); }, 40); }
	}
	function html(webview: vscode.Webview, surface: 'chat' | 'configuration' = 'chat'): string {
		const dist = vscode.Uri.joinPath(context.extensionUri, 'dist');
		webview.options = { enableScripts: true, localResourceRoots: [dist] };
		const nonce = randomBytes(18).toString('base64');
		const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, name));
		return `<!DOCTYPE html><html lang="${vscode.env.language.startsWith('zh') ? 'zh-CN' : 'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;"><link rel="stylesheet" href="${asset('beacon.css')}"></head><body data-surface="${surface}"><div id="root"></div><script nonce="${nonce}" src="${asset('beacon.js')}"></script></body></html>`;
	}
	function receive(message: unknown): void {
		if (!message || typeof message !== 'object') { return; }
		const value = message as { type?: string; text?: string; id?: number; conversationId?: string; url?: string };
		switch (value.type) {
			case 'ready': publish(); break;
			case 'send': if (!historyUnreadable && connections.configured && typeof value.text === 'string') { const request = connections.request(); void session.send(value.text, request.generate, false, request.source); } else { publish(); } break;
			case 'retry': if (!historyUnreadable && connections.configured) { const request = connections.request(); void session.send('', request.generate, true, request.source); } else { publish(); } break;
			case 'stop': session.stop(); break;
			case 'clear': if (!historyUnreadable) { history.newConversation(); } break;
			case 'openHistory': if (typeof value.conversationId === 'string') { history.open(value.conversationId); } break;
			case 'renameHistory': if (typeof value.conversationId === 'string') { void manageHistory(value.conversationId, false); } break;
			case 'deleteHistory': if (typeof value.conversationId === 'string') { void manageHistory(value.conversationId, true); } break;
			case 'saveHistory': if (!historyUnreadable) { void history.flush(); } break;
			case 'settings': void vscode.commands.executeCommand('becoder.beacon.configuration.focus'); break;
			case 'copy': {
				const item = session.snapshot.messages.find(item => item.id === value.id);
				if (item) { void vscode.env.clipboard.writeText(item.text); }
				break;
			}
			case 'link': if (typeof value.url === 'string' && /^https?:\/\//i.test(value.url)) { void vscode.env.openExternal(vscode.Uri.parse(value.url)); } break;
		}
	}
	async function manageHistory(id: string, remove: boolean): Promise<void> {
		if (session.snapshot.busy || historyUnreadable) { return; }
		const item = history.snapshot.history.find(item => item.id === id);
		if (!item) { return; }
		if (remove) {
			history.remove(id);
		} else {
			const title = await vscode.window.showInputBox({ title: vscode.l10n.t('Rename chat'), value: item.title, ignoreFocusOut: true, validateInput: value => value.trim() && value.trim().length <= 80 ? undefined : vscode.l10n.t('Enter a title between 1 and 80 characters.') });
			if (title !== undefined) { history.rename(id, title); }
		}
	}
	context.subscriptions.push(
		{ dispose: () => { void shutdown?.(); } },
		vscode.commands.registerCommand('becoder.beacon.open', async () => {
			if (view?.visible) {
				await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
			} else {
				await vscode.commands.executeCommand('becoder.beacon.chat.focus');
			}
		}),
		vscode.commands.registerCommand('becoder.beacon.configureKey', () => connections.configureKey()),
		vscode.window.registerWebviewViewProvider('becoder.beacon.configuration', {
			resolveWebviewView(resolved) {
				configurationView = resolved;
				resolved.webview.html = html(resolved.webview, 'configuration');
				const receiveDisposable = resolved.webview.onDidReceiveMessage((message: unknown) => {
					if (!message || typeof message !== 'object') { return; }
					const value = message as { type?: string; field?: string; value?: string; provider?: string };
					const type = value.type;
					if (type === 'ready') { publish(); }
					if (type === 'configure') { void connections.configureKey(); }
					if (type === 'fetchModels') { void connections.fetchModels(); }
					if (type === 'updateConnection') { void connections.update(value.field, value.value, value.provider); }
					if (type === 'openSettings') { void vscode.commands.executeCommand('workbench.action.openSettings', '@ext:becoder.beacon'); }
					if (type === 'openChat') { void vscode.commands.executeCommand('becoder.beacon.chat.focus'); }
				});
				const disposed = resolved.onDidDispose(() => { receiveDisposable.dispose(); disposed.dispose(); if (configurationView === resolved) { configurationView = undefined; } });
				publish();
			}
		}),
		vscode.window.registerWebviewViewProvider('becoder.beacon.chat', {
			resolveWebviewView(resolved) {
				view = resolved;
				const webview = resolved.webview;
				webview.html = html(webview);
				const receiveDisposable = webview.onDidReceiveMessage(receive);
				const disposed = resolved.onDidDispose(() => { receiveDisposable.dispose(); disposed.dispose(); if (view === resolved) { view = undefined; } });
				publish();
			}
		}, { webviewOptions: { retainContextWhenHidden: true } })
	);
	void connections.refresh();
}

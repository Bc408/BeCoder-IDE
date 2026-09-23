/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { ChatSession } from './session';
import { createGenerator } from './provider';

const keyName = 'beacon.deepseek.apiKey';

export function activate(context: vscode.ExtensionContext): void {
	let view: vscode.WebviewView | undefined;
	let configured = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let alive = true;
	const session = new ChatSession(() => schedule(), error => {
		const status = (error as { statusCode?: number })?.statusCode;
		if (status === 401 || status === 403) { return vscode.l10n.t('DeepSeek rejected the API key. Please update it.'); }
		if (status === 402) { return vscode.l10n.t('Your DeepSeek account has insufficient balance.'); }
		if (status === 429) { return vscode.l10n.t('DeepSeek is rate limiting requests. Please try again later.'); }
		return vscode.l10n.t('The response could not be completed. Check your connection and DeepSeek account, then retry.');
	});
	const publish = () => {
		if (alive) { void view?.webview.postMessage({ type: 'snapshot', ...session.snapshot, configured }); }
	};
	function schedule(): void {
		if (!timer && alive) { timer = setTimeout(() => { timer = undefined; publish(); }, 40); }
	}
	async function configureKey(): Promise<void> {
		if (session.snapshot.busy) { return; }
		const key = await vscode.window.showInputBox({ title: 'Beacon · DeepSeek API Key', prompt: vscode.l10n.t('Stored securely by BeCoder. Leave empty to remove the saved key.'), password: true, ignoreFocusOut: true });
		if (key === undefined) { return; }
		try {
			if (key.trim()) { await context.secrets.store(keyName, key.trim()); } else { await context.secrets.delete(keyName); }
		} catch {
			void vscode.window.showErrorMessage(vscode.l10n.t('Unable to save the API key. Please try again.'));
		}
		await refreshKey();
	}
	async function refreshKey(): Promise<void> {
		try { configured = !!(await context.secrets.get(keyName)); } catch { configured = false; }
		publish();
	}
	const generate = createGenerator(() => context.secrets.get(keyName));
	context.subscriptions.push(
		{ dispose: () => { alive = false; if (timer) { clearTimeout(timer); } session.dispose(); } },
		vscode.commands.registerCommand('becoder.beacon.open', () => vscode.commands.executeCommand('becoder.beacon.chat.focus')),
		vscode.commands.registerCommand('becoder.beacon.configureKey', configureKey),
		context.secrets.onDidChange(event => { if (event.key === keyName) { void refreshKey(); } }),
		vscode.window.registerWebviewViewProvider('becoder.beacon.chat', {
			resolveWebviewView(resolved) {
				view = resolved;
				const webview = resolved.webview;
				const dist = vscode.Uri.joinPath(context.extensionUri, 'dist');
				webview.options = { enableScripts: true, localResourceRoots: [dist] };
				const nonce = randomBytes(18).toString('base64');
				const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, name));
				webview.html = `<!DOCTYPE html><html lang="${vscode.env.language.startsWith('zh') ? 'zh-CN' : 'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;"><link rel="stylesheet" href="${asset('beacon.css')}"></head><body><div id="root"></div><script nonce="${nonce}" src="${asset('beacon.js')}"></script></body></html>`;
				const receive = webview.onDidReceiveMessage((message: unknown) => {
					if (!message || typeof message !== 'object') { return; }
					const value = message as { type?: string; text?: string; id?: number; url?: string };
					switch (value.type) {
						case 'ready': void refreshKey(); break;
						case 'configure': void configureKey(); break;
						case 'send': if (configured && typeof value.text === 'string') { void session.send(value.text, generate); } break;
						case 'retry': if (configured) { void session.send('', generate, true); } break;
						case 'stop': session.stop(); break;
						case 'clear': session.clear(); break;
						case 'copy': {
							const item = session.snapshot.messages.find(item => item.id === value.id);
							if (item) { void vscode.env.clipboard.writeText(item.text); }
							break;
						}
						case 'link': if (typeof value.url === 'string' && /^https?:\/\//i.test(value.url)) { void vscode.env.openExternal(vscode.Uri.parse(value.url)); } break;
					}
				});
				const disposed = resolved.onDidDispose(() => { receive.dispose(); disposed.dispose(); if (view === resolved) { view = undefined; } });
				void refreshKey();
			}
		}, { webviewOptions: { retainContextWhenHidden: true } })
	);
}

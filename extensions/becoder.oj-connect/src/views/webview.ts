/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import markdownService from '../markdownService';
import { randomBytes } from 'crypto';
import { panelMessage, safeState, type PanelState, type PanelAction } from './model';
import { userError } from '../messages';

export function labels(): Record<string, string> {
	return {
		rendering: vscode.l10n.t('Rendering the statement…'), renderFailed: vscode.l10n.t('Could not render the statement.'), submit: vscode.l10n.t('Submit'), submitCode: vscode.l10n.t('Submit Code'), importCph: vscode.l10n.t('Send to CPH'), openOriginal: vscode.l10n.t('Open Original'),
		continueQuery: vscode.l10n.t('Continue Querying'), record: vscode.l10n.t('Submission'),
		tracking: vscode.l10n.t('Reading the current submission result…'), waiting: vscode.l10n.t('Waiting for record data'), language: vscode.l10n.t('Language'),
		interactive: vscode.l10n.t('Interactive problem'), samples: vscode.l10n.t('Samples'), sample: vscode.l10n.t('Sample'), input: vscode.l10n.t('Input'), output: vscode.l10n.t('Output'),
		copy: vscode.l10n.t('Copy'), copied: vscode.l10n.t('Copied'), copyFailed: vscode.l10n.t('Select and copy the sample'), score: vscode.l10n.t('Score'),
		chooseLanguage: vscode.l10n.t('Choose language when submitting'), statementLanguage: vscode.l10n.t('Statement language'), problem: vscode.l10n.t('Problem'), verdict: vscode.l10n.t('Verdict'), resources: vscode.l10n.t('Time / Memory'),
		'Time Limit': vscode.l10n.t('Time Limit'), 'Memory Limit': vscode.l10n.t('Memory Limit'),
		difficulty: vscode.l10n.t('Problem Difficulty'), tags: vscode.l10n.t('Problem Tags'),
		testCases: vscode.l10n.t('Test Cases'),
		sampleExplanation: vscode.l10n.t('Sample explanation'),
		submittedAt: vscode.l10n.t('Submission Time'), codeLength: vscode.l10n.t('Code Size'), source: vscode.l10n.t('Source Code'), viewSource: vscode.l10n.t('View in BeCoder'),
		compileSucceeded: vscode.l10n.t('Compilation succeeded'), compileFailed: vscode.l10n.t('Compilation failed'),
		compileUnavailable: vscode.l10n.t('Compiler output is unavailable for this record.'),
		status_AC: vscode.l10n.t('Accepted'), status_WA: vscode.l10n.t('Wrong answer'), status_CE: vscode.l10n.t('Compilation error'),
		status_TLE: vscode.l10n.t('Time limit exceeded'), status_MLE: vscode.l10n.t('Memory limit exceeded'), status_RE: vscode.l10n.t('Runtime error'),
		status_OLE: vscode.l10n.t('Output limit exceeded'), status_IE: vscode.l10n.t('Internal judge error'), status_WJ: vscode.l10n.t('Waiting for judging'), status_WR: vscode.l10n.t('Waiting for rejudging'),
		status_QLE: vscode.l10n.t('Query limit exceeded'),
		time: vscode.l10n.t('Time'), memory: vscode.l10n.t('Memory'), owner: vscode.l10n.t('User'), compiler: vscode.l10n.t('Compiler Output'),
		'verification_matched': vscode.l10n.t('The submitted source was verified.'), 'verification_mismatch': vscode.l10n.t('The record source differs from the submitted source.'),
		'verification_unavailable': vscode.l10n.t('The record source is unavailable.'), 'verification_not-checked': vscode.l10n.t('Source comparison is not available for this result.')
	};
}

export class Panel implements vscode.Disposable {
	readonly panel: vscode.WebviewPanel;
	private readonly subscriptions: vscode.Disposable[] = [];
	private closed = false;
	constructor(context: vscode.ExtensionContext, readonly state: PanelState, action: (value: PanelAction) => Promise<void>, onClose: () => void) {
		const resources = vscode.Uri.joinPath(context.extensionUri, 'dist');
		const sourceColumn = vscode.window.activeTextEditor?.viewColumn;
		const side = sourceColumn === undefined ? undefined : vscode.window.tabGroups?.all.filter(group => group.viewColumn > sourceColumn).sort((a, b) => a.viewColumn - b.viewColumn)[0]?.viewColumn;
		this.panel = vscode.window.createWebviewPanel('becoder.ojConnect.' + state.kind, state.kind === 'problem' ? state.problem!.title : '#' + state.record!.id, { viewColumn: side ?? vscode.ViewColumn.Beside, preserveFocus: false }, { enableScripts: true, localResourceRoots: [resources] });
		const webview = this.panel.webview, nonce = randomBytes(20).toString('hex');
		const resource = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(resources, name));
		webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; connect-src ${webview.cspSource}; worker-src blob:;"><link rel="stylesheet" href="${resource('katex.min.css')}"><link rel="stylesheet" href="${resource('webview.css')}"></head><body><main id="app"></main><script nonce="${nonce}">window.__OJ_STATE__=${safeState(state)};</script><script nonce="${nonce}" src="${resource('webview.js')}"></script></body></html>`;
		this.subscriptions.push(webview.onDidReceiveMessage(raw => {
			const request = raw && raw.type === 'ojAction' && typeof raw.uuid === 'string' && /^[a-f0-9-]{36}$/i.test(raw.uuid) && Object.keys(raw).length === 3 ? raw : undefined;
			const value = panelMessage(request ? request.data : raw); if (!value || this.closed) { return; }
			if (value.action === 'ready') { this.update({}); return; }
			const respond = (error?: string, data?: unknown) => { if (request && !this.closed) { void webview.postMessage({ uuid: request.uuid, data, error }); } };
			const operation = value.action === 'renderContent' ? value.format === 'markdown' ? markdownService.renderTree(value.content) : markdownService.renderHtmlTree(value.content, this.state.problem?.ref.url ?? 'https://invalid.invalid/') : action(value);
			void operation.then(data => respond(undefined, data), error => {
				const message = userError(error); void vscode.window.showErrorMessage(vscode.l10n.t('OJ Connect: {0}', message)); respond(message);
			});
		}), this.panel.onDidDispose(() => { this.closed = true; onClose(); this.subscriptions.splice(0).forEach(value => value.dispose()); }));
	}
	update(value: Partial<PanelState>): void { if (!this.closed) { Object.assign(this.state, value); void this.panel.webview.postMessage({ type: 'state', state: this.state }); } }
	reveal(): void { if (!this.closed) { this.panel.reveal(undefined, false); } }
	dispose(): void { this.panel.dispose(); }
}

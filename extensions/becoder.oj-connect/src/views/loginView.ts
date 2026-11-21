/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import type { OjAdapter } from '../adapters/adapter';
import type { LoginSummary, SiteId } from '../domain';
import { openAccount, loginRows, sites } from './loginModel';
import { loginContent } from './loginContent';
import { userError } from '../messages';

export class LoginView implements vscode.WebviewViewProvider, vscode.Disposable {
	private rows: LoginSummary[];
	private request: AbortController | undefined;
	private view: vscode.WebviewView | undefined;
	private subscriptions: vscode.Disposable[] = [];
	private readonly states = { 'signed-in': vscode.l10n.t('Signed in'), 'signed-out': vscode.l10n.t('Signed out'), unknown: vscode.l10n.t('Not checked'), unavailable: vscode.l10n.t('Not connected yet') };
	constructor(private readonly context: vscode.ExtensionContext, private readonly adapters: readonly OjAdapter[], private readonly execute: (command: string) => Promise<unknown>, private readonly open: (url: string) => Promise<void>, private readonly onSignedIn: (site: SiteId) => void = () => undefined) {
		this.rows = sites.map(site => ({ site, state: adapters.some(adapter => adapter.site === site) ? 'unknown' : 'unavailable' }));
	}
	resolveWebviewView(view: vscode.WebviewView): void {
		this.subscriptions.splice(0).forEach(value => value.dispose());
		this.view = view;
		const resources = vscode.Uri.joinPath(this.context.extensionUri, 'resources');
		view.webview.options = { enableScripts: true, localResourceRoots: [resources] };
		const names = { luogu: vscode.l10n.t('Luogu'), atcoder: 'AtCoder', codeforces: 'Codeforces', nowcoder: vscode.l10n.t('Nowcoder'), lanqiao: vscode.l10n.t('Lanqiao') };
		const icons = Object.fromEntries(sites.map(site => [site, view.webview.asWebviewUri(vscode.Uri.joinPath(resources, site + (site === 'luogu' || site === 'codeforces' ? '.svg' : '.png'))).toString()])) as Record<SiteId, string>;
		view.webview.html = loginContent(this.rows, names, this.states, icons, view.webview.cspSource, randomBytes(20).toString('hex'), { enabled: this.acmMode(), label: vscode.l10n.t('ACM Mode') });
		this.subscriptions.push(view.webview.onDidReceiveMessage((message: unknown) => {
			if (!message || typeof message !== 'object' || Array.isArray(message)) { return; }
			const keys = Object.keys(message);
			if (keys.length === 2 && keys.includes('action') && keys.includes('enabled') && Reflect.get(message, 'action') === 'setAcmMode' && typeof Reflect.get(message, 'enabled') === 'boolean') { void this.setAcmMode(Reflect.get(message, 'enabled')); return; }
			if (keys.length !== 1) { return; }
			if (Reflect.get(message, 'ready') === true) { this.update(); return; }
			const site = Reflect.get(message, 'site'), row = this.rows.find(row => row.site === site);
			if (row) { void openAccount(row, this.execute, () => this.refresh(), this.open).catch(error => { void vscode.window.showErrorMessage(vscode.l10n.t('OJ Connect: {0}', userError(error))); }); }
		}), view.onDidChangeVisibility(() => { if (view.visible) { void this.refresh(); } }), view.onDidDispose(() => { this.view = undefined; this.request?.abort(); this.subscriptions.splice(0).forEach(value => value.dispose()); }), vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('becoder.ojConnect.acmMode')) { this.update(); } }));
		void this.refresh();
	}
	async refresh(reset = false): Promise<void> {
		this.request?.abort(); const request = new AbortController(); this.request = request;
		if (reset) {
			this.rows = sites.map(site => ({ site, state: this.adapters.some(adapter => adapter.site === site) ? 'unknown' : 'unavailable' }));
			this.update();
		}
		const rows = await loginRows(this.adapters, request.signal);
		if (!request.signal.aborted) {
			const signedIn = rows.filter(row => row.state === 'signed-in' && this.rows.find(previous => previous.site === row.site)?.state !== 'signed-in');
			this.rows = rows;
			this.update();
			for (const row of signedIn) { this.onSignedIn(row.site); }
		}
	}
	private acmMode(): boolean { return vscode.workspace.getConfiguration('becoder.ojConnect').get<unknown>('acmMode', false) === true; }
	private async setAcmMode(enabled: boolean): Promise<void> {
		try { await vscode.workspace.getConfiguration('becoder.ojConnect').update('acmMode', enabled, vscode.ConfigurationTarget.Global); }
		catch (error) { void vscode.window.showErrorMessage(vscode.l10n.t('OJ Connect: {0}', userError(error))); }
		finally { this.update(); }
	}
	private update(): void { void this.view?.webview.postMessage({ rows: this.rows.map(row => ({ site: row.site, state: row.state, text: this.states[row.state] + (row.label ? ' · ' + row.label : '') })), acmMode: this.acmMode() }); }
	dispose(): void { this.request?.abort(); this.subscriptions.splice(0).forEach(value => value.dispose()); this.view = undefined; }
}

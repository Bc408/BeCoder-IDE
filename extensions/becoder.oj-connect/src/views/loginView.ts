/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { OjAdapter } from '../adapters/adapter';
import type { LoginSummary } from '../domain';
import { changeAccount, loginRows, sites } from './loginModel';

export class LoginView implements vscode.TreeDataProvider<LoginSummary>, vscode.Disposable {
	private readonly change = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.change.event;
	private rows: LoginSummary[] = sites.map(site => ({ site, state: site === 'luogu' || site === 'atcoder' ? 'unknown' : 'unavailable' }));
	private request: AbortController | undefined;
	constructor(private readonly adapters: readonly OjAdapter[], private readonly execute: (command: string) => Promise<unknown>) { }
	async manage(row: LoginSummary | undefined, action: 'login' | 'logout'): Promise<void> {
		const current = this.rows.find(item => item.site === row?.site);
		if (current) { await changeAccount(current, action, this.execute, () => this.refresh()); }
	}
	async refresh(): Promise<void> {
		this.request?.abort(); const request = new AbortController(); this.request = request;
		const rows = await loginRows(this.adapters, request.signal);
		if (!request.signal.aborted) { this.rows = rows; this.change.fire(); }
	}
	getChildren(): LoginSummary[] { return this.rows; }
	getTreeItem(row: LoginSummary): vscode.TreeItem {
		const names = { luogu: vscode.l10n.t('Luogu'), atcoder: 'AtCoder', codeforces: 'Codeforces', nowcoder: vscode.l10n.t('Nowcoder'), lanqiao: vscode.l10n.t('Lanqiao') };
		const states = { 'signed-in': vscode.l10n.t('Signed in'), 'signed-out': vscode.l10n.t('Signed out'), unknown: vscode.l10n.t('Not checked'), unavailable: vscode.l10n.t('Not connected yet') };
		const item = new vscode.TreeItem(names[row.site], vscode.TreeItemCollapsibleState.None);
		item.contextValue = 'ojConnect.account.' + row.site + '.' + row.state;
		if ((row.site === 'luogu' || row.site === 'atcoder') && (row.state === 'signed-out' || row.state === 'unknown')) {
			item.command = { command: 'becoder.ojConnect.login', title: vscode.l10n.t('Sign In'), arguments: [row] };
		}
		item.description = row.label ? states[row.state] + ' · ' + row.label : states[row.state]; item.tooltip = item.description;
		item.iconPath = new vscode.ThemeIcon(row.state === 'signed-in' ? 'account' : row.state === 'unavailable' ? 'circle-slash' : 'circle-outline'); return item;
	}
	dispose(): void { this.request?.abort(); this.change.dispose(); }
}

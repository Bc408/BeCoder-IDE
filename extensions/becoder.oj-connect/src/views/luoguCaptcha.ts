/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Portions Copyright (c) 2018 引领天下.
 *  Licensed under GPL-3.0-or-later. Upstream MIT notice: ThirdPartyNotices.txt.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/** Adapted from vscode-luogu v4.20.0 workspaceUtils.askForCaptcha.
 * Only image transport and cancellation differ; the browser Session owns credentials.
 */
export class LuoguCaptcha implements vscode.Disposable {
	private active: { requestId: string; token: vscode.CancellationTokenSource; panel: vscode.WebviewPanel } | undefined;
	constructor(private readonly refresh: (requestId: string) => Promise<string>) { }
	async ask(image: string, requestId: string): Promise<string | undefined> {
		this.dispose();
		const token = new vscode.CancellationTokenSource();
		const panel = vscode.window.createWebviewPanel('ojConnect.luoguCaptcha', vscode.l10n.t('Luogu Verification'), vscode.ViewColumn.Active, { enableScripts: false });
		const current = { requestId, token, panel }; this.active = current;
		const closed = panel.onDidDispose(() => token.cancel());
		try {
			let input: string | undefined;
			do {
				if (token.token.isCancellationRequested) { return undefined; }
				if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(image) || image.length > 3 * 1024 * 1024) { throw new Error(vscode.l10n.t('Could not load the Luogu verification image.')); }
				panel.webview.html = '<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:"><img src="data:image/png;base64,' + image + '">';
				input = await vscode.window.showInputBox({ prompt: vscode.l10n.t('Enter the verification code'), ignoreFocusOut: true, placeHolder: vscode.l10n.t('Leave empty to refresh the verification image') }, token.token);
				if (token.token.isCancellationRequested) { return undefined; }
				if (input === '') { image = await this.refresh(requestId); }
			} while (input === '');
			return input;
		} finally {
			if (this.active === current) { this.active = undefined; }
			closed.dispose(); panel.dispose(); token.dispose();
		}
	}
	cancel(requestId: string): void { if (this.active?.requestId === requestId) { this.dispose(); } }
	dispose(): void {
		const current = this.active; this.active = undefined;
		if (current) { current.token.cancel(); current.panel.dispose(); }
	}
}

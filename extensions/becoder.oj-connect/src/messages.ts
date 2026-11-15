/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
export function userError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	if (message === 'luogu-browser-verification-required') { return vscode.l10n.t('Please submit in the built-in browser and complete verification manually.'); }
	if (/^(?:oj-connect|atcoder|luogu)[-:]/.test(message)) {
		console.warn('[OJ Connect]', message);
		return vscode.l10n.t('The website operation stopped ({0}). Check login and verification, then continue the appropriate action.', message);
	}
	return vscode.l10n.t(message);
}

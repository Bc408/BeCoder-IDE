/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
export function userError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	if (message === 'lanqiao-login-required') { return vscode.l10n.t('Sign in to Lanqiao from the OJ Connect sidebar.'); }
	if (message === 'lanqiao-unsupported-problem') { return vscode.l10n.t('Only accessible public Lanqiao C/C++ standard input/output practice problems are supported.'); }
	if (message === 'lanqiao-receipt-unconfirmed') { return vscode.l10n.t('The Lanqiao submission is unconfirmed. Continue querying this attempt; no code or report will be sent again.'); }
	if (message === 'lanqiao-language-config-changed') { return vscode.l10n.t('The current Lanqiao compiler catalogue could not be verified. Refresh the problem and choose an available compiler before submitting.'); }
	if (message === 'atcoder-login-required') { return vscode.l10n.t('Sign in to AtCoder from the OJ Connect sidebar.'); }
	if (message === 'codeforces-login-required') { return vscode.l10n.t('Sign in to Codeforces from the OJ Connect sidebar.'); }
	if (message === 'codeforces-browser-verification-required') { return vscode.l10n.t('Open Codeforces in the built-in browser and complete verification manually, then retry the appropriate action.'); }
	if (message === 'codeforces-practice-unavailable') { return vscode.l10n.t('Only ordinary ended public Codeforces contest problems in practice mode are supported.'); }
	if (message === 'codeforces-request-timeout') { return vscode.l10n.t('The Codeforces request timed out. Check the connection and try the action again.'); }
	if (message === 'codeforces-session-changed') { return vscode.l10n.t('The Codeforces login session changed. Refresh its account status, then try the action again.'); }
	if (message === 'codeforces-session-stopped') { return vscode.l10n.t('The Codeforces connection stopped. Reopen OJ Connect and try the action again.'); }
	if (message === 'codeforces-operation-cancelled') { return vscode.l10n.t('The Codeforces operation was cancelled. Try the action again.'); }
	if (message === 'codeforces-duplicate-source') { return vscode.l10n.t('Codeforces rejected this submission because you have already submitted exactly the same code for this problem. No new submission was created. View the earlier submission or choose another problem.'); }
	if (message === 'nowcoder-login-required') { return vscode.l10n.t('Sign in to Nowcoder from the OJ Connect sidebar.'); }
	if (message === 'nowcoder-browser-verification-required') { return vscode.l10n.t('Please submit in the built-in browser and complete verification manually.'); }
	if (/^nowcoder-unsupported-(?:problem|contest)$/.test(message)) { return vscode.l10n.t('Only public Nowcoder ACM standard input/output problems and ended public individual contests are supported.'); }
	if (message === 'atcoder-browser-verification-required') { return vscode.l10n.t('AtCoder requires manual verification. Submit in the built-in browser and complete verification manually.'); }
	if (message === 'luogu-browser-verification-required') { return vscode.l10n.t('Please submit in the built-in browser and complete verification manually.'); }
	if (/^(?:oj-connect|oj-statement|atcoder|luogu|nowcoder|codeforces|lanqiao)[-:]/.test(message)) {
		console.warn('[OJ Connect]', message);
		return vscode.l10n.t('The website operation stopped ({0}). Check login and verification, then continue the appropriate action.', message);
	}
	return vscode.l10n.t(message);
}

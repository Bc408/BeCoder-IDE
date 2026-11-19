/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import type { OjAdapter } from '../adapters/adapter';
import { type RecordRef, validateRecordRef } from '../domain';
import { RecordController } from '../recordController';
import { Panel, labels } from './webview';
import { userError } from '../messages';

export class RecordPanel implements vscode.Disposable {
	private readonly panels = new Map<string, { panel: Panel; stop: () => void }>();
	constructor(private readonly context: vscode.ExtensionContext, private readonly adapters: readonly OjAdapter[], private readonly openLink: (url: string) => Promise<void>, private readonly release: (record: RecordRef) => Promise<void>) { }
	async open(input: RecordRef, sourceUri = ''): Promise<void> {
		const ref = validateRecordRef(input), existing = this.panels.get(ref.url);
		if (existing) { existing.panel.reveal(); return; }
		const adapter = this.adapters.find(item => item.site === ref.problem.site);
		if (!adapter) { throw new Error(vscode.l10n.t('This site is not available yet.')); }
		let active: AbortController | undefined;
		const stop = () => { active?.abort(); active = undefined; };
		const track = async () => {
			stop(); const controller = new AbortController(); active = controller;
			panel.update({ tracking: true, message: undefined, canRetry: false });
			try {
				await new RecordController((record, signal) => adapter.readRecord(record, signal), { intervalMs: ref.problem.site === 'luogu' ? 0 : undefined }).track(ref, snapshot => {
					if (active !== controller || controller.signal.aborted) { return; }
					const stopped = ref.problem.site === 'luogu' && snapshot.phase === 'unknown';
					panel.update({ snapshot, canRetry: stopped, message: stopped ? snapshot.rawStatus === 'N/A' ? vscode.l10n.t('This result is hidden. Continue querying to check for updates.') : vscode.l10n.t('This result has an unrecognized status. Continue querying to check for updates.') : undefined });
				}, controller.signal);
			}
			catch (error) { if (active === controller && !controller.signal.aborted) { panel.update({ canRetry: true, message: vscode.l10n.t('Could not update this record: {0} Continue querying this record; no code will be resent.', userError(error)) }); } }
			finally { if (active === controller) { active = undefined; panel.update({ tracking: false }); } }
		};
		const panel = new Panel(this.context, { kind: 'record', labels: labels(), record: ref, sourceName: sourceUri ? path.basename(vscode.Uri.parse(sourceUri).fsPath) : ref.problem.nativeId }, async value => {
			if (value.action === 'continueQuery') { await track(); }
			else if (value.action === 'openLink') { await this.openLink(value.url); }
			else if (value.action === 'viewSource' && panel.state.snapshot?.source !== undefined) {
				const snapshot = panel.state.snapshot;
				const document = await vscode.workspace.openTextDocument({ content: snapshot.source, language: /C\+\+/.test(snapshot.language ?? '') ? 'cpp' : 'c' });
				await vscode.window.showTextDocument(document, { preview: false });
			}
		}, () => { stop(); this.panels.delete(ref.url); void this.release(ref).catch(() => undefined); });
		this.panels.set(ref.url, { panel, stop }); void track();
	}
	dispose(): void { for (const value of this.panels.values()) { value.stop(); value.panel.dispose(); } this.panels.clear(); }
}

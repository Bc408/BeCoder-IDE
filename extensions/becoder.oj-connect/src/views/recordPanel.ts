/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import type { OjAdapter } from '../adapters/adapter';
import { type RecordRef, type RecordSnapshot, type SubmissionEvaluation, type SubmissionOutcome, validateRecordRef } from '../domain';
import type { IBeaconCollectionScope } from 'becoder-beacon';
import { RecordController } from '../recordController';
import { Panel, labels } from './webview';
import { userError } from '../messages';
import type { PanelState } from './model';

type PendingOutcome = Extract<SubmissionOutcome, { kind: 'unconfirmed' }>;
interface RecordView { panel: Panel; sourceUri: string; attemptId?: string; stop(): void; track(): Promise<void>; update(value: Partial<PanelState>): void; closed: boolean; started: boolean; retry?: () => Promise<void> }
export interface RecordCapture { accept(snapshot: RecordSnapshot): void; finish(): Promise<void> }

export class RecordPanel implements vscode.Disposable {
	private readonly panels = new Map<string, RecordView>();
	private readonly views = new Set<RecordView>();
	constructor(private readonly context: vscode.ExtensionContext, private readonly adapters: readonly OjAdapter[], private readonly openLink: (url: string) => Promise<void>, private readonly release: (record: RecordRef) => Promise<void>, private readonly queryPending?: (outcome: PendingOutcome, sourceUri: string, adopt: (record: RecordRef) => void, isOpen: () => boolean, scope?: IBeaconCollectionScope) => () => Promise<void>, private readonly capture?: (ref: RecordRef, sourceUri: string, scope: IBeaconCollectionScope | undefined, attemptId?: string) => RecordCapture) { }
	async open(input: RecordRef, sourceUri = '', scope?: IBeaconCollectionScope, attemptId?: string): Promise<void> {
		const ref = validateRecordRef(input), existing = this.panels.get(ref.url);
		if (existing) { existing.panel.reveal(); if (!existing.started) { void existing.track(); } return; }
		if (!this.adapters.some(item => item.site === ref.problem.site)) { throw new Error(vscode.l10n.t('This site is not available yet.')); }
		const view = this.create({ kind: 'record', labels: labels(), record: ref, sourceName: this.sourceName(sourceUri, ref.problem.nativeId) }, sourceUri, scope);
		view.attemptId = attemptId;
		this.panels.set(ref.url, view); void view.track();
	}
	beginEvaluation(value: SubmissionEvaluation, sourceUri: string, scope?: IBeaconCollectionScope) {
		const view = this.create({ kind: 'record', labels: labels(), submission: value, sourceName: this.sourceName(sourceUri, value.problem.nativeId), tracking: true }, sourceUri, scope);
		view.attemptId = value.attemptId;
		let settled = false;
		const adopt = (input: RecordRef) => {
			const ref = validateRecordRef(input);
			if (ref.problem.url !== value.problem.url || ref.problem.site !== value.problem.site || ref.problem.nativeId !== value.problem.nativeId) { throw new Error('lanqiao-record-mismatch'); }
			if (view.closed) { void this.release(ref).catch(() => undefined); return; }
			view.retry = undefined;
			view.update({ record: ref, tracking: true, message: undefined, canRetry: false });
			this.panels.set(ref.url, view);
			void view.track();
		};
		return {
			update: (next: SubmissionEvaluation) => {
				if (next.attemptId) { view.attemptId = next.attemptId; }
				if (!settled && !view.closed && next.problem.url === value.problem.url && next.problem.site === value.problem.site && next.problem.nativeId === value.problem.nativeId) { view.update({ submission: next }); }
			},
			finish: (outcome?: SubmissionOutcome) => {
				if (settled) { return false; } settled = true;
				// This preview owns result presentation, including closure during later async cleanup.
				if (outcome?.kind === 'record') { adopt(outcome.record); return false; }
				if (view.closed) { return false; }
				if (outcome?.kind === 'unconfirmed') {
					view.retry = this.queryPending?.(outcome, sourceUri, adopt, () => !view.closed, scope);
					view.update({ tracking: false, canRetry: !!view.retry, message: vscode.l10n.t('The submission receipt is still unconfirmed. Continue querying; no code will be resent.') });
				} else {
					view.update({ tracking: false, canRetry: false, message: outcome ? userError(outcome.reason) : vscode.l10n.t('No confirmed submission result is available.') });
				}
				return false;
			}
		};
	}
	private sourceName(sourceUri: string, fallback: string): string { return sourceUri ? path.basename(vscode.Uri.parse(sourceUri).fsPath) : fallback; }
	private create(state: PanelState, sourceUri: string, scope?: IBeaconCollectionScope): RecordView {
		let active: AbortController | undefined;
		const stop = () => { active?.abort(); active = undefined; };
		const update = (value: Partial<PanelState>) => { if (!view.closed) { Object.assign(state, value); panel.update(value); } };
		const track = async () => {
			const ref = state.record;
			if (!ref || view.closed) { return; }
			const adapter = this.adapters.find(item => item.site === ref.problem.site)!;
			stop(); const controller = new AbortController(); active = controller; view.started = true;
			update({ tracking: true, message: undefined, canRetry: false });
			const evidence = this.capture?.(ref, sourceUri, scope, view.attemptId);
			try {
				await new RecordController((record, signal) => adapter.readRecord(record, signal), { intervalMs: ref.problem.site === 'luogu' ? 0 : undefined }).track(ref, snapshot => {
					if (active !== controller || controller.signal.aborted) { return; }
					evidence?.accept(snapshot);
					const stopped = ref.problem.site === 'luogu' && snapshot.phase === 'unknown';
					update({ snapshot, canRetry: stopped, message: stopped ? snapshot.rawStatus === 'N/A' ? vscode.l10n.t('This result is hidden. Continue querying to check for updates.') : vscode.l10n.t('This result has an unrecognized status. Continue querying to check for updates.') : undefined });
				}, controller.signal);
			}
			catch (error) { if (active === controller && !controller.signal.aborted) { update({ canRetry: true, message: vscode.l10n.t('Could not update this record: {0} Continue querying this record; no code will be resent.', userError(error)) }); } }
			finally { try { await evidence?.finish(); } finally { if (active === controller) { active = undefined; update({ tracking: false }); } } }
		};
		const panel = new Panel(this.context, state, async value => {
			if (value.action === 'continueQuery') { if (view.retry) { await view.retry(); } else { await track(); } }
			else if (value.action === 'openLink') { await this.openLink(value.url); }
			else if (value.action === 'viewSource' && state.snapshot?.source !== undefined) {
				const snapshot = state.snapshot;
				const document = await vscode.workspace.openTextDocument({ content: snapshot.source, language: /C\+\+/.test(snapshot.language ?? '') ? 'cpp' : 'c' });
				await vscode.window.showTextDocument(document, { preview: false });
			}
		}, () => {
			view.closed = true; stop(); this.views.delete(view);
			if (state.record) { this.panels.delete(state.record.url); void this.release(state.record).catch(() => undefined); }
		});
		const view: RecordView = { panel, sourceUri, stop, track, update, closed: false, started: false };
		this.views.add(view); return view;
	}
	beaconRecords() {
		return [...this.views].flatMap(view => {
			const identity: object = view.panel.panel;
			return view.panel.state.snapshot && !view.closed ? [{ identity, snapshot: view.panel.state.snapshot, sourceUri: view.sourceUri || undefined, active: view.panel.panel.active }] : [];
		});
	}
	dispose(): void { for (const view of this.views) { view.stop(); view.panel.dispose(); } this.views.clear(); this.panels.clear(); }
}

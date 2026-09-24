/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isProvider, listModels, normalizeBaseURL, providers, secretName, type ConnectionState, type ProviderId } from './connection';
import { createGenerator } from './provider';

export function connectionError(error: unknown): string {
	const status = (error as { statusCode?: number })?.statusCode;
	if (status === 401 || status === 403) { return vscode.l10n.t('The provider rejected the API key or access to this model.'); }
	if (status === 402) { return vscode.l10n.t('The provider account has insufficient balance.'); }
	if (status === 429) { return vscode.l10n.t('Too many requests. Please try again later.'); }
	return vscode.l10n.t('Unable to complete the request. Check the service address, model, credentials and connection.');
}

/** User-scoped configuration and provider-specific secrets. Never exposes keys to a Webview. */
export class Connections implements vscode.Disposable {
	private state: ConnectionState = { provider: 'deepseek', baseURL: providers.deepseek.baseURL, model: providers.deepseek.model, keyConfigured: false, models: [], loading: false, error: '' };
	private revision = 0;
	private controller: AbortController | undefined;
	private mutating = false;
	private disposed = false;
	private readonly subscriptions: vscode.Disposable[];

	constructor(private readonly context: vscode.ExtensionContext, private readonly busy: () => boolean, private readonly changed: () => void) {
		this.subscriptions = [vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('beacon')) { void this.refresh(); } }), context.secrets.onDidChange(event => { if (event.key.startsWith('beacon.') && event.key.endsWith('.apiKey')) { void this.refresh(true); } })];
	}
	get snapshot(): ConnectionState { return { ...this.state, loading: this.state.loading || this.mutating, models: [...this.state.models] }; }
	get configured(): boolean { return !this.state.loading && !this.mutating && !!this.state.model && (this.state.provider === 'ollama' || this.state.keyConfigured) && !this.state.error; }
	private readSelection(): { provider: ProviderId; baseURL: string; model: string } {
		const config = vscode.workspace.getConfiguration('beacon');
		const selected = config.get('provider', 'deepseek');
		const provider = isProvider(selected) ? selected : 'deepseek';
		return { provider, baseURL: normalizeBaseURL(config.get(`${provider}.baseURL`, providers[provider].baseURL), provider), model: config.get<string>(`${provider}.model`, providers[provider].model).trim() };
	}
	async refresh(resetModels = false): Promise<void> {
		const revision = ++this.revision;
		this.controller?.abort();
		this.controller = undefined;
		this.state.loading = true;
		this.state.keyConfigured = false;
		if (resetModels) { this.state.models = []; }
		this.changed();
		try {
			const selection = this.readSelection();
			const configured = !!await this.context.secrets.get(secretName(selection.provider));
			if (revision !== this.revision || this.disposed) { return; }
			const models = this.state.provider === selection.provider && this.state.baseURL === selection.baseURL ? this.state.models : [];
			this.state = { ...selection, keyConfigured: configured, models, loading: false, error: '' };
		} catch {
			if (revision !== this.revision || this.disposed) { return; }
			this.state.error = vscode.l10n.t('Invalid connection settings. Use HTTPS, or local HTTP for Ollama, without credentials or query parameters in the URL.');
			this.state.loading = false;
		}
		this.changed();
	}
	async configureKey(): Promise<void> {
		if (this.busy() || this.mutating) { return; }
		const provider = this.state.provider;
		this.mutating = true; this.changed();
		try {
			const key = await vscode.window.showInputBox({ title: `${providers[provider].name} · API Key`, prompt: vscode.l10n.t('Stored securely by BeCoder. Leave empty to remove the saved key.'), password: true, ignoreFocusOut: true });
			if (key === undefined || this.disposed) { return; }
			if (key.trim()) { await this.context.secrets.store(secretName(provider), key.trim()); }
			else { await this.context.secrets.delete(secretName(provider)); }
			await this.refresh();
		} catch { this.state.error = vscode.l10n.t('Unable to save the API key. Please try again.'); }
		finally { this.mutating = false; this.changed(); }
	}
	async update(field: unknown, value: unknown, expectedProvider: unknown): Promise<void> {
		if (this.busy() || this.mutating || typeof value !== 'string' || expectedProvider !== this.state.provider) { return; }
		this.mutating = true; this.changed();
		try {
			let setting: string;
			if (field === 'provider' && isProvider(value)) { setting = 'provider'; }
			else if (field === 'model' && value.trim().length <= 256) { setting = `${this.state.provider}.model`; value = value.trim(); }
			else if (field === 'baseURL') { setting = `${this.state.provider}.baseURL`; value = normalizeBaseURL(value, this.state.provider); }
			else { return; }
			await vscode.workspace.getConfiguration('beacon').update(setting, value, vscode.ConfigurationTarget.Global);
			await this.refresh();
		} catch { this.state.error = vscode.l10n.t('Unable to save connection settings. Check the address and try again.'); }
		finally { this.mutating = false; this.changed(); }
	}
	async fetchModels(): Promise<void> {
		if (this.busy() || this.mutating || this.state.loading) { return; }
		const revision = ++this.revision;
		const controller = new AbortController();
		this.controller = controller;
		this.state.loading = true; this.state.error = ''; this.changed();
		try {
			const selection = this.readSelection();
			const apiKey = await this.context.secrets.get(secretName(selection.provider));
			const models = await listModels({ ...selection, apiKey }, AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]));
			if (revision !== this.revision || this.disposed) { return; }
			this.state.models = models;
			if (!models.length) { this.state.error = vscode.l10n.t('No models were returned. For Ollama, install a chat model in your Ollama service first.'); }
		} catch (error) {
			if (revision === this.revision && !this.disposed) { this.state.error = connectionError(error); }
		} finally {
			if (revision === this.revision && !this.disposed) { this.controller = undefined; this.state.loading = false; this.changed(); }
		}
	}
	request() {
		const selection = this.readSelection();
		return { source: { provider: selection.provider, model: selection.model }, generate: createGenerator(async () => ({ ...selection, apiKey: await this.context.secrets.get(secretName(selection.provider)) })) };
	}
	dispose(): void { this.disposed = true; this.revision++; this.controller?.abort(); for (const disposable of this.subscriptions) { disposable.dispose(); } }
}

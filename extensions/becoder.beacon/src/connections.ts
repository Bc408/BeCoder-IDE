/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isProvider, normalizeBaseURL, providers, readModelParameters, secretName, updateModelParameters, type Connection, type ConnectionState } from './connection';
import { createGenerator, inspectModel, listModels } from './provider';
import { ModelCapabilityError, readModelSettings, resolveCapabilities, updateModelSettings } from './models';
import type { FileTool, FilePermission, FileRoot } from './fileTools';

export function connectionError(error: unknown): string {
	if (error instanceof ModelCapabilityError) {
		if (error.code === 'non-chat') { return vscode.l10n.t('This model is not a chat model. Select a chat model in Beacon settings.'); }
		if (error.code === 'vision') { return vscode.l10n.t('This conversation contains images. Select a vision-capable model or correct its capabilities in Beacon settings.'); }
		if (error.code === 'output-limit') { return vscode.l10n.t('The maximum output tokens exceed this model\'s limit. Adjust the model parameters.'); }
		return vscode.l10n.t('This model does not support the selected thinking mode. Restore the model default or correct its capabilities.');
	}
	let cause = error;
	for (let depth = 0; depth < 5 && cause && typeof cause === 'object'; depth++) {
		const details = cause as { code?: string; name?: string; cause?: unknown };
		if (details.name === 'TimeoutError' || details.code === 'ETIMEDOUT' || details.code === 'UND_ERR_CONNECT_TIMEOUT') { return vscode.l10n.t('The provider connection timed out. Please retry.'); }
		if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(details.code ?? '')) { return vscode.l10n.t('Could not establish a connection to the provider. Check your network or proxy, then retry.'); }
		cause = details.cause;
	}
	const status = (error as { statusCode?: number })?.statusCode;
	if (status === 401 || status === 403) { return vscode.l10n.t('The provider rejected the API key or access to this model.'); }
	if (status === 402) { return vscode.l10n.t('The provider account has insufficient balance.'); }
	if (status === 429) { return vscode.l10n.t('Too many requests. Please try again later.'); }
	return vscode.l10n.t('Unable to complete the request. Check the service address, model, credentials and connection.');
}

/** User-scoped configuration and provider-specific secrets. Never exposes keys to a Webview. */
export class Connections implements vscode.Disposable {
	private state: ConnectionState = { provider: 'deepseek', baseURL: providers.deepseek.baseURL, model: providers.deepseek.model, parameters: {}, keyConfigured: false, models: [], loading: false, error: '' };
	private revision = 0;
	private controller: AbortController | undefined;
	private mutating = false;
	private disposed = false;
	private readonly subscriptions: vscode.Disposable[];

	constructor(private readonly context: vscode.ExtensionContext, private readonly busy: () => boolean, private readonly changed: () => void) {
		this.subscriptions = [vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('beacon')) { void this.refresh(); } }), context.secrets.onDidChange(event => { if (event.key.startsWith('beacon.') && event.key.endsWith('.apiKey')) { void this.refresh(true); } })];
	}
	get snapshot(): ConnectionState { return structuredClone({ ...this.state, loading: this.state.loading || this.mutating }); }
	get configured(): boolean { return !this.state.loading && !this.mutating && !!this.state.model && (!this.state.capabilities || ['chat', 'unknown'].includes(this.state.capabilities.purpose)) && (this.state.provider === 'ollama' || this.state.keyConfigured) && !this.state.error; }
	private readSelection(): Omit<Connection, 'apiKey'> {
		const config = vscode.workspace.getConfiguration('beacon');
		const selected = config.get('provider', 'deepseek');
		const provider = isProvider(selected) ? selected : 'deepseek';
		const model = config.get<string>(`${provider}.model`, providers[provider].model).trim();
		const baseURL = normalizeBaseURL(config.get(`${provider}.baseURL`, providers[provider].baseURL), provider);
		const modelSettings = readModelSettings(config.get('modelCapabilities', {}), provider, baseURL, model);
		const discovered = this.state.provider === provider && this.state.baseURL === baseURL ? this.state.models.find(item => item.id === model)?.capabilities : undefined;
		return { provider, baseURL, model, parameters: readModelParameters(config.get('modelParameters', {}), provider, model, baseURL), modelSettings, capabilities: resolveCapabilities(provider, baseURL, model, discovered, modelSettings) };
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
			const models = this.state.provider === selection.provider && this.state.baseURL === selection.baseURL ? [...this.state.models] : [];
			if (selection.provider === 'ollama' && selection.model && models.find(item => item.id === selection.model)?.capabilities?.source !== 'service') {
				const controller = new AbortController();
				this.controller = controller;
				const detail = await inspectModel(selection, AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])).catch(() => undefined);
				if (revision !== this.revision || this.disposed) { return; }
				this.controller = undefined;
				if (detail) {
					const index = models.findIndex(item => item.id === selection.model);
					const entry = { id: selection.model, provider: selection.provider, capabilities: detail };
					if (index < 0) { models.push(entry); } else { models[index] = entry; }
					selection.capabilities = resolveCapabilities(selection.provider, selection.baseURL, selection.model, detail, selection.modelSettings);
				}
			}
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
	async updateParameter(field: unknown, value: unknown, expectedProvider: unknown, expectedModel: unknown, expectedURL: unknown): Promise<void> {
		if (this.busy() || this.mutating || expectedProvider !== this.state.provider || expectedModel !== this.state.model || expectedURL !== this.state.baseURL) { return; }
		this.mutating = true; this.changed();
		try {
			const config = vscode.workspace.getConfiguration('beacon');
			const parameters = updateModelParameters(config.get('modelParameters', {}), this.state.provider, this.state.model, field, value, this.state.baseURL);
			await config.update('modelParameters', parameters, vscode.ConfigurationTarget.Global);
			await this.refresh();
		} catch { this.state.error = vscode.l10n.t('Unable to save model parameters. Check the values and try again.'); }
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
			this.state.capabilities = resolveCapabilities(selection.provider, selection.baseURL, selection.model, models.find(item => item.id === selection.model)?.capabilities, selection.modelSettings);
			if (!models.length) { this.state.error = vscode.l10n.t('No models were returned. For Ollama, install a chat model in your Ollama service first.'); }
		} catch (error) {
			if (revision === this.revision && !this.disposed) { this.state.error = connectionError(error); }
		} finally {
			if (revision === this.revision && !this.disposed) { this.controller = undefined; this.state.loading = false; this.changed(); }
		}
	}
	async updateCapability(field: unknown, value: unknown, expectedProvider: unknown, expectedURL: unknown, expectedModel: unknown): Promise<void> {
		if (this.busy() || this.mutating || expectedProvider !== this.state.provider || expectedURL !== this.state.baseURL || expectedModel !== this.state.model) { return; }
		this.mutating = true; this.changed();
		try {
			const config = vscode.workspace.getConfiguration('beacon');
			await config.update('modelCapabilities', updateModelSettings(config.get('modelCapabilities', {}), this.state.provider, this.state.baseURL, this.state.model, field, value), vscode.ConfigurationTarget.Global);
			await this.refresh();
		} catch { this.state.error = vscode.l10n.t('Unable to save model capabilities. Check the values and try again.'); }
		finally { this.mutating = false; this.changed(); }
	}
	request(files: FileTool, permission: FilePermission, roots: FileRoot[], webEnabled: boolean) {
		const selection = this.readSelection();
		return { capabilities: selection.capabilities!, source: { provider: selection.provider, baseURL: selection.baseURL, model: selection.model }, generate: createGenerator(async () => ({ ...selection, apiKey: await this.context.secrets.get(secretName(selection.provider)) }), fetch, permission, roots, webEnabled), files };
	}
	dispose(): void { this.disposed = true; this.revision++; this.controller?.abort(); for (const disposable of this.subscriptions) { disposable.dispose(); } }
}

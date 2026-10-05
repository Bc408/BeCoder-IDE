/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isProvider, normalizeBaseURL, providers, secretName, type Connection, type ConnectionState, type ProviderId } from './connection';
import { createGenerator, inspectModel, listModels } from './provider';
import { ModelCapabilityError, resolveCapabilities } from './models';
import { emptyConfiguration, parseConfiguration, parseModel, validateModel, type ModelConfiguration, type SettingsCommand, type SettingsSnapshot } from './modelConfiguration';
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

/** One connection per provider. Keys never enter a Webview snapshot. */
export class Connections implements vscode.Disposable {
	private data = emptyConfiguration();
	private keys: Partial<Record<ProviderId, string>> = {};
	private revision = 0;
	private refreshing = 0;
	private pending = false;
	private refreshNeeded = false;
	private error = '';
	private cached: { stamp: string; snapshot: ConnectionState } | undefined;
	private disposed = false;
	private readonly controller = new AbortController();
	private readonly subscriptions: vscode.Disposable[];
	constructor(private readonly context: vscode.ExtensionContext, private readonly changed: () => void) {
		this.subscriptions = [vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('beacon.modelConfiguration')) { this.configurationChanged(); }
		}), context.secrets.onDidChange(event => {
			if (Object.keys(providers).some(id => event.key === secretName(id as ProviderId))) { this.configurationChanged(); }
		})];
	}
	private configurationChanged(): void {
		if (this.pending) { this.refreshNeeded = true; } else { void this.refresh(); }
	}
	get settings(): SettingsSnapshot {
		return structuredClone({ ...this.data, revision: this.revision, pending: this.pending || !!this.refreshing, error: this.error, keyConfigured: Object.fromEntries(Object.keys(providers).map(id => [id, !!this.keys[id as ProviderId]])) });
	}
	get snapshot(): ConnectionState {
		const stamp = `${this.revision}:${this.pending}:${this.refreshing}:${this.error}`;
		if (this.cached?.stamp === stamp) { return structuredClone(this.cached.snapshot); }
		const selection = this.data.selection;
		const provider = selection?.provider ?? 'deepseek';
		const profile = this.data.providers[provider];
		const model = profile.models.find(item => item.id === selection?.model);
		const choices = (Object.keys(providers) as ProviderId[]).flatMap(id => this.data.providers[id].models.filter(item => item.enabled && ['chat', 'unknown'].includes(resolveCapabilities(id, this.data.providers[id].baseURL, item.id, item.discovered, item.settings).purpose)).map(item => ({ provider: id, id: item.id, name: item.name })));
		const snapshot = { provider, baseURL: profile.baseURL, model: model?.id ?? '', displayName: model?.name, parameters: model?.parameters ?? {}, modelSettings: model?.settings, capabilities: resolveCapabilities(provider, profile.baseURL, model?.id ?? '', model?.discovered, model?.settings), models: [], choices, revision: this.revision, keyConfigured: !!this.keys[provider], loading: this.pending || !!this.refreshing, error: this.error };
		this.cached = { stamp, snapshot: structuredClone(snapshot) };
		return snapshot;
	}
	get configured(): boolean {
		const selection = this.data.selection;
		if (!selection || this.pending || this.refreshing || this.error) { return false; }
		const state = this.snapshot;
		return this.data.providers[selection.provider].models.some(item => item.id === selection.model && item.enabled) && ['chat', 'unknown'].includes(state.capabilities!.purpose) && (state.provider === 'ollama' || state.keyConfigured);
	}
	async refresh(): Promise<void> {
		const generation = ++this.revision;
		this.refreshing++; this.changed();
		try {
			const data = parseConfiguration(vscode.workspace.getConfiguration('beacon').get('modelConfiguration'));
			const keys = Object.fromEntries(await Promise.all((Object.keys(providers) as ProviderId[]).map(async id => [id, await this.context.secrets.get(secretName(id))])));
			if (generation !== this.revision || this.disposed) { return; }
			this.data = data; this.keys = keys; this.error = '';
		} catch { if (generation === this.revision && !this.disposed) { this.error = vscode.l10n.t('Could not read Beacon model settings. Check the settings document and secret storage.'); } }
		finally { this.refreshing--; this.changed(); }
	}
	private async persist(data: ModelConfiguration): Promise<void> {
		const current = parseConfiguration(vscode.workspace.getConfiguration('beacon').get('modelConfiguration'));
		if (JSON.stringify(current) !== JSON.stringify(this.data)) { await this.refresh(); throw new Error('settings-stale'); }
		await vscode.workspace.getConfiguration('beacon').update('modelConfiguration', data, vscode.ConfigurationTarget.Global);
		this.data = data; this.revision++;
	}
	async apply(value: SettingsCommand): Promise<void> {
		if (this.disposed || this.pending || this.refreshing) { throw new Error('settings-pending'); }
		if (!isProvider(value.provider) || !Number.isSafeInteger(value.revision) || value.revision !== this.revision) { throw new Error('settings-stale'); }
		if (this.error) { throw new Error('settings-unreadable'); }
		this.pending = true; this.changed();
		try {
			const data = structuredClone(this.data);
			const profile = data.providers[value.provider];
			switch (value.type) {
				case 'saveConnection': {
					if (typeof value.baseURL !== 'string' || (value.clearKey !== undefined && typeof value.clearKey !== 'boolean') || (value.key !== undefined && (typeof value.key !== 'string' || value.key.length > 4096)) || (value.clearKey && value.key?.trim())) { throw new Error('invalid-connection'); }
					const baseURL = normalizeBaseURL(value.baseURL, value.provider);
					if (baseURL !== profile.baseURL) { for (const model of profile.models) { delete model.discovered; } }
					profile.baseURL = baseURL;
					const previous = this.keys[value.provider];
					const next = value.clearKey ? undefined : value.key?.trim() || previous;
					const replace = value.clearKey === true || !!value.key?.trim();
					if (replace) { await this.writeKey(value.provider, next); }
					try { await this.persist(data); }
					catch (error) {
						if (replace) { try { await this.writeKey(value.provider, previous); } catch { await this.refresh(); } }
						throw error;
					}
					this.keys[value.provider] = next;
					break;
				}
				case 'saveModel': {
					const model = parseModel(value.model);
					const original = profile.models.find(item => item.id === value.originalId);
					if (value.originalId !== undefined && !original) { throw new Error('settings-stale'); }
					if (profile.models.some(item => item.id === model.id && item !== original)) { throw new Error('duplicate-model'); }
					// Discovery metadata is owned by the host, not by the model form.
					model.discovered = original?.id === model.id ? original.discovered : undefined;
					if (value.provider === 'ollama' && model.discovered?.source !== 'service') {
						model.discovered = await inspectModel({ provider: value.provider, baseURL: profile.baseURL, model: model.id, apiKey: this.keys[value.provider] }, AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)])).catch(() => undefined);
					}
					validateModel(value.provider, profile.baseURL, model);
					if (original) { profile.models[profile.models.indexOf(original)] = model; } else { if (profile.models.length >= 2000) { throw new Error('model-limit'); } profile.models.push(model); }
					if (data.selection?.provider === value.provider && data.selection.model === value.originalId) { data.selection.model = model.id; }
					await this.persist(data); break;
				}
				case 'fetchModels': {
					const models = await listModels({ provider: value.provider, baseURL: profile.baseURL, model: data.selection?.provider === value.provider ? data.selection.model : '', parameters: {}, apiKey: this.keys[value.provider] }, AbortSignal.any([this.controller.signal, AbortSignal.timeout(20000)]));
					if (!models.length) { throw new Error('empty-models'); }
					for (const item of models) {
						const existing = profile.models.find(model => model.id === item.id);
						const discovered = item.capabilities?.source === 'service' ? item.capabilities : undefined;
						if (existing && discovered) { existing.discovered = discovered; }
						else if (existing) { continue; }
						else { profile.models.push({ id: item.id, name: item.id, enabled: ['chat', 'unknown'].includes(item.capabilities?.purpose ?? 'unknown'), parameters: {}, settings: {}, discovered }); }
					}
					if (profile.models.length > 2000) { throw new Error('model-limit'); }
					await this.persist(data); break;
				}
				case 'selectModel': case 'toggleModel': case 'removeModel': {
					const model = profile.models.find(item => item.id === value.id);
					if (!model) { throw new Error('settings-stale'); }
					if (value.type === 'selectModel') {
						if (value.provider === 'ollama' && model.discovered?.source !== 'service') {
							model.discovered = await inspectModel({ provider: value.provider, baseURL: profile.baseURL, model: model.id, apiKey: this.keys[value.provider] }, AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)])).catch(() => undefined);
						}
						if (!model.enabled || !['chat', 'unknown'].includes(resolveCapabilities(value.provider, profile.baseURL, model.id, model.discovered, model.settings).purpose) || (value.provider !== 'ollama' && !this.keys[value.provider])) { throw new Error('model-unavailable'); }
						validateModel(value.provider, profile.baseURL, model);
						data.selection = { provider: value.provider, model: model.id };
					} else if (value.type === 'toggleModel') {
						if (typeof value.enabled !== 'boolean') { throw new Error('invalid-model'); }
						model.enabled = value.enabled;
					} else {
						profile.models.splice(profile.models.indexOf(model), 1);
						if (data.selection?.provider === value.provider && data.selection.model === model.id) { delete data.selection; }
					}
					await this.persist(data); break;
				}
				default: throw new Error('invalid-settings-command');
			}
		} finally {
			this.pending = false;
			if (this.refreshNeeded && !this.disposed) { this.refreshNeeded = false; await this.refresh(); }
			this.changed();
		}
	}
	private async writeKey(provider: ProviderId, key: string | undefined): Promise<void> {
		if (key) { await this.context.secrets.store(secretName(provider), key); } else { await this.context.secrets.delete(secretName(provider)); }
	}
	request(files: FileTool, permission: FilePermission, roots: FileRoot[], webEnabled: boolean) {
		if (!this.configured) { throw new Error('model-unavailable'); }
		const state = this.snapshot;
		const model = this.data.providers[state.provider].models.find(item => item.id === state.model)!;
		validateModel(state.provider, state.baseURL, model);
		const connection: Connection = structuredClone({ provider: state.provider, baseURL: state.baseURL, model: state.model, parameters: state.parameters, capabilities: state.capabilities, modelSettings: state.modelSettings, apiKey: this.keys[state.provider] });
		return { capabilities: connection.capabilities!, source: { provider: connection.provider, baseURL: connection.baseURL, model: connection.model }, generate: createGenerator(async () => connection, fetch, permission, structuredClone(roots), webEnabled), files };
	}
	dispose(): void { this.disposed = true; this.controller.abort(); for (const disposable of this.subscriptions) { disposable.dispose(); } }
}

export function settingsError(error: unknown): string {
	const code = error instanceof Error ? error.message : '';
	if (code === 'settings-stale') { return vscode.l10n.t('Settings changed elsewhere. Your draft is preserved. Cancel and reopen it to use the latest values.'); }
	if (code === 'settings-pending') { return vscode.l10n.t('Another settings operation is running. Wait for it to finish and retry.'); }
	if (code === 'duplicate-model') { return vscode.l10n.t('This provider already has a model with that ID. Edit the existing model instead.'); }
	if (code === 'empty-models') { return vscode.l10n.t('No models were returned. You can add a model manually.'); }
	if (code === 'model-unavailable') { return vscode.l10n.t('This model is unavailable. Enable a chat model and save its provider connection first.'); }
	if (['invalid-model', 'invalid-model-parameter', 'invalid-model-capability', 'invalid-model-settings', 'invalid-thinking', 'invalid-effort', 'output-limit', 'unsupported-sampling', 'invalid-connection', 'invalid-url'].includes(code) || error instanceof TypeError) { return vscode.l10n.t('Check the address, model ID, capabilities and parameter ranges. Use model defaults for unsupported parameters.'); }
	return connectionError(error);
}

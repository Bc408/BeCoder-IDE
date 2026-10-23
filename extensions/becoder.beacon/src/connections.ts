/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { isProvider, normalizeBaseURL, providers, secretName, type Connection, type ConnectionState, type ProviderId } from './connection';
import { createGenerator, listModels, testModelConnection } from './provider';
import { ProviderTests } from './providerTests';
import { ModelCapabilityError, resolveCapabilities } from './models';
import { modelParameterIssues, replaceDiscoveredModels, emptyConfiguration, parseConfiguration, parseModel, validateModel, type ModelDiscovery, type ModelConfiguration, type SettingsCommand, type SettingsSnapshot } from './modelConfiguration';
import type { FileTool, FilePermission, FileRoot } from './fileTools';
import { RequestRecoveryError, RequestRejectedError, type RequestDiagnostic } from './requestRecovery';

export function connectionError(error: unknown): string {
	if (error instanceof RequestRejectedError) {
		if (error.code === 'QUOTA_EXHAUSTED') { return vscode.l10n.t('The provider account has insufficient balance.'); }
		if (error.code === 'AUTHENTICATION') { return vscode.l10n.t('The provider rejected the API key or access to this model.'); }
		return vscode.l10n.t('Unable to complete the request. Check the service address, model, credentials and connection.');
	}
	if (error instanceof RequestRecoveryError) {
		const text = error.failure.kind === 'rate-limit' ? vscode.l10n.t('Too many requests. Please try again later.') : error.failure.kind === 'timeout' ? vscode.l10n.t('The provider connection timed out. Please retry.') : vscode.l10n.t('The provider is temporarily unreachable. Please retry.');
		return error.failure.retries ? `${text} ${vscode.l10n.t('Automatic reconnection was attempted {0} times.', error.failure.retries)}` : text;
	}
	const parameterCode = error instanceof Error ? error.message : '';
	if (['invalid-thinking', 'invalid-effort', 'output-limit', 'unsupported-sampling'].includes(parameterCode)) { return vscode.l10n.t('The saved generation parameters conflict with the current model capabilities. Adjust them in Beacon settings.'); }
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
	private readonly tests = new ProviderTests(testModelConnection, () => this.changed(), connectionError);
	get testing(): boolean { return this.tests.running; }
	closeSettings(): void { this.tests.cancel(); this.cancelDiscovery(); }
	private data = emptyConfiguration();
	private discovery: ModelDiscovery | undefined;
	private discoveryJob: AbortController | undefined;
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
	constructor(private readonly context: vscode.ExtensionContext, private readonly changed: () => void, private readonly diagnostic?: (event: RequestDiagnostic & { provider: ProviderId }) => void) {
		this.subscriptions = [vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('beacon.modelConfiguration')) { this.configurationChanged(); }
		}), context.secrets.onDidChange(event => {
			if (Object.keys(providers).some(id => event.key === secretName(id as ProviderId))) { this.configurationChanged(); }
		})];
	}
	private configurationChanged(): void {
		this.tests.clear();
		this.cancelDiscovery();
		if (this.pending) { this.refreshNeeded = true; } else { void this.refresh(); }
	}
	get settings(): SettingsSnapshot {
		const providerIds = Object.keys(providers) as ProviderId[];
		return structuredClone({
			...this.data,
			providers: Object.fromEntries(providerIds.map(id => [id, { ...this.data.providers[id], enabled: this.enabled(id) }])) as ModelConfiguration['providers'],
			providerTest: this.tests.snapshot, discovery: this.discovery,
			parameterIssues: Object.fromEntries(providerIds.map(id => [id, Object.fromEntries(this.data.providers[id].models.map(model => [model.id, modelParameterIssues(id, this.data.providers[id].baseURL, model)]))])),
			revision: this.revision, pending: this.pending || !!this.refreshing, error: this.error,
			keyConfigured: Object.fromEntries(providerIds.map(id => [id, !!this.keys[id]])),
			keyPreview: Object.fromEntries(providerIds.map(id => { const key = this.keys[id]; return [id, key && key.length > 12 ? key.slice(0, 2) + '••••••' + key.slice(-4) : '••••••••']; }))
		});
	}
	get snapshot(): ConnectionState {
		const stamp = `${this.revision}:${this.pending}:${this.refreshing}:${this.error}`;
		if (this.cached?.stamp === stamp) { return structuredClone(this.cached.snapshot); }
		const selection = this.data.selection;
		const provider = selection?.provider ?? 'deepseek';
		const profile = this.data.providers[provider];
		const model = profile.models.find(item => item.id === selection?.model);
		const choices = (Object.keys(providers) as ProviderId[]).flatMap(id => this.enabled(id) ? this.data.providers[id].models.filter(item => item.enabled !== false && ['chat', 'unknown'].includes(resolveCapabilities(id, this.data.providers[id].baseURL, item.id, item.discovered, item.settings).purpose)).map(item => ({ provider: id, id: item.id, name: item.name })) : []);
		const snapshot = { provider, baseURL: profile.baseURL, model: model?.id ?? '', displayName: model?.name, parameters: model?.parameters ?? {}, modelSettings: model?.settings, capabilities: resolveCapabilities(provider, profile.baseURL, model?.id ?? '', model?.discovered, model?.settings), choices, revision: this.revision, keyConfigured: !!this.keys[provider], loading: this.pending || !!this.refreshing, error: this.error };
		this.cached = { stamp, snapshot: structuredClone(snapshot) };
		return snapshot;
	}
	get configured(): boolean {
		const selection = this.data.selection;
		if (!selection || this.pending || this.refreshing || this.error) { return false; }
		const state = this.snapshot;
		return this.enabled(selection.provider) && this.data.providers[selection.provider].models.some(item => item.id === selection.model && item.enabled !== false) && ['chat', 'unknown'].includes(state.capabilities!.purpose) && (state.provider === 'ollama' || state.keyConfigured);
	}
	enabled(provider: ProviderId): boolean { return this.data.providers[provider].enabled ?? (this.data.selection?.provider === provider); }
	async accessKey(action: 'copy' | 'reveal', revision: number, provider: ProviderId): Promise<string | undefined> {
		if (this.disposed || this.pending || this.refreshing || this.testing) { throw new Error('settings-pending'); }
		if (!isProvider(provider) || revision !== this.revision || this.error) { throw new Error('settings-stale'); }
		const key = await this.context.secrets.get(secretName(provider));
		if (this.disposed || revision !== this.revision || key !== this.keys[provider]) { throw new Error('settings-stale'); }
		if (action === 'copy') { await vscode.env.clipboard.writeText(key ?? ''); return; }
		return key ?? '';
	}
	cancelDiscovery(id?: string): void {
		if (id && this.discovery?.id !== id) { return; }
		this.discoveryJob?.abort(); this.discoveryJob = undefined; this.discovery = undefined;
	}
	async refresh(): Promise<void> {
		this.cancelDiscovery();
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
		this.tests.clear();
		const current = parseConfiguration(vscode.workspace.getConfiguration('beacon').get('modelConfiguration'));
		if (JSON.stringify(current) !== JSON.stringify(this.data)) { await this.refresh(); throw new Error('settings-stale'); }
		await vscode.workspace.getConfiguration('beacon').update('modelConfiguration', data, vscode.ConfigurationTarget.Global);
		this.data = data; this.revision++;
	}
	async apply(value: SettingsCommand): Promise<void> {
		if (value.type === 'cancelProviderTest') { this.tests.cancel(value.testId); return; }
		if (value.type === 'cancelDiscovery') { this.cancelDiscovery(value.discoveryId); this.changed(); return; }
		if (this.disposed || this.pending || this.refreshing || this.testing) { throw new Error('settings-pending'); }
		if (!isProvider(value.provider) || !Number.isSafeInteger(value.revision) || value.revision !== this.revision) { throw new Error('settings-stale'); }
		if (this.error) { throw new Error('settings-unreadable'); }
		if (value.type === 'testProvider') {
			const profile = this.data.providers[value.provider];
			if (!profile.models.length || (value.provider !== 'ollama' && !this.keys[value.provider])) { throw new Error('model-unavailable'); }
			await this.tests.start(profile.models.map(model => ({ provider: value.provider, baseURL: profile.baseURL, model: model.id, apiKey: this.keys[value.provider], parameters: {} })), this.revision); return;
		}
		this.pending = true; this.changed();
		try {
			const data = structuredClone(this.data);
			const profile = data.providers[value.provider];
			if (profile.enabled === undefined && this.enabled(value.provider)) { profile.enabled = true; }
			switch (value.type) {
				case 'saveKey': {
					if ((value.clearKey !== undefined && typeof value.clearKey !== 'boolean') || (value.clearKey ? value.key !== undefined : typeof value.key !== 'string' || !value.key.trim() || value.key.length > 4096)) { throw new Error('invalid-connection'); }
					await this.writeKey(value.provider, value.clearKey ? undefined : value.key!.trim());
					this.keys[value.provider] = value.clearKey ? undefined : value.key!.trim();
					this.tests.clear(); this.cancelDiscovery(); this.revision++;
					break;
				}
				case 'saveConnection': {
					if (typeof value.baseURL !== 'string' || (value.clearKey !== undefined && typeof value.clearKey !== 'boolean') || (value.key !== undefined && (typeof value.key !== 'string' || value.key.length > 4096)) || (value.clearKey && value.key?.trim())) { throw new Error('invalid-connection'); }
					const baseURL = normalizeBaseURL(value.baseURL, value.provider);
					if (baseURL !== profile.baseURL) { for (const model of profile.models) { delete model.discovered; delete model.settings.overrides; } }
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

					validateModel(value.provider, profile.baseURL, model);
					if (original && original.id !== model.id) { throw new Error('invalid-model'); }
					if (original) { profile.models[profile.models.indexOf(original)] = model; } else { if (profile.models.length >= 2000) { throw new Error('model-limit'); } profile.models.push(model); }
					this.clearInvalidSelection(data, value.provider);
					await this.persist(data); break;
				}
				case 'fetchModels': {
					this.cancelDiscovery();
					const job = new AbortController(); this.discoveryJob = job;
					const revision = this.revision;
					try {
						const models = await listModels({ provider: value.provider, baseURL: profile.baseURL, model: '', parameters: {}, apiKey: this.keys[value.provider] }, AbortSignal.any([this.controller.signal, job.signal, AbortSignal.timeout(20000)]));
						if (job.signal.aborted || this.disposed || revision !== this.revision || this.refreshNeeded) { throw new Error('settings-stale'); }
						this.discovery = { id: randomUUID(), revision, provider: value.provider, models };
					} catch (error) {
						if (job.signal.aborted || this.disposed || revision !== this.revision || this.refreshNeeded) { throw new Error('settings-stale'); }
						throw error;
					} finally { if (this.discoveryJob === job) { this.discoveryJob = undefined; } }
					break;
				}
				case 'confirmModels': {
					const candidate = this.discovery;
					if (!candidate || candidate.provider !== value.provider || candidate.id !== value.discoveryId || candidate.revision !== this.revision || !Array.isArray(value.ids) || value.ids.some(id => typeof id !== 'string')) { throw new Error('settings-stale'); }
					data.providers[value.provider] = replaceDiscoveredModels(profile, candidate.models, value.ids);
					this.clearInvalidSelection(data, value.provider);
					await this.persist(data); this.discovery = undefined; break;
				}
				case 'toggleProvider': {
					if (typeof value.enabled !== 'boolean') { throw new Error('invalid-model'); }
					profile.enabled = value.enabled;
					if (!value.enabled && data.selection?.provider === value.provider) { delete data.selection; }
					await this.persist(data); break;
				}
				case 'selectModel': case 'removeModel': {
					const model = profile.models.find(item => item.id === value.id);
					if (!model) { throw new Error('settings-stale'); }
					if (value.type === 'selectModel') {
						if (!this.enabled(value.provider) || model.enabled === false || !['chat', 'unknown'].includes(resolveCapabilities(value.provider, profile.baseURL, model.id, model.discovered, model.settings).purpose) || (value.provider !== 'ollama' && !this.keys[value.provider])) { throw new Error('model-unavailable'); }
						if (data.selection && data.providers[data.selection.provider].enabled === undefined) { data.providers[data.selection.provider].enabled = true; }
						data.selection = { provider: value.provider, model: model.id };
					} else { profile.models.splice(profile.models.indexOf(model), 1); this.clearInvalidSelection(data, value.provider); }
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
	private clearInvalidSelection(data: ModelConfiguration, provider: ProviderId): void {
		if (!data.selection || data.selection.provider !== provider) { return; }
		const profile = data.providers[provider];
		const model = profile.models.find(item => item.id === data.selection!.model);
		if (profile.enabled === false || !model || model.enabled === false || !['chat', 'unknown'].includes(resolveCapabilities(provider, profile.baseURL, model.id, model.discovered, model.settings).purpose)) { delete data.selection; }
	}
	private async writeKey(provider: ProviderId, key: string | undefined): Promise<void> {
		if (key) { await this.context.secrets.store(secretName(provider), key); } else { await this.context.secrets.delete(secretName(provider)); }
	}
	request(files: FileTool, permission: FilePermission, roots: FileRoot[], webEnabled: boolean, context?: import('./contextTools').ContextAccess, notebooks?: import('./notebookTools').NotebookAccess) {
		if (this.testing) { throw new Error('settings-pending'); }
		if (!this.configured) { throw new Error('model-unavailable'); }
		const state = this.snapshot;
		const model = this.data.providers[state.provider].models.find(item => item.id === state.model)!;
		validateModel(state.provider, state.baseURL, model);
		const connection: Connection = structuredClone({ provider: state.provider, baseURL: state.baseURL, model: state.model, parameters: state.parameters, capabilities: state.capabilities, modelSettings: state.modelSettings, apiKey: this.keys[state.provider] });
		return { capabilities: connection.capabilities!, source: { provider: connection.provider, baseURL: connection.baseURL, model: connection.model }, generate: createGenerator(async () => connection, fetch, permission, structuredClone(roots), webEnabled, fetch, { diagnostic: event => this.diagnostic?.({ ...event, provider: connection.provider }) }, context, notebooks), files };
	}
	dispose(): void { this.disposed = true; this.tests.dispose(); this.controller.abort(); this.cancelDiscovery(); for (const disposable of this.subscriptions) { disposable.dispose(); } }
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

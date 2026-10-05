/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { isProvider, normalizeBaseURL, providers, validParameter, type ModelParameters, type ModelParameterName, type ProviderId } from './connection';
import { parseModelSettings, resolveCapabilities, serviceCapabilities, type ModelCapabilities, type ModelSettings } from './models';

export interface ConfiguredModel {
	id: string;
	name: string;
	enabled: boolean;
	parameters: ModelParameters;
	settings: ModelSettings;
	discovered?: ModelCapabilities;
}
export interface ProviderConfiguration { baseURL: string; models: ConfiguredModel[] }
export interface ModelConfiguration {
	selection?: { provider: ProviderId; model: string };
	providers: Record<ProviderId, ProviderConfiguration>;
}
export interface SettingsSnapshot extends ModelConfiguration {
	revision: number;
	keyConfigured: Partial<Record<ProviderId, boolean>>;
	pending: boolean;
	error: string;
}
export interface SettingsCommand {
	type: 'saveConnection' | 'saveModel' | 'removeModel' | 'fetchModels' | 'selectModel' | 'toggleModel';
	requestId: number;
	revision: number;
	provider: ProviderId;
	baseURL?: string;
	key?: string;
	clearKey?: boolean;
	model?: unknown;
	originalId?: string;
	id?: string;
	enabled?: boolean;
}
export interface SettingsResult { type: 'settingsResult'; requestId: number; ok: boolean; error?: string }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function emptyConfiguration(): ModelConfiguration {
	const profile = (id: ProviderId): ProviderConfiguration => ({ baseURL: providers[id].baseURL, models: [] });
	return { providers: { deepseek: profile('deepseek'), bailian: profile('bailian'), moonshot: profile('moonshot'), ollama: profile('ollama') } };
}
export function parseModel(value: unknown): ConfiguredModel {
	if (!record(value) || typeof value.id !== 'string' || !value.id.trim() || value.id.trim().length > 256 || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 120 || typeof value.enabled !== 'boolean' || !record(value.parameters)) { throw new Error('invalid-model'); }
	const parameters: ModelParameters = {};
	for (const [field, parameter] of Object.entries(value.parameters)) {
		if (!['temperature', 'topP', 'maxOutputTokens'].includes(field) || !validParameter(field as ModelParameterName, parameter)) { throw new Error('invalid-model-parameter'); }
		parameters[field as ModelParameterName] = parameter as number;
	}
	return { id: value.id.trim(), name: value.name.trim(), enabled: value.enabled, parameters, settings: parseModelSettings(value.settings), ...(value.discovered ? { discovered: serviceCapabilities(value.discovered) } : {}) };
}
/** This is a fresh document format. Old configuration keys are intentionally never read. */
export function parseConfiguration(value: unknown): ModelConfiguration {
	if (value === undefined) { return emptyConfiguration(); }
	if (!record(value) || !record(value.providers)) { throw new Error('invalid-configuration'); }
	const result = emptyConfiguration();
	for (const id of Object.keys(providers) as ProviderId[]) {
		const stored = value.providers[id];
		if (!record(stored) || typeof stored.baseURL !== 'string' || !Array.isArray(stored.models) || stored.models.length > 2000) { throw new Error('invalid-configuration'); }
		const models = stored.models.map(parseModel);
		if (new Set(models.map(model => model.id)).size !== models.length) { throw new Error('duplicate-model'); }
		result.providers[id] = { baseURL: normalizeBaseURL(stored.baseURL, id), models };
	}
	if (value.selection !== undefined) {
		if (!record(value.selection) || !isProvider(value.selection.provider) || typeof value.selection.model !== 'string') { throw new Error('invalid-selection'); }
		result.selection = { provider: value.selection.provider, model: value.selection.model };
	}
	return result;
}

/** The UI and host share the same adapter restrictions; unsupported fields never reach a request. */
export function parameterPolicy(provider: ProviderId, model: string, capabilities: ModelCapabilities, settings: ModelSettings) {
	const fixedThinking = capabilities.reasoning === 'supported' && (/-thinking($|-)/.test(model) || model === 'deepseek-reasoner');
	const thinking = capabilities.reasoning === 'supported';
	const efforts: NonNullable<ModelSettings['effort']>[] = provider === 'deepseek' && thinking && /^deepseek-(flash|pro|v4)/.test(model) ? ['low', 'high', 'max'] : [];
	// The installed DeepSeek adapter applies these defaults by ID even on custom endpoints.
	const defaultThinking = model === 'deepseek-reasoner' || model.includes('deepseek-v4') || model.startsWith('deepseek-flash') || model.startsWith('deepseek-pro');
	const sampling = !(provider === 'deepseek' && settings.thinking !== 'disabled' && (settings.thinking === 'enabled' || defaultThinking));
	return { thinking, fixedThinking, efforts, sampling, outputMaximum: Math.min(131072, capabilities.maxOutputTokens ?? 131072) };
}
export function validateModel(provider: ProviderId, baseURL: string, model: ConfiguredModel): void {
	const capabilities = resolveCapabilities(provider, baseURL, model.id, model.discovered, model.settings);
	const policy = parameterPolicy(provider, model.id, capabilities, model.settings);
	if (model.settings.thinking && (!policy.thinking || (policy.fixedThinking && model.settings.thinking === 'disabled'))) { throw new Error('invalid-thinking'); }
	if (model.settings.effort && (!policy.efforts.includes(model.settings.effort) || model.settings.thinking === 'disabled')) { throw new Error('invalid-effort'); }
	if (!policy.sampling && (model.parameters.temperature !== undefined || model.parameters.topP !== undefined)) { throw new Error('unsupported-sampling'); }
	if (model.parameters.maxOutputTokens !== undefined && model.parameters.maxOutputTokens > policy.outputMaximum) { throw new Error('output-limit'); }
}

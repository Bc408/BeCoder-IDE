/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { isProvider, normalizeBaseURL, providers, validParameter, type ModelParameters, type ModelParameterName, type ProviderId, type ModelInfo } from './connection';
import type { ProviderTestSnapshot } from './providerTests';
import { parseModelSettings, resolveCapabilities, serviceCapabilities, type ModelCapabilities, type ModelSettings } from './models';

export interface ConfiguredModel {
	id: string;
	name: string;
	enabled?: boolean;
	parameters: ModelParameters;
	settings: ModelSettings;
	discovered?: ModelCapabilities;
}
export interface ProviderConfiguration { baseURL: string; models: ConfiguredModel[]; enabled?: boolean }
export interface ModelConfiguration {
	selection?: { provider: ProviderId; model: string };
	providers: Record<ProviderId, ProviderConfiguration>;
}
export interface SettingsSnapshot extends ModelConfiguration {
	discovery?: ModelDiscovery;
	providerTest?: ProviderTestSnapshot;
	supplierEnabled?: boolean;
	parameterIssues?: Record<string, ParameterIssue[]>;
	revision: number;
	keyConfigured: Partial<Record<ProviderId, boolean>>;
	pending: boolean;
	error: string;
}
export interface SettingsCommand {
	type: 'saveConnection' | 'saveModel' | 'removeModel' | 'fetchModels' | 'selectModel' | 'toggleProvider' | 'confirmModels' | 'cancelDiscovery' | 'testProvider' | 'cancelProviderTest';
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
	discoveryId?: string;
	ids?: string[];
	testId?: string;
}
export interface ModelDiscovery { id: string; revision: number; provider: ProviderId; models: ModelInfo[] }
export interface SettingsResult { type: 'settingsResult'; requestId: number; ok: boolean; error?: string }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function emptyConfiguration(): ModelConfiguration {
	const profile = (id: ProviderId): ProviderConfiguration => ({ baseURL: providers[id].baseURL, models: [] });
	return { providers: { deepseek: profile('deepseek'), bailian: profile('bailian'), moonshot: profile('moonshot'), ollama: profile('ollama') } };
}
export function parseModel(value: unknown): ConfiguredModel {
	if (!record(value) || typeof value.id !== 'string' || !value.id.trim() || value.id.trim().length > 256 || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 120 || (value.enabled !== undefined && typeof value.enabled !== 'boolean') || !record(value.parameters)) { throw new Error('invalid-model'); }
	const parameters: ModelParameters = {};
	for (const [field, parameter] of Object.entries(value.parameters)) {
		if (!['temperature', 'topP', 'maxOutputTokens'].includes(field) || !validParameter(field as ModelParameterName, parameter)) { throw new Error('invalid-model-parameter'); }
		parameters[field as ModelParameterName] = parameter as number;
	}
	return { id: value.id.trim(), name: value.name.trim(), enabled: value.enabled, parameters, settings: parseModelSettings(value.settings), ...(value.discovered && (value.discovered as ModelCapabilities).source !== 'catalog' ? { discovered: serviceCapabilities(value.discovered) } : {}) };
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
		if (stored.enabled !== undefined && typeof stored.enabled !== 'boolean') { throw new Error('invalid-configuration'); }
		result.providers[id] = { baseURL: normalizeBaseURL(stored.baseURL, id), models, ...(stored.enabled !== undefined ? { enabled: stored.enabled as boolean } : {}) };
	}
	if (value.selection !== undefined) {
		if (!record(value.selection) || !isProvider(value.selection.provider) || typeof value.selection.model !== 'string') { throw new Error('invalid-selection'); }
		result.selection = { provider: value.selection.provider, model: value.selection.model };
	}
	return result;
}

export interface ParameterIssue {
	field: 'temperature' | 'topP' | 'maxOutputTokens' | 'thinking' | 'effort';
	code: 'unsupported' | 'exceeds-limit' | 'unknown-support';
}

export function replaceDiscoveredModels(current: ProviderConfiguration, candidates: ModelInfo[], ids: string[]): ProviderConfiguration {
	if (new Set(ids).size !== ids.length || ids.some(id => !candidates.some(item => item.id === id))) { throw new Error('invalid-model'); }
	return { ...current, ...(current.enabled === undefined && ids.length ? { enabled: true } : {}), models: ids.map(id => {
		const candidate = candidates.find(item => item.id === id)!;
		const old = current.models.find(item => item.id === id);
		const settings = { ...old?.settings }; delete settings.overrides;
		return { id, name: old?.name ?? candidate.name ?? id, parameters: { ...old?.parameters }, settings, discovered: candidate.capabilities };
	}) };
}

/** SDK sampling defaults are transport constraints, never capability declarations. */
export function parameterPolicy(provider: ProviderId, model: string, capabilities: ModelCapabilities, settings: ModelSettings) {
	const defaultThinking = model === 'deepseek-reasoner' || model.includes('deepseek-v4') || model.startsWith('deepseek-flash') || model.startsWith('deepseek-pro');
	const sampling = !(provider === 'deepseek' && settings.thinking !== 'disabled' && (settings.thinking === 'enabled' || defaultThinking));
	return { thinking: capabilities.reasoning === 'supported', fixedThinking: false, efforts: provider === 'deepseek' ? capabilities.reasoningEfforts ?? [] : [], sampling, outputMaximum: capabilities.maxOutputTokens ?? 10000000 };
}
export function modelParameterIssues(provider: ProviderId, baseURL: string, model: ConfiguredModel): ParameterIssue[] {
	const capabilities = resolveCapabilities(provider, baseURL, model.id, model.discovered, model.settings);
	const policy = parameterPolicy(provider, model.id, capabilities, model.settings);
	const issues: ParameterIssue[] = [];
	if (model.settings.thinking && !policy.thinking) { issues.push({ field: 'thinking', code: capabilities.reasoning === 'unknown' ? 'unknown-support' : 'unsupported' }); }
	if (model.settings.effort && (!policy.efforts.includes(model.settings.effort) || model.settings.thinking === 'disabled' || !policy.thinking)) { issues.push({ field: 'effort', code: 'unsupported' }); }
	for (const field of ['temperature', 'topP'] as const) { if (!policy.sampling && model.parameters[field] !== undefined) { issues.push({ field, code: 'unsupported' }); } }
	if (model.parameters.maxOutputTokens !== undefined && model.parameters.maxOutputTokens > policy.outputMaximum) { issues.push({ field: 'maxOutputTokens', code: 'exceeds-limit' }); }
	return issues;
}
export function validateModel(provider: ProviderId, baseURL: string, model: ConfiguredModel): void {
	const issue = modelParameterIssues(provider, baseURL, model)[0];
	if (issue) { throw new Error(issue.field === 'thinking' ? 'invalid-thinking' : issue.field === 'effort' ? 'invalid-effort' : issue.field === 'maxOutputTokens' ? 'output-limit' : 'unsupported-sampling'); }
}

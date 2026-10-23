/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { ProviderId } from './connection';
import type { ProviderMetadata } from 'ai';

export type DeepSeekEffort = 'low' | 'high' | 'max';
export type ModelPurpose = 'chat' | 'embedding' | 'rerank' | 'image' | 'unknown';
export interface ModelCapabilities {
	purpose: ModelPurpose;
	vision: boolean;
	reasoning: boolean;
	tools: boolean;
	contextWindow?: number;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	reasoningEfforts?: DeepSeekEffort[];
	source: 'default' | 'catalog' | 'service' | 'manual';
}
export interface ModelSettings {
	overrides?: Partial<Omit<ModelCapabilities, 'source'>>;
	thinking?: 'enabled' | 'disabled';
	effort?: 'low' | 'high' | 'max';
}
export const defaultCapabilities: ModelCapabilities = { purpose: 'chat', vision: true, reasoning: true, tools: true, source: 'default' };
const capacityDefaults = { contextWindow: 32768, maxInputTokens: 24576, maxOutputTokens: 8192 };
const supportFields = ['vision', 'reasoning', 'tools'] as const;
const normalizeSupport = (value: unknown): boolean => value !== false && value !== 'unsupported';
const purposes: ModelPurpose[] = ['chat', 'embedding', 'rerank', 'image', 'unknown'];
const capabilityFields = ['purpose', 'vision', 'reasoning', 'tools', 'contextWindow', 'maxInputTokens', 'maxOutputTokens', 'reasoningEfforts'] as const;
export type CapabilityField = typeof capabilityFields[number];

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function validCapability(field: CapabilityField, value: unknown): boolean {
	if (field === 'reasoningEfforts') { return Array.isArray(value) && value.every(item => ['low', 'high', 'max'].includes(item)); }
	if (field === 'purpose') { return purposes.includes(value as ModelPurpose); }
	if (field === 'contextWindow' || field === 'maxInputTokens' || field === 'maxOutputTokens') { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 10000000; }
	return typeof value === 'boolean' || ['supported', 'unsupported', 'unknown'].includes(value as string);
}

export function parseModelSettings(stored: unknown): ModelSettings {
	if (!record(stored)) { throw new Error('invalid-model-settings'); }
	const result: ModelSettings = {};
	if (stored.overrides !== undefined) {
		if (!record(stored.overrides) || Object.keys(stored.overrides).some(field => !capabilityFields.includes(field as CapabilityField) || !validCapability(field as CapabilityField, (stored.overrides as Record<string, unknown>)[field]))) { throw new Error('invalid-model-capability'); }
		result.overrides = Object.fromEntries(Object.entries(stored.overrides).map(([field, value]) => [field, supportFields.includes(field as typeof supportFields[number]) ? normalizeSupport(value) : value]));
	}
	if (stored.thinking !== undefined) {
		if (stored.thinking !== 'enabled' && stored.thinking !== 'disabled') { throw new Error('invalid-thinking'); }
		result.thinking = stored.thinking;
	}
	if (stored.effort !== undefined) {
		if (!['low', 'high', 'max'].includes(stored.effort as string)) { throw new Error('invalid-effort'); }
		result.effort = stored.effort as ModelSettings['effort'];
	}
	return result;
}

export function resolveCapabilities(_provider: ProviderId, _baseURL: string, _model: string, discovered?: ModelCapabilities, settings: ModelSettings = {}): ModelCapabilities {
	const defaults = discovered?.source === 'catalog' ? { ...defaultCapabilities } : discovered ?? { ...defaultCapabilities };
	const merged = { ...defaults, ...settings.overrides };
	const contextWindow = merged.contextWindow ?? Math.max(capacityDefaults.contextWindow, merged.maxInputTokens ?? 0, merged.maxOutputTokens ?? 0);
	return { ...merged, vision: normalizeSupport(merged.vision), reasoning: normalizeSupport(merged.reasoning), tools: normalizeSupport(merged.tools), contextWindow, maxInputTokens: merged.maxInputTokens ?? Math.min(capacityDefaults.maxInputTokens, contextWindow), maxOutputTokens: merged.maxOutputTokens ?? Math.min(capacityDefaults.maxOutputTokens, contextWindow), source: settings.overrides && Object.keys(settings.overrides).length ? 'manual' : defaults.source };
}

/** Read only explicit service metadata; do not infer capabilities from an arbitrary model name. */
export function serviceCapabilities(value: unknown, completeCapabilityList = false): ModelCapabilities | undefined {
	if (!record(value)) { return; }
	const result = { ...defaultCapabilities, source: 'service' as const };
	let found = false;
	for (const field of capabilityFields) {
		if (validCapability(field, value[field])) { Object.assign(result, { [field]: supportFields.includes(field as typeof supportFields[number]) ? normalizeSupport(value[field]) : value[field] }); found = true; }
	}
	const caps = value.capabilities;
	if (Array.isArray(caps) && caps.every(item => typeof item === 'string')) {
		result.purpose = caps.includes('embedding') || caps.includes('TR') || caps.includes('ME') ? 'embedding' : caps.includes('rerank') ? 'rerank' : result.purpose;
		if (value.vision === undefined && (completeCapabilityList || caps.includes('vision') || caps.includes('VU'))) { result.vision = caps.includes('vision') || caps.includes('VU'); }
		if (value.reasoning === undefined && (completeCapabilityList || caps.includes('thinking') || caps.includes('Reasoning'))) { result.reasoning = caps.includes('thinking') || caps.includes('Reasoning'); }
		if (value.tools === undefined && (completeCapabilityList || caps.includes('tools'))) { result.tools = caps.includes('tools'); }
		found = true;
	}
	const info = record(value.model_info) ? value.model_info : {};
	for (const [key, field] of [['context_window', 'contextWindow'], ['max_input_tokens', 'maxInputTokens'], ['max_output_tokens', 'maxOutputTokens']] as const) {
		const capacity = value[key] ?? info[key];
		if (validCapability(field, capacity)) { Object.assign(result, { [field]: capacity }); found = true; }
	}
	const modalities = record(value.inference_metadata) ? value.inference_metadata : {};
	const input = value.input_modalities ?? modalities.request_modality;
	const output = value.output_modalities ?? modalities.response_modality;
	if (Array.isArray(input) && input.every(item => typeof item === 'string')) { result.vision = input.some(item => item.toLowerCase() === 'image'); found = true; }
	if (Array.isArray(output) && output.every(item => typeof item === 'string') && !output.some(item => item.toLowerCase() === 'text')) { result.purpose = 'image'; found = true; }
	if (value.tools === undefined && Array.isArray(value.features) && value.features.includes('function-calling')) { result.tools = true; found = true; }
	return found ? result : undefined;
}

export class ModelCapabilityError extends Error {
	constructor(readonly code: 'non-chat' | 'vision' | 'output-limit' | 'thinking') { super(code); }
}

export function reasoningOptions(provider: ProviderId, _model: string, capabilities: ModelCapabilities, settings: ModelSettings): ProviderMetadata {
	if (settings.thinking === 'enabled' && !capabilities.reasoning) { throw new ModelCapabilityError('thinking'); }
	if (!capabilities.reasoning) {
		if (provider === 'bailian') { return { bailian: { enable_thinking: false } }; }
		if (provider === 'ollama') { return { ollama: { reasoningEffort: 'none' } }; }
		return { [provider]: { thinking: { type: 'disabled' } } };
	}
	if (provider === 'deepseek') {
		return { deepseek: { ...(settings.thinking ? { thinking: { type: settings.thinking } } : {}), ...(settings.effort ? { reasoningEffort: settings.effort } : {}) } };
	}
	if (provider === 'bailian') { return { bailian: settings.thinking ? { enable_thinking: settings.thinking === 'enabled' } : {} }; }
	if (provider === 'moonshot') { return { moonshot: settings.thinking ? { thinking: { type: settings.thinking } } : {} }; }
	// Ollama's OpenAI-compatible endpoint exposes reasoning_effort, not the native /api/chat think field.
	return { ollama: settings.thinking ? { reasoningEffort: settings.thinking === 'enabled' ? 'high' : 'none' } : {} };
}

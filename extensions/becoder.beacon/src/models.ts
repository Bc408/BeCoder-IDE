/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { ProviderId } from './connection';
import type { ProviderMetadata } from 'ai';

export type DeepSeekEffort = 'low' | 'high' | 'max';
export type Support = 'supported' | 'unsupported' | 'unknown';
export type ModelPurpose = 'chat' | 'embedding' | 'rerank' | 'image' | 'unknown';
export interface ModelCapabilities {
	purpose: ModelPurpose;
	vision: Support;
	reasoning: Support;
	tools: Support;
	contextWindow?: number;
	maxOutputTokens?: number;
	reasoningEfforts?: DeepSeekEffort[];
	source: 'unknown' | 'catalog' | 'service' | 'manual';
}
export interface ModelSettings {
	overrides?: Partial<Omit<ModelCapabilities, 'source'>>;
	thinking?: 'enabled' | 'disabled';
	effort?: 'low' | 'high' | 'max';
}
export const unknownCapabilities: ModelCapabilities = { purpose: 'unknown', vision: 'unknown', reasoning: 'unknown', tools: 'unknown', source: 'unknown' };
const supports: Support[] = ['supported', 'unsupported', 'unknown'];
const purposes: ModelPurpose[] = ['chat', 'embedding', 'rerank', 'image', 'unknown'];
const capabilityFields = ['purpose', 'vision', 'reasoning', 'tools', 'contextWindow', 'maxOutputTokens', 'reasoningEfforts'] as const;
export type CapabilityField = typeof capabilityFields[number];

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function validCapability(field: CapabilityField, value: unknown): boolean {
	if (field === 'reasoningEfforts') { return Array.isArray(value) && value.every(item => ['low', 'high', 'max'].includes(item)); }
	if (field === 'purpose') { return purposes.includes(value as ModelPurpose); }
	if (field === 'contextWindow' || field === 'maxOutputTokens') { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 10000000; }
	return supports.includes(value as Support);
}

export function parseModelSettings(stored: unknown): ModelSettings {
	if (!record(stored)) { throw new Error('invalid-model-settings'); }
	const result: ModelSettings = {};
	if (stored.overrides !== undefined) {
		if (!record(stored.overrides) || Object.keys(stored.overrides).some(field => !capabilityFields.includes(field as CapabilityField) || !validCapability(field as CapabilityField, (stored.overrides as Record<string, unknown>)[field]))) { throw new Error('invalid-model-capability'); }
		result.overrides = { ...stored.overrides };
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
	const defaults = discovered?.source === 'catalog' ? { ...unknownCapabilities } : discovered ?? { ...unknownCapabilities };
	return { ...defaults, ...settings.overrides, source: settings.overrides && Object.keys(settings.overrides).length ? 'manual' : defaults.source };
}

/** Read only explicit service metadata; do not infer capabilities from an arbitrary model name. */
export function serviceCapabilities(value: unknown): ModelCapabilities | undefined {
	if (!record(value)) { return; }
	const result = { ...unknownCapabilities, source: 'service' as const };
	let found = false;
	for (const field of capabilityFields) {
		if (validCapability(field, value[field])) { Object.assign(result, { [field]: value[field] }); found = true; }
	}
	const caps = value.capabilities;
	if (Array.isArray(caps) && caps.every(item => typeof item === 'string')) {
		result.purpose = caps.includes('completion') ? 'chat' : caps.includes('embedding') ? 'embedding' : 'unknown';
		result.vision = caps.includes('vision') ? 'supported' : 'unsupported';
		result.reasoning = caps.includes('thinking') ? 'supported' : 'unsupported';
		result.tools = caps.includes('tools') ? 'supported' : 'unsupported';
		found = true;
	}
	return found ? result : undefined;
}

export class ModelCapabilityError extends Error {
	constructor(readonly code: 'non-chat' | 'vision' | 'output-limit' | 'thinking') { super(code); }
}

export function reasoningOptions(provider: ProviderId, _model: string, capabilities: ModelCapabilities, settings: ModelSettings): ProviderMetadata {
	if (settings.thinking && capabilities.reasoning !== 'supported') { throw new ModelCapabilityError('thinking'); }
	if (capabilities.reasoning !== 'supported') { return {}; }
	if (provider === 'deepseek') {
		return { deepseek: { ...(settings.thinking ? { thinking: { type: settings.thinking } } : {}), ...(settings.effort ? { reasoningEffort: settings.effort } : {}) } };
	}
	if (provider === 'bailian') { return { bailian: settings.thinking ? { enable_thinking: settings.thinking === 'enabled' } : {} }; }
	if (provider === 'moonshot') { return { moonshot: settings.thinking ? { thinking: { type: settings.thinking } } : {} }; }
	// Ollama's OpenAI-compatible endpoint exposes reasoning_effort, not the native /api/chat think field.
	return { ollama: settings.thinking ? { reasoningEffort: settings.thinking === 'enabled' ? 'high' : 'none' } : {} };
}

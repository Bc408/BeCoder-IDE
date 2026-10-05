/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { ProviderId } from './connection';
import type { ProviderMetadata } from 'ai';

export type Support = 'supported' | 'unsupported' | 'unknown';
export type ModelPurpose = 'chat' | 'embedding' | 'rerank' | 'image' | 'unknown';
export interface ModelCapabilities {
	purpose: ModelPurpose;
	vision: Support;
	reasoning: Support;
	tools: Support;
	contextWindow?: number;
	maxOutputTokens?: number;
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
const capabilityFields = ['purpose', 'vision', 'reasoning', 'tools', 'contextWindow', 'maxOutputTokens'] as const;
export type CapabilityField = typeof capabilityFields[number];

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function validCapability(field: CapabilityField, value: unknown): boolean {
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

/** Conservative official-endpoint catalog, checked 2026-10-03. Unknown IDs stay unknown.
 * https://api-docs.deepseek.com/guides/thinking_mode/
 * https://api-docs.deepseek.com/guides/vision/
 * https://help.aliyun.com/zh/model-studio/vision
 * https://github.com/MoonshotAI/Kimi-K2.5
 */
function catalog(provider: ProviderId, baseURL: string, model: string): ModelCapabilities {
	const url = new URL(baseURL);
	const id = model.toLowerCase();
	const chat = (vision: Support, reasoning: Support, tools: Support): ModelCapabilities => ({ purpose: 'chat', vision, reasoning, tools, source: 'catalog' });
	if (url.protocol !== 'https:' || (url.port && url.port !== '443')) { return { ...unknownCapabilities }; }
	if (provider === 'deepseek' && url.hostname === 'api.deepseek.com' && ['', '/', '/v1'].includes(url.pathname)) {
		if (['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4.1-flash'].includes(id)) { return chat('supported', 'supported', 'supported'); }
		if (['deepseek-pro', 'deepseek-v4-pro'].includes(id)) { return chat('unsupported', 'supported', 'supported'); }
		if (id === 'deepseek-chat') { return chat('unsupported', 'unsupported', 'supported'); }
		if (id === 'deepseek-reasoner') { return chat('unsupported', 'supported', 'unknown'); }
	}
	if (provider === 'bailian' && ['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'dashscope-us.aliyuncs.com'].includes(url.hostname) && url.pathname === '/compatible-mode/v1') {
		if (/^(text-embedding|multimodal-embedding)-/.test(id)) { return { ...unknownCapabilities, purpose: 'embedding', source: 'catalog' }; }
		if (/^(gte-rerank|qwen3-rerank)/.test(id)) { return { ...unknownCapabilities, purpose: 'rerank', source: 'catalog' }; }
		if (/^(wanx|wan\d|qwen-image)/.test(id)) { return { ...unknownCapabilities, purpose: 'image', source: 'catalog' }; }
		if (/^qwen3\.[5-8]-(plus|flash)(-\d{4}-\d{2}-\d{2})?$/.test(id) || /^qwen3-vl-(plus|flash)(-\d{4}-\d{2}-\d{2})?$/.test(id) || /^qwen3-vl-(2b|4b|8b|32b|30b-a3b|235b-a22b)-(thinking|instruct)$/.test(id)) { return chat('supported', id.endsWith('-instruct') ? 'unsupported' : 'supported', 'supported'); }
		if (/^qwen3-(0\.6b|1\.7b|4b|8b|14b|32b|30b-a3b|235b-a22b)(-(thinking|instruct)(-\d{4})?)?$/.test(id) || /^qwen3-(max|plus|flash)(-\d{4}-\d{2}-\d{2})?$/.test(id)) { return chat('unsupported', id.includes('-instruct') ? 'unsupported' : 'supported', 'supported'); }
		if (['qwen-plus', 'qwen-turbo', 'qwen-max'].includes(id)) { return chat('unsupported', 'unknown', 'supported'); }
	}
	if (provider === 'moonshot' && ['api.moonshot.cn', 'api.moonshot.ai'].includes(url.hostname) && url.pathname === '/v1') {
		if (id === 'kimi-k2.5') { return chat('supported', 'supported', 'supported'); }
		if (/^kimi-k2-(thinking|0905|0711|turbo)/.test(id)) { return chat('unsupported', id.includes('thinking') ? 'supported' : 'unsupported', 'supported'); }
		if (/^moonshot-v1-(8k|32k|128k)(-vision-preview)?$/.test(id)) { return chat(id.includes('vision') ? 'supported' : 'unsupported', 'unsupported', id.includes('vision') ? 'unknown' : 'supported'); }
	}
	return { ...unknownCapabilities };
}

export function resolveCapabilities(provider: ProviderId, baseURL: string, model: string, discovered?: ModelCapabilities, settings: ModelSettings = {}): ModelCapabilities {
	const defaults = discovered ?? catalog(provider, baseURL, model);
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

export function reasoningOptions(provider: ProviderId, model: string, capabilities: ModelCapabilities, settings: ModelSettings): ProviderMetadata {
	if (settings.thinking && capabilities.reasoning !== 'supported') { throw new ModelCapabilityError('thinking'); }
	if (capabilities.source === 'catalog' && settings.thinking === 'disabled' && /-thinking($|-)/.test(model)) { throw new ModelCapabilityError('thinking'); }
	if (capabilities.reasoning !== 'supported') { return {}; }
	if (provider === 'deepseek') {
		return { deepseek: { ...(settings.thinking ? { thinking: { type: settings.thinking } } : {}), ...(settings.effort && /^(deepseek-(flash|pro|v4))/.test(model) ? { reasoningEffort: settings.effort } : {}) } };
	}
	if (provider === 'bailian') { return { bailian: settings.thinking ? { enable_thinking: settings.thinking === 'enabled' } : {} }; }
	if (provider === 'moonshot') { return { moonshot: settings.thinking ? { thinking: { type: settings.thinking } } : {} }; }
	// Ollama's OpenAI-compatible endpoint exposes reasoning_effort, not the native /api/chat think field.
	return { ollama: settings.thinking ? { reasoningEffort: settings.thinking === 'enabled' ? 'high' : 'none' } : {} };
}

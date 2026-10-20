/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { ModelInfo } from './connection';
import { serviceCapabilities, unknownCapabilities, validCapability, type ModelCapabilities, type DeepSeekEffort } from './models';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Only declarations for the actual endpoint are used; model IDs are opaque. */
export function parseDeepSeekModels(value: unknown): ModelInfo[] {
	if (!record(value) || !Array.isArray(value.data) || value.data.length > 2000) { throw new Error('invalid-model-list'); }
	const models = new Map<string, ModelInfo>();
	for (const entry of value.data) {
		if (!record(entry) || typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 256) { throw new Error('invalid-model-list'); }
		for (const field of ['purpose', 'vision', 'reasoning', 'tools', 'contextWindow', 'maxOutputTokens', 'reasoningEfforts'] as const) {
			if (entry[field] !== undefined && !validCapability(field, entry[field])) { throw new Error('invalid-model-list'); }
		}
		if (entry.capabilities !== undefined && (!Array.isArray(entry.capabilities) || !entry.capabilities.every(item => typeof item === 'string'))) { throw new Error('invalid-model-list'); }
		let capabilities: ModelCapabilities = serviceCapabilities({ ...entry, capabilities: undefined }) ?? { ...unknownCapabilities };
		const declare = (patch: Partial<ModelCapabilities>) => { capabilities = { ...capabilities, ...patch, source: 'service' }; };
		if (Array.isArray(entry.capabilities)) {
			const tokens = entry.capabilities;
			if (tokens.includes('completion')) { declare({ purpose: 'chat' }); }
			if (tokens.includes('embedding')) { declare({ purpose: 'embedding' }); }
			if (tokens.includes('vision')) { declare({ vision: 'supported' }); }
			if (tokens.includes('thinking')) { declare({ reasoning: 'supported' }); }
			if (tokens.includes('tools')) { declare({ tools: 'supported' }); }
		}
		for (const [key, field] of [['context_window', 'contextWindow'], ['max_output_tokens', 'maxOutputTokens']] as const) {
			if (entry[key] !== undefined) {
				if (!validCapability(field, entry[key])) { throw new Error('invalid-model-list'); }
				declare({ [field]: entry[key] });
			}
		}
		for (const key of ['input_modalities', 'output_modalities'] as const) {
			if (entry[key] !== undefined && (!Array.isArray(entry[key]) || !entry[key].every(item => typeof item === 'string'))) { throw new Error('invalid-model-list'); }
		}
		const input = entry.input_modalities as string[] | undefined;
		const output = entry.output_modalities as string[] | undefined;
		if (input) { declare({ vision: input.includes('image') ? 'supported' : 'unsupported' }); }
		if (input?.includes('text') && output?.includes('text')) { declare({ purpose: 'chat' }); }
		if (entry.effort !== undefined) {
			if (!record(entry.effort) || !Array.isArray(entry.effort.supported_levels) || !entry.effort.supported_levels.every(item => typeof item === 'string')) { throw new Error('invalid-model-list'); }
			const levels = entry.effort.supported_levels;
			declare({ reasoning: levels.length ? 'supported' : 'unknown', reasoningEfforts: [...new Set(levels.filter((item): item is DeepSeekEffort => ['low', 'high', 'max'].includes(item)))] });
		}
		if (entry.name !== undefined && (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 120)) { throw new Error('invalid-model-list'); }
		const model: ModelInfo = { id: entry.id.trim(), provider: 'deepseek', ...(entry.name ? { name: String(entry.name).trim() } : {}), capabilities };
		const previous = models.get(model.id);
		if (previous && JSON.stringify(previous) !== JSON.stringify(model)) { throw new Error('invalid-model-list'); }
		models.set(model.id, model);
	}
	return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

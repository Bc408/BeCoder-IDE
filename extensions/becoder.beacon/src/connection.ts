/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { ModelCapabilities, ModelSettings } from './models';

export const providers = {
	deepseek: { name: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: '' },
	bailian: { name: 'Alibaba Cloud Bailian', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '' },
	moonshot: { name: 'Moonshot', baseURL: 'https://api.moonshot.cn/v1', model: '' },
	ollama: { name: 'Ollama', baseURL: 'http://localhost:11434/v1', model: '' }
} as const;

export type ProviderId = keyof typeof providers;
export interface Connection {
	provider: ProviderId;
	baseURL: string;
	model: string;
	parameters: ModelParameters;
	capabilities?: ModelCapabilities;
	modelSettings?: ModelSettings;
	apiKey?: string;
}
export interface ConnectionState {
	provider: ProviderId;
	baseURL: string;
	model: string;
	parameters: ModelParameters;
	capabilities?: ModelCapabilities;
	modelSettings?: ModelSettings;
	keyConfigured: boolean;
	models: ModelInfo[];
	loading: boolean;
	error: string;
}
export interface ModelParameters {
	temperature?: number;
	topP?: number;
	maxOutputTokens?: number;
}
export type ModelParameterName = keyof ModelParameters;
export interface ModelInfo {
	id: string;
	provider: ProviderId;
	capabilities?: ModelCapabilities;
}
export function isProvider(value: unknown): value is ProviderId {
	return typeof value === 'string' && Object.hasOwn(providers, value);
}
export function secretName(provider: ProviderId): string { return `beacon.${provider}.apiKey`; }

const parameterRanges: Record<ModelParameterName, { minimum: number; maximum: number; integer?: boolean }> = {
	temperature: { minimum: 0, maximum: 2 },
	topP: { minimum: 0, maximum: 1 },
	maxOutputTokens: { minimum: 1, maximum: 131072, integer: true }
};

function parameterKey(provider: ProviderId, model: string, baseURL: string): string { return `${provider}:${encodeURIComponent(baseURL.replace(/\/+$/, ''))}:${encodeURIComponent(model)}`; }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validParameter(name: ModelParameterName, value: unknown): value is number {
	const range = parameterRanges[name];
	return typeof value === 'number' && Number.isFinite(value) && value >= range.minimum && value <= range.maximum && (!range.integer || Number.isInteger(value));
}

export function readModelParameters(value: unknown, provider: ProviderId, model: string, baseURL: string = providers[provider].baseURL): ModelParameters {
	if (!model || !isRecord(value)) { return {}; }
	const stored = value[parameterKey(provider, model, baseURL)];
	if (!isRecord(stored)) { return {}; }
	const result: ModelParameters = {};
	for (const name of Object.keys(parameterRanges) as ModelParameterName[]) {
		if (validParameter(name, stored[name])) { result[name] = stored[name]; }
	}
	return result;
}

export function updateModelParameters(value: unknown, provider: ProviderId, model: string, name: unknown, parameter: unknown, baseURL: string = providers[provider].baseURL): Record<string, unknown> {
	if (!model || typeof name !== 'string' || !Object.hasOwn(parameterRanges, name) || (parameter !== null && !validParameter(name as ModelParameterName, parameter))) { throw new Error('invalid-model-parameter'); }
	const result = isRecord(value) ? { ...value } : {};
	const key = parameterKey(provider, model, baseURL);
	const current = readModelParameters(result, provider, model, baseURL);
	if (parameter === null) { delete current[name as ModelParameterName]; }
	else { current[name as ModelParameterName] = parameter as number; }
	if (Object.keys(current).length) { result[key] = current; }
	else { delete result[key]; }
	return result;
}

export function normalizeBaseURL(value: string, provider: ProviderId): string {
	const url = new URL(value.trim());
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (provider === 'ollama' && local && url.protocol === 'http:'))) { throw new Error('invalid-url'); }
	return url.href.replace(/\/+$/, '');
}

export class ConnectionError extends Error {
	constructor(readonly statusCode: number) { super('provider-request-failed'); }
}

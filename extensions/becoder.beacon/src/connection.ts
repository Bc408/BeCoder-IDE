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
	displayName?: string;
	choices?: { provider: ProviderId; id: string; name: string }[];
	revision?: number;
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
export function secretName(provider: ProviderId): string { return `beacon.modelConfiguration.${provider}.apiKey`; }

const parameterRanges: Record<ModelParameterName, { minimum: number; maximum: number; integer?: boolean }> = {
	temperature: { minimum: 0, maximum: 2 },
	topP: { minimum: 0, maximum: 1 },
	maxOutputTokens: { minimum: 1, maximum: 131072, integer: true }
};

export function validParameter(name: ModelParameterName, value: unknown): value is number {
	const range = parameterRanges[name];
	return typeof value === 'number' && Number.isFinite(value) && value >= range.minimum && value <= range.maximum && (!range.integer || Number.isInteger(value));
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

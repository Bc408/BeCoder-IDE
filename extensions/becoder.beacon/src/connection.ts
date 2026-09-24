/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

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
	apiKey?: string;
}
export interface ConnectionState {
	provider: ProviderId;
	baseURL: string;
	model: string;
	keyConfigured: boolean;
	models: string[];
	loading: boolean;
	error: string;
}
export function isProvider(value: unknown): value is ProviderId {
	return typeof value === 'string' && Object.hasOwn(providers, value);
}
export function secretName(provider: ProviderId): string { return `beacon.${provider}.apiKey`; }

export function normalizeBaseURL(value: string, provider: ProviderId): string {
	const url = new URL(value.trim());
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (provider === 'ollama' && local && url.protocol === 'http:'))) { throw new Error('invalid-url'); }
	return url.href.replace(/\/+$/, '');
}

export class ConnectionError extends Error {
	constructor(readonly statusCode: number) { super('provider-request-failed'); }
}

/** No redirects with credentials; no provider error body is exposed to the UI. */
export async function listModels(connection: Connection, signal: AbortSignal, request: typeof fetch = fetch): Promise<string[]> {
	const baseURL = normalizeBaseURL(connection.baseURL, connection.provider);
	if (connection.provider !== 'ollama' && !connection.apiKey) { throw new ConnectionError(401); }
	const headers: Record<string, string> = {};
	if (connection.apiKey) { headers.Authorization = `Bearer ${connection.apiKey}`; }
	const models = new Set<string>();
	const nativeBailian = connection.provider === 'bailian' && baseURL.endsWith('/compatible-mode/v1');
	let count = 0;
	for (let page = 1; page <= 50; page++) {
		const url = nativeBailian ? `${baseURL.replace(/\/compatible-mode\/v1$/, '/api/v1')}/models?page_no=${page}&page_size=100&capabilities=TG` : `${baseURL}/models`;
		const response = await request(url, { headers, signal, redirect: 'error' });
		if (!response.ok) { throw new ConnectionError(response.status); }
		const body = await response.json() as { data?: { id?: unknown }[]; output?: { models?: { model?: unknown }[]; total?: number } };
		const entries = nativeBailian ? body.output?.models : body.data;
		if (!Array.isArray(entries)) { throw new Error('invalid-model-list'); }
		for (const entry of entries) {
			const id = nativeBailian ? (entry as { model?: unknown })?.model : (entry as { id?: unknown })?.id;
			if (typeof id !== 'string' || !id.trim() || id.length > 256) { throw new Error('invalid-model-list'); }
			models.add(id);
		}
		count += entries.length;
		if (!nativeBailian || !entries.length || (typeof body.output?.total === 'number' ? count >= body.output.total : entries.length < 100)) { return [...models].sort(); }
	}
	throw new Error('model-list-too-large');
}

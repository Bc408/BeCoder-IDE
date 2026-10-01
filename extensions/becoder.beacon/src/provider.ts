/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { jsonSchema, stepCountIs, streamText, tool, type LanguageModel } from 'ai';
import type { Generate, ToolActivity, WorkspaceReadResult } from './session';
import { ConnectionError, normalizeBaseURL, type Connection, type ModelInfo, type ProviderId } from './connection';

interface ProviderAdapter {
	createModel(connection: Connection, request: typeof fetch): LanguageModel;
	listModels(connection: Connection, signal: AbortSignal, request: typeof fetch): Promise<ModelInfo[]>;
}

function options(connection: Connection, request: typeof fetch) {
	return {
		apiKey: connection.apiKey,
		baseURL: normalizeBaseURL(connection.baseURL, connection.provider),
		fetch: ((url, init) => request(url, { ...init, redirect: 'error' })) as typeof fetch,
	};
}

function compatibleAdapter(name: ProviderId, listModels = listCompatibleModels): ProviderAdapter {
	return {
		createModel: (connection, request) => createOpenAICompatible({ ...options(connection, request), name })(connection.model),
		listModels
	};
}

const adapters: Record<ProviderId, ProviderAdapter> = {
	deepseek: {
		createModel: (connection, request) => createDeepSeek(options(connection, request))(connection.model),
		listModels: listCompatibleModels
	},
	bailian: compatibleAdapter('bailian', listBailianModels),
	moonshot: compatibleAdapter('moonshot'),
	ollama: compatibleAdapter('ollama')
};

function headers(connection: Connection): Record<string, string> {
	return connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {};
}

function modelInfo(provider: ProviderId, id: unknown): ModelInfo {
	if (typeof id !== 'string' || !id.trim() || id.length > 256) { throw new Error('invalid-model-list'); }
	return { id, provider };
}

/** No redirects with credentials; no provider error body is exposed to the UI. */
async function listCompatibleModels(connection: Connection, signal: AbortSignal, request: typeof fetch): Promise<ModelInfo[]> {
	const response = await request(`${normalizeBaseURL(connection.baseURL, connection.provider)}/models`, { headers: headers(connection), signal, redirect: 'error' });
	if (!response.ok) { throw new ConnectionError(response.status); }
	const body = await response.json() as { data?: { id?: unknown }[] };
	if (!Array.isArray(body.data)) { throw new Error('invalid-model-list'); }
	return [...new Map(body.data.map(entry => modelInfo(connection.provider, entry?.id)).map(model => [model.id, model])).values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function listBailianModels(connection: Connection, signal: AbortSignal, request: typeof fetch): Promise<ModelInfo[]> {
	const baseURL = normalizeBaseURL(connection.baseURL, connection.provider);
	if (!baseURL.endsWith('/compatible-mode/v1')) { return listCompatibleModels(connection, signal, request); }
	const models = new Map<string, ModelInfo>();
	let count = 0;
	for (let page = 1; page <= 50; page++) {
		const response = await request(`${baseURL.replace(/\/compatible-mode\/v1$/, '/api/v1')}/models?page_no=${page}&page_size=100&capabilities=TG`, { headers: headers(connection), signal, redirect: 'error' });
		if (!response.ok) { throw new ConnectionError(response.status); }
		const body = await response.json() as { output?: { models?: { model?: unknown }[]; total?: number } };
		const entries = body.output?.models;
		if (!Array.isArray(entries)) { throw new Error('invalid-model-list'); }
		for (const entry of entries) { const model = modelInfo(connection.provider, entry?.model); models.set(model.id, model); }
		count += entries.length;
		if (!entries.length || (typeof body.output?.total === 'number' ? count >= body.output.total : entries.length < 100)) { return [...models.values()].sort((a, b) => a.id.localeCompare(b.id)); }
	}
	throw new Error('model-list-too-large');
}

/**
 * Provider construction is deliberately delegated to the Vercel AI SDK.
 * Beacon owns the connection snapshot and SecretStorage boundary; it does not
 * implement provider-specific chat payloads or stream parsers.
 */
export async function listModels(connection: Connection, signal: AbortSignal, request: typeof fetch = fetch): Promise<ModelInfo[]> {
	if (connection.provider !== 'ollama' && !connection.apiKey) { throw new ConnectionError(401); }
	return adapters[connection.provider].listModels(connection, signal, request);
}

const workspaceFileSchema = jsonSchema<{ path: string }>({
	type: 'object',
	properties: { path: { type: 'string', description: 'A workspace-relative path. In multi-root workspaces, prefix it with the folder name.' } },
	required: ['path'],
	additionalProperties: false
});

function toolActivity(id: string, input: unknown, status: ToolActivity['status']): ToolActivity {
	const path = input && typeof input === 'object' && 'path' in input && typeof input.path === 'string' ? input.path.slice(0, 1024) : '';
	return { id, type: 'read-workspace-file', path, status };
}

function safeToolError(error: unknown): string {
	const code = error instanceof Error ? error.message : '';
	switch (code) {
		case 'no-workspace': return 'No workspace is open.';
		case 'workspace-folder-required': return 'Specify a workspace folder and relative file path.';
		case 'invalid-workspace-path': return 'The path must be relative to the open workspace.';
		case 'protected-workspace-file': return 'This sensitive file is not available to Beacon.';
		case 'workspace-file-too-large': return 'The file exceeds the 128 KiB read limit.';
		case 'workspace-file-not-text': return 'Only UTF-8 text files can be read.';
		default: return 'The workspace file could not be read.';
	}
}

export function createGenerator(readConnection: () => PromiseLike<Connection>, fetchImplementation: typeof fetch = fetch): Generate {
	return async function* (messages, signal, readWorkspaceFile) {
		const connection = await readConnection();
		if (connection.provider !== 'ollama' && !connection.apiKey) { throw new Error('missing-key'); }
		if (!connection.model.trim()) { throw new Error('missing-model'); }
		if (signal.aborted) { return; }
		let readCount = 0;
		const result = streamText({
			model: adapters[connection.provider].createModel(connection, fetchImplementation),
			messages: [...messages],
			tools: {
				readWorkspaceFile: tool({
					description: 'Read one UTF-8 text file from the currently open workspace. Use only when the user asks about workspace contents. Paths must be workspace-relative; never request secrets or files outside the workspace.',
					inputSchema: workspaceFileSchema,
					execute: async ({ path }, options) => {
						readCount++;
						if (readCount > 3) { return { ok: false, path, error: 'At most three workspace files may be read in one response.' }; }
						try {
							const file = await readWorkspaceFile(path, options.abortSignal ?? signal);
							return { ok: true, path: file.path, contents: file.content };
						} catch (error) {
							if (signal.aborted || options.abortSignal?.aborted) { throw error; }
						return { ok: false, path, error: safeToolError(error) };
						}
					}
				})
			},
			stopWhen: stepCountIs(4),
			abortSignal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
			maxRetries: 0,
			...connection.parameters
		});
		for await (const part of result.fullStream) {
			if (part.type === 'text-delta') { yield { type: 'text', text: part.text }; }
			if (part.type === 'reasoning-delta') { yield { type: 'reasoning', text: part.text }; }
			if (part.type === 'tool-call' && part.toolName === 'readWorkspaceFile') { yield { type: 'activity', activity: toolActivity(part.toolCallId, part.input, 'running') }; }
			if (part.type === 'tool-result' && part.toolName === 'readWorkspaceFile') {
				const output = part.output as WorkspaceReadResult['output'];
				yield { type: 'tool-result', result: { id: part.toolCallId, path: toolActivity(part.toolCallId, part.input, 'complete').path, output } };
				yield { type: 'activity', activity: toolActivity(part.toolCallId, part.input, output?.ok === true ? 'complete' : 'error') };
			}
			if (part.type === 'tool-error' && part.toolName === 'readWorkspaceFile') { yield { type: 'activity', activity: toolActivity(part.toolCallId, part.input, 'error') }; }
			if (part.type === 'error') { throw part.error; }
			if (part.type === 'finish' && part.finishReason !== 'stop') { throw new Error('incomplete-response'); }
		}
	};
}

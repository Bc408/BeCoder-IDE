/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { parseDeepSeekModels } from './deepseekModels';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { InvalidToolInputError, jsonSchema, streamText, tool, wrapLanguageModel, type FilePart, type TextPart, type LanguageModel, type ModelMessage } from 'ai';
import { fileModelOutput, type Generate, type ToolActivity } from './session';
import { safeFileError, type FileInput, type FileOutput, type FilePermission, type FileRoot } from './fileTools';
import { ConnectionError, normalizeBaseURL, requiresApiKey, type Connection, type ModelInfo, type ProviderId } from './connection';
import { defaultCapabilities, ModelCapabilityError, reasoningOptions, resolveCapabilities, serviceCapabilities, validCapability, type ModelCapabilities } from './models';
import { ProtocolRecorder } from './protocol';
import { createWebTool, webModelOutput, type WebInput, type WebOutput } from './webTools';
import { toolErrorCode, type ToolError } from './toolFeedback';
import { RequestRecovery, RequestRejectedError, type RecoveryOptions } from './requestRecovery';
import type { ContextAccess, ContextOutput } from './contextTools';
import { contextToolSchema, contextToolNames, contextToolDescriptions, type BeaconContextToolName } from './contextToolContract';
import { composeBeaconPrompt, type BeaconToolName } from './prompts';
import { measureBeaconRequest, beaconFingerprint, beaconMedia, type PreparedBeaconRequest, type BeaconUsageAnchor } from './contextBudget';
import { compactBeaconContext, coveredCount, prefixFingerprint, projectCompaction, selectCompaction, type BeaconCompaction, type EffectiveUnit } from './compaction';
import { contextModelOutput, modelFailureOutput, normalizeNewToolFailures, sdkToolFailure, type BeaconModelFailure } from './toolModelOutput';

class BeaconPreparationError extends Error { constructor() { super('beacon-context-capacity'); } }

interface ProviderAdapter {
	createModel(connection: Connection, request: typeof fetch): LanguageModel;
	listModels(connection: Connection, signal: AbortSignal, request: typeof fetch): Promise<ModelInfo[]>;
}

function options(connection: Connection, request: typeof fetch) {
	return {
		apiKey: connection.apiKey || (connection.provider === 'ollama' ? 'ollama' : undefined),
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

function customResponsesModel(connection: Connection, request: typeof fetch): LanguageModel {
	const model = createOpenAI({
		...options(connection, request), name: 'custom',
		// An explicit empty value prevents SDK environment fallback. Remove its
		// generated empty Bearer header before the request reaches any endpoint.
		apiKey: connection.apiKey ?? '',
		fetch: (url, init) => {
			const headers = new Headers(init?.headers);
			if (!connection.apiKey) { headers.delete('authorization'); }
			return request(url, { ...init, headers, redirect: 'error' });
		}
	}).responses(connection.model);
	return wrapLanguageModel({ model, middleware: {
		// Responses otherwise normalizes omitted strict to true. Beacon's tools
		// deliberately have optional parameters (for example an empty list query).
		transformParams: async ({ params }) => ({ ...params, tools: params.tools?.map(tool => tool.type === 'function' ? { ...tool, strict: false } : tool) })
	} });
}

const adapters: Record<ProviderId, ProviderAdapter> = {
	deepseek: {
		createModel: (connection, request) => createDeepSeek(options(connection, request))(connection.model),
		listModels: listCompatibleModels
	},
	bailian: compatibleAdapter('bailian', listBailianModels),
	moonshot: compatibleAdapter('moonshot'),
	ollama: compatibleAdapter('ollama'),
	custom: {
		createModel: customResponsesModel,
		listModels: listCompatibleModels
	}
};

function headers(connection: Connection): Record<string, string> {
	return connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {};
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function safeModelText(value: unknown, maximum: number): value is string { return typeof value === 'string' && !!value.trim() && value.length <= maximum && !/[\x00-\x1f\x7f-\x9f]/.test(value); }

function validateMetadata(value: Record<string, unknown>): void {
	for (const field of ['purpose', 'vision', 'reasoning', 'tools', 'contextWindow', 'maxInputTokens', 'maxOutputTokens', 'reasoningEfforts'] as const) {
		if (value[field] !== undefined && !validCapability(field, value[field])) { throw new Error('invalid-model-list'); }
	}
	for (const field of ['capabilities', 'features', 'input_modalities', 'output_modalities']) {
		if (value[field] !== undefined && (!Array.isArray(value[field]) || !value[field].every(item => typeof item === 'string'))) { throw new Error('invalid-model-list'); }
	}
	if (value.model_info !== undefined && !record(value.model_info)) { throw new Error('invalid-model-list'); }
	for (const info of [value, record(value.model_info) ? value.model_info : {}]) {
		for (const [key, field] of [['context_window', 'contextWindow'], ['max_input_tokens', 'maxInputTokens'], ['max_output_tokens', 'maxOutputTokens']] as const) {
			if (info[key] !== undefined && info[key] !== null && !validCapability(field, info[key])) { throw new Error('invalid-model-list'); }
		}
	}
	if (value.inference_metadata !== undefined) {
		if (!record(value.inference_metadata)) { throw new Error('invalid-model-list'); }
		for (const key of ['request_modality', 'response_modality']) {
			const modalities = value.inference_metadata[key];
			if (modalities !== undefined && (!Array.isArray(modalities) || !modalities.every(item => typeof item === 'string'))) { throw new Error('invalid-model-list'); }
		}
	}
}

function modelInfo(connection: Connection, id: unknown, metadata: unknown): ModelInfo {
	if (!safeModelText(id, 256) || !record(metadata) || (metadata.name !== undefined && !safeModelText(metadata.name, 120))) { throw new Error('invalid-model-list'); }
	validateMetadata(metadata);
	const declared = serviceCapabilities(metadata);
	// Ollama detail is merged before capacity defaults so missing fields stay distinguishable.
	const capabilities = connection.provider === 'ollama' ? declared ?? { ...defaultCapabilities } : resolveCapabilities(connection.provider, connection.baseURL, id, declared);
	const modalities = record(metadata.inference_metadata) ? metadata.inference_metadata : {};
	for (const values of [metadata.input_modalities ?? modalities.request_modality, metadata.output_modalities ?? modalities.response_modality]) {
		if (Array.isArray(values) && !values.some(item => typeof item === 'string' && item.toLowerCase() === 'text')) { capabilities.purpose = 'image'; }
	}
	return { id: id.trim(), ...(metadata.name ? { name: String(metadata.name).trim() } : {}), provider: connection.provider, capabilities };
}

function addModel(models: Map<string, ModelInfo>, model: ModelInfo): void {
	const previous = models.get(model.id);
	if (previous && JSON.stringify(previous) !== JSON.stringify(model)) { throw new Error('invalid-model-list'); }
	models.set(model.id, model);
}

function chatModels(models: Iterable<ModelInfo>): ModelInfo[] {
	return [...models].filter(model => ['chat', 'unknown'].includes(model.capabilities?.purpose ?? 'chat')).sort((a, b) => a.id.localeCompare(b.id));
}

/** No redirects with credentials; no provider error body is exposed to the UI. */
async function listCompatibleModels(connection: Connection, signal: AbortSignal, request: typeof fetch): Promise<ModelInfo[]> {
	const response = await request(`${normalizeBaseURL(connection.baseURL, connection.provider)}/models`, { headers: headers(connection), signal, redirect: 'error' });
	if (!response.ok) { throw new ConnectionError(response.status); }
	const body: unknown = await response.json();
	if (connection.provider === 'deepseek') { return parseDeepSeekModels(body); }
	if (!record(body) || !Array.isArray(body.data) || body.data.length > 2000) { throw new Error('invalid-model-list'); }
	const models = new Map<string, ModelInfo>();
	for (const entry of body.data) { addModel(models, modelInfo(connection, record(entry) ? entry.id : undefined, entry)); }
	return chatModels(models.values());
}

async function listBailianModels(connection: Connection, signal: AbortSignal, request: typeof fetch): Promise<ModelInfo[]> {
	const baseURL = normalizeBaseURL(connection.baseURL, connection.provider);
	if (!baseURL.endsWith('/compatible-mode/v1')) { return listCompatibleModels(connection, signal, request); }
	const models = new Map<string, ModelInfo>();
	let count = 0;
	for (let page = 1; page <= 2000; page++) {
		const response = await request(`${baseURL.replace(/\/compatible-mode\/v1$/, '/api/v1')}/models?page_no=${page}&page_size=100&capabilities=TG`, { headers: headers(connection), signal, redirect: 'error' });
		if (!response.ok) { throw new ConnectionError(response.status); }
		const body: unknown = await response.json();
		if (!record(body) || body.success === false || !record(body.output)) { throw new Error('invalid-model-list'); }
		const { models: entries, total } = body.output;
		if (!Array.isArray(entries) || entries.length > 100 || (total !== undefined && (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 || total > 2000)) || count + entries.length > 2000) { throw new Error('invalid-model-list'); }
		const previousIds = new Set(models.keys());
		for (const entry of entries) { addModel(models, modelInfo(connection, record(entry) ? entry.model : undefined, entry)); }
		count += entries.length;
		if (entries.length > 0 && entries.every(entry => record(entry) && typeof entry.model === 'string' && previousIds.has(entry.model.trim()))) { throw new Error('invalid-model-list'); }
		if (typeof total === 'number') {
			if (count > total || (!entries.length && count < total)) { throw new Error('invalid-model-list'); }
			if (count === total) { return chatModels(models.values()); }
		} else if (entries.length < 100) { return chatModels(models.values()); }
		if (count === 2000) { throw new Error('invalid-model-list'); }
	}
	throw new Error('model-list-too-large');
}

/**
 * Provider construction is deliberately delegated to the Vercel AI SDK.
 * Beacon owns the connection snapshot and SecretStorage boundary; it does not
 * implement provider-specific chat payloads or stream parsers.
 */
export async function listModels(connection: Connection, signal: AbortSignal, request: typeof fetch = fetch): Promise<ModelInfo[]> {
	if (requiresApiKey(connection.provider) && !connection.apiKey) { throw new ConnectionError(401); }
	const models = await adapters[connection.provider].listModels(connection, signal, request);
	if (connection.provider === 'ollama') {
		for (let start = 0; start < models.length; start += 4) {
			signal.throwIfAborted();
			await Promise.all(models.slice(start, start + 4).map(async model => {
				try {
					const detail = await inspectModel({ ...connection, model: model.id }, AbortSignal.any([signal, AbortSignal.timeout(5000)]), request);
					if (detail) { model.capabilities = { ...model.capabilities, ...detail }; }
				} catch { signal.throwIfAborted(); }
			}));
		}
		for (const model of models) { model.capabilities = resolveCapabilities(connection.provider, connection.baseURL, model.id, model.capabilities); }
	}
	signal.throwIfAborted();
	return chatModels(models);
}

/** Read one local model's metadata; never pull models or change runtime configuration. */
export async function inspectModel(connection: Pick<Connection, 'provider' | 'baseURL' | 'model' | 'apiKey'>, signal: AbortSignal, request: typeof fetch = fetch): Promise<ModelCapabilities | undefined> {
	if (connection.provider !== 'ollama' || !connection.model) { return; }
	const baseURL = normalizeBaseURL(connection.baseURL, connection.provider);
	if (!baseURL.endsWith('/v1') || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) { return; }
	const response = await request(`${baseURL.slice(0, -3)}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {}) }, body: JSON.stringify({ model: connection.model }), signal, redirect: 'error' });
	if (response.status === 404) { return; }
	if (!response.ok) { throw new ConnectionError(response.status); }
	const value: unknown = await response.json();
	if (!record(value)) { throw new Error('invalid-model-list'); }
	validateMetadata(value);
	const context = Object.entries(record(value.model_info) ? value.model_info : {}).find(([key]) => key.endsWith('.context_length'))?.[1];
	return serviceCapabilities({ ...value, ...(validCapability('contextWindow', context) ? { contextWindow: context } : {}) }, true);
}

/** A user-triggered probe never receives conversation context or generation overrides. */
export async function testModelConnection(connection: Connection, signal: AbortSignal, request: typeof fetch = fetch): Promise<void> {
	const controller = new AbortController();
	const result = streamText({ model: adapters[connection.provider].createModel(connection, request), messages: [{ role: 'user', content: 'Reply with OK.' }], ...(connection.provider === 'custom' ? { providerOptions: reasoningOptions('custom', connection.model, defaultCapabilities, {}) } : {}), abortSignal: AbortSignal.any([signal, controller.signal]), maxRetries: 0, onError: () => {} });
	try {
		for await (const part of result.fullStream) {
			if (part.type === 'error') { throw part.error; }
			if (part.type === 'text-delta' && part.text.trim()) { return; }
		}
		signal.throwIfAborted(); throw new Error('empty-response');
	} finally { controller.abort(); }
}

/** Independent task generation: no conversation assembly, tools, retries or history writes. */
export async function generateTranslationBatch(connection: Connection, system: string, payload: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<string> {
	signal.throwIfAborted();
	const capabilities = connection.capabilities ?? defaultCapabilities;
	const result = streamText({ model: adapters[connection.provider].createModel(connection, request), system,
		messages: [{ role: 'user', content: payload }], abortSignal: signal, maxRetries: 0, onError: () => {},
		...connection.parameters, providerOptions: reasoningOptions(connection.provider, connection.model, capabilities, connection.modelSettings ?? {}) });
	let text = '';
	for await (const part of result.fullStream) {
		signal.throwIfAborted();
		if (part.type === 'error') { throw part.error; }
		if (part.type === 'text-delta') { text += part.text; if (Buffer.byteLength(text, 'utf8') > 8 * 1024 * 1024) { throw new Error('translation-too-large'); } }
	}
	signal.throwIfAborted();
	if (await result.finishReason !== 'stop' || !text.trim()) { throw new Error('translation-incomplete'); }
	return text;
}

function fileScopeDescription(permission: FilePermission, roots: readonly FileRoot[]): string {
	const scope = permission === 'workspace' ? 'ordinary files within the selected Beacon workspace' : 'local files on this computer, including outside the selected Beacon workspace';
	const base = roots.length === 1 ? roots[0].path : roots.length ? `prefix relative paths with the matching folder name: ${JSON.stringify(roots)}` : 'no relative-path root is available; use an absolute path';
	return ` File scope: ${scope}. Relative-path base: ${base}. Protected paths remain excluded.`;
}

const fileSchema = jsonSchema<FileInput>({
	type: 'object',
	properties: {
		operation: { type: 'string', enum: ['read', 'list', 'find', 'search'], description: 'read: read one file; list: list immediate directory entries; find: recursively match file or directory names; search: recursively find matching text lines in inspected file content.' },
		path: { type: 'string', description: 'Absolute local or UNC path, or a path relative to the listed file root. Use . for that root. read requires a file; list, find and search require a directory.' },
		offset: { type: 'integer', minimum: 0, description: 'For read only: zero-based Unicode character offset for text, or byte offset for binary excerpts. For the next range, pass the returned nextOffset as offset.' },
		limit: { type: 'integer', minimum: 1, maximum: 131072, description: 'For text/binary reads: maximum Unicode characters or bytes respectively, default 32768 and maximum 131072, subject to result budgets. For list/find/search: maximum returned entries or matches, default 100 and maximum 200. Omit offset and limit for images.' },
		query: { type: 'string', description: 'Required for find/search. Literal, case-insensitive substring: find matches each file or directory name, not its parent path; search matches within individual text lines, without crossing line breaks. Omit for read/list.' }
	},
	required: ['operation', 'path'],
	additionalProperties: false
}, {
	validate: value => {
		const valid = record(value) && Object.keys(value).every(key => ['operation', 'path', 'offset', 'limit', 'query'].includes(key))
			&& typeof value.operation === 'string' && ['read', 'list', 'find', 'search'].includes(value.operation)
			&& typeof value.path === 'string' && value.path.length > 0 && value.path.length <= 4096
			&& (value.offset === undefined || Number.isSafeInteger(value.offset) && Number(value.offset) >= 0)
			&& (value.limit === undefined || Number.isSafeInteger(value.limit) && Number(value.limit) >= 1 && Number(value.limit) <= 131072)
			&& (value.query === undefined || typeof value.query === 'string');
		return valid ? { success: true, value: value as unknown as FileInput } : { success: false, error: new Error('invalid_arguments') };
	}
});

const webSchema = jsonSchema<WebInput>({
	type: 'object',
	properties: {
		operation: { type: 'string', enum: ['search', 'fetch'], description: 'search: search public web information using query; fetch: read a public HTTP(S) page using url.' },
		query: { type: 'string', maxLength: 500, description: 'For search: the public search query, within the real user\'s requested scope.' },
		url: { type: 'string', maxLength: 2048, description: 'For fetch: a public HTTP(S) URL supplied by the user or found in search results.' }
	},
	required: ['operation'],
	additionalProperties: false
});

function toolActivity(id: string, input: unknown, status: ToolActivity['status'], name = 'inspectFile', error?: ToolError): ToolActivity {
	const feedback = error ? { error } : {};
	if (contextToolNames.includes(name as BeaconContextToolName)) {
		const value = input as Record<string, unknown> | undefined;
		return { id, type: name.endsWith('Record') && !value?.id && !value?.latest ? 'list' : 'read', path: String(value?.id ?? value?.filePath ?? name), status, ...feedback };
	}
	if (name === 'browseWeb') {
		const value = input as Partial<WebInput> | undefined;
		const path = value?.operation === 'fetch' ? value.url : value?.query;
		return { id, type: value?.operation === 'fetch' ? 'web-fetch' : 'web-search', path: typeof path === 'string' ? path.slice(0, 2048) : '', status, ...(error ? { error } : {}) };
	}
	const path = input && typeof input === 'object' && 'path' in input && typeof input.path === 'string' ? input.path.slice(0, 1024) : '';
	const operation = input && typeof input === 'object' && 'operation' in input ? input.operation : 'read';
	return { id, type: operation === 'list' || operation === 'find' || operation === 'search' ? operation : 'read', path, status, ...feedback };
}

function fileMessages(messages: ModelMessage[], vision: boolean): ModelMessage[] {
	// Chat-completions adapters serialize tool content as JSON. Move image bytes to
	// a user file part so the SDK sends an actual image, including on history replay.
	return messages.flatMap((message): ModelMessage[] => {
		if (!vision && Array.isArray(message.content) && message.content.some(part => part.type === 'image' || (part.type === 'file' && part.mediaType.startsWith('image/')))) { throw new ModelCapabilityError('vision'); }
		if (message.role !== 'tool') { return [message]; }
		const images: (FilePart | TextPart)[] = [];
		const content = message.content.map(part => {
			if (part.type !== 'tool-result' || !['inspectFile', 'inspectFiles'].includes(part.toolName) || part.output.type !== 'content') { return part; }
			const value = part.output.value.filter(item => {
				if (item.type !== 'file' || !item.mediaType.startsWith('image/') || item.data.type !== 'data') { return true; }
				if (!vision) { throw new ModelCapabilityError('vision'); }
				images.push({ type: 'text', text: 'Image content from the preceding recorded tool result, shown as a media part. This is not a new user request.\n' + JSON.stringify({ toolCallId: part.toolCallId, toolName: part.toolName }) }, item);
				return false;
			});
			return { ...part, output: { ...part.output, value } };
		});
		return [{ ...message, content }, ...(images.length ? [{ role: 'user' as const, content: images }] : [])];
	});
}

export function createGenerator(readConnection: () => PromiseLike<Connection>, fetchImplementation: typeof fetch = fetch, permission: FilePermission = 'none', roots: FileRoot[] = [], webEnabled = true, webRequest: typeof fetch = fetchImplementation, recoveryOptions: Omit<RecoveryOptions, 'progress'> = {}, context?: ContextAccess): Generate {
	return async function* (messages, signal, files, progress, generation) {
		const connection = await readConnection();
		if (requiresApiKey(connection.provider) && !connection.apiKey) { throw new Error('missing-key'); }
		if (!connection.model.trim()) { throw new Error('missing-model'); }
		if (signal.aborted) { return; }
		const capabilities = resolveCapabilities(connection.provider, connection.baseURL, connection.model, connection.capabilities, connection.modelSettings);
		// Keep declared capacities intact. An unusable default reservation falls back
		// to the existing 3:1 input/output split; explicit reservations still fail honestly.
		const defaultOutputTokens = capabilities.maxOutputTokens! < capabilities.contextWindow! ? capabilities.maxOutputTokens! : Math.max(1, Math.floor(capabilities.contextWindow! / 4));
		const maxOutputTokens = connection.parameters.maxOutputTokens ?? defaultOutputTokens;
		const limits = { contextWindow: capabilities.contextWindow!, maxInputTokens: capabilities.maxInputTokens!, maxOutputTokens };
		if (!['chat', 'unknown'].includes(capabilities.purpose)) { throw new ModelCapabilityError('non-chat'); }
		if (connection.parameters.maxOutputTokens && capabilities.maxOutputTokens && connection.parameters.maxOutputTokens > capabilities.maxOutputTokens) { throw new ModelCapabilityError('output-limit'); }
		const providerOptions = reasoningOptions(connection.provider, connection.model, capabilities, connection.modelSettings ?? {});
		const vision = capabilities.vision;
		const prepareMessages = (messages: readonly ModelMessage[]) => fileMessages([...messages], vision);
		const systemTime = new Date().toISOString();
		const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(180000)]);
		const recovery = new RequestRecovery(fetchImplementation, requestSignal, { ...recoveryOptions, progress });
		try {
			const contextDescription = context ? await context.describe(requestSignal) : undefined;
			const web = createWebTool(webRequest);
			const webAvailable = webEnabled && capabilities.tools;
			const tools = !capabilities.tools ? {} : {
				...(context ? Object.fromEntries((context.names ?? contextToolNames).map(name => [name, tool({
					description: contextToolDescriptions[name],
					inputSchema: contextToolSchema(name),
					toModelOutput: ({ output }) => contextModelOutput(name, output as ContextOutput),
					execute: (input, options): Promise<ContextOutput> => { recovery.commit(); return context.execute(name, input, options.abortSignal ?? signal); }
				})])) : {}),
				...(permission === 'none' ? {} : {
					inspectFile: tool<FileInput, FileOutput, Record<string, unknown>>({
						description: 'Inspect local files and directories within the file scope below: read a file, list a directory, find entries by name or search text. Open text includes unsaved edits; Notebook files return numbered content cells. File reads support text, images and binary excerpts.' + fileScopeDescription(permission, roots),
					inputSchema: fileSchema,
					toModelOutput: ({ output }) => fileModelOutput(output),
					execute: async (input, options): Promise<FileOutput> => {
						recovery.commit();
						try {
							const output = await files(input, options.abortSignal ?? signal);
							return output.ok && output.kind === 'image' && !vision ? { ok: false, path: output.path, error: 'The selected model does not support image input. Select a vision-capable model in Beacon settings.' } : output;
						} catch (error) {
							if (signal.aborted || options.abortSignal?.aborted) { throw error; }
							return { ok: false, path: input.path, error: safeFileError(error) };
						}
					}
				})
				}),
				...(webAvailable ? {
					browseWeb: tool<WebInput, WebOutput, Record<string, unknown>>({
						description: 'Search public web information or fetch a public webpage. Returns source links with search excerpts or page text; cite relevant links when using them. The chat web-search switch controls this tool.',
						inputSchema: webSchema,
						toModelOutput: ({ output }) => webModelOutput(output),
						execute: (input, options) => { recovery.commit(); return web(input, options.abortSignal ?? signal); }
					})
				} : {})
			};
			const prompt = composeBeaconPrompt({ currentTime: systemTime, toolNames: Object.keys(tools) as BeaconToolName[], contextDescription });
			let ordinaryStep = 0; let observerError: unknown;
			let requestPhase: 'answer' | 'compaction' = 'answer', repairUsed = false, stepStarted = false;
			const steps = { remaining: 20 };
			let installedSummary: BeaconCompaction | undefined;
			let requestMessages = prepareMessages(messages);
			let usageAnchor: BeaconUsageAnchor | undefined, lastPrepared: PreparedBeaconRequest | undefined;
			const anchors = new Map<string, BeaconUsageAnchor>(), measuredRequests = new Map<string, PreparedBeaconRequest>();
			const prepared = (instructions: unknown, messages: readonly unknown[], definitions: readonly { name: string; definition: unknown }[]): PreparedBeaconRequest => ({ source: { provider: connection.provider, baseURL: connection.baseURL, model: connection.model }, phase: requestPhase, limits, instructions, activeTools: definitions, messages, media: beaconMedia(messages), projectionFingerprint: beaconFingerprint(messages), contractFingerprint: beaconFingerprint({ instructions, definitions }), unitFingerprints: messages.map(beaconFingerprint) });
			const hardGate = (request: PreparedBeaconRequest) => {
				measuredRequests.set(request.contractFingerprint, request);
				const measured = measureBeaconRequest(request, anchors.get(request.contractFingerprint) ?? usageAnchor);
				if (measured.estimatedInput > measured.budget || requestPhase === 'answer' && measured.estimatedInput >= measured.trigger) { throw new BeaconPreparationError(); }
				return measured;
			};
			const guardedFetch: typeof fetch = async (url, init) => {
				if (typeof init?.body === 'string') {
					const body = JSON.parse(init.body) as { messages?: ModelMessage[]; input?: unknown[]; instructions?: string; tools?: { name?: string; function?: { name?: string } }[] };
					const responses = connection.provider === 'custom';
					const input = body.messages ?? [];
					lastPrepared = responses
						? prepared(body.instructions, body.input ?? [], (body.tools ?? []).map((definition, index) => ({ name: definition.name ?? String(index), definition })))
						: prepared(input.filter(message => message.role === 'system'), input.filter(message => message.role !== 'system'), (body.tools ?? []).map((definition, index) => ({ name: definition.function?.name ?? String(index), definition })));
					hardGate(lastPrepared);
				}
				return recovery.fetch(url, init);
			};
			const logicalStepId = () => `${generation?.requestId ?? 'request'}:${ordinaryStep}`;
			const protocol = new ProtocolRecorder();
			let newlyClosed: { count: number; failures: Map<string, BeaconModelFailure> } | undefined;
			const accepted = new Set<string>();
			const rejected = new Map<string, BeaconModelFailure>();
			const acceptTool = (toolCallId: string, toolName: string, input: unknown, output: import('./toolModelOutput').BeaconModelOutput) => {
				if (!generation) { return; }
				const key = `${logicalStepId()}:${toolCallId}`;
				if (accepted.has(key)) { return; }
				generation.acceptCompletedTool({ requestId: generation.requestId, turnIndex: generation.turnIndex, logicalStepId: logicalStepId(), toolCallId, toolName, input, output }); accepted.add(key);
			};
			const model = wrapLanguageModel({ model: adapters[connection.provider].createModel(connection, guardedFetch) as Exclude<LanguageModel, string>, middleware: { transformParams: async ({ params }) => { hardGate(prepared(undefined, params.prompt, (params.tools ?? []).map((definition, index) => ({ name: 'name' in definition ? definition.name : String(index), definition })))); return params; } } });
			const declarations = Object.entries(tools).map(([name, definition]) => ({ name, definition: { description: definition.description, inputSchema: definition.inputSchema } }));
			const snapshot = () => ({ requestId: generation?.requestId ?? 'temporary', sequence: protocol.sequence, turn: { provider: connection.provider, baseURL: connection.baseURL, model: connection.model, messages: protocol.closedMessages, stepEnds: protocol.stepEnds }, stepEnds: protocol.stepEnds });
			const prepareAnswer = async (current: readonly ModelMessage[], force = false): Promise<ModelMessage[]> => {
				if (observerError) { throw observerError; } requestSignal.throwIfAborted();
				if (steps.remaining < 1) { throw new Error('beacon-step-budget'); }
				const state = generation ? await generation.prepare(snapshot(), requestSignal) : { conversationId: 'temporary', checkpoints: installedSummary ? [installedSummary] : [], units: current.map((message, index): EffectiveUnit => ({ key: String(index), messageId: index, unitIndex: 0, isUserQuestion: message.role === 'user', messages: [message], fingerprint: beaconFingerprint(message) })) };
				const old = selectCompaction(state.units, state.checkpoints);
				let projection = prepareMessages(projectCompaction(state.units, old));
				const input = prepared(prompt.system, projection, declarations), measured = measureBeaconRequest(input, anchors.get(input.contractFingerprint));
				measuredRequests.set(input.contractFingerprint, input);
				// Keep complete tool exchanges. Compact only before the next request.
				if (!force && measured.estimatedInput < measured.trigger) { return projection; }
				if (repairUsed || stepStarted) { throw new BeaconPreparationError(); } repairUsed = true;
				const count = state.units.length - 1, already = old ? coveredCount(state.units, old) : 0;
				if (count <= already || count < 1) { throw new BeaconPreparationError(); }
				const prefix = state.units.slice(0, count), tailUnits = state.units.slice(count), question = state.units.findLast(unit => unit.isUserQuestion);
				const tail = [...(question && !tailUnits.includes(question) ? question.messages : []), ...tailUnits.flatMap(unit => [...unit.messages])];
				requestPhase = 'compaction';
				let summary: string;
				try { summary = (await compactBeaconContext({ model, prepared: { ...input, phase: 'compaction' }, units: prefix.slice(already), old, tail, context: capabilities.tools ? context?.compactionView?.() : undefined, parameters: connection.parameters, providerOptions, prepareMessages, steps }, requestSignal)).summary; }
				finally { requestPhase = 'answer'; }
				const last = prefix.at(-1)!;
				const candidate: BeaconCompaction = { schemaVersion: 1, coveredThrough: { messageId: last.messageId, unit: last.unitIndex }, prefixSha256: prefixFingerprint(prefix), summary, createdAt: Date.now(), ...(old ? { inputCompaction: { prefixSha256: old.prefixSha256, summarySha256: beaconFingerprint(old.summary) } } : {}) };
				projection = prepareMessages(projectCompaction(state.units, candidate));
				const after = measureBeaconRequest(prepared(prompt.system, projection, declarations));
				if (after.estimatedInput >= measured.estimatedInput || after.estimatedInput >= measured.trigger || after.estimatedInput > after.budget) { throw new Error('beacon-compaction-no-gain'); }
				if (generation) { await generation.commitCompaction(candidate, { conversationId: state.conversationId, requestId: generation.requestId, prefixSha256: candidate.prefixSha256 }, requestSignal); }
				installedSummary = candidate; usageAnchor = undefined; anchors.clear(); measuredRequests.clear(); return projection;
			};
			while (true) {
				const checkpoint = () => ({ type: 'protocol' as const, sequence: protocol.consumedSequence, turn: { provider: connection.provider, baseURL: connection.baseURL, model: connection.model, messages: protocol.messages, stepEnds: protocol.stepEnds.slice(0, protocol.consumedSequence) } });
				const attemptController = new AbortController();
				const result = streamText({
					model,
					system: prompt.system,
					messages: requestMessages,
					prepareStep: async ({ messages }) => {
						if (observerError) { throw observerError; }
						const current = newlyClosed ? [...messages.slice(0, -newlyClosed.count), ...normalizeNewToolFailures(messages.slice(-newlyClosed.count), newlyClosed.failures)] : messages;
						newlyClosed = undefined;
						return { messages: await prepareAnswer(prepareMessages(current)), maxOutputTokens };
					},
					providerOptions,
					// SDK's default logger includes request bodies. Report through the
					// classified diagnostics and the consumed error stream instead.
					onError: () => {},
					onStepEnd: step => {
						try {
							const failures = new Map<string, BeaconModelFailure>();
							for (const part of step.content) {
								if (part.type === 'tool-error' || part.type === 'tool-call' && part.invalid) {
									if (!failures.has(part.toolCallId)) { failures.set(part.toolCallId, sdkToolFailure(part.error)); }
								}
							}
							for (const part of step.content) { if (!requestSignal.aborted && part.type === 'tool-call' && failures.has(part.toolCallId)) { acceptTool(part.toolCallId, part.toolName, part.input, modelFailureOutput(failures.get(part.toolCallId)!)); } }
							newlyClosed = { count: step.response.messages.length, failures };
							protocol.seal(normalizeNewToolFailures(step.response.messages, failures), logicalStepId());
							generation?.acceptClosed({ requestId: generation.requestId, sequence: protocol.sequence, turn: { provider: connection.provider, baseURL: connection.baseURL, model: connection.model, messages: protocol.closedMessages, stepEnds: protocol.stepEnds }, stepEnds: protocol.stepEnds });
							ordinaryStep++;
							steps.remaining--; repairUsed = false; stepStarted = false;
							if (lastPrepared && step.usage.inputTokens && step.usage.inputTokens > 0) { usageAnchor = { source: lastPrepared.source, phase: lastPrepared.phase, inputTokens: step.usage.inputTokens, projectionFingerprint: lastPrepared.projectionFingerprint, contractFingerprint: lastPrepared.contractFingerprint, unitFingerprints: lastPrepared.unitFingerprints }; }
							if (step.usage.inputTokens && step.usage.inputTokens > 0) { for (const value of measuredRequests.values()) { if (value.phase === 'answer') { anchors.set(value.contractFingerprint, { source: value.source, phase: value.phase, inputTokens: step.usage.inputTokens, projectionFingerprint: value.projectionFingerprint, contractFingerprint: value.contractFingerprint, unitFingerprints: value.unitFingerprints }); } } }
							measuredRequests.clear();
						} catch (error) { observerError = error; }
					},
					onToolExecutionEnd: event => {
						if (!generation) { return; }
						try {
							const name = event.toolCall.toolName, result = event.toolOutput;
							if (result.type === 'tool-error' && requestSignal.aborted) { return; }
							const output = result.type === 'tool-error' ? modelFailureOutput(sdkToolFailure(result.error)) : name === 'inspectFile' ? fileModelOutput(result.output as FileOutput) : name === 'browseWeb' ? webModelOutput(result.output as WebOutput) : contextModelOutput(name as BeaconContextToolName, result.output as ContextOutput);
							acceptTool(event.toolCall.toolCallId, name, event.toolCall.input, output);
						} catch (error) { observerError = error; }
					},
					tools: Object.keys(tools).length ? tools : undefined,
					onChunk: ({ chunk }) => { if ((chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && chunk.text || chunk.type === 'tool-input-start' || chunk.type === 'tool-call') { stepStarted = true; } },
					onToolExecutionStart: () => { stepStarted = true; },
					stopWhen: () => steps.remaining <= 0,
					abortSignal: AbortSignal.any([requestSignal, attemptController.signal]),
					maxRetries: 0,
					...connection.parameters,
					maxOutputTokens
				});
				let startedStep = false;
				try {
					for await (const part of result.fullStream) {
						if (((part.type === 'text-delta' || part.type === 'reasoning-delta') && part.text) || part.type === 'tool-input-start' || part.type === 'tool-call') { recovery.commit(); }
						// finish-step is forwarded before onStepEnd finishes. The SDK waits for
						// that callback before starting another step or emitting the final finish.
						if (part.type === 'start-step') {
							if (startedStep) { protocol.finishStep(); yield checkpoint(); }
							startedStep = true;
						}
						if (part.type === 'text-delta' || part.type === 'reasoning-delta') {
							protocol.text(part.type === 'text-delta' ? 'text' : 'reasoning', part.id, part.text, part.providerMetadata);
							yield { type: part.type === 'text-delta' ? 'text' : 'reasoning', text: part.text, turn: checkpoint().turn, sequence: checkpoint().sequence };
						}
						if (part.type === 'text-end' || part.type === 'reasoning-end') { protocol.text(part.type === 'text-end' ? 'text' : 'reasoning', part.id, '', part.providerMetadata); yield checkpoint(); }
						if (part.type === 'finish') { protocol.finishStep(); yield checkpoint(); }
						if (part.type === 'tool-call') {
							rejected.delete(part.toolCallId);
							if (part.invalid) { rejected.set(part.toolCallId, sdkToolFailure(part.error)); }
							protocol.call({ type: 'tool-call', toolCallId: part.toolCallId, toolName: part.toolName, input: part.input, providerOptions: part.providerMetadata });
							if (Object.hasOwn(tools, part.toolName)) { yield { type: 'activity', activity: toolActivity(part.toolCallId, part.input, 'running', part.toolName) }; }
						}
						if (part.type === 'tool-result' && part.toolName === 'inspectFile') {
							const output = part.output as FileOutput;
							protocol.result({ type: 'tool-result', toolCallId: part.toolCallId, toolName: part.toolName, output: fileModelOutput(output), providerOptions: part.providerMetadata });
							yield checkpoint();
							yield { type: 'tool-result', result: { id: part.toolCallId, path: toolActivity(part.toolCallId, part.input, 'complete').path, input: part.input as FileInput, output } };
							yield { type: 'activity', activity: toolActivity(part.toolCallId, part.input, output?.ok === true ? 'complete' : 'error', part.toolName, output?.ok === true ? undefined : toolErrorCode(output?.code)) };
						}
						if (part.type === 'tool-result' && part.toolName === 'browseWeb') {
							const output = part.output as WebOutput;
							protocol.result({ type: 'tool-result', toolCallId: part.toolCallId, toolName: part.toolName, output: webModelOutput(output), providerOptions: part.providerMetadata });
							yield checkpoint();
							if (output.ok) { yield { type: 'web-result', sources: output.sources }; }
							yield { type: 'activity', activity: toolActivity(part.toolCallId, part.input, output.ok ? 'complete' : 'error', part.toolName, output.ok ? undefined : output.error) };
						}
						if (part.type === 'tool-result' && contextToolNames.includes(part.toolName as BeaconContextToolName)) {
							const output = part.output as ContextOutput;
							protocol.result({ type: 'tool-result', toolCallId: part.toolCallId, toolName: part.toolName, output: contextModelOutput(part.toolName as BeaconContextToolName, output), providerOptions: part.providerMetadata });
							yield checkpoint();
							yield { type: 'activity', activity: toolActivity(part.toolCallId, part.input, !output.error ? 'complete' : 'error', part.toolName, !output.error ? undefined : toolErrorCode(typeof output.error === 'object' ? output.error.code : output.error)) };
						}
						if (part.type === 'tool-error' && !requestSignal.aborted) {
							protocol.result({ type: 'tool-result', toolCallId: part.toolCallId, toolName: part.toolName, output: modelFailureOutput(rejected.get(part.toolCallId) ?? sdkToolFailure(part.error)), providerOptions: part.providerMetadata }); yield checkpoint();
							if (Object.hasOwn(tools, part.toolName)) { yield { type: 'activity', activity: toolActivity(part.toolCallId, part.input, 'error', part.toolName, rejected.get(part.toolCallId)?.code === 'invalid_arguments' || InvalidToolInputError.isInstance(part.error) ? 'invalid-input' : 'unavailable') }; }
						}
						if (part.type === 'error') { throw part.error; }
						if (part.type === 'finish' && part.finishReason !== 'stop') { throw new Error('incomplete-response'); }
					}
					if (observerError) { throw observerError; }
				} catch (error) {
					attemptController.abort();
					if (!requestSignal.aborted && !stepStarted && !repairUsed && (error instanceof BeaconPreparationError || error instanceof RequestRejectedError && error.code === 'CONTEXT_TOO_LARGE')) { requestMessages = await prepareAnswer(requestMessages, true); continue; }
					if (await recovery.retryStream(error)) { continue; }
					throw recovery.wrap(error);
				} finally { attemptController.abort(); }
				break;
			}
		} catch (error) { throw recovery.wrap(error); }
		finally { progress?.(undefined); }
	};
}

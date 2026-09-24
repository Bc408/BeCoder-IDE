/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import type { Generate } from './session';
import { normalizeBaseURL, type Connection } from './connection';

type Provider = ReturnType<typeof createDeepSeek> | ReturnType<typeof createOpenAICompatible>;

/**
 * Provider construction is deliberately delegated to the Vercel AI SDK.
 * Beacon owns the connection snapshot and SecretStorage boundary; it does not
 * implement provider-specific chat payloads or stream parsers.
 */
function createProvider(connection: Connection, fetchImplementation: typeof fetch): Provider {
	const options = {
		apiKey: connection.apiKey,
		baseURL: normalizeBaseURL(connection.baseURL, connection.provider),
		fetch: ((url, init) => fetchImplementation(url, { ...init, redirect: 'error' })) as typeof fetch,
	};
	return connection.provider === 'deepseek'
		? createDeepSeek(options)
		: createOpenAICompatible({ ...options, name: connection.provider });
}

export function createGenerator(readConnection: () => PromiseLike<Connection>, fetchImplementation: typeof fetch = fetch): Generate {
	return async function* (messages, signal) {
		const connection = await readConnection();
		if (connection.provider !== 'ollama' && !connection.apiKey) { throw new Error('missing-key'); }
		if (!connection.model.trim()) { throw new Error('missing-model'); }
		if (signal.aborted) { return; }
		const provider = createProvider(connection, fetchImplementation);
		const result = streamText({
			model: provider(connection.model),
			messages: [...messages],
			abortSignal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
			maxRetries: 0,
			maxOutputTokens: 8192
		});
		for await (const part of result.fullStream) {
			if (part.type === 'text-delta') { yield { type: 'text', text: part.text }; }
			if (part.type === 'reasoning-delta') { yield { type: 'reasoning', text: part.text }; }
			if (part.type === 'error') { throw part.error; }
			if (part.type === 'finish' && part.finishReason !== 'stop') { throw new Error('incomplete-response'); }
		}
	};
}

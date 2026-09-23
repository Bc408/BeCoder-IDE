/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { createDeepSeek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import type { Generate } from './session';

export function createGenerator(readKey: () => PromiseLike<string | undefined>, fetchImplementation?: typeof fetch): Generate {
	return async function* (messages, signal) {
		const key = await readKey();
		if (!key) { throw new Error('missing-key'); }
		if (signal.aborted) { return; }
		const provider = createDeepSeek({ apiKey: key, fetch: fetchImplementation });
		const result = streamText({
			model: provider('deepseek-v4-flash'),
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

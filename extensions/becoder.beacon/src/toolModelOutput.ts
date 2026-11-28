/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { InvalidToolInputError, NoSuchToolError, type JSONValue, type ModelMessage } from 'ai';
import type { CompletedToolFact } from './protocol';
import type { FileOutput } from './fileTools';
import type { ContextOutput } from './contextTools';
import type { BeaconContextToolName } from './contextToolContract';
import type { WebOutput } from './webTools';
import { contextResultNotes, fileResultNotes, webResultNotes } from './toolResultNotes';

export type BeaconModelOutput = CompletedToolFact['output'];
export interface BeaconModelFailure { code: string; message: string }

export function modelFailureOutput(error: BeaconModelFailure): BeaconModelOutput { return { type: 'json', value: { ok: false, error: { ...error } } }; }

export function fileModelOutput(output: FileOutput): BeaconModelOutput {
	const { failureCode, ...raw } = output;
	delete raw.code;
	if (!output.ok) { return { type: 'json', value: { ...raw, error: { code: failureCode ?? 'read_failed', message: output.error ?? 'The file could not be read.' } } }; }
	if (output.kind === 'image' && output.contents && output.mediaType) {
		return { type: 'content', value: [{ type: 'text', text: JSON.stringify({ ...raw, contents: undefined }) }, { type: 'file', mediaType: output.mediaType, data: { type: 'data', data: output.contents } }] };
	}
	const notes = fileResultNotes(output);
	return { type: 'json', value: { ...raw, ...(notes.length ? { notes } : {}) } };
}

export function webModelOutput(output: WebOutput): BeaconModelOutput {
	const notes = webResultNotes(output);
	return output.ok ? { type: 'json', value: { ok: true, sources: output.sources.map(source => ({ ...source })), ...(notes.length ? { notes } : {}) } } : modelFailureOutput({ code: output.error, message: ({ unavailable: 'The web lookup service is unavailable.', 'rate-limit': 'The web lookup service is rate limited.', timeout: 'The web lookup timed out.', 'invalid-response': 'The web lookup service returned an unreadable response.', 'invalid-input': 'Supply a search query or a public webpage URL for the selected operation.', budget: 'The web lookup budget for this answer is exhausted.' })[output.error] });
}

export function contextModelOutput(name: BeaconContextToolName, output: ContextOutput): BeaconModelOutput {
	if (output.error) {
		if (name === 'fetchProblem' && typeof output.error === 'object' && output.error.code === 'statement_language_unavailable' && Array.isArray(output.availableLanguages)) {
			return { type: 'json', value: { ok: false, error: output.error, availableLanguages: output.availableLanguages.filter(language => language === 'en' || language === 'zh-CN') } };
		}
		return modelFailureOutput(typeof output.error === 'object' ? output.error : { code: 'read_failed', message: 'The requested source could not be read.' });
	}
	const notes = contextResultNotes(name, output);
	return { type: 'json', value: JSON.parse(JSON.stringify({ ...output, ...(notes.length ? { notes } : {}) })) as JSONValue };
}

export function sdkToolFailure(error: unknown): BeaconModelFailure {
	return NoSuchToolError.isInstance(error) ? { code: 'unavailable', message: 'This tool is not available in this request.' }
		: InvalidToolInputError.isInstance(error) ? { code: 'invalid_arguments', message: 'The tool arguments do not match its declared parameters. Supply the required fields and permitted values.' }
			: { code: 'read_failed', message: 'The tool did not complete. No source contents were obtained from this call.' };
}

/** The caller supplies only the newly closed step, never the historical prefix. */
export function normalizeNewToolFailures(messages: readonly ModelMessage[], failures: ReadonlyMap<string, BeaconModelFailure>): ModelMessage[] {
	return messages.map(message => message.role !== 'tool' ? message : { ...message, content: message.content.map(part => part.type === 'tool-result' && failures.has(part.toolCallId) ? { ...part, output: modelFailureOutput(failures.get(part.toolCallId)!) } : part) });
}

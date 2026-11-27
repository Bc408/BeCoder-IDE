/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { ProtocolSource } from './protocol';
import { createHash } from 'crypto';

export interface PreparedBeaconRequest {
	source: ProtocolSource; phase: 'answer' | 'compaction'; limits: { contextWindow: number; maxInputTokens: number; maxOutputTokens: number };
	instructions: unknown; activeTools: readonly { name: string; definition: unknown }[]; messages: readonly unknown[];
	media: readonly { key: string; kind: string; inputTokens?: number }[]; projectionFingerprint: string; contractFingerprint: string; unitFingerprints: readonly string[];
}
export interface BeaconUsageAnchor { source: ProtocolSource; phase: 'answer' | 'compaction'; inputTokens: number; projectionFingerprint: string; contractFingerprint: string; unitFingerprints: readonly string[] }
export interface BeaconMeasurement { estimatedInput: number; budget: number; trigger: number; target: number; method: 'usage-anchor' | 'tokenizer' | 'utf8-estimate'; unknownMedia: readonly string[]; unknownReasoning: readonly string[]; coverage: 'estimated-complete' | 'unknown-media' | 'unknown-reasoning' }
export const beaconFingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const objectValue = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** Opaque media/reasoning bytes are not text tokens. Only the measurement projection changes. */
export function beaconTextRepresentation(value: unknown): unknown {
	if (Array.isArray(value)) { return value.map(beaconTextRepresentation); }
	if (!value || typeof value !== 'object') { return value; }
	let object = value as Record<string, unknown>;
	if (object.type === 'json') { return value; }
	if (object.type === 'reasoning') {
		const options = objectValue(object.providerOptions), openai = objectValue(options?.openai);
		object = { ...object,
			...(typeof object.encrypted_content === 'string' ? { encrypted_content: '[encrypted reasoning payload]' } : {}),
			...(typeof openai?.reasoningEncryptedContent === 'string' ? { providerOptions: { ...options, openai: { ...openai, reasoningEncryptedContent: '[encrypted reasoning payload]' } } } : {})
		};
	}
	if (object.type === 'input_image') { return { ...object, ...(typeof object.image_url === 'string' && object.image_url.startsWith('data:') ? { image_url: '[media payload]' } : {}) }; }
	if (object.type === 'input_file') { return { ...object, ...(typeof object.file_data === 'string' ? { file_data: '[media payload]' } : {}) }; }
	if (object.type === 'image' || object.type === 'file') {
		const result = { ...object };
		for (const key of ['image', 'data']) { if (key in result && (typeof result[key] !== 'string' || !(result[key] as string).startsWith('http'))) { result[key] = '[media payload]'; } }
		return result;
	}
	if (object.type === 'image_url' && object.image_url && typeof object.image_url === 'object') {
		const url = (object.image_url as { url?: unknown }).url;
		return { ...object, image_url: { ...object.image_url, ...(typeof url === 'string' && url.startsWith('data:') ? { url: '[media payload]' } : {}) } };
	}
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, beaconTextRepresentation(value)]));
}

function unknownReasoning(value: unknown, location: string): string[] {
	if (Array.isArray(value)) { return value.flatMap((item, index) => unknownReasoning(item, `${location}.${index}`)); }
	const object = objectValue(value);
	if (!object || object.type === 'json') { return []; }
	if (object.type === 'reasoning' && (typeof object.encrypted_content === 'string' || typeof objectValue(objectValue(object.providerOptions)?.openai)?.reasoningEncryptedContent === 'string')) { return [location]; }
	return Object.entries(object).flatMap(([key, child]) => unknownReasoning(child, `${location}.${key}`));
}

export function beaconMedia(value: unknown, location = 'input'): { key: string; kind: string }[] {
	if (Array.isArray(value)) { return value.flatMap((item, index) => beaconMedia(item, `${location}.${index}`)); }
	if (!value || typeof value !== 'object') { return []; }
	const object = value as Record<string, unknown>;
	if (object.type === 'json') { return []; }
	if (['image', 'image_url', 'file', 'input_image', 'input_file'].includes(String(object.type))) { return [{ key: location, kind: String(object.type) }]; }
	return Object.entries(object).flatMap(([key, child]) => beaconMedia(child, `${location}.${key}`));
}

export function measureBeaconRequest(input: PreparedBeaconRequest, anchor?: BeaconUsageAnchor): BeaconMeasurement {
	const { contextWindow: C, maxInputTokens: I, maxOutputTokens: O } = input.limits;
	if (![C, I, O].every(value => Number.isSafeInteger(value) && value > 0) || C <= O) { throw new Error('beacon-invalid-model-budget'); }
	const budget = Math.min(I, C - O);
	const unknownMedia = input.media.filter(media => !Number.isFinite(media.inputTokens) || media.inputTokens! <= 0).map(media => media.key);
	const opaqueReasoning = unknownReasoning(input.messages, 'messages');
	const knownMedia = input.media.reduce((total, media) => total + (Number.isFinite(media.inputTokens) && media.inputTokens! > 0 ? media.inputTokens! : 0), 0);
	const text = beaconTextRepresentation({ instructions: input.instructions, activeTools: input.activeTools, messages: input.messages });
	let estimatedInput = Buffer.byteLength(JSON.stringify(text), 'utf8') + 256 + 32 * input.messages.length + 64 * input.activeTools.length + knownMedia;
	let method: BeaconMeasurement['method'] = 'utf8-estimate';
	if (anchor && anchor.inputTokens > 0 && Number.isSafeInteger(anchor.inputTokens) && anchor.phase === input.phase && beaconFingerprint(anchor.source) === beaconFingerprint(input.source) && anchor.contractFingerprint === input.contractFingerprint && anchor.unitFingerprints.length <= input.unitFingerprints.length && anchor.unitFingerprints.every((value, index) => input.unitFingerprints[index] === value)) {
		const same = anchor.projectionFingerprint === input.projectionFingerprint;
		if (same) { estimatedInput = anchor.inputTokens; method = 'usage-anchor'; }
		else if (anchor.unitFingerprints.length < input.messages.length) {
			const suffix = input.messages.slice(anchor.unitFingerprints.length);
			estimatedInput = anchor.inputTokens + Buffer.byteLength(JSON.stringify(beaconTextRepresentation(suffix)), 'utf8') + 32 * suffix.length + knownMedia; method = 'usage-anchor';
		}
	}
	return { estimatedInput, budget, trigger: Math.floor(0.9 * budget), target: Math.floor(0.6 * budget), method, unknownMedia, unknownReasoning: opaqueReasoning, coverage: unknownMedia.length ? 'unknown-media' : opaqueReasoning.length ? 'unknown-reasoning' : 'estimated-complete' };
}

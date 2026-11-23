/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { ModelMessage } from 'ai';
import type { ProtocolSource } from './protocol';
import { createHash } from 'crypto';

export interface PreparedBeaconRequest {
	source: ProtocolSource; phase: 'answer' | 'compaction'; limits: { contextWindow: number; maxInputTokens: number; maxOutputTokens: number };
	instructions: unknown; activeTools: readonly { name: string; definition: unknown }[]; messages: readonly ModelMessage[];
	media: readonly { key: string; kind: string; inputTokens?: number }[]; projectionFingerprint: string; contractFingerprint: string; unitFingerprints: readonly string[];
}
export interface BeaconUsageAnchor { source: ProtocolSource; phase: 'answer' | 'compaction'; inputTokens: number; projectionFingerprint: string; contractFingerprint: string; unitFingerprints: readonly string[] }
export interface BeaconMeasurement { estimatedInput: number; budget: number; trigger: number; target: number; method: 'usage-anchor' | 'tokenizer' | 'utf8-estimate'; unknownMedia: readonly string[]; coverage: 'estimated-complete' | 'unknown-media' }
export const beaconFingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Media payload bytes have no honest text-token equivalent; keep their envelope and mark unknown. */
export function beaconTextRepresentation(value: unknown): unknown {
	if (Array.isArray(value)) { return value.map(beaconTextRepresentation); }
	if (!value || typeof value !== 'object') { return value; }
	const object = value as Record<string, unknown>;
	if (object.type === 'json') { return value; }
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

export function beaconMedia(value: unknown, location = 'input'): { key: string; kind: string }[] {
	if (Array.isArray(value)) { return value.flatMap((item, index) => beaconMedia(item, `${location}.${index}`)); }
	if (!value || typeof value !== 'object') { return []; }
	const object = value as Record<string, unknown>;
	if (object.type === 'json') { return []; }
	if (['image', 'image_url', 'file'].includes(String(object.type))) { return [{ key: location, kind: String(object.type) }]; }
	return Object.entries(object).flatMap(([key, child]) => beaconMedia(child, `${location}.${key}`));
}

export function measureBeaconRequest(input: PreparedBeaconRequest, anchor?: BeaconUsageAnchor): BeaconMeasurement {
	const { contextWindow: C, maxInputTokens: I, maxOutputTokens: O } = input.limits;
	if (![C, I, O].every(value => Number.isSafeInteger(value) && value > 0) || C <= O) { throw new Error('beacon-invalid-model-budget'); }
	const budget = Math.min(I, C - O);
	const unknownMedia = input.media.filter(media => !Number.isFinite(media.inputTokens) || media.inputTokens! <= 0).map(media => media.key);
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
	return { estimatedInput, budget, trigger: Math.floor(0.9 * budget), target: Math.floor(0.6 * budget), method, unknownMedia, coverage: unknownMedia.length ? 'unknown-media' : 'estimated-complete' };
}

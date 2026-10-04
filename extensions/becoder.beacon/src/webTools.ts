/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { isIP } from 'net';

export interface WebSource {
	id: string;
	title: string;
	url: string;
	text: string;
	kind: 'search' | 'page';
	retrievedAt: number;
	truncated: boolean;
}

export interface WebInput { operation: 'search' | 'fetch'; query?: string; url?: string }
export type WebError = 'unavailable' | 'rate-limit' | 'timeout' | 'invalid-response' | 'invalid-input' | 'budget';
export type WebOutput = { ok: true; sources: WebSource[] } | { ok: false; error: WebError };
export type WebTool = (input: WebInput, signal: AbortSignal) => Promise<WebOutput>;

const endpoint = 'https://mcp.exa.ai/mcp';
const responseByteLimit = 1024 * 1024;

/** Only public webpage addresses; requests themselves always go to the fixed Exa service. */
export function publicWebURL(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.length > 2048) { return; }
	try {
		const url = new URL(value);
		const host = url.hostname.toLowerCase().replace(/\.$/, '');
		if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || isIP(host) || host.startsWith('[') || !host.includes('.') || /(^|\.)(localhost|local|internal|lan|test|invalid|example)$/.test(host)) { return; }
		url.hash = '';
		return url.href;
	} catch { return; }
}

export function isWebSource(value: unknown): value is WebSource {
	if (!value || typeof value !== 'object') { return false; }
	const source = value as WebSource;
	return typeof source.id === 'string' && /^web-[a-f0-9]{16}$/.test(source.id) && typeof source.title === 'string' && source.title.length <= 512 && publicWebURL(source.url) === source.url && typeof source.text === 'string' && source.text.length <= 8000 && ['search', 'page'].includes(source.kind) && Number.isFinite(source.retrievedAt) && source.retrievedAt >= 0 && source.retrievedAt <= 8640000000000000 && typeof source.truncated === 'boolean';
}

class LookupError extends Error { constructor(readonly code: WebError) { super(code); } }

async function boundedText(response: Response): Promise<string> {
	if (!response.body) { throw new LookupError('invalid-response'); }
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = '';
	try {
		while (true) {
			const part = await reader.read();
			if (part.done) { return text + decoder.decode(); }
			bytes += part.value.byteLength;
			if (bytes > responseByteLimit) { throw new LookupError('invalid-response'); }
			text += decoder.decode(part.value, { stream: true });
		}
	} finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** The hosted endpoint returns either JSON or SSE containing the tools/call result. */
function resultText(raw: string, id: number): string {
	const payloads = raw.trimStart().startsWith('{') ? [raw] : raw.split(/\r?\n\r?\n/).map(event => event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')).filter(value => value && value !== '[DONE]');
	for (const payload of payloads) {
		let message: { id?: unknown; error?: unknown; result?: { isError?: boolean; content?: { type?: string; text?: unknown }[] } };
		try { message = JSON.parse(payload); } catch { throw new LookupError('invalid-response'); }
		if (message.id !== id) { continue; }
		if (message.error || message.result?.isError) {
			throw new LookupError(/rate.?limit|too many requests|\b429\b/i.test(JSON.stringify(message)) ? 'rate-limit' : 'unavailable');
		}
		if (!Array.isArray(message.result?.content)) { throw new LookupError('invalid-response'); }
		return message.result.content.filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n\n');
	}
	throw new LookupError('invalid-response');
}

/** Parse the verified Exa search and fetch text formats without accepting raw markup as UI. */
function sources(text: string, kind: WebSource['kind'], requestedURL?: string): WebSource[] {
	const normalized = text.replace(/\r\n/g, '\n');
	const markers = [...normalized.matchAll(/(?:^|\n)(?:Title: ?([^\n]*)|# ([^\n]+))\nURL: *(\S+)[^\n]*\n/g)];
	const result: WebSource[] = [];
	for (let index = 0; index < markers.length && result.length < (kind === 'page' ? 1 : 5); index++) {
		const marker = markers[index];
		const url = publicWebURL(marker[3]);
		if (kind === 'page' && url !== requestedURL) { throw new LookupError('invalid-response'); }
		if (!url || result.some(source => source.url === url)) { continue; }
		const content = normalized.slice(marker.index! + marker[0].length, kind === 'page' ? normalized.length : markers[index + 1]?.index ?? normalized.length).replace(/^(?:(?:Published|Author):[^\n]*\n)*(?:Text|Highlights|Content):\s*\n?/, '').trim();
		const limit = kind === 'search' ? 2000 : 8000;
		result.push({ id: 'web-' + createHash('sha256').update(url).digest('hex').slice(0, 16), title: ((marker[1] || marker[2] || '').trim() || new URL(url).hostname).slice(0, 512), url, text: content.slice(0, limit), kind, retrievedAt: Date.now(), truncated: content.length >= limit });
	}
	// Empty content is a valid empty search, but an unexpected page format is not success.
	if (text.trim() && !markers.length && !/^(no (?:results|search results|content) found|no results|\[\])\.?$/i.test(text.trim())) { throw new LookupError('invalid-response'); }
	return result;
}

export function webModelOutput(output: WebOutput) {
	return { type: 'json' as const, value: output.ok ? { ok: true, sources: output.sources.map(source => ({ ...source })) } : { ok: false, error: output.error } };
}

/** One bounded search owner per response. No keys, remote tool discovery, retries or local reads. */
export function createWebTool(request: typeof fetch = fetch): WebTool {
	let calls = 0;
	let remaining = 32000;
	return async (input, signal) => {
		if (signal.aborted) { signal.throwIfAborted(); }
		if (!input || typeof input !== 'object') { return { ok: false, error: 'invalid-input' }; }
		const query = typeof input.query === 'string' ? input.query.trim() : '';
		const url = publicWebURL(input.url);
		if (!['search', 'fetch'].includes(input.operation) || (input.operation === 'search' ? !query || query.length > 500 : !url)) { return { ok: false, error: 'invalid-input' }; }
		if (calls >= 6 || remaining <= 0) { return { ok: false, error: 'budget' }; }
		const id = ++calls;
		const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(25000)]);
		try {
			const response = await request(endpoint, {
				method: 'POST', headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, redirect: 'error', signal: combinedSignal,
				body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: input.operation === 'search'
					? { name: 'web_search_exa', arguments: { query, objective: 'Find reliable public sources that answer this query. Prefer original, official sources. Return useful facts and their source URLs.', numResults: 5 } }
					: { name: 'web_fetch_exa', arguments: { urls: [url], maxCharacters: Math.min(8000, remaining) } } })
			});
			if (!response.ok) { await response.body?.cancel(); throw new LookupError(response.status === 429 ? 'rate-limit' : 'unavailable'); }
			const found = sources(resultText(await boundedText(response), id), input.operation === 'search' ? 'search' : 'page', url);
			const included: WebSource[] = [];
			for (const source of found) {
				const overhead = source.id.length + source.title.length + source.url.length;
				if (remaining <= overhead) { break; }
				const length = Math.min(source.text.length, remaining - overhead);
				included.push({ ...source, text: source.text.slice(0, length), truncated: source.truncated || length < source.text.length });
				remaining -= overhead + length;
			}
			return { ok: true, sources: included };
		} catch (error) {
			if (signal.aborted) { signal.throwIfAborted(); }
			return { ok: false, error: error instanceof LookupError ? error.code : combinedSignal.aborted || (error instanceof Error && error.name === 'TimeoutError') ? 'timeout' : 'unavailable' };
		}
	};
}

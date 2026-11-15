/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RequestOptions } from 'https';
import type { ClientRequest, IncomingMessage } from 'http';
import { createBrotliDecompress, createGunzip, createInflate } from 'zlib';

export type LuoguHttpsRequest = (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;

/** Fixed Luogu HTTP operations using browser-owned credentials over Node HTTPS. */
export async function fetchLuoguDirect(session: Pick<Electron.Session, 'cookies' | 'getUserAgent'>, url: string, init: RequestInit, requestPort?: LuoguHttpsRequest): Promise<Response> {
	const target = new URL(url), method = init.method?.toUpperCase() ?? 'GET';
	const submit = /^\/fe\/api\/problem\/submit\/[a-zA-Z0-9_]+$/.test(target.pathname);
	const read = ['/ranking', '/_lfe/config', '/_lfe/tags/zh-CN', '/api/verify/captcha'].includes(target.pathname) || /^\/problem\/[a-zA-Z0-9_]+$/.test(target.pathname) || /^\/record\/[1-9]\d*$/.test(target.pathname);
	if (target.origin !== 'https://www.luogu.com.cn' || target.username || target.password || target.hash || !(method === 'GET' && read || method === 'POST' && submit) || [...target.searchParams].some(([key, value]) => key === '_contentOnly' ? value !== '1' : key !== 'contestId' || !/^[1-9]\d*$/.test(value))) { throw new Error('luogu-invalid-route'); }
	if (init.body !== undefined && init.body !== null && typeof init.body !== 'string') { throw new Error('luogu-invalid-body'); }
	const signal = init.signal;
	signal?.throwIfAborted();
	const cookies = await new Promise<Electron.Cookie[]>((resolve, reject) => {
		const abort = () => reject(signal?.reason ?? new Error('luogu-operation-cancelled'));
		signal?.addEventListener('abort', abort, { once: true });
		void session.cookies.get({ url: target.href }).then(value => { signal?.removeEventListener('abort', abort); resolve(value); }, error => { signal?.removeEventListener('abort', abort); reject(error); });
	});
	signal?.throwIfAborted();
	const selected = new Map<string, string>();
	for (const cookie of cookies) {
		if (!['_uid', '__client_id'].includes(cookie.name)) { continue; }
		if (/[;\r\n]/.test(cookie.value) || cookie.value.length > 8192 || selected.has(cookie.name) && selected.get(cookie.name) !== cookie.value) { throw new Error('luogu-invalid-session-cookie'); }
		selected.set(cookie.name, cookie.value);
	}
	const headers = new Headers(init.headers);
	headers.delete('cookie');
	if (selected.size) { headers.set('Cookie', ['_uid', '__client_id'].filter(name => selected.has(name)).map(name => name + '=' + selected.get(name)).join(';')); }
	headers.set('User-Agent', session.getUserAgent());
	// No encoding negotiation is needed. Decoders below still handle servers that compress anyway.
	headers.set('Accept-Encoding', 'identity');
	if (typeof init.body === 'string') { headers.set('Content-Length', String(Buffer.byteLength(init.body))); }
	const send = requestPort ?? (await import('https')).request;
	signal?.throwIfAborted();
	return new Promise<Response>((resolve, reject) => {
		let settled = false, response: IncomingMessage | undefined;
		let decoder: ReturnType<typeof createGunzip> | ReturnType<typeof createInflate> | ReturnType<typeof createBrotliDecompress> | undefined;
		const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
		const fail = (error: Error) => { if (settled) { return; } settled = true; cleanup(); decoder?.destroy(); response?.destroy(); req.destroy(error); reject(error); };
		const abort = () => fail(signal?.reason instanceof Error ? signal.reason : new Error('luogu-operation-cancelled'));
		const req = send(target, { method, headers: Object.fromEntries(headers), agent: false }, incoming => {
			response = incoming;
			incoming.on('error', fail);
			if (settled) { incoming.destroy(); return; }
			for (const cookie of incoming.headers['set-cookie'] ?? []) {
				const uid = /^_uid=([^;]*)/.exec(cookie)?.[1];
				if (uid !== undefined && uid !== (selected.get('_uid') ?? '0')) { fail(new Error('luogu-session-changed')); return; }
			}
			const encoding = incoming.headers['content-encoding'];
			decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : undefined;
			let encodedBytes = 0, decodedBytes = 0;
			incoming.on('data', (chunk: Buffer) => { encodedBytes += chunk.length; if (encodedBytes > 8 * 1024 * 1024) { fail(new Error('luogu-response-too-large')); } });
			const body = decoder ? incoming.pipe(decoder) : incoming;
			if (decoder) { decoder.on('error', fail); }
			const chunks: Buffer[] = [];
			body.on('data', (chunk: Buffer) => { decodedBytes += chunk.length; if (decodedBytes > 8 * 1024 * 1024) { fail(new Error('luogu-response-too-large')); } else if (!settled) { chunks.push(chunk); } });
			body.on('end', () => {
				if (settled) { return; }
				const responseHeaders = new Headers();
				for (const [name, value] of Object.entries(incoming.headers)) {
					if (value !== undefined && !['set-cookie', 'content-encoding', 'content-length'].includes(name)) { responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value); }
				}
				try {
					const status = incoming.statusCode ?? 500;
					const value = new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: responseHeaders });
					settled = true; cleanup(); resolve(value);
				} catch { fail(new Error('luogu-invalid-response')); }
			});
		});
		const timer = setTimeout(() => fail(new Error('luogu-request-timeout')), 6000);
		req.on('error', fail);
		req.setTimeout(6000, () => fail(new Error('luogu-request-timeout')));
		signal?.addEventListener('abort', abort, { once: true });
		if (signal?.aborted) { abort(); } else { req.end(init.body ?? undefined); }
	});
}

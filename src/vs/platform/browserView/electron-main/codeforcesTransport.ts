/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Session } from 'electron';

export interface CodeforcesPostInit { body: string; headers: Record<string, string>; signal: AbortSignal }
export interface CodeforcesPostResponse { status: number; location?: string; body: string }
export type CodeforcesPost = (url: string, init: CodeforcesPostInit) => Promise<CodeforcesPostResponse>;

/** One native dispatch. Redirect events are receipts, never permission to replay a POST. */
export function createCodeforcesPost(session: Session, requestFactory?: typeof import('electron').net.request): CodeforcesPost {
	return async (url, init) => {
		init.signal.throwIfAborted();
		const target = new URL(url);
		if (target.origin !== 'https://codeforces.com' || !/^\/contest\/[1-9]\d*\/submit$/.test(target.pathname) || target.hash || [...target.searchParams.keys()].some(key => !['csrf_token', 'adcd1e'].includes(key)) || !target.searchParams.get('csrf_token') || Buffer.byteLength(init.body) > 4 * 1024 * 1024) { throw new Error('codeforces-submit-target'); }
		const request = requestFactory ?? (await import('electron')).net.request;
		init.signal.throwIfAborted();
		return new Promise<CodeforcesPostResponse>((resolve, reject) => {
			let done = false;
			const req = request({ url, method: 'POST', session, useSessionCookies: true, redirect: 'manual' });
			const finish = (value?: CodeforcesPostResponse, error?: unknown) => {
				if (done) { return; } done = true; clearTimeout(timer); init.signal.removeEventListener('abort', abort);
				if (error) { reject(error); } else { resolve(value!); }
				req.abort();
			};
			const abort = () => finish(undefined, new Error('codeforces-request-cancelled'));
			const timer = setTimeout(() => finish(undefined, new Error('codeforces-request-timeout')), 15000);
			init.signal.addEventListener('abort', abort, { once: true });
			req.on('redirect', (status, _method, location) => finish({ status, location, body: '' }));
			req.on('response', response => {
				const chunks: Buffer[] = []; let size = 0;
				response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 4 * 1024 * 1024) { finish(undefined, new Error('codeforces-response-too-large')); } else { chunks.push(chunk); } });
				response.on('end', () => finish({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
				response.on('error', () => finish(undefined, new Error('codeforces-response-failed')));
			});
			req.on('error', () => finish(undefined, new Error('codeforces-request-failed')));
			try { for (const [key, value] of Object.entries(init.headers)) { req.setHeader(key, value); } init.signal.throwIfAborted(); req.end(init.body); } catch { finish(undefined, new Error('codeforces-request-failed')); }
		});
	};
}

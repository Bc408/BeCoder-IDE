/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Session } from 'electron';

export type OjLanguageRead = (url: string, signal: AbortSignal) => Promise<string>;

/** Fixed compiler-catalogue GETs only. Redirects are classified and never followed. */
export function createOjLanguageRead(session: Session, requestFactory?: typeof import('electron').net.request): OjLanguageRead {
	return async (url, signal) => {
		signal.throwIfAborted();
		let target: URL;
		try { target = new URL(url); } catch { throw new Error('oj-language-target'); }
		const cf = target.origin === 'https://codeforces.com' && /^\/contest\/[1-9]\d{0,5}\/submit$/.test(target.pathname) && /^[A-Z][A-Z0-9]*$/.test(target.searchParams.get('problemIndex') ?? '') && [...target.searchParams.keys()].length === 1;
		const atcoder = target.origin === 'https://atcoder.jp' && /^\/contests\/[a-zA-Z0-9_-]+\/submit$/.test(target.pathname) && /^[a-zA-Z0-9_-]+$/.test(target.searchParams.get('taskScreenName') ?? '') && [...target.searchParams.keys()].length === 1;
		if ((!cf && !atcoder) || target.username || target.password || target.hash) { throw new Error('oj-language-target'); }
		const request = requestFactory ?? (await import('electron')).net.request;
		signal.throwIfAborted();
		return new Promise<string>((resolve, reject) => {
			let done = false, req: Electron.ClientRequest;
			try { req = request({ url, method: 'GET', session, useSessionCookies: true, redirect: 'manual' }); }
			catch { reject(new Error('oj-language-request-failed')); return; }
			const finish = (value?: string, reason?: string) => {
				if (done) { return; } done = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
				if (reason) { reject(new Error(reason)); } else { resolve(value!); }
				try { req.abort(); } catch { /* Completion already owns the result. */ }
			};
			const abort = () => finish(undefined, 'oj-language-cancelled');
			const timer = setTimeout(() => finish(undefined, 'oj-language-timeout'), 15000);
			signal.addEventListener('abort', abort, { once: true });
			req.on('redirect', (_status, _method, location) => {
				let login = false;
				try {
					const destination = new URL(location, target);
					login = destination.origin === target.origin && !destination.username && !destination.password && !destination.hash && destination.pathname === (cf ? '/enter' : '/login');
				} catch { /* Malformed destinations are unavailable. */ }
				finish(undefined, login ? 'oj-language-login-required' : 'oj-language-redirect-unavailable');
			});
			req.on('response', response => {
				response.on('error', () => finish(undefined, 'oj-language-response-body-read'));
				if (response.statusCode !== 200) { finish(undefined, 'oj-language-response-unavailable'); return; }
				const chunks: Buffer[] = []; let size = 0;
				response.on('data', (chunk: Buffer) => {
					if (done) { return; }
					size += chunk.length;
					if (size > 4 * 1024 * 1024) { finish(undefined, 'oj-language-response-too-large'); } else { chunks.push(chunk); }
				});
				response.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
			});
			req.on('error', () => finish(undefined, 'oj-language-request-failed'));
			try { signal.throwIfAborted(); req.setHeader('Referer', target.origin + '/'); req.end(); }
			catch { finish(undefined, signal.aborted ? 'oj-language-cancelled' : 'oj-language-request-failed'); }
		});
	};
}

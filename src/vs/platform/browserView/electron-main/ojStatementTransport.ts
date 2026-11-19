/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal type-only OJ contract.
import type { ProblemRef } from 'becoder-oj-connect';
import type { Session } from 'electron';

export function assertOjStatementTarget(problem: ProblemRef): void {
	if (!problem || typeof problem.url !== 'string' || typeof problem.nativeId !== 'string') { throw new Error('oj-statement-target'); }
	let target: URL;
	try { target = new URL(problem.url); } catch { throw new Error('oj-statement-target'); }
	const at = problem.site === 'atcoder' && /^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/.exec(problem.nativeId);
	const cf = problem.site === 'codeforces' && /^([1-9]\d{0,5})\/([A-Z][A-Z0-9]*)$/.exec(problem.nativeId);
	const expected = at ? `https://atcoder.jp/contests/${at[1]}/tasks/${at[2]}` : cf ? `https://codeforces.com/contest/${cf[1]}/problem/${cf[2]}` : undefined;
	if (!expected || problem.url !== expected || target.href !== expected) { throw new Error('oj-statement-target'); }
}

/** Fixed official problem GET only; no redirects, website navigation, account export or source body. */
export function createOjStatementRead(session: Session, requestFactory?: typeof import('electron').net.request): (problem: ProblemRef, signal: AbortSignal) => Promise<string> {
	return async (problem, signal) => {
		signal.throwIfAborted(); assertOjStatementTarget(problem);
		const target = new URL(problem.url), request = requestFactory ?? (await import('electron')).net.request;
		signal.throwIfAborted();
		return new Promise<string>((resolve, reject) => {
			let done = false, req: Electron.ClientRequest;
			try { req = request({ url: problem.url, method: 'GET', session, useSessionCookies: true, redirect: 'manual', cache: 'no-store' }); }
			catch { reject(new Error('oj-statement-request-failed')); return; }
			const finish = (value?: string, reason?: string) => {
				if (done) { return; } done = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
				if (reason) { reject(new Error(reason)); } else { resolve(value!); }
				try { req.abort(); } catch { /* Completion already owns the result. */ }
			};
			const abort = () => finish(undefined, 'oj-statement-cancelled');
			const timer = setTimeout(() => finish(undefined, 'oj-statement-timeout'), 15000);
			signal.addEventListener('abort', abort, { once: true });
			req.on('redirect', (_status, _method, location) => {
				let login = false;
				try { const to = new URL(location, target); login = to.origin === target.origin && !to.username && !to.password && !to.hash && to.pathname === (problem.site === 'atcoder' ? '/login' : '/enter'); } catch { /* Invalid redirects fail closed. */ }
				finish(undefined, login ? problem.site + '-login-required' : 'oj-statement-redirect-unavailable');
			});
			req.on('response', response => {
				response.on('error', () => finish(undefined, 'oj-statement-response-body-read'));
				if (response.statusCode !== 200) { finish(undefined, 'oj-statement-response-unavailable'); return; }
				const raw = response.headers['content-type'], type = Array.isArray(raw) ? raw[0] : raw;
				if (typeof type !== 'string' || !/^text\/html(?:\s*;|\s*$)/i.test(type)) { finish(undefined, 'oj-statement-response-type'); return; }
				const chunks: Buffer[] = []; let size = 0;
				response.on('data', (chunk: Buffer) => { if (done) { return; } size += chunk.length; if (size > 8 * 1024 * 1024) { finish(undefined, 'oj-connect-response-too-large'); } else { chunks.push(chunk); } });
				response.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
			});
			req.on('error', () => finish(undefined, 'oj-statement-request-failed'));
			try { signal.throwIfAborted(); req.setHeader('Referer', target.origin + '/'); req.end(); }
			catch { finish(undefined, signal.aborted ? 'oj-statement-cancelled' : 'oj-statement-request-failed'); }
		});
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal type-only OJ contract.
import type { ProblemDocument, ProblemRef } from 'becoder-oj-connect';
import { session, WebContentsView } from 'electron';
import { assertOjStatementTarget } from './ojStatementTransport.js';
import { generateUuid } from '../../../base/common/uuid.js';

export interface OjStatementBundles { readonly oj: string; readonly companion?: string }
const shell = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\';"><title>OJ local parser</title>');
let offline: Electron.Session | undefined;
function offlineSession(): Electron.Session {
	if (!offline) {
		offline = session.fromPartition('becoder-oj-statement-parser', { cache: false });
		offline.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => callback({ cancel: details.url !== shell }));
		offline.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
		offline.setPermissionCheckHandler(() => false);
		offline.on('will-download', event => event.preventDefault());
	}
	return offline;
}

/** Original HTML stays detached; only our fixed bundled code executes in an unowned, offline sandbox. */
export async function parseOjStatement(problem: ProblemRef, html: string, bundles: OjStatementBundles, signal: AbortSignal): Promise<ProblemDocument> {
	signal.throwIfAborted(); assertOjStatementTarget(problem);
	if (Buffer.byteLength(html) > 8 * 1024 * 1024) { throw new Error('oj-connect-response-too-large'); }
	const view = new WebContentsView({ webPreferences: { session: offlineSession(), sandbox: true, nodeIntegration: false, contextIsolation: true, webviewTag: false, webSecurity: true, backgroundThrottling: false } }), contents = view.webContents;
	contents.setWindowOpenHandler(() => ({ action: 'deny' }));
	const navigate = (event: Electron.Event, url: string) => { if (url !== shell) { event.preventDefault(); } };
	contents.on('will-navigate', navigate); contents.on('will-redirect', navigate);
	let rejectStopped!: (error: Error) => void;
	const interrupted = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
	const close = () => { if (!contents.isDestroyed()) { contents.close({ waitForBeforeUnload: false }); } };
	const destroyed = new Promise<void>(resolve => contents.once('destroyed', () => resolve()));
	const abort = () => { rejectStopped(new Error('oj-statement-cancelled')); close(); };
	const timer = setTimeout(() => { rejectStopped(new Error('oj-statement-parse-timeout')); close(); }, 10000);
	signal.addEventListener('abort', abort, { once: true });
	try {
		signal.throwIfAborted(); await Promise.race([contents.loadURL(shell), interrupted]); signal.throwIfAborted();
		const input = JSON.stringify({ problem, html }).replace(/[\u2028\u2029]/g, value => value === '\u2028' ? '\\u2028' : '\\u2029');
		const code = `if(!crypto.randomUUID){Object.defineProperty(crypto,'randomUUID',{value:()=>${JSON.stringify(generateUuid())}});}\n${bundles.oj}\n${problem.site === 'codeforces' ? bundles.companion ?? '' : ''}\n(async () => { const {problem,html}=${input}; return problem.site==='atcoder' ? BeCoderOj.parseAtCoderProblem(problem,html) : BeCoderOj.parseCodeforcesProblem({problem,companion:JSON.parse(await BeCoderCompanion.parseCodeforcesHtml(problem.url,html))},html); })()`;
		const raw: unknown = await Promise.race([contents.executeJavaScriptInIsolatedWorld(1006, [{ code }]), interrupted]);
		signal.throwIfAborted();
		if (Buffer.byteLength(JSON.stringify(raw)) > 8 * 1024 * 1024) { throw new Error('oj-connect-response-too-large'); }
		const value = raw as Record<string, unknown> | undefined, ref = value?.ref as Record<string, unknown> | undefined;
		if (!value || typeof value !== 'object' || !ref || typeof ref !== 'object' || ref.url !== problem.url || ref.site !== problem.site || ref.nativeId !== problem.nativeId) { throw new Error('oj-connect-invalid-host-response'); }
		return raw as ProblemDocument;
	} finally { clearTimeout(timer); signal.removeEventListener('abort', abort); contents.removeListener('will-navigate', navigate); contents.removeListener('will-redirect', navigate); close(); await destroyed; }
}

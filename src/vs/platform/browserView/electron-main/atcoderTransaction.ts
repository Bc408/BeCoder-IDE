/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { combinedDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { createHash } from 'crypto';
import type { BrowserView } from './browserView.js';
import { atCoderTask, atCoderSubmitURL, type IAtCoderSourcePayload } from '../common/atcoderWorkflow.js';
import { atCoderReadinessScript, atCoderSendScript, atCoderHistoryOwner, parseAtCoderRecords, newAtCoderCandidates, type AtCoderSendResult, type IAtCoderShortcutResult } from '../common/atcoderShortcut.js';
import { checkAtCoderSourceResponse, decodeAtCoderHTML, extractAtCoderSourceHTML } from '../common/atcoderSubmission.js';

export interface AtCoderAttempt { id: string; taskURL: string; baseline: string; owner?: string; languageId: string; sourceHash: string }
export interface AtCoderTransactionPorts {
	view: Pick<BrowserView, 'owner' | 'getWebContentsView' | 'onDidClose' | 'onDidNavigate'>;
	requests: Map<string, AbortController>;
	prepare(payload: IAtCoderSourcePayload): Promise<unknown>;
	onAttempt?(attempt: AtCoderAttempt | undefined): void;
	onConfirmedDetail?(url: string, html: string, source: string): void;
	trace?(phase: string, elapsedMs: number): void;
}

/** Read-only work must release its caller when the owning transaction stops. */
async function interrupted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	let stop!: () => void;
	const cancelled = new Promise<never>((_, reject) => { stop = () => reject(signal.reason); signal.addEventListener('abort', stop, { once: true }); });
	if (signal.aborted) { stop(); }
	try { return await Promise.race([work, cancelled]); }
	finally { signal.removeEventListener('abort', stop); }
}

/** Fixed same-site GETs are bounded; no webpage is retained for record reads. */
export async function readAtCoderHTML(session: Electron.Session, url: string, signal: AbortSignal): Promise<string> {
	const target = new URL(url);
	if (target.origin !== 'https://atcoder.jp' || target.username || target.password || !/^\/contests\/[a-zA-Z0-9_-]+\/submissions\/(?:me|[1-9][0-9]*)$/.test(target.pathname)) { throw new Error('atcoder-read-route'); }
	signal.throwIfAborted();
	const response = await session.fetch(url, { redirect: 'error', signal, cache: 'no-store', headers: { Accept: 'text/html' } });
	checkAtCoderSourceResponse(response);
	const reader = response.body!.getReader(), chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const part = await reader.read();
			if (part.done) { break; }
			size += part.value.byteLength;
			if (size > 4 * 1024 * 1024) { throw new Error('atcoder-response-too-large'); }
			chunks.push(part.value);
		}
	} finally { await reader.cancel().catch(() => undefined); }
	signal.throwIfAborted();
	return Buffer.concat(chunks).toString('utf8');
}

async function confirm(ports: { session: Electron.Session; signal: AbortSignal; onConfirmedDetail?: AtCoderTransactionPorts['onConfirmedDetail'] }, attempt: AtCoderAttempt, history?: string): Promise<IAtCoderShortcutResult> {
	const task = atCoderTask(attempt.taskURL);
	if (!task) { throw new Error('atcoder-task-route'); }
	const base = 'https://atcoder.jp/contests/' + task.contestId;
	const rows = parseAtCoderRecords(history ?? await readAtCoderHTML(ports.session, base + '/submissions/me', ports.signal), task.contestId);
	const candidates = newAtCoderCandidates(rows, attempt.baseline, task.taskId, attempt.languageId, attempt.owner);
	if (candidates.length !== 1) { return { verified: false, status: candidates.length ? 'ambiguous' : 'unknown' }; }
	const candidate = candidates[0], url = base + '/submissions/' + candidate.id;
	const detailHTML = await readAtCoderHTML(ports.session, url, ports.signal);
	const source = decodeAtCoderHTML(extractAtCoderSourceHTML(detailHTML));
	if (createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex') !== attempt.sourceHash) { return { verified: false, status: 'source-mismatch' }; }
	ports.signal.throwIfAborted();
	ports.onConfirmedDetail?.(url, detailHTML, source);
	return { verified: true, id: candidate.id, url, owner: candidate.owner, status: 'WJ' };
}

/** Read-only recovery survives disposal of the short-lived submission page. */
export async function reconcileAtCoderTransaction(ports: { session: Electron.Session; signal?: AbortSignal; onConfirmedDetail?: AtCoderTransactionPorts['onConfirmedDetail'] }, attempt: AtCoderAttempt): Promise<IAtCoderShortcutResult> {
	const controller = new AbortController();
	const abort = () => controller.abort(ports.signal?.reason);
	ports.signal?.addEventListener('abort', abort, { once: true });
	if (ports.signal?.aborted) { abort(); }
	const timer = setTimeout(() => controller.abort(), 10000);
	try { return await confirm({ ...ports, signal: controller.signal }, attempt); }
	finally { clearTimeout(timer); controller.abort(); ports.signal?.removeEventListener('abort', abort); }
}

/** One normal verification and one in-page POST, then source-verified receipt. */
export async function runAtCoderTransaction(ports: AtCoderTransactionPorts, id: string, windowId: number, expectedURL: string, payload: IAtCoderSourcePayload): Promise<IAtCoderShortcutResult> {
	const view = ports.view;
	if (view.owner.mainWindowId !== windowId) { throw new Error('atcoder-owner'); }
	const task = atCoderTask(expectedURL);
	if (!task) { throw new Error('atcoder-task-route'); }
	if (ports.requests.has(id)) { throw new Error('atcoder-submission-busy'); }
	const contents = view.getWebContentsView().webContents;
	const submitURL = atCoderSubmitURL(expectedURL);
	const backgroundThrottling = contents.getBackgroundThrottling();
	const started = Date.now();
	const trace = (phase: string) => ports.trace?.(phase, Date.now() - started);
	const controller = new AbortController();
	ports.requests.set(id, controller);
	const close = combinedDisposable(view.onDidClose(() => controller.abort()), view.onDidNavigate(() => controller.abort()));
	let timedOut = false, verificationPending = false, attempted = false;
	const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 120000);
	let verificationTimer: ReturnType<typeof setTimeout> | undefined;
	const available = () => {
		controller.signal.throwIfAborted();
		if (contents.isDestroyed() || contents.getURL() !== submitURL) { throw new Error('atcoder-page-changed'); }
	};
	try {
		contents.setBackgroundThrottling(false);
		trace('preparing');
		const [history] = await Promise.all([readAtCoderHTML(contents.session, 'https://atcoder.jp/contests/' + task.contestId + '/submissions/me', controller.signal), interrupted(ports.prepare(payload), controller.signal)]);
		const before = parseAtCoderRecords(history, task.contestId);
		const owner = atCoderHistoryOwner(history, before);
		const attempt: AtCoderAttempt = { id: generateUuid(), taskURL: expectedURL, baseline: before.reduce((value, row) => BigInt(row.id) > BigInt(value) ? row.id : value, '0'), owner, languageId: payload.languageId, sourceHash: createHash('sha256').update(payload.source.replace(/\r\n/g, '\n')).digest('hex') };
		trace('prepared');
		while (true) {
			available();
			const ready: unknown = await interrupted(contents.executeJavaScriptInIsolatedWorld(1005, [{ code: atCoderReadinessScript(expectedURL, payload.languageId) }]), controller.signal);
			available();
			if (ready === false) {
				verificationPending = true;
				if (!verificationTimer) { trace('waiting-verification'); verificationTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 20000); }
				await interrupted(new Promise(resolve => setTimeout(resolve, 100)), controller.signal);
				continue;
			}
			if (ready !== true) { return { status: typeof ready === 'string' ? ready : 'atcoder-invalid-readiness', verified: false, stopped: true }; }
			if (verificationTimer) { clearTimeout(verificationTimer); verificationTimer = undefined; }
			trace('verification-ready');
			// A queued renderer invocation is unable to POST after this short lease.
			// Nothing asynchronous in the script precedes its final expiry check.
			const expiresAt = Date.now() + 6000;
			attempted = true;
			ports.onAttempt?.(attempt);
			let response: AtCoderSendResult;
			const sendTimer = setTimeout(() => controller.abort(new Error('atcoder-send-timeout')), 10000);
			try {
				trace('dispatching');
				response = await interrupted(contents.executeJavaScriptInIsolatedWorld(1005, [{ code: atCoderSendScript(expectedURL, payload.source, payload.languageId, attempt.id, expiresAt) }]), controller.signal) as AtCoderSendResult;
			} catch {
				// Retire any still-queued invocation before handing the channel back.
				if (!contents.isDestroyed()) { await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt - Date.now()))); }
				if (controller.signal.aborted) { return { status: 'unknown', verified: false, stopped: true }; }
				response = { kind: 'unknown' };
			} finally { clearTimeout(sendTimer); }
			if (response?.kind === 'pending') { attempted = false; ports.onAttempt?.(undefined); continue; }
			if (response?.kind === 'not-sent') { attempted = false; ports.onAttempt?.(undefined); return { status: response.status, verified: false, stopped: true }; }
			trace('response-received');
			available();
			const receiptHTML = response?.kind === 'response' && response.url === 'https://atcoder.jp/contests/' + task.contestId + '/submissions/me' && typeof response.html === 'string' && Buffer.byteLength(response.html) <= 4 * 1024 * 1024 ? response.html : undefined;
			const result = await confirm({ session: contents.session, signal: controller.signal, onConfirmedDetail: ports.onConfirmedDetail }, attempt, receiptHTML);
			if (result.verified) { trace('receipt-confirmed'); }
			return result;
		}
	} catch (error) {
		return { status: attempted ? 'unknown' : timedOut && verificationPending ? 'atcoder-browser-verification-required' : error instanceof Error ? error.message : 'not-sent', verified: false, stopped: true };
	} finally {
		clearTimeout(timer);
		if (verificationTimer) { clearTimeout(verificationTimer); }
		close.dispose();
		controller.abort();
		ports.requests.delete(id);
		if (!contents.isDestroyed()) { contents.setBackgroundThrottling(backgroundThrottling); }
		trace('released');
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { combinedDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { createHash } from 'crypto';
import type { BrowserView } from './browserView.js';
import { atCoderTask, type IAtCoderSourcePayload } from '../common/atcoderWorkflow.js';
import { atCoderSendScript, atCoderSendCleanupScript, atCoderSubmitMarker, parseAtCoderRecords, newAtCoderCandidates, type IAtCoderShortcutResult } from '../common/atcoderShortcut.js';
import { checkAtCoderSourceResponse, extractAtCoderSourceHTML } from '../common/atcoderSubmission.js';

export interface AtCoderAttempt { id: string; taskURL: string; baseline: string; owner?: string; languageId: string; sourceHash: string }
export interface AtCoderTransactionPorts {
	view: Pick<BrowserView, 'owner' | 'getWebContentsView' | 'onDidClose' | 'onDidNavigate'>;
	requests: Map<string, AbortController>;
	prepare(payload: IAtCoderSourcePayload): Promise<unknown>;
	onAttempt?(attempt: AtCoderAttempt): void;
	onInteraction?(): void;
}

/** Read-only recovery: one candidate and its source must match; this function never fills or submits. */
export async function reconcileAtCoderTransaction(ports: Pick<AtCoderTransactionPorts, 'view'>, attempt: AtCoderAttempt): Promise<IAtCoderShortcutResult> {
	const task = atCoderTask(attempt.taskURL);
	if (!task) { throw new Error('atcoder-task-route'); }
	const contents = ports.view.getWebContentsView().webContents;
	const base = `https://atcoder.jp/contests/${task.contestId}`;
	const controller = new AbortController();
	const watch = combinedDisposable(ports.view.onDidClose(() => controller.abort()), ports.view.onDidNavigate(() => controller.abort()));
	const timer = setTimeout(() => controller.abort(), 10000);
	const check = () => {
		if (controller.signal.aborted || contents.isDestroyed() || contents.isLoading()) { throw new Error('atcoder-page-changed'); }
		const current = new URL(contents.getURL());
		if (current.origin !== 'https://atcoder.jp' || !current.pathname.startsWith(`/contests/${task.contestId}/`)) { throw new Error('atcoder-page-changed'); }
	};
	const html = async (url: string) => {
		check();
		const response = await contents.session.fetch(url, { redirect: 'error', signal: controller.signal, headers: { Accept: 'text/html' } });
		checkAtCoderSourceResponse(response);
		const reader = response.body!.getReader(), chunks: Uint8Array[] = [];
		let size = 0;
		try {
			while (true) {
				const part = await reader.read(); if (part.done) { break; }
				size += part.value.byteLength; if (size > 4 * 1024 * 1024) { throw new Error('atcoder-response-too-large'); }
				chunks.push(part.value);
			}
		} finally { await reader.cancel().catch(() => undefined); }
		check(); return Buffer.concat(chunks).toString('utf8');
	};
	try {
		const rows = parseAtCoderRecords(await html(base + '/submissions/me'), task.contestId);
		const candidates = newAtCoderCandidates(rows, attempt.baseline, task.taskId, attempt.languageId, attempt.owner);
		if (candidates.length !== 1) { return { verified: false, status: candidates.length ? 'ambiguous' : 'unknown' }; }
		const candidate = candidates[0], url = base + '/submissions/' + candidate.id;
		const escaped = extractAtCoderSourceHTML(await html(url));
		const source = await contents.executeJavaScriptInIsolatedWorld(1005, [{ code: `(() => { const node=document.createElement('textarea'); node.innerHTML=${JSON.stringify(escaped)}; return node.value; })()` }]);
		check();
		if (typeof source !== 'string' || createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex') !== attempt.sourceHash) { return { verified: false, status: 'source-mismatch' }; }
		return { verified: true, id: candidate.id, url, owner: candidate.owner, status: 'WJ' };
	} finally { clearTimeout(timer); controller.abort(); watch.dispose(); }
}

/** One native send attempt confirms its receipt; record reading is a separate operation. */
export async function runAtCoderTransaction(ports: AtCoderTransactionPorts, id: string, windowId: number, expectedURL: string, payload: IAtCoderSourcePayload): Promise<IAtCoderShortcutResult> {
	const view = ports.view;
	if (view.owner.mainWindowId !== windowId) { throw new Error('atcoder-owner'); }
	const task = atCoderTask(expectedURL);
	if (!task) { throw new Error('atcoder-task-route'); }
	if (ports.requests.has(id)) { throw new Error('atcoder-submission-busy'); }
	const contents = view.getWebContentsView().webContents;
	const controller = new AbortController();
	ports.requests.set(id, controller);
	const prefix = `/contests/${task.contestId}`;
	const allowedPath = (path: string) => path === `${prefix}/tasks/${task.taskId}` || path === `${prefix}/submit` || path === `${prefix}/submissions/me`;
	let returnedToOwnList = false;
	const close = combinedDisposable(view.onDidClose(() => controller.abort()), view.onDidNavigate(event => {
		try {
			const url = new URL(event.url);
			if (url.origin !== 'https://atcoder.jp' || !allowedPath(url.pathname)) { controller.abort(); }
			if (url.pathname === `/contests/${task.contestId}/submissions/me`) { returnedToOwnList = true; }
		} catch { controller.abort(); }
	}));
	const timer = setTimeout(() => controller.abort(), 120000);
	const requestId = generateUuid();
	let attempted = false;
	let removeSubmitObserver: (() => void) | undefined;
	const base = `https://atcoder.jp/contests/${task.contestId}`;
	const available = () => {
		if (controller.signal.aborted || contents.isDestroyed()) { throw new Error('atcoder-tracking-stopped'); }
		const current = new URL(contents.getURL());
		if (current.origin !== 'https://atcoder.jp' || !allowedPath(current.pathname)) { throw new Error('atcoder-page-changed'); }
	};
	const html = async (url: string) => {
		available();
		const response = await contents.session.fetch(url, { redirect: 'error', signal: controller.signal, headers: { Accept: 'text/html' } });
		checkAtCoderSourceResponse(response);
		const reader = response.body!.getReader();
		const chunks: Uint8Array[] = [];
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
		available();
		return Buffer.concat(chunks).toString('utf8');
	};
	try {
		const before = parseAtCoderRecords(await html(base + '/submissions/me'), task.contestId);
		const owners = new Set(before.map(row => row.owner));
		if (owners.size > 1) { throw new Error('atcoder-account-ambiguous'); }
		const owner = before[0]?.owner;
		const baseline = before.reduce((value, row) => BigInt(row.id) > BigInt(value) ? row.id : value, '0');
		await ports.prepare(payload);
		available();
		const markAttempt = () => {
			if (attempted) { return; }
			attempted = true;
			ports.onAttempt?.({ id: requestId, taskURL: expectedURL, baseline, owner, languageId: payload.languageId, sourceHash: createHash('sha256').update(payload.source.replace(/\r\n/g, '\n')).digest('hex') });
		};
		// A manual native Submit can navigate before the next isolated-world read.
		// The private marker contains no source, account or verification token.
		const onSubmit = (event: Electron.Event<Electron.WebContentsConsoleMessageEventParams>) => {
			if (event.message === atCoderSubmitMarker(requestId) && event.frame === contents.mainFrame) { markAttempt(); }
		};
		contents.on('console-message', onSubmit);
		removeSubmitObserver = () => contents.removeListener('console-message', onSubmit);
		const sendCode = atCoderSendScript(expectedURL, payload.source, payload.languageId, requestId);
		let sent = false, interactionShown = false;
		while (!controller.signal.aborted) {
			available();
			if (!attempted && !returnedToOwnList && !contents.isLoading() && contents.getURL() === expectedURL) {
				try {
					const result: unknown = await contents.executeJavaScriptInIsolatedWorld(1005, [{ code: sendCode }]);
					// Known readiness failures return a value: Electron discards renderer Error details.
					if (typeof result === 'string') { return { status: result, verified: false, stopped: true }; }
					if (typeof result !== 'boolean') { throw new Error('atcoder-invalid-send-result'); }
					sent = result;
					if (sent) { markAttempt(); }
				} catch (error) {
					// An interrupted script may already have crossed the native send boundary.
					markAttempt();
					throw error;
				}
				if (!sent && !interactionShown) { interactionShown = true; ports.onInteraction?.(); }
			}
			if (returnedToOwnList) {
				if (!attempted) { return { status: 'not-sent', verified: false, stopped: true }; }
				const rows = parseAtCoderRecords(await html(base + '/submissions/me'), task.contestId);
				const candidates = newAtCoderCandidates(rows, baseline, task.taskId, payload.languageId, owner);
				if (candidates.length > 1) { return { status: 'ambiguous', verified: false }; }
				if (candidates.length === 1) {
					const candidate = candidates[0];
					const url = base + '/submissions/' + candidate.id;
					const escaped = extractAtCoderSourceHTML(await html(url));
					const source = await contents.executeJavaScriptInIsolatedWorld(1005, [{ code: `(() => { const node=document.createElement('textarea'); node.innerHTML=${JSON.stringify(escaped)}; return node.value; })()` }]);
					if (source !== payload.source.replace(/\r\n/g, '\n')) { return { status: 'source-mismatch', verified: false }; }
					return { id: candidate.id, url, owner: candidate.owner, status: 'WJ', verified: true };
				}
			}
			await new Promise(resolve => setTimeout(resolve, attempted || returnedToOwnList ? 2000 : 250));
		}
		return { status: attempted ? 'unknown' : 'not-sent', verified: false, stopped: true };
	} catch (error) {
		return { status: attempted ? 'unknown' : error instanceof Error ? error.message : 'not-sent', verified: false, stopped: true };
	} finally {
		clearTimeout(timer);
		removeSubmitObserver?.();
		close.dispose();
		controller.abort();
		ports.requests.delete(id);
		if (!contents.isDestroyed()) {
			await contents.executeJavaScriptInIsolatedWorld(1005, [{ code: atCoderSendCleanupScript(requestId) }]).catch(() => undefined);
		}
	}
}

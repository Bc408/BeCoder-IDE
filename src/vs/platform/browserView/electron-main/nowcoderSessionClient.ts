/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs.
import type { ProblemRef, INowcoderSourcePayload, SubmissionOutcome, RecordRef, LoginSummary } from 'becoder-oj-connect';
import { assertNowcoderProblem, nowcoderRecord } from '../common/nowcoderBridge.js';
import { nowcoderObject, nowcoderLanguages, parseNowcoderPage, parseNowcoderStatus, type NowcoderPage } from './nowcoderProtocol.js';

export interface NowcoderSessionPorts {
	fetch(url: string, init: RequestInit): Promise<Response>;
	synchronizeSession?(): Promise<void>;
	onSessionChange(listener: () => void): { dispose(): void };
	onIdentityChange?(): void;
}
const origin = 'https://ac.nowcoder.com';
const accountURL = 'https://gw-c.nowcoder.com/api/sparta/user/info/global/pc';

function cancellable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
	signal.throwIfAborted();
	return new Promise((resolve, reject) => {
		const abort = () => reject(signal.reason);
		signal.addEventListener('abort', abort, { once: true });
		void pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
	});
}

/** Fixed ACM requests in the browser's Session; no page, remote execution, retries or fallback route. */
export class NowcoderSessionClient {
	private generation = 0;
	private disposed = false;
	private busy = false;
	private owner: string | null | undefined;
	private credentialRevision = 0;
	private accountRead: Promise<{ owner: string | undefined; revision: number }> | undefined;
	private readonly requests = new Set<AbortController>();
	private readonly prepared = new Map<string, { page: NowcoderPage; ownerKey: string; generation: number; languages: Awaited<ReturnType<typeof nowcoderLanguages>> }>();
	private readonly records = new Map<string, { ref: RecordRef; generation: number; source: string; language: string; owner: string; problemTitle: string }>();
	private readonly reads = new Map<string, Set<AbortController>>();
	private readonly listener: { dispose(): void };
	constructor(private readonly ports: NowcoderSessionPorts) { this.listener = ports.onSessionChange(() => { void this.refreshIdentity().catch(() => undefined); }); }
	invalidate(): void { this.generation++; this.owner = undefined; this.accountRead = undefined; this.prepared.clear(); this.records.clear(); for (const controller of this.requests) { controller.abort(new Error('nowcoder-session-changed')); } }
	dispose(): void { this.disposed = true; this.invalidate(); this.listener.dispose(); }
	private async text(url: string, init: RequestInit, dispatch?: () => void): Promise<string> {
		if (this.disposed) { throw new Error('nowcoder-session-stopped'); }
		const controller = new AbortController(), outer = init.signal;
		const abort = () => controller.abort(outer?.reason);
		outer?.addEventListener('abort', abort, { once: true }); if (outer?.aborted) { abort(); }
		this.requests.add(controller);
		const timer = setTimeout(() => controller.abort(new Error('nowcoder-request-timeout')), 10000);
		try {
			controller.signal.throwIfAborted(); dispatch?.();
			const response = await this.ports.fetch(url, { ...init, credentials: 'include', redirect: 'manual', signal: controller.signal, headers: { Referer: origin + '/', ...init.headers } });
			if (!response.ok || response.url && response.url !== url) { throw new Error('nowcoder-http-' + response.status); }
			if (!response.body) { throw new Error('nowcoder-empty-response'); }
			const reader = response.body.getReader(), chunks: Uint8Array[] = [];
			let size = 0;
			try {
				for (; ;) { const part = await reader.read(); if (part.done) { break; } size += part.value.byteLength; if (size > 4 * 1024 * 1024) { throw new Error('nowcoder-response-too-large'); } chunks.push(part.value); }
			} finally { void reader.cancel().catch(() => undefined); }
			controller.signal.throwIfAborted();
			return Buffer.concat(chunks).toString('utf8');
		} catch (error) {
			throw controller.signal.aborted ? controller.signal.reason : error;
		} finally { clearTimeout(timer); this.requests.delete(controller); outer?.removeEventListener('abort', abort); }
	}
	private async readAccount(signal: AbortSignal): Promise<{ owner: string | undefined; revision: number }> {
		const epoch = this.generation;
		for (let attempt = 0; attempt < 2; attempt++) {
			const revision = this.credentialRevision;
			const value = nowcoderObject(JSON.parse(await this.text(accountURL, { signal, cache: 'no-store' })));
			const id = value.code === 0 ? nowcoderObject(value.data).userId : undefined;
			if (value.code !== 999 && ((typeof id !== 'number' || !Number.isSafeInteger(id)) && typeof id !== 'string' || !/^[1-9]\d*$/.test(String(id)))) { throw new Error('nowcoder-account-unknown'); }
			signal.throwIfAborted(); if (epoch !== this.generation || this.disposed) { throw new Error('nowcoder-session-changed'); }
			if (revision !== this.credentialRevision) { continue; }
			const owner = value.code === 999 ? undefined : String(id), next = owner ?? null;
			if (this.owner !== undefined && this.owner !== next) {
				this.invalidate(); this.owner = next; this.ports.onIdentityChange?.();
			} else { this.owner = next; }
			return { owner, revision };
		}
		throw new Error('nowcoder-account-unstable');
	}
	private async account(signal: AbortSignal): Promise<string | undefined> {
		signal.throwIfAborted();
		if (!this.accountRead) {
			const epoch = this.generation;
			const pending = Promise.resolve().then(() => {
				if (epoch !== this.generation || this.disposed) { throw new Error('nowcoder-session-changed'); }
				return this.readAccount(new AbortController().signal);
			}); this.accountRead = pending;
			void pending.finally(() => { if (this.accountRead === pending) { this.accountRead = undefined; } }).catch(() => undefined);
		}
		const result = await cancellable(this.accountRead, signal);
		if (result.revision !== this.credentialRevision) { throw new Error('nowcoder-account-unstable'); }
		return result.owner;
	}
	async refreshIdentity(): Promise<void> { this.credentialRevision++; await this.account(new AbortController().signal); }
	async login(signal: AbortSignal): Promise<LoginSummary> {
		const owner = await this.account(signal);
		return owner ? { site: 'nowcoder', state: 'signed-in', label: owner, profileUrl: 'https://ac.nowcoder.com/acm/contest/profile/' + owner } : { site: 'nowcoder', state: 'signed-out' };
	}
	private async page(problem: ProblemRef, signal: AbortSignal): Promise<NowcoderPage> {
		assertNowcoderProblem(problem); return parseNowcoderPage(problem, await this.text(problem.url, { signal }));
	}
	async readProblem(problem: ProblemRef, signal: AbortSignal) {
		const epoch = this.generation, page = await this.page(problem, signal);
		const assertCurrent = () => { signal.throwIfAborted(); if (epoch !== this.generation || this.disposed) { throw new Error('nowcoder-session-changed'); } };
		assertCurrent();
		try {
			if (!page.languageURL) { throw new Error('nowcoder-language-config-missing'); }
			const languages = await nowcoderLanguages(await this.text(page.languageURL, { signal }));
			assertCurrent();
			return { ...page.document, languages };
		} catch {
			assertCurrent();
			return { ...page.document, languageError: 'unavailable' as const };
		}
	}
	async prepare(problem: ProblemRef, signal: AbortSignal) {
		assertNowcoderProblem(problem); const epoch = this.generation;
		const [page, ownerKey] = await Promise.all([this.page(problem, signal), this.account(signal)]);
		if (!ownerKey) { throw new Error('nowcoder-login-required'); }
		if (!page.languageURL) { throw new Error('nowcoder-language-config-missing'); }
		const languages = await nowcoderLanguages(await this.text(page.languageURL, { signal }));
		signal.throwIfAborted(); if (epoch !== this.generation || this.disposed) { throw new Error('nowcoder-session-changed'); }
		this.prepared.set(problem.url, { page, ownerKey, generation: epoch, languages });
		return { ownerKey, languages, hasDraft: false };
	}
	async submit(problem: ProblemRef, payload: INowcoderSourcePayload, ownerKey: string, requestId: string, signal: AbortSignal): Promise<SubmissionOutcome> {
		let dispatched = false;
		try {
			assertNowcoderProblem(problem);
			const prepared = this.prepared.get(problem.url); this.prepared.delete(problem.url);
			if (!prepared || this.busy || this.disposed || prepared.ownerKey !== ownerKey || prepared.generation !== this.generation) { throw new Error('nowcoder-session-changed'); }
			if (!payload || typeof payload.source !== 'string' || !payload.source.trim() || Buffer.byteLength(payload.source) > 1024 * 1024 || typeof payload.fileName !== 'string' || !/^[^\\/\x00-\x1f]+\.(c|cpp|cc|cxx)$/i.test(payload.fileName)) { throw new Error('nowcoder-invalid-source'); }
			const language = prepared.languages.find(item => item.id === payload.languageId);
			if (!language) { throw new Error('nowcoder-language-changed'); }
			this.busy = true;
			try {
				await this.ports.synchronizeSession?.();
				const owner = await this.account(signal);
				signal.throwIfAborted();
				if (prepared.generation !== this.generation || this.disposed || owner !== prepared.ownerKey) { throw new Error('nowcoder-session-changed'); }
				const { page } = prepared;
				const body = new URLSearchParams({ questionId: page.questionId, tagId: page.tagId, subTagId: page.subTagId, doneQuestionId: page.doneQuestionId, content: payload.source, language: language.id, languageName: language.label });
				const value = nowcoderObject(JSON.parse(await this.text(origin + '/nccommon/submit_cd', { method: 'POST', signal, headers: { Origin: origin, Referer: problem.url, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: body.toString() }, () => { dispatched = true; })));
				if (value.code === 0) {
					const data = value.data;
					const id = data && typeof data === 'object' ? nowcoderObject(data).submissionId : data ?? value.submissionId;
					if ((typeof id === 'number' && Number.isSafeInteger(id) || typeof id === 'string') && /^[1-9]\d*$/.test(String(id))) {
						const ref = nowcoderRecord(problem, String(id));
						if (prepared.generation !== this.generation) { throw new Error('nowcoder-session-changed'); }
						this.records.set(ref.url, { ref, generation: this.generation, source: payload.source, language: language.label, owner: ownerKey, problemTitle: page.document.title }); return { kind: 'record', record: ref };
					}
				} else if (typeof value.code === 'number' && value.code !== 0 && typeof value.msg === 'string') {
					return { kind: 'not-sent', reason: value.code === 1125 ? 'nowcoder-browser-verification-required' : value.msg.slice(0, 1000) };
				}
				throw new Error('nowcoder-receipt-unconfirmed');
			} finally { this.busy = false; }
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return dispatched ? { kind: 'unconfirmed', problem, attemptId: requestId, message } : { kind: 'not-sent', reason: message };
		}
	}
	async readRecord(record: RecordRef, signal: AbortSignal) {
		const accepted = this.records.get(record.url);
		if (!accepted || accepted.generation !== this.generation || accepted.ref.id !== record.id || accepted.ref.problem.url !== record.problem.url || accepted.ref.problem.nativeId !== record.problem.nativeId || record.problem.site !== 'nowcoder') { throw new Error('nowcoder-record-unowned'); }
		const controller = new AbortController(), epoch = this.generation;
		const abort = () => controller.abort(signal.reason);
		signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) { abort(); }
		let reads = this.reads.get(record.url); if (!reads) { reads = new Set(); this.reads.set(record.url, reads); } reads.add(controller);
		try {
			const owner = await this.account(controller.signal);
			if (epoch !== this.generation || owner !== accepted.owner) { throw new Error('nowcoder-session-changed'); }
			const subTagId = record.problem.nativeId.startsWith('contest/') ? '1' : '0';
			const raw = JSON.parse(await this.text(origin + '/nccommon/status?' + new URLSearchParams({ submissionId: record.id, tagId: '4', subTagId }), { signal: controller.signal }));
			if (epoch !== this.generation) { throw new Error('nowcoder-session-changed'); }
			return { ...parseNowcoderStatus(record, raw), language: accepted.language, owner: accepted.owner, source: accepted.source, problemTitle: accepted.problemTitle };
		} finally { signal.removeEventListener('abort', abort); reads.delete(controller); if (!reads.size) { this.reads.delete(record.url); } }
	}
	releaseRecord(record: RecordRef): void { for (const controller of this.reads.get(record.url) ?? []) { controller.abort(new Error('nowcoder-record-released')); } }
}

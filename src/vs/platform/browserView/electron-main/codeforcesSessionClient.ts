/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs.
import type { ProblemRef, ICodeforcesSourcePayload, SubmissionOutcome, RecordRef, RecordSnapshot, LoginSummary } from 'becoder-oj-connect';
import { codeforcesAccount, codeforcesOrigin, codeforcesProblemParts, codeforcesRecord, codeforcesObject, codeforcesResources, parseCodeforcesForm, parseCodeforcesList, parseCodeforcesRecord, isCodeforcesDuplicateRejection, sameCodeforcesCompiler, type CodeforcesForm, type CodeforcesList } from './codeforcesProtocol.js';
import type { CodeforcesPost } from './codeforcesTransport.js';
import { randomBytes } from 'crypto';

export interface CodeforcesSessionPorts {
	trace?(event: string, details: Record<string, string | number | boolean>): void;
	fetch(url: string, init: RequestInit): Promise<Response>;
	post: CodeforcesPost;
	getSigningCookie(): Promise<string | undefined>;
	synchronizeSession?(): Promise<void>;
	onSessionChange(listener: () => void): { dispose(): void };
	onIdentityChange?(): void;
}
interface Prepared { form: CodeforcesForm; before: CodeforcesList; generation: number; created: number }
interface Attempt { problem: ProblemRef; owner: string; source: string; language: string; boundary: bigint; generation: number; created: number }
interface Accepted { ref: RecordRef; attempt: Attempt; csrf: string; initial?: RecordSnapshot; metadata: Pick<RecordSnapshot, 'language' | 'problemTitle' | 'submittedAt'>; released: boolean }
type RequestPhase = 'account' | 'submit-form' | 'submission-list' | 'submission-source' | 'source-post';
function normalize(source: string): string { return source.replace(/\r\n/g, '\n'); }
function cancellable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
	signal.throwIfAborted();
	return new Promise((resolve, reject) => {
		const abort = () => reject(signal.reason ?? new Error('codeforces-operation-cancelled'));
		signal.addEventListener('abort', abort, { once: true });
		void pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
	});
}
/** Matches the site's arithmetic protocol; cookie data stays inside this fixed Session client. */
function signingValue(raw: string): number {
	const cookie = raw.replace(/%u([\da-f]{4})|%([\da-f]{2})/gi, (_all, unicode: string | undefined, byte: string | undefined) => String.fromCharCode(parseInt(unicode ?? byte!, 16)));
	let result = 0;
	for (let i = 0; i < cookie.length; i++) {
		result = (result + (i + 1) * (i + 2) * cookie.charCodeAt(i)) % 1009;
		if (i % 3 === 0) { result++; } if (i % 2 === 0) { result *= 2; }
		if (i > 0) { result -= Math.floor(cookie.charCodeAt(Math.floor(i / 2)) / 2) * (result % 5); }
		result = ((result % 1009) + 1009) % 1009;
	}
	return result;
}

/** Fixed ordinary-practice operations. No page execution, preload, queue, resend or fallback. */
export class CodeforcesSessionClient {
	private generation = 0;
	private disposed = false;
	private busy = false;
	private requestSequence = 0;
	private owner: string | null | undefined;
	private accountRead: Promise<string | undefined> | undefined;
	private readonly requests = new Set<AbortController>();
	private readonly prepared = new Map<string, Prepared>();
	private readonly attempts = new Map<string, Attempt>();
	private readonly records = new Map<string, Accepted>();
	private readonly reads = new Map<string, Set<AbortController>>();
	private readonly listener: { dispose(): void };
	constructor(private readonly ports: CodeforcesSessionPorts) { this.listener = ports.onSessionChange(() => this.invalidate()); }
	private trace(event: string, details: Record<string, string | number | boolean>): void {
		try { this.ports.trace?.(event, details); } catch { /* Diagnostics cannot interrupt requests or cleanup. */ }
	}
	invalidate(reason: 'session-change' | 'identity-change' | 'account-navigation' | 'stopped' = 'session-change'): void {
		this.trace('session-invalidated', { reason, generation: this.generation, pendingRequests: this.requests.size });
		this.generation++; this.owner = undefined; this.prepared.clear(); this.attempts.clear(); this.records.clear(); this.accountRead = undefined;
		for (const controller of this.requests) { controller.abort(new Error(this.disposed ? 'codeforces-session-stopped' : 'codeforces-session-changed')); }
	}
	dispose(): void { this.disposed = true; this.invalidate('stopped'); this.listener.dispose(); }
	private observe(owner: string | undefined): void {
		const next = owner ?? null;
		if (this.owner !== undefined && this.owner !== next) { this.invalidate('identity-change'); this.owner = next; this.ports.onIdentityChange?.(); } else { this.owner = next; }
	}
	private valid(generation: number, signal: AbortSignal): void { signal.throwIfAborted(); if (this.disposed || generation !== this.generation) { throw new Error('codeforces-session-changed'); } }
	private async operation<T>(phase: RequestPhase, signal: AbortSignal, task: (inner: AbortSignal) => Promise<T>): Promise<T> {
		if (this.disposed) { throw new Error('codeforces-session-stopped'); }
		const requestId = ++this.requestSequence, started = Date.now();
		const controller = new AbortController(), abort = () => controller.abort(new Error('codeforces-operation-cancelled'));
		signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) { abort(); }
		this.requests.add(controller); const timer = setTimeout(() => controller.abort(new Error('codeforces-request-timeout')), 15000);
		this.trace('operation-start', { phase, requestId, generation: this.generation });
		try {
			controller.signal.throwIfAborted(); const value = await cancellable(task(controller.signal), controller.signal); controller.signal.throwIfAborted();
			this.trace('operation-complete', { phase, requestId, elapsedMs: Date.now() - started }); return value;
		} catch (error) {
			const failure = controller.signal.aborted ? controller.signal.reason : error;
			const reason = failure instanceof Error && /^codeforces-[a-z-]+$/.test(failure.message) ? failure.message : 'codeforces-request-failed';
			this.trace('operation-failed', { phase, requestId, elapsedMs: Date.now() - started, reason }); throw failure;
		}
		finally { clearTimeout(timer); signal.removeEventListener('abort', abort); this.requests.delete(controller); }
	}
	private async text(phase: RequestPhase, path: string, signal: AbortSignal, init: RequestInit = {}): Promise<string> {
		return this.operation(phase, signal, async inner => {
			const url = codeforcesOrigin + path;
			const response = await this.ports.fetch(url, { ...init, signal: inner, cache: 'no-store', credentials: 'include', redirect: 'manual', headers: { Referer: codeforcesOrigin + '/', ...init.headers } });
			if (!response.ok || response.url && response.url !== url) { throw new Error('codeforces-response-unavailable'); }
			if (!response.body) { throw new Error('codeforces-empty-response'); }
			const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
			try { for (; ;) { inner.throwIfAborted(); const part = await reader.read(); if (part.done) { break; } size += part.value.byteLength; if (size > 4 * 1024 * 1024) { throw new Error('codeforces-response-too-large'); } chunks.push(part.value); } }
			finally { void reader.cancel().catch(() => undefined); }
			inner.throwIfAborted(); return Buffer.concat(chunks).toString('utf8');
		});
	}
	private async account(signal: AbortSignal): Promise<string | undefined> {
		const epoch = this.generation, owner = codeforcesAccount(await this.text('account', '/', signal)); this.valid(epoch, signal); this.observe(owner); return owner;
	}
	async login(signal: AbortSignal): Promise<LoginSummary> {
		try {
			if (!this.accountRead) { const controller = new AbortController(); const pending = this.account(controller.signal); this.accountRead = pending; void pending.finally(() => { if (this.accountRead === pending) { this.accountRead = undefined; } }).catch(() => undefined); }
			const owner = await cancellable(this.accountRead, signal); signal.throwIfAborted();
			return owner ? { site: 'codeforces', state: 'signed-in', label: owner, profileUrl: codeforcesOrigin + '/profile/' + owner } : { site: 'codeforces', state: 'signed-out' };
		} catch { signal.throwIfAborted(); return { site: 'codeforces', state: 'unknown' }; }
	}
	private async list(problem: ProblemRef, signal: AbortSignal, page = 1): Promise<CodeforcesList> {
		const { contest } = codeforcesProblemParts(problem);
		try { return parseCodeforcesList(problem, await this.text('submission-list', '/contest/' + contest + '/my' + (page > 1 ? '/page/' + page : ''), signal), page); }
		catch (error) { if (error instanceof Error && error.message === 'codeforces-login-required') { this.observe(undefined); } throw error; }
	}
	async prepare(problem: ProblemRef, signal: AbortSignal): Promise<{ ownerKey: string; languages: CodeforcesForm['languages']; hasDraft: false }> {
		const { contest, index } = codeforcesProblemParts(problem), epoch = this.generation;
		const [form, before] = await Promise.all([this.text('submit-form', '/contest/' + contest + '/submit?problemIndex=' + index, signal).then(html => parseCodeforcesForm(problem, html)), this.list(problem, signal)]);
		this.valid(epoch, signal);
		if (form.ownerKey !== before.ownerKey) { throw new Error('codeforces-session-changed'); }
		this.observe(form.ownerKey); this.valid(epoch, signal);
		if (this.prepared.size >= 16) { this.prepared.delete(this.prepared.keys().next().value!); }
		this.prepared.set(problem.url, { form, before, generation: epoch, created: Date.now() });
		return { ownerKey: form.ownerKey, languages: form.languages, hasDraft: false };
	}
	private prune(): void { for (const [id, attempt] of this.attempts) { if (Date.now() - attempt.created > 15 * 60 * 1000) { this.attempts.delete(id); } } }
	private unconfirmed(attemptId: string, attempt: Attempt): SubmissionOutcome { return { kind: 'unconfirmed', problem: attempt.problem, attemptId, message: 'codeforces-receipt-unconfirmed' }; }
	async submit(problem: ProblemRef, payload: ICodeforcesSourcePayload, ownerKey: string, requestId: string, signal: AbortSignal): Promise<SubmissionOutcome> {
		let dispatched = false, attempt: Attempt | undefined;
		try {
			codeforcesProblemParts(problem); this.prune();
			if (this.busy || this.disposed || this.attempts.size >= 16 || typeof requestId !== 'string' || !requestId || requestId.length > 200 || this.attempts.has(requestId)) { throw new Error('codeforces-request-unavailable'); }
			const prepared = this.prepared.get(problem.url); this.prepared.delete(problem.url);
			if (!prepared || prepared.generation !== this.generation || prepared.form.ownerKey !== ownerKey || Date.now() - prepared.created > 120000) { throw new Error('codeforces-session-changed'); }
			if (!payload || typeof payload.source !== 'string' || !payload.source.trim() || Buffer.byteLength(payload.source) > 1048576 || typeof payload.fileName !== 'string' || !/^[^\\/\x00-\x1f]+\.(?:c|cpp|cc|cxx)$/i.test(payload.fileName)) { throw new Error('codeforces-invalid-source'); }
			const language = prepared.form.languages.find(value => value.id === payload.languageId);
			if (!language || (language.family === 'c') !== /\.c$/i.test(payload.fileName)) { throw new Error('codeforces-language-changed'); }
			this.busy = true;
			try {
				await this.ports.synchronizeSession?.(); this.valid(prepared.generation, signal);
				if (await this.account(signal) !== ownerKey) { throw new Error('codeforces-session-changed'); } this.valid(prepared.generation, signal);
				const cookie = await this.ports.getSigningCookie(); this.valid(prepared.generation, signal);
				if (!cookie || cookie.length > 8192) { throw new Error('codeforces-signing-cookie-unavailable'); }
				const fields = new URLSearchParams(prepared.form.fields), tta = signingValue(cookie), action = new URL(prepared.form.action);
				if (tta) { fields.set('_tta', String(tta)); } fields.set('programTypeId', language.id); fields.set('source', payload.source);
				action.searchParams.set('adcd1e', 'caf4f' + randomBytes(7).toString('hex').slice(0, 9));
				attempt = { problem: { ...problem }, owner: ownerKey, source: payload.source, language: language.label, boundary: prepared.before.rows.length ? BigInt(prepared.before.rows[0].id) : 0n, generation: prepared.generation, created: Date.now() };
				this.attempts.set(requestId, attempt); this.valid(attempt.generation, signal);
				dispatched = true;
				const response = await this.operation('source-post', signal, inner => this.ports.post(action.href, { signal: inner, body: fields.toString(), headers: { Origin: codeforcesOrigin, Referer: codeforcesOrigin + '/contest/' + codeforcesProblemParts(problem).contest + '/submit?problemIndex=' + codeforcesProblemParts(problem).index, 'Content-Type': 'application/x-www-form-urlencoded' } }));
				this.valid(attempt.generation, signal);
				const duplicate = response.status === 200 && isCodeforcesDuplicateRejection(problem, ownerKey, response.body);
				this.trace('submit-response', { status: response.status, category: duplicate ? 'duplicate-source' : 'receipt-check' });
				if (duplicate) { this.attempts.delete(requestId); return { kind: 'rejected', reason: 'codeforces-duplicate-source' }; }
				const expected = codeforcesOrigin + '/contest/' + codeforcesProblemParts(problem).contest + '/my';
				if (response.status !== 302 && response.status !== 303 || !response.location || new URL(response.location, action.href).href !== expected) { return this.unconfirmed(requestId, attempt); }
				return await this.confirm(requestId, attempt, signal);
			} finally { this.busy = false; }
		} catch (error) {
			if (dispatched && attempt) { return this.unconfirmed(requestId, attempt); }
			const message = error instanceof Error && /^codeforces-[a-z-]+$/.test(error.message) ? error.message : 'codeforces-preparation-failed';
			return { kind: 'not-sent', reason: message };
		}
	}
	private async source(record: RecordRef, csrf: string, signal: AbortSignal, row?: Parameters<typeof parseCodeforcesRecord>[2]): Promise<RecordSnapshot> {
		const data = codeforcesObject(JSON.parse(await this.text('submission-source', '/data/submitSource', signal, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Csrf-Token': csrf, 'X-Requested-With': 'XMLHttpRequest' }, body: new URLSearchParams({ submissionId: record.id, csrf_token: csrf }).toString() })));
		if (data.href !== new URL(record.url).pathname) { throw new Error('codeforces-record-mismatch'); }
		return parseCodeforcesRecord(record, data, row);
	}
	private async confirm(attemptId: string, attempt: Attempt, signal: AbortSignal): Promise<SubmissionOutcome> {
		this.valid(attempt.generation, signal);
		const candidates: { row: CodeforcesList['rows'][number]; csrf: string }[] = []; let complete = false;
		for (let page = 1; page <= 5; page++) {
			const list = await this.list(attempt.problem, signal, page); this.valid(attempt.generation, signal);
			this.observe(list.ownerKey); this.valid(attempt.generation, signal);
			if (list.ownerKey !== attempt.owner) { throw new Error('codeforces-session-changed'); }
			for (const row of list.rows) {
				if (BigInt(row.id) <= attempt.boundary) { continue; }
				const { contest, index } = codeforcesProblemParts(attempt.problem);
				if ([attempt.problem.url, codeforcesOrigin + '/problemset/problem/' + contest + '/' + index].includes(row.problemURL) && sameCodeforcesCompiler(attempt.language, row.language)) { candidates.push({ row, csrf: list.csrf }); }
			}
			// An old contest-history row cannot terminate another table's practice pagination.
			complete = !list.nextPage || list.rowsByTable.every(rows => !rows.length || BigInt(rows[rows.length - 1].id) <= attempt.boundary);
			if (complete) { break; }
		}
		if (!complete || candidates.length > 16) { return this.unconfirmed(attemptId, attempt); }
		const matches: { ref: RecordRef; initial: RecordSnapshot; csrf: string }[] = [];
		for (const { row, csrf } of candidates) {
			const ref = codeforcesRecord(attempt.problem, row.id), initial = await this.source(ref, csrf, signal, row); this.valid(attempt.generation, signal);
			if (typeof initial.source === 'string' && normalize(initial.source) === normalize(attempt.source)) { matches.push({ ref, initial: { ...initial, sourceVerification: 'matched' }, csrf }); }
		}
		if (matches.length !== 1) { return this.unconfirmed(attemptId, attempt); }
		const { ref, initial, csrf } = matches[0];
		if (this.records.size >= 64) {
			const oldest = [...this.records].find(([, value]) => value.released)?.[0] ?? this.records.keys().next().value!;
			for (const controller of this.reads.get(oldest) ?? []) { controller.abort(); } this.records.delete(oldest);
		}
		this.records.set(ref.url, { ref, attempt, csrf, initial, metadata: { language: initial.language, problemTitle: initial.problemTitle, submittedAt: initial.submittedAt }, released: false }); this.attempts.delete(attemptId); return { kind: 'record', record: ref };
	}
	async reconcile(attemptId: string, signal: AbortSignal): Promise<SubmissionOutcome> {
		this.prune(); const attempt = this.attempts.get(attemptId); if (!attempt || this.disposed) { throw new Error('codeforces-attempt-unowned'); }
		try { return await this.confirm(attemptId, attempt, signal); } catch { signal.throwIfAborted(); return this.unconfirmed(attemptId, attempt); }
	}
	async readRecord(record: RecordRef, signal: AbortSignal): Promise<RecordSnapshot> {
		const accepted = this.records.get(record.url);
		if (!accepted || accepted.ref.id !== record.id || accepted.ref.problem.url !== record.problem.url || accepted.ref.problem.nativeId !== record.problem.nativeId || record.problem.site !== 'codeforces') { throw new Error('codeforces-record-unowned'); }
		this.valid(accepted.attempt.generation, signal);
		const controller = new AbortController(), abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) { abort(); }
		let reads = this.reads.get(record.url); if (!reads) { reads = new Set(); this.reads.set(record.url, reads); } reads.add(controller);
		try {
			const list = await this.list(record.problem, controller.signal); this.observe(list.ownerKey); this.valid(accepted.attempt.generation, controller.signal);
			if (list.ownerKey !== accepted.attempt.owner) { throw new Error('codeforces-session-changed'); }
			accepted.released = false; accepted.csrf = list.csrf;
			const row = list.rows.find(value => value.id === record.id), snapshot = accepted.initial ?? await this.source(record, accepted.csrf, controller.signal, row); this.valid(accepted.attempt.generation, controller.signal);
			accepted.initial = undefined;
			let resources = codeforcesResources(snapshot, row);
			if (snapshot.phase === 'finished' && !/^Compilation error$/i.test(snapshot.rawStatus) && (resources.time === undefined || resources.memory === undefined)) {
				// The source can finish after the preceding list read. Refresh resources once without resending.
				try {
					const latest = await this.list(record.problem, controller.signal); this.observe(latest.ownerKey); this.valid(accepted.attempt.generation, controller.signal);
					if (latest.ownerKey !== accepted.attempt.owner) { throw new Error('codeforces-session-changed'); }
					accepted.csrf = latest.csrf;
					resources = codeforcesResources(snapshot, latest.rows.find(value => value.id === record.id));
				} catch (error) {
					this.valid(accepted.attempt.generation, controller.signal);
					if (error instanceof Error && error.message === 'codeforces-login-required') { this.observe(undefined); throw error; }
				}
			}
			return { ...accepted.metadata, ...snapshot, time: undefined, memory: undefined, ...resources, sourceVerification: typeof snapshot.source === 'string' ? normalize(snapshot.source) === normalize(accepted.attempt.source) ? 'matched' : 'mismatch' : 'unavailable' };
		} finally { signal.removeEventListener('abort', abort); reads.delete(controller); if (!reads.size) { this.reads.delete(record.url); } }
	}
	releaseRecord(record: RecordRef): void { for (const controller of this.reads.get(record.url) ?? []) { controller.abort(); } const accepted = this.records.get(record.url); if (accepted) { accepted.initial = undefined; accepted.released = true; } }
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs.
import type { ProblemRef, ProblemDocument, ProblemReadOptions, LoginSummary, LanguageOption, ILanqiaoSourcePayload, ILanqiaoProgress, SubmissionOutcome, RecordRef, RecordSnapshot } from 'becoder-oj-connect';
import type { LanqiaoTransport, LanqiaoOperation } from './lanqiaoTransport.js';
import { assertLanqiaoProblem, lanqiaoObject, lanqiaoAssets, lanqiaoCatalogueAsset, parseLanqiaoLanguages, parseLanqiaoProblem, lanqiaoQuestion, lanqiaoExecution, lanqiaoRecord, parseLanqiaoRecord, projectLanqiaoReport, type LanqiaoReportProjection } from './lanqiaoProtocol.js';
import { generateUuid } from '../../../base/common/uuid.js';

export interface LanqiaoSessionPorts {
	readonly transport: LanqiaoTransport;
	onSessionChange(listener: () => void): { dispose(): void };
	onIdentityChange?(): void;
	assertCurrent?(): void;
	now?(): number;
	pause?(ms: number, signal: AbortSignal): Promise<void>;
}
interface Preparation { problem: ProblemRef; owner: string; generation: number; questionId: string; languages: readonly LanguageOption[]; knownIds: ReadonlySet<string>; expires: number }
interface Attempt { problem: ProblemRef; owner: string; generation: number; questionId: string; source: string; language: 'c' | 'cpp'; languageLabel: string; requestId: string; sourceConsumed: boolean; reportConsumed: boolean; id?: string; projection?: LanqiaoReportProjection; expires: number }
interface Accepted { attempt: Attempt; ref: RecordRef; reads: Set<AbortController> }
export class LanqiaoSessionClient {
	private generation = 0;
	private credentialRevision = 0;
	private owner: string | null | undefined;
	private disposed = false;
	private busy = false;
	private progress: { attempt: Attempt; revision: number; signal: AbortSignal } | undefined;
	private readonly prepared = new Map<string, Preparation>();
	private readonly attempts = new Map<string, Attempt>();
	private readonly records = new Map<string, Accepted>();
	private readonly requests = new Set<AbortController>();
	private readonly listener: { dispose(): void };
	constructor(private readonly ports: LanqiaoSessionPorts) { this.listener = ports.onSessionChange(() => { this.credentialRevision++; this.ports.onIdentityChange?.(); }); }
	private current(signal: AbortSignal, generation = this.generation): void { signal.throwIfAborted(); if (this.disposed || generation !== this.generation) { throw new Error('lanqiao-session-changed'); } this.ports.assertCurrent?.(); }
	private async request(operation: LanqiaoOperation, signal: AbortSignal, beforeDispatch?: () => void): Promise<string> {
		this.current(signal);
		const controller = new AbortController(), abort = () => controller.abort(signal.reason);
		signal.addEventListener('abort', abort, { once: true }); this.requests.add(controller);
		try {
			const value = await this.ports.transport.request(operation, controller.signal, beforeDispatch);
			this.current(controller.signal);
			if (value.status !== 200) { throw new Error(value.status === 401 ? 'lanqiao-login-required' : 'lanqiao-http-' + value.status); }
			if (typeof value.body !== 'string' || Buffer.byteLength(value.body) > 4 * 1024 * 1024) { throw new Error('lanqiao-response-too-large'); }
			return value.body;
		} finally { signal.removeEventListener('abort', abort); this.requests.delete(controller); }
	}
	private async json(operation: LanqiaoOperation, signal: AbortSignal, beforeDispatch?: () => void): Promise<Record<string, unknown>> { return lanqiaoObject(JSON.parse(await this.request(operation, signal, beforeDispatch))); }
	private async account(signal: AbortSignal): Promise<{ id?: string; label?: string }> {
		const epoch = this.generation;
		for (let attempt = 0; attempt < 2; attempt++) {
			const revision = this.credentialRevision;
			let data: Record<string, unknown> | undefined;
			try { data = await this.json({ kind: 'account' }, signal); }
			catch (error) { if (!(error instanceof Error) || error.message !== 'lanqiao-login-required') { throw error; } }
			this.current(signal, epoch);
			if (revision !== this.credentialRevision) { continue; }
			if (data && !((typeof data.id === 'number' && Number.isSafeInteger(data.id) || typeof data.id === 'string') && /^[1-9]\d{0,19}$/.test(String(data.id)))) { throw new Error('lanqiao-account-unknown'); }
			const id = data ? String(data.id) : undefined, next = id ?? null;
			if (this.owner !== undefined && this.owner !== next) { this.invalidate(); this.owner = next; this.ports.onIdentityChange?.(); }
			else { this.owner = next; }
			return { id, ...(typeof data?.name === 'string' && data.name.length <= 512 ? { label: data.name } : {}) };
		}
		throw new Error('lanqiao-account-unstable');
	}
	async loginSummary(signal: AbortSignal): Promise<LoginSummary> {
		try { const owner = await this.account(signal); return { site: 'lanqiao', state: owner.id ? 'signed-in' : 'signed-out', ...(owner.label ? { label: owner.label } : {}) }; }
		catch { this.current(signal); return { site: 'lanqiao', state: 'unknown' }; }
	}
	private async problemData(problem: ProblemRef, signal: AbortSignal): Promise<Record<string, unknown>> {
		assertLanqiaoProblem(problem); const epoch = this.generation, revision = this.credentialRevision;
		const value = await this.json({ kind: 'problem', problem }, signal);
		if (revision !== this.credentialRevision) { await this.account(signal); }
		this.current(signal, epoch); return value;
	}
	async readProblem(problem: ProblemRef, options: ProblemReadOptions, signal: AbortSignal): Promise<ProblemDocument> { return parseLanqiaoProblem(problem, await this.problemData(problem, signal), options); }
	async readLanguages(problem: ProblemRef, signal: AbortSignal): Promise<readonly LanguageOption[]> {
		assertLanqiaoProblem(problem); const epoch = this.generation;
		const assets = lanqiaoAssets(await this.request({ kind: 'catalogue-page' }, signal));
		const runtime = await this.request({ kind: 'catalogue-asset', url: assets.runtime }, signal);
		const application = await this.request({ kind: 'catalogue-asset', url: assets.application }, signal);
		const url = await lanqiaoCatalogueAsset(runtime, application, assets.base);
		const languages = await parseLanqiaoLanguages(await this.request({ kind: 'catalogue-asset', url }, signal));
		this.current(signal, epoch); return languages;
	}
	private now(): number { return this.ports.now?.() ?? Date.now(); }
	private async pause(ms: number, signal: AbortSignal): Promise<void> {
		this.current(signal);
		if (this.ports.pause) { await this.ports.pause(ms, signal); this.current(signal); return; }
		await new Promise<void>((resolve, reject) => {
			const abort = () => { clearTimeout(timer); reject(signal.reason); };
			const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
			signal.addEventListener('abort', abort, { once: true });
		});
		this.current(signal);
	}
	async prepare(problem: ProblemRef, signal: AbortSignal): Promise<{ ownerKey: string; hasDraft: boolean; languages: readonly LanguageOption[] }> {
		assertLanqiaoProblem(problem); this.current(signal);
		const owner = await this.account(signal);
		if (!owner.id) { throw new Error('lanqiao-login-required'); }
		const generation = this.generation, revision = this.credentialRevision;
		const data = await this.problemData(problem, signal), questionId = lanqiaoQuestion(problem, data);
		const languages = await this.readLanguages(problem, signal);
		const previous = await this.json({ kind: 'records', problem }, signal);
		if (!Array.isArray(previous.results) || previous.results.length > 100) { throw new Error('lanqiao-invalid-record-list'); }
		const knownIds = new Set(previous.results.map(raw => lanqiaoObject(raw).submission_id).filter((id): id is string => typeof id === 'string' && /^[0-9a-f]{24}$/.test(id)));
		const after = await this.account(signal);
		this.current(signal, generation);
		if (after.id !== owner.id || revision !== this.credentialRevision) { throw new Error('lanqiao-session-changed'); }
		for (const [key, entry] of this.prepared) { if (entry.problem.url === problem.url || entry.expires < this.now()) { this.prepared.delete(key); } }
		if (this.prepared.size >= 16) { throw new Error('lanqiao-preparation-limit'); }
		const ownerKey = generateUuid();
		this.prepared.set(ownerKey, { problem: { ...problem }, owner: owner.id, generation, questionId, languages, knownIds, expires: this.now() + 120000 });
		return { ownerKey, hasDraft: false, languages };
	}
	private pending(attempt: Attempt): SubmissionOutcome { return { kind: 'unconfirmed', problem: { ...attempt.problem }, attemptId: attempt.requestId, message: 'lanqiao-receipt-unconfirmed' }; }
	private async identity(attempt: Pick<Attempt, 'owner' | 'generation'>, signal: AbortSignal): Promise<void> {
		this.current(signal, attempt.generation); const owner = await this.account(signal); this.current(signal, attempt.generation);
		if (owner.id !== attempt.owner) { throw new Error('lanqiao-session-changed'); }
	}
	private async confirm(attempt: Attempt, signal: AbortSignal): Promise<RecordSnapshot | undefined> {
		if (!attempt.id) { return undefined; }
		await this.identity(attempt, signal);
		const ref = lanqiaoRecord(attempt.problem, attempt.id);
		let data: Record<string, unknown>;
		try { data = await this.json({ kind: 'record', record: ref }, signal); }
		catch (error) { if (error instanceof Error && error.message === 'lanqiao-http-404') { return undefined; } throw error; }
		const snapshot = parseLanqiaoRecord(ref, data);
		if (data.language !== attempt.language || snapshot.source?.replace(/\r\n/g, '\n') !== attempt.source) { throw new Error('lanqiao-record-mismatch'); }
		const list = await this.json({ kind: 'records', problem: attempt.problem }, signal);
		if (!Array.isArray(list.results) || list.results.length > 100 || !list.results.some(raw => { const row = lanqiaoObject(raw); return row.submission_id === attempt.id && row.language === attempt.language; })) { return undefined; }
		await this.identity(attempt, signal);
		return { ...snapshot, language: attempt.languageLabel, sourceVerification: 'matched', ...(attempt.projection?.rows.length ? { groups: [{ name: 'Test Cases', rows: attempt.projection.rows }] } : {}) };
	}
	private accepted(attempt: Attempt, snapshot: RecordSnapshot): SubmissionOutcome {
		this.records.set(snapshot.ref.url, { attempt, ref: snapshot.ref, reads: new Set() });
		return { kind: 'record', record: snapshot.ref, observed: { attemptId: attempt.requestId, snapshot } };
	}
	readProgress(requestId: string): ILanqiaoProgress | undefined {
		this.ports.assertCurrent?.();
		const progress = this.progress;
		if (this.disposed || !progress || progress.signal.aborted || progress.attempt.requestId !== requestId || progress.attempt.generation !== this.generation || progress.revision !== this.credentialRevision) { return undefined; }
		const attempt = progress.attempt;
		return { attemptId: attempt.requestId, phase: attempt.reportConsumed ? 'confirming' : attempt.id ? 'judging' : 'sending', ...(attempt.projection?.rows.length ? { groups: [{ name: 'Test Cases', rows: structuredClone(attempt.projection.rows) }] } : {}) };
	}
	async send(problem: ProblemRef, payload: ILanqiaoSourcePayload, ownerKey: string, requestId: string, signal: AbortSignal): Promise<SubmissionOutcome> {
		assertLanqiaoProblem(problem); this.current(signal);
		const preparation = this.prepared.get(ownerKey);
		if (this.busy || !preparation || preparation.problem.url !== problem.url || preparation.generation !== this.generation || preparation.expires < this.now() || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId) || this.attempts.has(requestId)) { return { kind: 'not-sent', reason: 'lanqiao-preparation-expired' }; }
		const language = preparation.languages.find(option => option.id === payload?.languageId);
		if (!payload || typeof payload.source !== 'string' || !payload.source.trim() || Buffer.byteLength(payload.source) > 1024 * 1024 || typeof payload.fileName !== 'string' || !/^[^\\/\x00-\x1f]+\.(?:c|cpp|cc|cxx)$/i.test(payload.fileName) || !language || language.id !== (/\.c$/i.test(payload.fileName) ? 'c' : 'cpp')) { return { kind: 'not-sent', reason: 'lanqiao-invalid-source' }; }
		this.prepared.delete(ownerKey); this.busy = true;
		let attempt: Attempt | undefined;
		const deadline = this.now() + 120000;
		try {
			await this.identity(preparation, signal);
			const currentProblem = await this.problemData(problem, signal);
			if (lanqiaoQuestion(problem, currentProblem) !== preparation.questionId) { throw new Error('lanqiao-problem-changed'); }
			this.current(signal, preparation.generation);
			for (const [key, prior] of this.attempts) { if (prior.expires < this.now()) { this.attempts.delete(key); } }
			if (this.attempts.size >= 32) { throw new Error('lanqiao-attempt-limit'); }
			attempt = { problem: { ...problem }, owner: preparation.owner, generation: preparation.generation, questionId: preparation.questionId, source: payload.source.replace(/\r\n/g, '\n'), language: language.family, languageLabel: language.label, requestId, sourceConsumed: true, reportConsumed: false, expires: this.now() + 600000 };
			this.attempts.set(requestId, attempt);
			const revision = this.credentialRevision;
			this.progress = { attempt, revision, signal };
			const dispatch = () => { this.current(signal, preparation.generation); if (this.owner !== preparation.owner || revision !== this.credentialRevision) { throw new Error('lanqiao-session-changed'); } };
			// The right is consumed synchronously above, before transport can dispatch or throw.
			const source = await this.json({ kind: 'source', problem, source: payload.source, language: language.family }, signal, dispatch);
			const execution = lanqiaoExecution(source.submission_url, preparation.questionId);
			if (preparation.knownIds.has(execution.id)) { throw new Error('lanqiao-receipt-not-new'); }
			attempt.id = execution.id;
			let poll = 0;
			for (; ;) {
				if (this.now() >= deadline) { throw new Error('lanqiao-execution-timeout'); }
				await this.pause(poll < 3 ? 3000 : Math.min(1000 * 2 ** Math.min(poll - 2, 4), 10000), signal); poll++;
				this.current(signal, preparation.generation);
				if (this.now() >= deadline) { throw new Error('lanqiao-execution-timeout'); }
				const response = await this.json({ kind: 'execute', url: execution.url, questionId: preparation.questionId }, signal);
				const status = lanqiaoObject(response.data).execute_status;
				if (!Number.isSafeInteger(status) || Number(status) < 0) { throw new Error('lanqiao-invalid-execution'); }
				if (Number(status) >= 2) { break; }
			}
			await this.identity(attempt, signal);
			this.current(signal, preparation.generation);
			const reportRevision = this.credentialRevision;
			attempt.reportConsumed = true;
			try {
				const report = await this.json({ kind: 'report', problem, id: attempt.id }, signal, () => { this.current(signal, preparation.generation); if (this.owner !== preparation.owner || reportRevision !== this.credentialRevision) { throw new Error('lanqiao-session-changed'); } });
				attempt.projection = projectLanqiaoReport(report);
			} catch { this.current(signal, preparation.generation); /* A lost report never restores its right. Only official GETs may confirm. */ }
			for (; ;) {
				this.current(signal, preparation.generation);
				const snapshot = await this.confirm(attempt, signal);
				if (snapshot) { return this.accepted(attempt, snapshot); }
				if (this.now() >= deadline) { break; }
				await this.pause(2000, signal);
			}
			return this.pending(attempt);
		} catch (error) {
			this.ports.assertCurrent?.();
			if (this.disposed || preparation.generation !== this.generation) { throw new Error('lanqiao-session-changed'); }
			if (attempt?.sourceConsumed) { return this.pending(attempt); }
			return { kind: 'not-sent', reason: error instanceof Error && /^lanqiao-[a-z-]+$/.test(error.message) ? error.message : 'lanqiao-preparation-expired' };
		} finally { this.progress = undefined; this.busy = false; }
	}
	async reconcile(attemptId: string, signal: AbortSignal): Promise<SubmissionOutcome> {
		const attempt = this.attempts.get(attemptId); this.current(signal);
		if (!attempt || attempt.expires < this.now()) { throw new Error('lanqiao-attempt-unavailable'); }
		await this.identity(attempt, signal);
		if (!attempt.id) { return this.pending(attempt); }
		try { const snapshot = await this.confirm(attempt, signal); return snapshot ? this.accepted(attempt, snapshot) : this.pending(attempt); }
		catch { this.current(signal, attempt.generation); return this.pending(attempt); }
	}
	async readRecord(record: RecordRef, signal: AbortSignal): Promise<RecordSnapshot> {
		const accepted = this.records.get(record.url); this.current(signal);
		if (!accepted || record.id !== accepted.ref.id || record.problem.url !== accepted.ref.problem.url || record.problem.nativeId !== accepted.ref.problem.nativeId || record.problem.site !== 'lanqiao') { throw new Error('lanqiao-record-unavailable'); }
		const controller = new AbortController(), abort = () => controller.abort(signal.reason);
		signal.addEventListener('abort', abort, { once: true }); accepted.reads.add(controller);
		try { const result = await this.confirm(accepted.attempt, controller.signal); this.current(controller.signal, accepted.attempt.generation); if (!result) { throw new Error('lanqiao-record-unavailable'); } return result; }
		finally { signal.removeEventListener('abort', abort); accepted.reads.delete(controller); }
	}
	releaseRecord(record: RecordRef): void { const entry = this.records.get(record.url); if (entry) { entry.attempt.projection = undefined; for (const read of entry.reads) { read.abort(); } } }
	releasePreparation(ownerKey: string): void { this.prepared.delete(ownerKey); }
	invalidate(): void { this.generation++; this.progress = undefined; this.owner = undefined; this.prepared.clear(); this.attempts.clear(); this.records.clear(); for (const request of this.requests) { request.abort(new Error('lanqiao-session-changed')); } }
	dispose(): void { if (this.disposed) { return; } this.disposed = true; this.invalidate(); this.listener.dispose(); }
}

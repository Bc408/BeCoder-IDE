/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal type-only bundled extension contract.
import type { ProblemRef, RecordRef, RecordSnapshot, SubmissionOutcome, LanguageOption, ILuoguPrepared, ILuoguSourcePayload } from 'becoder-oj-connect';

export interface LuoguHostPage { viewId: string; url: string; generation?: number; ownerKey: string; languages: readonly LanguageOption[] }
export interface LuoguBridgePorts {
	newHandle(): string;
	isCurrent(page: LuoguHostPage): boolean;
	open(problem: ProblemRef, sourceUri: string): Promise<LuoguHostPage>;
	send(page: LuoguHostPage, problem: ProblemRef, payload: ILuoguSourcePayload, requestId: string): Promise<SubmissionOutcome>;
	cancel(page: LuoguHostPage, requestId: string): Promise<void>;
	release?(page: LuoguHostPage): void;
	readRecord(record: RecordRef): Promise<RecordSnapshot>;
	reconcile?(attemptId: string): Promise<SubmissionOutcome>;
}
interface Lease { page: LuoguHostPage; problem: ProblemRef; consumed: boolean; active: boolean; stopped: boolean }

export function assertLuoguProblem(value: ProblemRef): void {
	if (!value || value.site !== 'luogu') { throw new Error('luogu-problem-route'); }
	const url = new URL(value.url);
	const match = /^\/problem\/([a-zA-Z0-9_]+)$/.exec(url.pathname);
	const contest = url.searchParams.get('contestId');
	if (url.origin !== 'https://www.luogu.com.cn' || url.username || url.password || url.hash || !match || [...url.searchParams.keys()].some(key => key !== 'contestId') || (contest !== null && !/^[1-9]\d*$/.test(contest)) || value.nativeId !== match[1] + (contest ? '@' + contest : '')) { throw new Error('luogu-problem-route'); }
}

/** This window owns the lease; credentials and accepted-record receipts never come from UI messages. */
export class LuoguBridgeController {
	private readonly leases = new Map<string, Lease>();
	private readonly records = new Map<string, RecordRef>();
	private readonly attempts = new Map<string, ProblemRef>();
	private disposed = false;
	constructor(private readonly ports: LuoguBridgePorts) { }
	async prepare(input: ProblemRef, sourceUri: string): Promise<ILuoguPrepared> {
		if (this.disposed) { throw new Error('luogu-bridge-stopped'); }
		assertLuoguProblem(input);
		if (typeof sourceUri !== 'string' || !sourceUri.startsWith('file:') || sourceUri.length > 32768) { throw new Error('luogu-source-uri'); }
		const problem = { ...input }, page = await this.ports.open(problem, sourceUri);
		try {
			if (this.disposed) { throw new Error('luogu-bridge-stopped'); }
			if (!this.ports.isCurrent(page) || new URL(page.url).origin !== 'https://www.luogu.com.cn') { throw new Error('luogu-page-changed'); }
			if (!/^[1-9]\d*$/.test(page.ownerKey) || !Array.isArray(page.languages) || page.languages.length > 100 || page.languages.some(value => !/^\d+(?::o2)?$/.test(value.id) || !['c', 'cpp'].includes(value.family) || !value.label || value.label.length > 200)) { throw new Error('luogu-form-invalid'); }
		} catch (error) { this.ports.release?.(page); throw error; }
		const handle = this.ports.newHandle();
		this.leases.set(handle, { page, problem, consumed: false, active: false, stopped: false });
		return { handle, languages: structuredClone(page.languages), hasDraft: false };
	}
	private lease(handle: string): Lease {
		const lease = typeof handle === 'string' ? this.leases.get(handle) : undefined;
		if (this.disposed || !lease || lease.stopped) { throw new Error('luogu-invalid-handle'); }
		return lease;
	}
	private remember(value: SubmissionOutcome, problem: ProblemRef, attemptId: string): SubmissionOutcome {
		if (value.kind === 'record') {
			const record = value.record;
			if (record.problem.site !== 'luogu' || record.problem.url !== problem.url || record.problem.nativeId !== problem.nativeId || !/^[1-9]\d*$/.test(record.id) || record.url !== 'https://www.luogu.com.cn/record/' + record.id) { throw new Error('luogu-invalid-record'); }
			this.records.set(record.url, structuredClone(record));
		} else if (value.kind === 'unconfirmed') {
			if (value.attemptId !== attemptId || value.problem.url !== problem.url || value.problem.site !== 'luogu') { throw new Error('luogu-invalid-attempt'); }
			this.attempts.set(attemptId, problem);
		} else if (value.kind !== 'not-sent') { throw new Error('luogu-invalid-receipt'); }
		return structuredClone(value);
	}
	async send(handle: string, input: ILuoguSourcePayload): Promise<SubmissionOutcome> {
		const lease = this.lease(handle);
		if (lease.consumed) { throw new Error('luogu-handle-consumed'); }
		if (!this.ports.isCurrent(lease.page)) { throw new Error('luogu-page-changed'); }
		if (!input || typeof input.source !== 'string' || !input.source.trim() || new TextEncoder().encode(input.source).length > 1024 * 1024 || typeof input.fileName !== 'string' || !/^[^\\/\x00-\x1f]+\.(c|cpp|cc|cxx)$/i.test(input.fileName)) { throw new Error('luogu-source-invalid'); }
		if (!lease.page.languages.some(option => option.id === input.languageId)) { throw new Error('luogu-language-changed'); }
		lease.consumed = true; lease.active = true;
		try {
			const value = await this.ports.send(lease.page, lease.problem, { ...input }, handle);
			if (this.disposed || lease.stopped && value.kind !== 'record' && value.kind !== 'unconfirmed') { throw new Error('luogu-bridge-stopped'); }
			return this.remember(value, lease.problem, handle);
		} finally { lease.active = false; }
	}
	async readRecord(input: RecordRef): Promise<RecordSnapshot> {
		const record = this.records.get(input?.url);
		if (this.disposed || !record || input.id !== record.id || input.problem.url !== record.problem.url || input.problem.nativeId !== record.problem.nativeId || input.problem.site !== 'luogu') { throw new Error('luogu-invalid-record'); }
		const value = await this.ports.readRecord(structuredClone(record));
		if (this.disposed || value.ref.url !== record.url || value.ref.problem.url !== record.problem.url) { throw new Error('luogu-invalid-record'); }
		return structuredClone(value);
	}
	async reconcile(attemptId: string): Promise<SubmissionOutcome> {
		const problem = this.attempts.get(attemptId);
		if (this.disposed || !problem || !this.ports.reconcile) { throw new Error('luogu-invalid-attempt'); }
		const value = await this.ports.reconcile(attemptId);
		if (this.disposed) { throw new Error('luogu-bridge-stopped'); }
		return this.remember(value, problem, attemptId);
	}
	async cancel(handle: string): Promise<void> { await this.release(handle); }
	async release(handle: string): Promise<void> {
		const lease = this.leases.get(handle);
		if (!lease) { return; }
		this.leases.delete(handle); lease.stopped = true;
		if (lease.active) { await this.ports.cancel(lease.page, handle).catch(() => undefined); }
		this.ports.release?.(lease.page);
	}
	async dispose(): Promise<void> {
		this.disposed = true; this.records.clear(); this.attempts.clear();
		await Promise.all([...this.leases.keys()].map(handle => this.release(handle)));
	}
}

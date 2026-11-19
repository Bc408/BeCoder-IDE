/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal type-only bundled extension contract.
import type { ProblemRef, RecordRef, RecordSnapshot, SubmissionOutcome, LanguageOption, ICodeforcesPrepared, ICodeforcesSourcePayload } from 'becoder-oj-connect';

export function assertCodeforcesProblem(problem: ProblemRef): void {
	if (!problem || problem.site !== 'codeforces' || !/^[1-9]\d*\/[A-Z][A-Z0-9]*$/.test(problem.nativeId) || problem.url !== 'https://codeforces.com/contest/' + problem.nativeId.replace('/', '/problem/')) { throw new Error('codeforces-problem-route'); }
}
export function codeforcesRecord(problem: ProblemRef, id: string): RecordRef {
	assertCodeforcesProblem(problem);
	if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) { throw new Error('codeforces-invalid-record'); }
	return { problem, id, url: 'https://codeforces.com/contest/' + problem.nativeId.split('/')[0] + '/submission/' + id };
}

export interface CodeforcesHostPage { viewId: string; url: string; generation?: number; ownerKey: string; languages: readonly LanguageOption[] }
export interface CodeforcesBridgePorts {
	newHandle(): string;
	isCurrent(page: CodeforcesHostPage): boolean;
	open(problem: ProblemRef, sourceUri: string): Promise<CodeforcesHostPage>;
	send(page: CodeforcesHostPage, problem: ProblemRef, payload: ICodeforcesSourcePayload, requestId: string, signal: AbortSignal): Promise<SubmissionOutcome>;
	cancel(page: CodeforcesHostPage, requestId: string): Promise<void>;
	release?(page: CodeforcesHostPage): void;
	readRecord(record: RecordRef): Promise<RecordSnapshot>;
	reconcile?(attemptId: string): Promise<SubmissionOutcome>;
}
interface Lease { page: CodeforcesHostPage; problem: ProblemRef; consumed: boolean; active: boolean; stopped: boolean; controller: AbortController }

/** This window owns the lease; credentials and accepted-record receipts never come from UI messages. */
export class CodeforcesBridgeController {
	private readonly leases = new Map<string, Lease>();
	private readonly records = new Map<string, RecordRef>();
	private readonly attempts = new Map<string, ProblemRef>();
	private disposed = false;
	constructor(private readonly ports: CodeforcesBridgePorts) { }
	async prepare(input: ProblemRef, sourceUri: string): Promise<ICodeforcesPrepared> {
		if (this.disposed) { throw new Error('codeforces-bridge-stopped'); }
		assertCodeforcesProblem(input);
		if (typeof sourceUri !== 'string' || !sourceUri.startsWith('file:') || sourceUri.length > 32768) { throw new Error('codeforces-source-uri'); }
		const problem = { ...input }, page = await this.ports.open(problem, sourceUri);
		try {
			if (this.disposed) { throw new Error('codeforces-bridge-stopped'); }
			const url = new URL(page.url);
			if (!this.ports.isCurrent(page) || url.origin !== 'https://codeforces.com' || url.username || url.password) { throw new Error('codeforces-page-changed'); }
			if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(page.ownerKey) || !Array.isArray(page.languages) || !page.languages.length || page.languages.length > 100 || new Set(page.languages.map(value => value.id)).size !== page.languages.length || page.languages.some(value => !/^\d+$/.test(value.id) || !['c', 'cpp'].includes(value.family) || !value.label || value.label.length > 200)) { throw new Error('codeforces-form-invalid'); }
		} catch (error) { this.ports.release?.(page); throw error; }
		const handle = this.ports.newHandle();
		this.leases.set(handle, { page, problem, consumed: false, active: false, stopped: false, controller: new AbortController() });
		return { handle, languages: structuredClone(page.languages), hasDraft: false };
	}
	private lease(handle: string): Lease {
		const lease = typeof handle === 'string' ? this.leases.get(handle) : undefined;
		if (this.disposed || !lease || lease.stopped) { throw new Error('codeforces-invalid-handle'); }
		return lease;
	}
	private remember(value: SubmissionOutcome, problem: ProblemRef, attemptId: string): SubmissionOutcome {
		if (value.kind === 'record') {
			const record = value.record;
			if (record.problem.site !== 'codeforces' || record.problem.url !== problem.url || record.problem.nativeId !== problem.nativeId || !/^[1-9]\d*$/.test(record.id) || record.url !== codeforcesRecord(problem, record.id).url) { throw new Error('codeforces-invalid-record'); }
			this.records.set(record.url, structuredClone(record));
		} else if (value.kind === 'unconfirmed') {
			if (value.attemptId !== attemptId || value.problem.url !== problem.url || value.problem.nativeId !== problem.nativeId || value.problem.site !== 'codeforces') { throw new Error('codeforces-invalid-attempt'); }
			this.attempts.set(attemptId, problem);
		} else if (value.kind !== 'not-sent' && value.kind !== 'rejected') { throw new Error('codeforces-invalid-receipt'); }
		return structuredClone(value);
	}
	async send(handle: string, input: ICodeforcesSourcePayload): Promise<SubmissionOutcome> {
		const lease = this.lease(handle);
		if (lease.consumed) { throw new Error('codeforces-handle-consumed'); }
		if (!this.ports.isCurrent(lease.page)) { throw new Error('codeforces-page-changed'); }
		if (!input || typeof input.source !== 'string' || !input.source.trim() || new TextEncoder().encode(input.source).length > 1024 * 1024 || typeof input.fileName !== 'string' || !/^[^\\/\x00-\x1f]+\.(c|cpp|cc|cxx)$/i.test(input.fileName)) { throw new Error('codeforces-source-invalid'); }
		if (!lease.page.languages.some(option => option.id === input.languageId)) { throw new Error('codeforces-language-changed'); }
		lease.consumed = true; lease.active = true;
		try {
			const value = await this.ports.send(lease.page, lease.problem, { ...input }, handle, lease.controller.signal);
			if (this.disposed || lease.stopped && value.kind !== 'record' && value.kind !== 'unconfirmed') { throw new Error('codeforces-bridge-stopped'); }
			return this.remember(value, lease.problem, handle);
		} finally { lease.active = false; }
	}
	async readRecord(input: RecordRef): Promise<RecordSnapshot> {
		const record = this.records.get(input?.url);
		if (this.disposed || !record || input.id !== record.id || input.problem.url !== record.problem.url || input.problem.nativeId !== record.problem.nativeId || input.problem.site !== 'codeforces') { throw new Error('codeforces-invalid-record'); }
		const value = await this.ports.readRecord(structuredClone(record));
		if (this.disposed || value.ref.id !== record.id || value.ref.url !== record.url || value.ref.problem.url !== record.problem.url || value.ref.problem.nativeId !== record.problem.nativeId || value.ref.problem.site !== 'codeforces') { throw new Error('codeforces-invalid-record'); }
		return structuredClone(value);
	}
	async reconcile(attemptId: string): Promise<SubmissionOutcome> {
		const problem = this.attempts.get(attemptId);
		if (this.disposed || !problem || !this.ports.reconcile) { throw new Error('codeforces-invalid-attempt'); }
		const value = await this.ports.reconcile(attemptId);
		if (this.disposed) { throw new Error('codeforces-bridge-stopped'); }
		return this.remember(value, problem, attemptId);
	}
	async cancel(handle: string): Promise<void> { await this.release(handle); }
	async release(handle: string): Promise<void> {
		const lease = this.leases.get(handle);
		if (!lease) { return; }
		this.leases.delete(handle); lease.stopped = true; lease.controller.abort(new Error('codeforces-submission-cancelled'));
		if (lease.active) { await this.ports.cancel(lease.page, handle).catch(() => undefined); }
		this.ports.release?.(lease.page);
	}
	async dispose(): Promise<void> {
		this.disposed = true; this.records.clear(); this.attempts.clear();
		await Promise.all([...this.leases.keys()].map(handle => this.release(handle)));
	}
}

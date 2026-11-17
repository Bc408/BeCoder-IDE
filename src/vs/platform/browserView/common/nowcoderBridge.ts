/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal type-only bundled extension contract.
import type { ProblemRef, RecordRef, RecordSnapshot, SubmissionOutcome, LanguageOption, INowcoderPrepared, INowcoderSourcePayload } from 'becoder-oj-connect';

export function assertNowcoderProblem(problem: ProblemRef): void {
	if (!problem || problem.site !== 'nowcoder' || !/^(?:problem\/[1-9]\d*|contest\/[1-9]\d*\/[A-Z][A-Z0-9]*)$/.test(problem.nativeId) || problem.url !== 'https://ac.nowcoder.com/acm/' + problem.nativeId) { throw new Error('nowcoder-problem-route'); }
}
export function nowcoderRecord(problem: ProblemRef, id: string): RecordRef {
	assertNowcoderProblem(problem);
	if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) { throw new Error('nowcoder-invalid-record'); }
	return { problem, id, url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=' + id };
}

export interface NowcoderHostPage { viewId: string; url: string; generation?: number; ownerKey: string; languages: readonly LanguageOption[] }
export interface NowcoderBridgePorts {
	newHandle(): string;
	isCurrent(page: NowcoderHostPage): boolean;
	open(problem: ProblemRef, sourceUri: string): Promise<NowcoderHostPage>;
	send(page: NowcoderHostPage, problem: ProblemRef, payload: INowcoderSourcePayload, requestId: string): Promise<SubmissionOutcome>;
	cancel(page: NowcoderHostPage, requestId: string): Promise<void>;
	release?(page: NowcoderHostPage): void;
	readRecord(record: RecordRef): Promise<RecordSnapshot>;
	reconcile?(attemptId: string): Promise<SubmissionOutcome>;
}
interface Lease { page: NowcoderHostPage; problem: ProblemRef; consumed: boolean; active: boolean; stopped: boolean }

/** This window owns the lease; credentials and accepted-record receipts never come from UI messages. */
export class NowcoderBridgeController {
	private readonly leases = new Map<string, Lease>();
	private readonly records = new Map<string, RecordRef>();
	private readonly attempts = new Map<string, ProblemRef>();
	private disposed = false;
	constructor(private readonly ports: NowcoderBridgePorts) { }
	async prepare(input: ProblemRef, sourceUri: string): Promise<INowcoderPrepared> {
		if (this.disposed) { throw new Error('nowcoder-bridge-stopped'); }
		assertNowcoderProblem(input);
		if (typeof sourceUri !== 'string' || !sourceUri.startsWith('file:') || sourceUri.length > 32768) { throw new Error('nowcoder-source-uri'); }
		const problem = { ...input }, page = await this.ports.open(problem, sourceUri);
		try {
			if (this.disposed) { throw new Error('nowcoder-bridge-stopped'); }
			if (!this.ports.isCurrent(page) || new URL(page.url).origin !== 'https://ac.nowcoder.com') { throw new Error('nowcoder-page-changed'); }
			if (!/^[1-9]\d*$/.test(page.ownerKey) || !Array.isArray(page.languages) || page.languages.length > 100 || page.languages.some(value => !/^\d+$/.test(value.id) || !['c', 'cpp'].includes(value.family) || !value.label || value.label.length > 200)) { throw new Error('nowcoder-form-invalid'); }
		} catch (error) { this.ports.release?.(page); throw error; }
		const handle = this.ports.newHandle();
		this.leases.set(handle, { page, problem, consumed: false, active: false, stopped: false });
		return { handle, languages: structuredClone(page.languages), hasDraft: false };
	}
	private lease(handle: string): Lease {
		const lease = typeof handle === 'string' ? this.leases.get(handle) : undefined;
		if (this.disposed || !lease || lease.stopped) { throw new Error('nowcoder-invalid-handle'); }
		return lease;
	}
	private remember(value: SubmissionOutcome, problem: ProblemRef, attemptId: string): SubmissionOutcome {
		if (value.kind === 'record') {
			const record = value.record;
			if (record.problem.site !== 'nowcoder' || record.problem.url !== problem.url || record.problem.nativeId !== problem.nativeId || !/^[1-9]\d*$/.test(record.id) || record.url !== nowcoderRecord(problem, record.id).url) { throw new Error('nowcoder-invalid-record'); }
			this.records.set(record.url, structuredClone(record));
		} else if (value.kind === 'unconfirmed') {
			if (value.attemptId !== attemptId || value.problem.url !== problem.url || value.problem.site !== 'nowcoder') { throw new Error('nowcoder-invalid-attempt'); }
			this.attempts.set(attemptId, problem);
		} else if (value.kind !== 'not-sent') { throw new Error('nowcoder-invalid-receipt'); }
		return structuredClone(value);
	}
	async send(handle: string, input: INowcoderSourcePayload): Promise<SubmissionOutcome> {
		const lease = this.lease(handle);
		if (lease.consumed) { throw new Error('nowcoder-handle-consumed'); }
		if (!this.ports.isCurrent(lease.page)) { throw new Error('nowcoder-page-changed'); }
		if (!input || typeof input.source !== 'string' || !input.source.trim() || new TextEncoder().encode(input.source).length > 1024 * 1024 || typeof input.fileName !== 'string' || !/^[^\\/\x00-\x1f]+\.(c|cpp|cc|cxx)$/i.test(input.fileName)) { throw new Error('nowcoder-source-invalid'); }
		if (!lease.page.languages.some(option => option.id === input.languageId)) { throw new Error('nowcoder-language-changed'); }
		lease.consumed = true; lease.active = true;
		try {
			const value = await this.ports.send(lease.page, lease.problem, { ...input }, handle);
			if (this.disposed || lease.stopped && value.kind !== 'record' && value.kind !== 'unconfirmed') { throw new Error('nowcoder-bridge-stopped'); }
			return this.remember(value, lease.problem, handle);
		} finally { lease.active = false; }
	}
	async readRecord(input: RecordRef): Promise<RecordSnapshot> {
		const record = this.records.get(input?.url);
		if (this.disposed || !record || input.id !== record.id || input.problem.url !== record.problem.url || input.problem.nativeId !== record.problem.nativeId || input.problem.site !== 'nowcoder') { throw new Error('nowcoder-invalid-record'); }
		const value = await this.ports.readRecord(structuredClone(record));
		if (this.disposed || value.ref.url !== record.url || value.ref.problem.url !== record.problem.url) { throw new Error('nowcoder-invalid-record'); }
		return structuredClone(value);
	}
	async reconcile(attemptId: string): Promise<SubmissionOutcome> {
		const problem = this.attempts.get(attemptId);
		if (this.disposed || !problem || !this.ports.reconcile) { throw new Error('nowcoder-invalid-attempt'); }
		const value = await this.ports.reconcile(attemptId);
		if (this.disposed) { throw new Error('nowcoder-bridge-stopped'); }
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

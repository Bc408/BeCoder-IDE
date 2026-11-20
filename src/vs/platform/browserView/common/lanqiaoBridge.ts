/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal bundled extension DTOs.
import type { ProblemRef, LanguageOption, RecordRef, RecordSnapshot, SubmissionOutcome, ILanqiaoPrepared, ILanqiaoSourcePayload, ILanqiaoProgress } from 'becoder-oj-connect';

export function assertLanqiaoProblem(problem: ProblemRef): void {
	if (!problem || problem.site !== 'lanqiao' || !/^[1-9]\d{0,7}$/.test(problem.nativeId) || problem.url !== 'https://www.lanqiao.cn/problems/' + problem.nativeId + '/learning/') { throw new Error('lanqiao-problem-route'); }
}
export function lanqiaoRecord(problem: ProblemRef, id: string): RecordRef {
	assertLanqiaoProblem(problem);
	if (typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) { throw new Error('lanqiao-invalid-record'); }
	return { problem, id, url: 'https://www.lanqiao.cn/problems/' + problem.nativeId + '/submissions/' + id + '/' };
}

export interface LanqiaoHostPage { readonly viewId: string; readonly url: string; readonly ownerKey: string; readonly languages: readonly LanguageOption[]; readonly generation?: number }
export interface LanqiaoBridgePorts {
	newHandle(): string;
	isCurrent(page: LanqiaoHostPage): boolean;
	open(problem: ProblemRef, sourceUri: string): Promise<LanqiaoHostPage>;
	send(page: LanqiaoHostPage, problem: ProblemRef, payload: ILanqiaoSourcePayload, requestId: string, signal: AbortSignal): Promise<SubmissionOutcome>;
	readProgress?(page: LanqiaoHostPage, requestId: string): Promise<ILanqiaoProgress | undefined>;
	cancel(page: LanqiaoHostPage, requestId: string): Promise<void>;
	release?(page: LanqiaoHostPage): void;
	readRecord(record: RecordRef): Promise<RecordSnapshot>;
	reconcile(attemptId: string): Promise<SubmissionOutcome>;
}
export class LanqiaoBridgeController {
	private readonly leases = new Map<string, { page: LanqiaoHostPage; problem: ProblemRef; consumed: boolean; active: boolean; controller: AbortController }>();
	private readonly records = new Map<string, RecordRef>();
	private readonly attempts = new Map<string, ProblemRef>();
	private disposed = false;
	private busy = false;
	constructor(private readonly ports: LanqiaoBridgePorts) { }
	async prepare(problem: ProblemRef, sourceUri: string): Promise<ILanqiaoPrepared> {
		assertLanqiaoProblem(problem);
		if (this.disposed || typeof sourceUri !== 'string' || !sourceUri.startsWith('file:') || sourceUri.length > 32768) { throw new Error('lanqiao-source-uri'); }
		const page = await this.ports.open({ ...problem }, sourceUri);
		try {
			if (this.disposed || !this.ports.isCurrent(page) || page.url !== 'https://www.lanqiao.cn/' || typeof page.ownerKey !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(page.ownerKey) || !Array.isArray(page.languages) || !page.languages.length || page.languages.length > 2 || new Set(page.languages.map(value => value.id)).size !== page.languages.length || page.languages.some(value => !['c', 'cpp'].includes(value.family) || value.id !== value.family || typeof value.label !== 'string' || !value.label || value.label.length > 200)) { throw new Error('lanqiao-preparation-invalid'); }
			const handle = this.ports.newHandle();
			this.leases.set(handle, { page, problem: { ...problem }, consumed: false, active: false, controller: new AbortController() });
			return { handle, hasDraft: false, languages: structuredClone(page.languages) };
		} catch (error) { this.ports.release?.(page); throw error; }
	}
	private remember(value: SubmissionOutcome, problem: ProblemRef, attemptId: string): SubmissionOutcome {
		if (value.kind === 'record') {
			if (value.record.problem.site !== 'lanqiao' || value.record.problem.nativeId !== problem.nativeId || value.record.problem.url !== problem.url || lanqiaoRecord(problem, value.record.id).url !== value.record.url) { throw new Error('lanqiao-invalid-record'); }
			this.records.set(value.record.url, structuredClone(value.record));
		} else if (value.kind === 'unconfirmed') {
			if (value.attemptId !== attemptId || value.problem.site !== 'lanqiao' || value.problem.nativeId !== problem.nativeId || value.problem.url !== problem.url) { throw new Error('lanqiao-invalid-attempt'); }
			this.attempts.set(attemptId, { ...problem });
		} else if (value.kind !== 'not-sent' && value.kind !== 'rejected') { throw new Error('lanqiao-invalid-receipt'); }
		return structuredClone(value);
	}
	async send(handle: string, payload: ILanqiaoSourcePayload): Promise<SubmissionOutcome> {
		const lease = this.leases.get(handle);
		if (this.disposed || !lease || lease.consumed || this.busy || !this.ports.isCurrent(lease.page)) { throw new Error('lanqiao-handle-consumed'); }
		if (!payload || typeof payload.source !== 'string' || !payload.source.trim() || new TextEncoder().encode(payload.source).length > 1024 * 1024 || typeof payload.fileName !== 'string' || !/^[^\\/\x00-\x1f]+\.(?:c|cpp|cc|cxx)$/i.test(payload.fileName) || payload.languageId !== (/\.c$/i.test(payload.fileName) ? 'c' : 'cpp') || !lease.page.languages.some(option => option.id === payload.languageId)) { throw new Error('lanqiao-invalid-source'); }
		lease.consumed = true; lease.active = true; this.busy = true;
		try {
			const value = await this.ports.send(lease.page, lease.problem, { ...payload }, handle, lease.controller.signal);
			if (this.disposed || lease.controller.signal.aborted && value.kind !== 'unconfirmed') { throw new Error('lanqiao-bridge-stopped'); }
			return this.remember(value, lease.problem, handle);
		} finally { lease.active = false; this.busy = false; }
	}
	async readRecord(input: RecordRef): Promise<RecordSnapshot> {
		const record = this.records.get(input?.url);
		if (this.disposed || !record || input.id !== record.id || input.problem.site !== 'lanqiao' || input.problem.nativeId !== record.problem.nativeId || input.problem.url !== record.problem.url) { throw new Error('lanqiao-invalid-record'); }
		const result = await this.ports.readRecord(structuredClone(record));
		if (this.disposed || result.ref.id !== record.id || result.ref.url !== record.url || result.ref.problem.url !== record.problem.url || result.ref.problem.nativeId !== record.problem.nativeId || result.ref.problem.site !== 'lanqiao') { throw new Error('lanqiao-invalid-record'); }
		return structuredClone(result);
	}
	async readProgress(handle: string): Promise<ILanqiaoProgress | undefined> {
		const lease = this.leases.get(handle);
		const current = () => !this.disposed && this.leases.get(handle) === lease && !!lease?.active && !lease.controller.signal.aborted && this.ports.isCurrent(lease.page);
		if (!lease || !current()) { return undefined; }
		const value = await this.ports.readProgress?.(lease.page, handle);
		return current() ? structuredClone(value) : undefined;
	}
	async reconcile(attemptId: string): Promise<SubmissionOutcome> {
		const problem = this.attempts.get(attemptId);
		if (this.disposed || !problem) { throw new Error('lanqiao-invalid-attempt'); }
		const value = await this.ports.reconcile(attemptId);
		if (this.disposed) { throw new Error('lanqiao-bridge-stopped'); }
		return this.remember(value, problem, attemptId);
	}
	async cancel(handle: string): Promise<void> { await this.release(handle); }
	async release(handle: string): Promise<void> {
		const lease = this.leases.get(handle);
		if (!lease) { return; }
		this.leases.delete(handle); lease.controller.abort(new Error('lanqiao-operation-cancelled'));
		if (lease.active) { await this.ports.cancel(lease.page, handle).catch(() => undefined); }
		this.ports.release?.(lease.page);
	}
	async dispose(): Promise<void> { this.disposed = true; this.records.clear(); this.attempts.clear(); await Promise.all([...this.leases.keys()].map(handle => this.release(handle))); }
}

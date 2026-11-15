/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- Internal type-only DTOs shared with the bundled extension.
import type { IAtCoderBridge, IAtCoderPageRef, IAtCoderShortcutResult, IAtCoderSourcePayload, IAtCoderTaskForm, SubmissionOutcome, RecordRef, RecordSnapshot, ProblemRef } from 'becoder-oj-connect';
import { atCoderTask } from './atcoderWorkflow.js';

export interface IAtCoderHostPage { viewId: string; url: string; generation?: number }
/** A return to the same URL must not revive a page from an earlier document/navigation. */
export class AtCoderPageGeneration {
	private readonly generations = new Map<string, number>();
	capture(page: IAtCoderHostPage): IAtCoderHostPage { return { ...page, generation: this.generations.get(page.viewId) ?? 0 }; }
	didNavigate(viewId: string): void { this.generations.set(viewId, (this.generations.get(viewId) ?? 0) + 1); }
	isCurrent(page: IAtCoderHostPage): boolean { return page.generation === (this.generations.get(page.viewId) ?? 0); }
}
export interface IAtCoderBridgePorts {
	openTask(url: string, sourceUri: string): Promise<IAtCoderHostPage>;
	inspectTask(page: IAtCoderHostPage): Promise<IAtCoderTaskForm>;
	submit(page: IAtCoderHostPage, payload: IAtCoderSourcePayload): Promise<IAtCoderShortcutResult>;
	sendAndConfirm?(page: IAtCoderHostPage, payload: IAtCoderSourcePayload): Promise<SubmissionOutcome>;
	readRecord?(record: RecordRef): Promise<RecordSnapshot>;
	reconcile?(attemptId: string): Promise<SubmissionOutcome>;
	cancel(page: IAtCoderHostPage): Promise<void>;
	release?(page: IAtCoderHostPage): void;
	revealResult(page: IAtCoderHostPage, receipt: IAtCoderShortcutResult): Promise<void>;
	newHandle(): string;
	isPageCurrent(page: IAtCoderHostPage): boolean;
}
interface Lease {
	page: IAtCoderHostPage;
	consumed: boolean;
	active: boolean;
	stopped: boolean;
	receipt?: IAtCoderShortcutResult;
	timer: ReturnType<typeof setTimeout>;
}

/** Per-workbench-window bridge. Native view identities and receipts never come from the extension. */
export class AtCoderBridgeController implements IAtCoderBridge {
	private readonly leases = new Map<string, Lease>();
	private readonly records = new Map<string, RecordRef>();
	private readonly attempts = new Map<string, ProblemRef>();
	private disposed = false;
	constructor(private readonly ports: IAtCoderBridgePorts) { }

	async openTask(taskURL: string, sourceUri: string): Promise<IAtCoderPageRef> {
		if (this.disposed) { throw new Error('atcoder-bridge-stopped'); }
		if (typeof taskURL !== 'string' || taskURL.length > 2048 || !atCoderTask(taskURL)) { throw new Error('atcoder-task-route'); }
		if (typeof sourceUri !== 'string' || sourceUri.length > 32768 || !sourceUri.startsWith('file:')) { throw new Error('atcoder-source-uri'); }
		const page = await this.ports.openTask(taskURL, sourceUri);
		try {
			if (this.disposed) { throw new Error('atcoder-bridge-stopped'); }
			const requested = atCoderTask(taskURL), actual = atCoderTask(page.url);
			if (!actual || actual.contestId !== requested?.contestId || actual.taskId !== requested.taskId || !this.ports.isPageCurrent(page)) { throw new Error('atcoder-page-changed'); }
		} catch (error) { this.ports.release?.(page); throw error; }
		const handle = this.ports.newHandle();
		const timer = setTimeout(() => { void this.release({ handle, url: page.url }); }, 120000);
		this.leases.set(handle, { page, consumed: false, active: false, stopped: false, timer });
		return { handle, url: page.url };
	}

	private lease(ref: IAtCoderPageRef, current = false): Lease {
		const lease = ref && typeof ref.handle === 'string' ? this.leases.get(ref.handle) : undefined;
		if (!lease || lease.stopped || this.disposed || ref.url !== lease.page.url) { throw new Error('atcoder-invalid-handle'); }
		if (current && !this.ports.isPageCurrent(lease.page)) { throw new Error('atcoder-page-changed'); }
		return lease;
	}

	async inspectTask(ref: IAtCoderPageRef): Promise<IAtCoderTaskForm> {
		const lease = this.lease(ref, true);
		const result = await this.ports.inspectTask(lease.page);
		this.lease(ref, true);
		return result;
	}

	async submit(ref: IAtCoderPageRef, payload: IAtCoderSourcePayload): Promise<IAtCoderShortcutResult> {
		const result = await this.consume(ref, payload, page => this.ports.submit(page, { ...payload }));
		this.lease(ref).receipt = { ...result };
		return { ...result };
	}

	private async consume<T>(ref: IAtCoderPageRef, payload: IAtCoderSourcePayload, operation: (page: IAtCoderHostPage) => Promise<T>, accepted: (value: T) => boolean = () => false): Promise<T> {
		const lease = this.lease(ref, true);
		if (lease.consumed) { throw new Error('atcoder-handle-consumed'); }
		if (!payload || typeof payload.source !== 'string' || !payload.source.trim() || new TextEncoder().encode(payload.source).byteLength > 1024 * 1024 || typeof payload.fileName !== 'string' || !/^[^\\/\x00-\x1f]+\.(cpp|cc|cxx|c)$/i.test(payload.fileName) || typeof payload.languageId !== 'string' || !/^\d+$/.test(payload.languageId) || typeof payload.replaceDraft !== 'boolean') { throw new Error('atcoder-source-invalid'); }
		lease.consumed = true;
		lease.active = true;
		try {
			const result = await operation(lease.page);
			if (this.disposed || lease.stopped && !accepted(result)) { throw new Error('atcoder-bridge-stopped'); }
			return result;
		} finally { lease.active = false; }
	}

	private remember(outcome: SubmissionOutcome, expectedURL: string): SubmissionOutcome {
		const expected = atCoderTask(expectedURL);
		if (!expected) { throw new Error('atcoder-task-route'); }
		if (outcome.kind === 'record') {
			const record = outcome.record;
			if (record.problem.site !== 'atcoder' || record.problem.url !== expectedURL || record.problem.nativeId !== expected.contestId + '/' + expected.taskId || !/^[1-9]\d*$/.test(record.id) || record.url !== `https://atcoder.jp/contests/${expected.contestId}/submissions/${record.id}`) { throw new Error('atcoder-invalid-record'); }
			const copy = { ...record, problem: { ...record.problem } };
			this.records.set(copy.url, copy);
		} else if (outcome.kind === 'unconfirmed') {
			if (!outcome.attemptId || outcome.problem.url !== expectedURL || outcome.problem.site !== 'atcoder') { throw new Error('atcoder-invalid-attempt'); }
			this.attempts.set(outcome.attemptId, { ...outcome.problem });
		} else if (outcome.kind !== 'not-sent') { throw new Error('atcoder-invalid-receipt'); }
		return structuredClone(outcome);
	}

	async sendAndConfirm(ref: IAtCoderPageRef, payload: IAtCoderSourcePayload): Promise<SubmissionOutcome> {
		if (!this.ports.sendAndConfirm) { throw new Error('atcoder-workflow-unavailable'); }
		const outcome = await this.consume(ref, payload, page => this.ports.sendAndConfirm!(page, { ...payload }), value => value.kind === 'record' || value.kind === 'unconfirmed');
		if (this.disposed) { throw new Error('atcoder-bridge-stopped'); }
		return this.remember(outcome, ref.url);
	}

	async readRecord(input: RecordRef): Promise<RecordSnapshot> {
		const record = this.records.get(input?.url);
		if (this.disposed || !record || input.id !== record.id || input.problem.url !== record.problem.url || input.problem.nativeId !== record.problem.nativeId || input.problem.site !== 'atcoder' || !this.ports.readRecord) { throw new Error('atcoder-invalid-record'); }
		const value = await this.ports.readRecord(structuredClone(record));
		if (this.disposed || value.ref.id !== record.id || value.ref.url !== record.url || value.ref.problem.url !== record.problem.url) { throw new Error('atcoder-invalid-record'); }
		return structuredClone(value);
	}

	async reconcile(attemptId: string): Promise<SubmissionOutcome> {
		const problem = this.attempts.get(attemptId);
		if (this.disposed || !problem || !this.ports.reconcile) { throw new Error('atcoder-invalid-attempt'); }
		const result = await this.ports.reconcile(attemptId);
		if (this.disposed) { throw new Error('atcoder-bridge-stopped'); }
		if (result.kind === 'unconfirmed' && result.attemptId !== attemptId) { throw new Error('atcoder-invalid-attempt'); }
		return this.remember(result, problem.url);
	}

	async revealResult(ref: IAtCoderPageRef): Promise<void> {
		const lease = this.lease(ref);
		if (!lease.receipt) { throw new Error('atcoder-receipt-unavailable'); }
		await this.ports.revealResult(lease.page, { ...lease.receipt });
	}

	async cancel(ref: IAtCoderPageRef): Promise<void> { await this.release(ref); }
	async release(ref: IAtCoderPageRef): Promise<void> {
		const lease = ref && typeof ref.handle === 'string' ? this.leases.get(ref.handle) : undefined;
		if (!lease || ref.url !== lease.page.url) { return; }
		this.leases.delete(ref.handle);
		lease.stopped = true;
		clearTimeout(lease.timer);
		if (lease.active) { await this.ports.cancel(lease.page).catch(() => undefined); }
		this.ports.release?.(lease.page);
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		this.records.clear();
		this.attempts.clear();
		await Promise.all([...this.leases].map(([handle, lease]) => this.release({ handle, url: lease.page.url })));
	}
}

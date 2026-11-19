/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAtCoderBridge, IAtCoderPageRef, IAtCoderSourcePayload } from 'becoder-oj-connect';
import type { OjAdapter, SubmissionSession } from '../adapter';
import { type ProblemRef, type ProblemDocument, type RecordRef, type RecordSnapshot, type LoginSummary, type SubmissionOutcome, validateProblemRef, validateRecord, validateRecordRef } from '../../domain';
import { atCoderProblem } from './task';

export interface AtCoderHost extends Pick<IAtCoderBridge, 'openTask' | 'inspectTask' | 'cancel' | 'release'> {
	cancelPreparation?(): Promise<void>;
	sendAndConfirm(page: IAtCoderPageRef, payload: IAtCoderSourcePayload): Promise<SubmissionOutcome>;
	readProblem(problem: ProblemRef, signal?: AbortSignal): Promise<ProblemDocument>;
	loginSummary(): Promise<LoginSummary>;
	readRecord(record: RecordRef): Promise<RecordSnapshot>;
	cancelRecord?(record: RecordRef): Promise<void>;
	reconcile(attemptId: string): Promise<SubmissionOutcome>;
}

export class AtCoderAdapter implements OjAdapter {
	readonly site = 'atcoder';
	private readonly recordCancellations = new Map<string, Promise<void>>();
	constructor(private readonly host: AtCoderHost) { }
	resolve(input: string): ProblemRef | undefined { return atCoderProblem(input); }
	fileName(problem: ProblemRef): string {
		this.problem(problem);
		const [contest, task] = problem.nativeId.split('/'), natural = task + '.cpp';
		return atCoderProblem(natural)?.nativeId === problem.nativeId ? natural : contest + '@' + task + '.cpp';
	}
	private problem(problem: ProblemRef): void {
		if (validateProblemRef(problem).site !== this.site) { throw new Error('AtCoder received a different site.'); }
	}
	async readProblem(problem: ProblemRef, signal: AbortSignal): Promise<ProblemDocument> { signal.throwIfAborted(); this.problem(problem); const document = await this.host.readProblem(problem, signal); signal.throwIfAborted(); return document; }
	async loginSummary(signal: AbortSignal): Promise<LoginSummary> { signal.throwIfAborted(); return this.host.loginSummary(); }
	async readRecord(record: RecordRef, signal: AbortSignal): Promise<RecordSnapshot> {
		signal.throwIfAborted(); this.problem(record.problem); validateRecordRef(record);
		await this.recordCancellations.get(record.url);
		signal.throwIfAborted();
		let cancellation: Promise<void> | undefined;
		const cancel = () => {
			const pending = this.host.cancelRecord?.(record).catch(() => undefined) ?? Promise.resolve();
			cancellation = pending; this.recordCancellations.set(record.url, pending);
			void pending.finally(() => { if (this.recordCancellations.get(record.url) === pending) { this.recordCancellations.delete(record.url); } });
		};
		signal.addEventListener('abort', cancel, { once: true });
		try {
			const result = validateRecord(await this.host.readRecord(record));
			signal.throwIfAborted(); return result;
		} finally { signal.removeEventListener('abort', cancel); await cancellation; }
	}
	async reconcile(attemptId: string, signal: AbortSignal): Promise<SubmissionOutcome> { signal.throwIfAborted(); return this.host.reconcile(attemptId); }
	async prepare(problem: ProblemRef, sourceUri: string, _progress: Parameters<OjAdapter['prepare']>[2], signal: AbortSignal): Promise<SubmissionSession> {
		this.problem(problem); signal.throwIfAborted();
		const cancelPreparation = () => { void this.host.cancelPreparation?.().catch(() => undefined); };
		signal.addEventListener('abort', cancelPreparation, { once: true });
		let page: IAtCoderPageRef;
		try { page = await this.host.openTask(problem.url, sourceUri); }
		finally { signal.removeEventListener('abort', cancelPreparation); }
		try {
			signal.throwIfAborted();
			const form = await this.host.inspectTask(page);
			signal.throwIfAborted();
			let consumed = false, disposed = false;
			const host = this.host;
			return {
				languages: form.languages.map(option => ({ ...option, family: option.label.startsWith('C++') ? 'cpp' as const : 'c' as const })), hasDraft: form.hasDraft,
				async send(input, progress, sendSignal) {
					sendSignal.throwIfAborted();
					if (consumed || disposed) { throw new Error('Submission session is consumed.'); }
					consumed = true;
					progress({ phase: 'sending', message: 'Submitting code.' });
					const cancel = () => { void host.cancel(page).catch(() => undefined); };
					sendSignal.addEventListener('abort', cancel, { once: true });
					try { return await host.sendAndConfirm(page, { source: input.snapshot.source, fileName: input.snapshot.fileName, languageId: input.languageId, replaceDraft: input.replaceDraft }); }
					finally { sendSignal.removeEventListener('abort', cancel); }
				},
				cancel: () => host.cancel(page),
				async dispose() { if (!disposed) { disposed = true; await host.release(page); } }
			};
		} catch (error) { await this.host.release(page).catch(() => undefined); throw error; }
	}
}

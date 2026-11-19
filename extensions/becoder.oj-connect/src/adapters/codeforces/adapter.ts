/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICodeforcesPrepared, ICodeforcesSourcePayload } from 'becoder-oj-connect';
import { type ProblemRef, type ProblemDocument, type RecordRef, type RecordSnapshot, type LoginSummary, type SubmissionOutcome, validateProblemRef, validateRecord, validateRecordRef } from '../../domain';
import type { OjAdapter, SubmissionSession } from '../adapter';
import { codeforcesProblem } from './task';

export interface CodeforcesHost {
	cancelPreparation?(): Promise<void>;
	prepare(problem: ProblemRef, sourceUri: string): Promise<ICodeforcesPrepared>;
	send(handle: string, payload: ICodeforcesSourcePayload): Promise<SubmissionOutcome>;
	cancel(handle: string): Promise<void>;
	release(handle: string): Promise<void>;
	readProblem(problem: ProblemRef): Promise<ProblemDocument>;
	loginSummary(): Promise<LoginSummary>;
	readRecord(record: RecordRef): Promise<RecordSnapshot>;
	cancelRecord?(record: RecordRef): Promise<void>;
	reconcile(attemptId: string): Promise<SubmissionOutcome>;
}

export class CodeforcesAdapter implements OjAdapter {
	readonly site = 'codeforces';
	constructor(private readonly host: CodeforcesHost) { }
	resolve(input: string): ProblemRef | undefined { return codeforcesProblem(input); }
	private problem(problem: ProblemRef): void { if (validateProblemRef(problem).site !== 'codeforces') { throw new Error('Codeforces received a different site.'); } }
	fileName(problem: ProblemRef): string { this.problem(problem); return problem.nativeId.replace('/', '_').toLowerCase() + '.cpp'; }
	async readProblem(problem: ProblemRef, signal: AbortSignal): Promise<ProblemDocument> { signal.throwIfAborted(); this.problem(problem); return this.host.readProblem(problem); }
	async loginSummary(signal: AbortSignal): Promise<LoginSummary> { signal.throwIfAborted(); return this.host.loginSummary(); }
	async readRecord(record: RecordRef, signal: AbortSignal): Promise<RecordSnapshot> {
		signal.throwIfAborted(); this.problem(record.problem); validateRecordRef(record);
		const cancel = () => { void this.host.cancelRecord?.(record).catch(() => undefined); };
		signal.addEventListener('abort', cancel, { once: true });
		try { const value = validateRecord(await this.host.readRecord(record)); signal.throwIfAborted(); return value; }
		finally { signal.removeEventListener('abort', cancel); }
	}
	async reconcile(attemptId: string, signal: AbortSignal): Promise<SubmissionOutcome> { signal.throwIfAborted(); return this.host.reconcile(attemptId); }
	async prepare(problem: ProblemRef, sourceUri: string, _progress: Parameters<OjAdapter['prepare']>[2], signal: AbortSignal): Promise<SubmissionSession> {
		this.problem(problem); signal.throwIfAborted();
		const cancelPreparation = () => { void this.host.cancelPreparation?.().catch(() => undefined); };
		signal.addEventListener('abort', cancelPreparation, { once: true });
		let prepared: ICodeforcesPrepared;
		try { prepared = await this.host.prepare(problem, sourceUri); }
		finally { signal.removeEventListener('abort', cancelPreparation); }
		try {
			signal.throwIfAborted();
			let consumed = false, disposed = false;
			const host = this.host;
			return {
				languages: prepared.languages, hasDraft: prepared.hasDraft,
				async send(input, progress, sendSignal) {
					sendSignal.throwIfAborted();
					if (consumed || disposed) { throw new Error('Submission session is consumed.'); }
					consumed = true;
					progress({ phase: 'sending', message: 'Submitting to Codeforces.' });
					const cancel = () => { void host.cancel(prepared.handle).catch(() => undefined); };
					sendSignal.addEventListener('abort', cancel, { once: true });
					try { return await host.send(prepared.handle, { source: input.snapshot.source, fileName: input.snapshot.fileName, languageId: input.languageId }); }
					finally { sendSignal.removeEventListener('abort', cancel); }
				},
				cancel: () => host.cancel(prepared.handle),
				async dispose() { if (!disposed) { disposed = true; await host.release(prepared.handle); } }
			};
		} catch (error) { await this.host.release(prepared.handle).catch(() => undefined); throw error; }
	}
}

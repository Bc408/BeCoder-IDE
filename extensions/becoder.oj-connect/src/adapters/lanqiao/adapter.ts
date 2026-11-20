/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProblemRef, ProblemDocument, ProblemReadOptions, RecordRef, RecordSnapshot, LoginSummary, SubmissionOutcome, ILanqiaoPrepared, ILanqiaoSourcePayload, ILanqiaoProgress } from 'becoder-oj-connect';
import type { OjAdapter, SubmissionSession } from '../adapter';
import { lanqiaoProblem } from './task';
import { validateProblem, validateProblemRef, validateRecord, validateRecordRef, validateLanguageCatalogue, validateOutcome } from '../../domain';
export interface LanqiaoHost {
	prepare(problem: ProblemRef, sourceUri: string): Promise<ILanqiaoPrepared>;
	send(handle: string, payload: ILanqiaoSourcePayload): Promise<SubmissionOutcome>;
	readProgress(handle: string): Promise<ILanqiaoProgress | undefined>;
	cancel(handle: string): Promise<void>;
	release(handle: string): Promise<void>;
	cancelPreparation?(): Promise<void>;
	readProblem(problem: ProblemRef, signal: AbortSignal, options: ProblemReadOptions): Promise<ProblemDocument>;
	loginSummary(): Promise<LoginSummary>;
	readRecord(record: RecordRef): Promise<RecordSnapshot>;
	cancelRecord?(record: RecordRef): Promise<void>;
	reconcile(attemptId: string): Promise<SubmissionOutcome>;
}
export class LanqiaoAdapter implements OjAdapter {
	readonly site = 'lanqiao';
	constructor(private readonly host: LanqiaoHost) { }
	resolve(input: string): ProblemRef | undefined { return lanqiaoProblem(input); }
	private problem(problem: ProblemRef): void { if (validateProblemRef(problem).site !== 'lanqiao') { throw new Error('lanqiao-problem-route'); } }
	fileName(problem: ProblemRef): string { this.problem(problem); return problem.nativeId + '.cpp'; }
	async readProblem(problem: ProblemRef, signal: AbortSignal, options: ProblemReadOptions = { family: 'cpp' }): Promise<ProblemDocument> {
		this.problem(problem); signal.throwIfAborted(); const value = validateProblem(await this.host.readProblem(problem, signal, options)); signal.throwIfAborted();
		if (value.ref.url !== problem.url) { throw new Error('lanqiao-problem-mismatch'); } return value;
	}
	async loginSummary(signal: AbortSignal): Promise<LoginSummary> { signal.throwIfAborted(); const value = await this.host.loginSummary(); signal.throwIfAborted(); return value; }
	async prepare(problem: ProblemRef, sourceUri: string, _progress: Parameters<OjAdapter['prepare']>[2], signal: AbortSignal): Promise<SubmissionSession> {
		this.problem(problem); signal.throwIfAborted();
		const cancel = () => { void this.host.cancelPreparation?.().catch(() => undefined); };
		signal.addEventListener('abort', cancel, { once: true });
		let prepared: ILanqiaoPrepared;
		try { prepared = await this.host.prepare(problem, sourceUri); } finally { signal.removeEventListener('abort', cancel); }
		try {
			signal.throwIfAborted();
			const languages = validateLanguageCatalogue({ languages: prepared.languages }, 'lanqiao').languages;
			let consumed = false, disposed = false; const host = this.host;
			return {
				languages, hasDraft: false,
				async send(input, progress, signal) {
					signal.throwIfAborted(); if (consumed || disposed) { throw new Error('lanqiao-handle-consumed'); } consumed = true;
					const evaluation = { problem, language: languages.find(option => option.id === input.languageId)!.label, codeLength: new TextEncoder().encode(input.snapshot.source).length + ' B' };
					const reportProgress = (value: ILanqiaoProgress) => {
						try { progress({ phase: value.phase === 'sending' ? 'sending' : 'confirming', message: value.phase === 'sending' ? 'Submitting to Lanqiao.' : 'Waiting for the Lanqiao result.', evaluation: { ...evaluation, ...value } }); }
						catch { /* Display updates cannot change submission delivery or its receipt. */ }
					};
					reportProgress({ phase: 'sending' });
					let running = true, timer: ReturnType<typeof setTimeout> | undefined, previous = '';
					const readProgress = async () => {
						try {
							const value = await host.readProgress(prepared.handle);
							if (running && !signal.aborted && value && JSON.stringify(value) !== previous) {
								previous = JSON.stringify(value);
								reportProgress(value);
							}
						} catch { /* Display updates cannot change submission delivery or its receipt. */ }
						if (running && !signal.aborted) { timer = setTimeout(() => { void readProgress(); }, 250); }
					};
					const cancel = () => { void host.cancel(prepared.handle).catch(() => undefined); };
					signal.addEventListener('abort', cancel, { once: true });
					try {
						const sending = host.send(prepared.handle, { source: input.snapshot.source, fileName: input.snapshot.fileName, languageId: input.languageId });
						void readProgress();
						return validateOutcome(await sending);
					} finally { running = false; clearTimeout(timer); signal.removeEventListener('abort', cancel); }
				},
				cancel: () => host.cancel(prepared.handle),
				async dispose() { if (!disposed) { disposed = true; await host.release(prepared.handle); } }
			};
		} catch (error) { await this.host.release(prepared.handle).catch(() => undefined); throw error; }
	}
	async readRecord(record: RecordRef, signal: AbortSignal): Promise<RecordSnapshot> {
		this.problem(record.problem); validateRecordRef(record); signal.throwIfAborted();
		const cancel = () => { void this.host.cancelRecord?.(record).catch(() => undefined); };
		signal.addEventListener('abort', cancel, { once: true });
		try { const value = validateRecord(await this.host.readRecord(record)); signal.throwIfAborted(); if (value.ref.url !== record.url) { throw new Error('lanqiao-record-mismatch'); } return value; }
		finally { signal.removeEventListener('abort', cancel); }
	}
	async reconcile(attemptId: string, signal: AbortSignal): Promise<SubmissionOutcome> { signal.throwIfAborted(); const value = validateOutcome(await this.host.reconcile(attemptId)); signal.throwIfAborted(); return value; }
}

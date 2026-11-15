/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { fileURLToPath } from 'url';
import { type ISourceSnapshot, type ProblemRef, type LanguageOption, type SubmissionProgress, type SubmissionOutcome, type RecordRef, validateProblemRef, validateRecordRef } from './domain';
import type { OjAdapter, SubmissionSession } from './adapters/adapter';
import { resolveProblem } from './problemResolver';
import type { SiteDirectories, SiteId } from './settings';
import { OperationError } from './operationError';

export interface SubmissionHost {
	readonly adapters: readonly OjAdapter[];
	directories(): SiteDirectories;
	requestProblem(fileName: string, site?: SiteId): Promise<ProblemRef | undefined>;
	chooseLanguage(options: readonly LanguageOption[], fileName: string, site: SiteId, problem: ProblemRef): Promise<string | undefined>;
	confirmDraft(fileName: string): Promise<boolean>;
	runWithProgress<T>(fileName: string, operation: (progress: (value: SubmissionProgress) => void) => Promise<T>): Promise<T>;
	openRecord(record: RecordRef, sourceUri: string): Promise<void>;
}
interface Request { controller: AbortController; session?: SubmissionSession; cancellation?: Promise<void> }

export class SubmissionController {
	private active: Request | undefined;
	private disposed = false;
	private readonly languages = new Map<string, string>();
	constructor(private readonly host: SubmissionHost) { }
	preferredLanguage(site: SiteId, family: 'c' | 'cpp'): string | undefined { return this.languages.get(site + ':' + family); }
	selectLanguage(site: SiteId, family: 'c' | 'cpp', languageId: string): void { this.languages.set(site + ':' + family, languageId); }
	async submit(input: ISourceSnapshot, explicitProblem?: ProblemRef): Promise<SubmissionOutcome | undefined> {
		if (this.disposed) { throw new OperationError('prepare', 'not-sent', 'OJ Connect is stopped.'); }
		if (this.active) { throw new OperationError('prepare', 'not-sent', 'A submission is already in progress.'); }
		const snapshot = Object.freeze({ ...input, source: input.source.replace(/\r\n/g, '\n') });
		if (!['c', 'cpp'].includes(snapshot.family) || !snapshot.source.trim() || !Number.isSafeInteger(snapshot.version)) { throw new OperationError('prepare', 'not-sent', 'Select a nonempty C/C++ source document.'); }
		const filePath = fileURLToPath(snapshot.uri);
		const request: Request = { controller: new AbortController() };
		const signal = request.controller.signal;
		this.active = request;
		try {
			const resolution = explicitProblem ? { kind: 'problem' as const, problem: validateProblemRef(explicitProblem) } : resolveProblem(filePath, this.host.directories(), this.host.adapters);
			if (resolution.kind === 'unsupported') { throw new OperationError('prepare', 'not-sent', 'This site is not available: ' + resolution.site); }
			const problem = resolution.kind === 'problem' ? resolution.problem : await this.host.requestProblem(snapshot.fileName, resolution.site);
			signal.throwIfAborted();
			if (!problem) { return undefined; }
			validateProblemRef(problem);
			const adapter = this.host.adapters.find(candidate => candidate.site === problem.site);
			if (!adapter) { throw new OperationError('prepare', 'not-sent', 'This site is not available: ' + problem.site); }
			return await this.host.runWithProgress(snapshot.fileName, async progress => {
				request.session = await adapter.prepare(problem, snapshot.uri, progress, signal);
				signal.throwIfAborted();
				const session = request.session;
				const options = session.languages.filter(option => option.family === snapshot.family);
				if (!options.length) { throw new OperationError('prepare', 'not-sent', 'No matching language is currently available.'); }
				const key = adapter.site + ':' + snapshot.family;
				let languageId = this.languages.get(key);
				if (!options.some(option => option.id === languageId)) { languageId = await this.host.chooseLanguage(options, snapshot.fileName, adapter.site, problem); }
				signal.throwIfAborted();
				if (!languageId) { return undefined; }
				if (!options.some(option => option.id === languageId)) { throw new OperationError('prepare', 'not-sent', 'The selected language is no longer available.'); }
				const replaceDraft = session.hasDraft ? await this.host.confirmDraft(snapshot.fileName) : false;
				signal.throwIfAborted();
				if (session.hasDraft && !replaceDraft) { return undefined; }
				this.languages.set(key, languageId);
				let outcome: SubmissionOutcome;
				try { outcome = await session.send({ snapshot, languageId, replaceDraft }, progress, signal); }
				catch (error) {
					if (error instanceof OperationError) { throw error; }
					throw new OperationError('send', 'unconfirmed', error instanceof Error ? error.message : String(error));
				}
				// Stopping cannot discard an accepted record or an unresolved sent attempt.
				if (this.disposed) { return undefined; }
				if (outcome.kind === 'not-sent') { signal.throwIfAborted(); }
				if (outcome.kind === 'record') {
					const record = validateRecordRef(outcome.record);
					if (record.problem.url !== problem.url || record.problem.nativeId !== problem.nativeId) { throw new OperationError('confirm', 'unconfirmed', 'The returned record belongs to a different problem.'); }
					try { await this.host.openRecord(record, snapshot.uri); }
					catch (error) { throw new OperationError('track', 'record', error instanceof Error ? error.message : String(error), record); }
				} else if (outcome.kind === 'unconfirmed') {
					if (validateProblemRef(outcome.problem).url !== problem.url || !outcome.attemptId) { throw new OperationError('confirm', 'unconfirmed', 'The submission receipt could not be confirmed.'); }
				} else if (outcome.kind !== 'not-sent') { throw new OperationError('confirm', 'unconfirmed', 'The submission receipt could not be confirmed.'); }
				return outcome;
			});
		} catch (error) {
			if (error instanceof OperationError && error.delivery === 'record') { throw error; }
			if (signal.aborted || this.disposed) { return undefined; }
			throw error;
		} finally {
			try {
				if (request.session) {
					if (signal.aborted) { await this.cancelSession(request).catch(() => undefined); }
					await request.session.dispose().catch(() => undefined);
				}
			} finally { this.active = undefined; }
		}
	}
	async cancel(): Promise<void> {
		const request = this.active;
		if (!request) { return; }
		request.controller.abort();
		if (request.session) { await this.cancelSession(request); }
	}
	private cancelSession(request: Request): Promise<void> { return request.cancellation ??= request.session!.cancel(); }
	async dispose(): Promise<void> { this.disposed = true; await this.cancel(); }
}

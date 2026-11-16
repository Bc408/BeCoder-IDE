/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ISourceSnapshot, ProblemRef, ProblemDocument, LanguageOption, SubmissionProgress, SubmissionOutcome, LoginSummary, RecordRef, RecordSnapshot } from 'becoder-oj-connect';

export interface SubmissionSession {
	readonly languages: readonly LanguageOption[];
	readonly hasDraft: boolean;
	send(input: { snapshot: ISourceSnapshot; languageId: string; replaceDraft: boolean }, progress: (value: SubmissionProgress) => void, signal: AbortSignal): Promise<SubmissionOutcome>;
	cancel(): Promise<void>;
	dispose(): Promise<void>;
}

export interface OjAdapter {
	readonly site: 'luogu' | 'atcoder';
	resolve(input: string): ProblemRef | undefined;
	fileName(problem: ProblemRef): string;
	readProblem(problem: ProblemRef, signal: AbortSignal): Promise<ProblemDocument>;
	loginSummary(signal: AbortSignal): Promise<LoginSummary>;
	prepare(problem: ProblemRef, sourceUri: string, progress: (value: SubmissionProgress) => void, signal: AbortSignal): Promise<SubmissionSession>;
	readRecord(record: RecordRef, signal: AbortSignal): Promise<RecordSnapshot>;
	reconcile(attemptId: string, signal: AbortSignal): Promise<SubmissionOutcome>;
}

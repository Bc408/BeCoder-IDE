/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** BeCoder-internal command DTOs. Types only; not a public vscode API. */
declare module 'becoder-oj-connect' {
	export type SiteId = 'luogu' | 'codeforces' | 'atcoder' | 'lanqiao' | 'nowcoder';
	export interface ISourceSnapshot { uri: string; fileName: string; version: number; family: 'c' | 'cpp'; source: string }
	export interface ProblemRef { readonly site: SiteId; readonly nativeId: string; readonly url: string }
	export interface Section { readonly heading?: string; readonly format: 'markdown' | 'html'; readonly content: string; readonly kind?: 'notes' | 'sample-explanation'; readonly sampleIndex?: number }
	export interface ProblemDocument {
		readonly ref: ProblemRef; readonly title: string;
		readonly difficulty?: { readonly label: string; readonly color?: string };
		readonly tags?: readonly { readonly label: string; readonly color?: string }[];
		readonly bodies: readonly { readonly locale: string; readonly sections: readonly Section[] }[];
		readonly samples: readonly { readonly input: string; readonly output: string }[];
		readonly limits: readonly { readonly label: string; readonly value: string }[];
		readonly interactive: boolean;
		readonly languages?: readonly LanguageOption[];
	}
	export interface LanguageOption { readonly id: string; readonly label: string; readonly family: 'c' | 'cpp' }
	export interface RecordRef { readonly problem: ProblemRef; readonly id: string; readonly url: string }
	export interface RecordSnapshot {
		readonly ref: RecordRef; readonly phase: 'queued' | 'judging' | 'finished' | 'unknown';
		readonly problemTitle?: string; readonly problemDifficulty?: ProblemDocument['difficulty'];
		readonly rawStatus: string; readonly language?: string; readonly owner?: string; readonly score?: string;
		readonly time?: string; readonly memory?: string; readonly compileMessage?: string;
		readonly submittedAt?: string; readonly codeLength?: string; readonly source?: string; readonly compileSucceeded?: boolean;
		readonly testCaseSummary?: { readonly passed: number; readonly total: number };
		readonly groups?: readonly { readonly name: string; readonly rows: readonly (readonly string[])[] }[];
		readonly sourceVerification: 'matched' | 'mismatch' | 'unavailable' | 'not-checked';
		readonly pollAfterMs?: number;
	}
	export interface SubmissionProgress { readonly phase: 'preparing' | 'interaction' | 'sending' | 'confirming'; readonly message: string }
	export type SubmissionOutcome = { readonly kind: 'record'; readonly record: RecordRef }
		| { readonly kind: 'not-sent'; readonly reason: string }
		| { readonly kind: 'unconfirmed'; readonly problem: ProblemRef; readonly message: string; readonly attemptId: string };
	export interface LoginSummary { readonly site: SiteId; readonly state: 'signed-in' | 'signed-out' | 'unknown' | 'unavailable'; readonly label?: string; readonly profileUrl?: string }
	export interface ILuoguPrepared { readonly handle: string; readonly languages: readonly LanguageOption[]; readonly hasDraft: boolean }
	export interface ILuoguSourcePayload { readonly source: string; readonly fileName: string; readonly languageId: string }
	export interface INowcoderPrepared { readonly handle: string; readonly languages: readonly LanguageOption[]; readonly hasDraft: boolean }
	export interface INowcoderSourcePayload { readonly source: string; readonly fileName: string; readonly languageId: string }
	export interface IAtCoderPageRef { handle: string; url: string }
	export interface IAtCoderTaskForm { languages: { id: string; label: string }[]; hasDraft: boolean }
	export interface IAtCoderSourcePayload { source: string; fileName: string; languageId: string; replaceDraft: boolean }
	export interface IAtCoderShortcutResult { url?: string; id?: string; status: string; score?: string; owner?: string; verified: boolean; stopped?: boolean }
	export interface IAtCoderBridge {
		openTask(taskURL: string, sourceUri: string): Promise<IAtCoderPageRef>;
		inspectTask(page: IAtCoderPageRef): Promise<IAtCoderTaskForm>;
		cancel(page: IAtCoderPageRef): Promise<void>;
		release(page: IAtCoderPageRef): Promise<void>;
	}
}

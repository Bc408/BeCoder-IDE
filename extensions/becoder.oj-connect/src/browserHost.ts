/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ICodeforcesPrepared, ICodeforcesSourcePayload, IAtCoderPageRef, IAtCoderSourcePayload, IAtCoderTaskForm, ILuoguPrepared, ILuoguSourcePayload, INowcoderPrepared, INowcoderSourcePayload } from 'becoder-oj-connect';
import { officialTaskURL } from './adapters/atcoder/task';
import type { AtCoderHost } from './adapters/atcoder/adapter';
import { type ProblemRef, type ProblemDocument, type RecordRef, type RecordSnapshot, type LoginSummary, type SubmissionOutcome, validateProblem, validateRecord, validateOutcome, validateRecordRef } from './domain';
import type { CodeforcesHost } from './adapters/codeforces/adapter';
import type { NowcoderHost } from './adapters/nowcoder/adapter';
import type { LuoguHost } from './adapters/luogu/adapter';

type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
	if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('oj-connect-invalid-host-response'); }
	return value as RecordValue;
}

function loginSummary(raw: unknown, site: 'luogu' | 'atcoder' | 'nowcoder' | 'codeforces'): LoginSummary {
	const value = object(raw);
	if (value.site !== site || !['signed-in', 'signed-out', 'unknown', 'unavailable'].includes(String(value.state)) || (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 512)) || (value.profileUrl !== undefined && (typeof value.profileUrl !== 'string' || value.profileUrl.length > 512))) { invalid(); }
	return { site, state: value.state as LoginSummary['state'], label: value.label as string | undefined, profileUrl: value.profileUrl as string | undefined };
}

/** Luogu uses its own semantic operations, not AtCoder's page/form protocol. */
export class CommandLuoguHost implements LuoguHost {
	constructor(private readonly execute: (command: string, ...args: unknown[]) => Promise<unknown>) { }
	private call(operation: string, ...args: unknown[]): Promise<unknown> { return this.execute('_becoder.ojConnect.luogu.' + operation, ...args); }
	async cancelPreparation(): Promise<void> { await this.call('cancelPreparation'); }
	async prepare(problem: ProblemRef, sourceUri: string): Promise<ILuoguPrepared> {
		const value = object(await this.call('prepare', problem, sourceUri));
		if (typeof value.handle !== 'string' || !value.handle || value.handle.length > 200 || typeof value.hasDraft !== 'boolean' || !Array.isArray(value.languages) || value.languages.length > 100) { invalid(); }
		const languages = value.languages.map(raw => {
			const language = object(raw);
			if (typeof language.id !== 'string' || !/^\d+(?::o2)?$/.test(language.id) || typeof language.label !== 'string' || !language.label || language.label.length > 200 || (language.family !== 'c' && language.family !== 'cpp')) { invalid(); }
			return { id: language.id, label: language.label, family: language.family as 'c' | 'cpp' };
		});
		return { handle: value.handle, languages, hasDraft: value.hasDraft };
	}
	async send(handle: string, payload: ILuoguSourcePayload): Promise<SubmissionOutcome> { return validateOutcome(await this.call('send', handle, payload)); }
	async readProblem(problem: ProblemRef): Promise<ProblemDocument> {
		if (problem.site !== 'luogu') { invalid(); }
		const value = validateProblem(await this.call('readProblem', problem));
		if (value.ref.url !== problem.url) { invalid(); }
		return value;
	}
	async readRecord(input: RecordRef): Promise<RecordSnapshot> {
		const record = validateRecordRef(input);
		if (record.problem.site !== 'luogu') { invalid(); }
		const value = validateRecord(await this.call('readRecord', record));
		if (value.ref.url !== record.url || value.ref.problem.url !== record.problem.url) { throw new Error('oj-connect-invalid-record'); }
		return value;
	}
	async loginSummary(): Promise<LoginSummary> {
		return loginSummary(await this.call('loginSummary'), 'luogu');
	}
	async reconcile(attemptId: string): Promise<SubmissionOutcome> { return validateOutcome(await this.call('reconcile', attemptId)); }
	async cancel(handle: string): Promise<void> { await this.call('cancel', handle); }
	async cancelRecord(record: RecordRef): Promise<void> { await this.call('cancelRecord', record); }
	async release(handle: string): Promise<void> { await this.call('release', handle); }
}
/** Nowcoder uses its own semantic operations, not AtCoder's page/form protocol. */
export class CommandNowcoderHost implements NowcoderHost {
	constructor(private readonly execute: (command: string, ...args: unknown[]) => Promise<unknown>) { }
	private call(operation: string, ...args: unknown[]): Promise<unknown> { return this.execute('_becoder.ojConnect.nowcoder.' + operation, ...args); }
	async cancelPreparation(): Promise<void> { await this.call('cancelPreparation'); }
	async prepare(problem: ProblemRef, sourceUri: string): Promise<INowcoderPrepared> {
		const value = object(await this.call('prepare', problem, sourceUri));
		if (typeof value.handle !== 'string' || !value.handle || value.handle.length > 200 || typeof value.hasDraft !== 'boolean' || !Array.isArray(value.languages) || value.languages.length > 100) { invalid(); }
		const languages = value.languages.map(raw => {
			const language = object(raw);
			if (typeof language.id !== 'string' || !/^\d+$/.test(language.id) || typeof language.label !== 'string' || !language.label || language.label.length > 200 || (language.family !== 'c' && language.family !== 'cpp')) { invalid(); }
			return { id: language.id, label: language.label, family: language.family as 'c' | 'cpp' };
		});
		return { handle: value.handle, languages, hasDraft: value.hasDraft };
	}
	async send(handle: string, payload: INowcoderSourcePayload): Promise<SubmissionOutcome> { return validateOutcome(await this.call('send', handle, payload)); }
	async readProblem(problem: ProblemRef): Promise<ProblemDocument> {
		if (problem.site !== 'nowcoder') { invalid(); }
		const value = validateProblem(await this.call('readProblem', problem));
		if (value.ref.url !== problem.url) { invalid(); }
		return value;
	}
	async readRecord(input: RecordRef): Promise<RecordSnapshot> {
		const record = validateRecordRef(input);
		if (record.problem.site !== 'nowcoder') { invalid(); }
		const value = validateRecord(await this.call('readRecord', record));
		if (value.ref.url !== record.url || value.ref.problem.url !== record.problem.url) { throw new Error('oj-connect-invalid-record'); }
		return value;
	}
	async loginSummary(): Promise<LoginSummary> {
		return loginSummary(await this.call('loginSummary'), 'nowcoder');
	}
	async reconcile(attemptId: string): Promise<SubmissionOutcome> { return validateOutcome(await this.call('reconcile', attemptId)); }
	async cancel(handle: string): Promise<void> { await this.call('cancel', handle); }
	async cancelRecord(record: RecordRef): Promise<void> { await this.call('cancelRecord', record); }
	async release(handle: string): Promise<void> { await this.call('release', handle); }
}
/** Codeforces uses its own semantic operations, not AtCoder's page/form protocol. */
export class CommandCodeforcesHost implements CodeforcesHost {
	constructor(private readonly execute: (command: string, ...args: unknown[]) => Promise<unknown>) { }
	private call(operation: string, ...args: unknown[]): Promise<unknown> { return this.execute('_becoder.ojConnect.codeforces.' + operation, ...args); }
	private outcome(value: SubmissionOutcome): void { if ((value.kind === 'record' && value.record.problem.site !== 'codeforces') || (value.kind === 'unconfirmed' && value.problem.site !== 'codeforces')) { invalid(); } }
	async cancelPreparation(): Promise<void> { await this.call('cancelPreparation'); }
	async prepare(problem: ProblemRef, sourceUri: string): Promise<ICodeforcesPrepared> {
		const value = object(await this.call('prepare', problem, sourceUri));
		if (typeof value.handle !== 'string' || !value.handle || value.handle.length > 200 || typeof value.hasDraft !== 'boolean' || !Array.isArray(value.languages) || value.languages.length > 100) { invalid(); }
		const languages = value.languages.map(raw => {
			const language = object(raw);
			if (typeof language.id !== 'string' || !/^\d+$/.test(language.id) || typeof language.label !== 'string' || !language.label || language.label.length > 200 || (language.family !== 'c' && language.family !== 'cpp')) { invalid(); }
			return { id: language.id, label: language.label, family: language.family as 'c' | 'cpp' };
		});
		return { handle: value.handle, languages, hasDraft: value.hasDraft };
	}
	async send(handle: string, payload: ICodeforcesSourcePayload): Promise<SubmissionOutcome> { const outcome = validateOutcome(await this.call('send', handle, payload)); this.outcome(outcome); return outcome; }
	async readProblem(problem: ProblemRef): Promise<ProblemDocument> {
		if (problem.site !== 'codeforces') { invalid(); }
		const value = validateProblem(await this.call('readProblem', problem));
		if (value.ref.url !== problem.url) { invalid(); }
		return value;
	}
	async readRecord(input: RecordRef): Promise<RecordSnapshot> {
		const record = validateRecordRef(input);
		if (record.problem.site !== 'codeforces') { invalid(); }
		const value = validateRecord(await this.call('readRecord', record));
		if (value.ref.url !== record.url || value.ref.problem.url !== record.problem.url) { throw new Error('oj-connect-invalid-record'); }
		return value;
	}
	async loginSummary(): Promise<LoginSummary> {
		return loginSummary(await this.call('loginSummary'), 'codeforces');
	}
	async reconcile(attemptId: string): Promise<SubmissionOutcome> { const outcome = validateOutcome(await this.call('reconcile', attemptId)); this.outcome(outcome); return outcome; }
	async cancel(handle: string): Promise<void> { await this.call('cancel', handle); }
	async cancelRecord(record: RecordRef): Promise<void> { await this.call('cancelRecord', record); }
	async release(handle: string): Promise<void> { await this.call('release', handle); }
}
function invalid(): never { throw new Error('oj-connect-invalid-host-response'); }

/** Transport only. No browser cookies, native view IDs, scripts or generic network request are exposed. */
export class CommandBrowserHost implements AtCoderHost {
	constructor(private readonly execute: (command: string, ...args: unknown[]) => Promise<unknown>) { }
	private call(operation: string, ...args: unknown[]): Promise<unknown> { return this.execute('_becoder.ojConnect.atcoder.' + operation, ...args); }
	async cancelPreparation(): Promise<void> { await this.call('cancelPreparation'); }
	async openTask(url: string, sourceUri: string): Promise<IAtCoderPageRef> {
		const value = object(await this.call('openTask', url, sourceUri));
		if (typeof value.handle !== 'string' || !value.handle || value.handle.length > 200 || typeof value.url !== 'string' || !officialTaskURL(value.url) || new URL(value.url).pathname !== new URL(url).pathname) { invalid(); }
		return { handle: value.handle, url: value.url };
	}
	async inspectTask(page: IAtCoderPageRef): Promise<IAtCoderTaskForm> {
		const value = object(await this.call('inspectTask', page));
		if (typeof value.hasDraft !== 'boolean' || !Array.isArray(value.languages) || value.languages.length > 100) { invalid(); }
		const languages = value.languages.map(raw => {
			const option = object(raw);
			if (typeof option.id !== 'string' || !/^\d+$/.test(option.id) || typeof option.label !== 'string' || !option.label || option.label.length > 200) { invalid(); }
			return { id: option.id, label: option.label };
		});
		return { hasDraft: value.hasDraft, languages };
	}
	async sendAndConfirm(page: IAtCoderPageRef, payload: IAtCoderSourcePayload): Promise<SubmissionOutcome> {
		const outcome = validateOutcome(await this.call('sendAndConfirm', page, payload));
		if (outcome.kind === 'record' && outcome.record.problem.url !== page.url) { invalid(); }
		if (outcome.kind === 'unconfirmed' && outcome.problem.url !== page.url) { invalid(); }
		return outcome;
	}
	async readRecord(input: RecordRef): Promise<RecordSnapshot> {
		const record = validateRecordRef(input), value = validateRecord(await this.call('readRecord', record));
		if (value.ref.url !== record.url || value.ref.problem.url !== record.problem.url) { throw new Error('oj-connect-invalid-record'); }
		return value;
	}
	async readProblem(problem: ProblemRef): Promise<ProblemDocument> {
		const value = validateProblem(await this.call('readProblem', problem));
		if (value.ref.url !== problem.url) { invalid(); }
		return value;
	}
	async loginSummary(): Promise<LoginSummary> {
		return loginSummary(await this.call('loginSummary'), 'atcoder');
	}
	async reconcile(attemptId: string): Promise<SubmissionOutcome> { return validateOutcome(await this.call('reconcile', attemptId)); }
	async cancel(page: IAtCoderPageRef): Promise<void> { await this.call('cancel', page); }
	async cancelRecord(record: RecordRef): Promise<void> { await this.execute('_becoder.ojConnect.releaseRecord', validateRecordRef(record)); }
	async release(page: IAtCoderPageRef): Promise<void> { await this.call('release', page); }
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
import type { IAtCoderBridge, IAtCoderPageRef, IAtCoderShortcutResult, IAtCoderSourcePayload, IAtCoderTaskForm, ILuoguPrepared, ILuoguSourcePayload } from 'becoder-oj-connect';
import { officialTaskURL } from './adapters/atcoder/task';
import type { AtCoderHost } from './adapters/atcoder/adapter';
import { type ProblemRef, type ProblemDocument, type RecordRef, type RecordSnapshot, type LoginSummary, type SubmissionOutcome, validateProblem, validateRecord, validateOutcome, validateRecordRef } from './domain';
import type { LuoguHost } from './adapters/luogu/adapter';

type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
	if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('oj-connect-invalid-host-response'); }
	return value as RecordValue;
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
		const value = object(await this.call('loginSummary'));
		if (value.site !== 'luogu' || !['signed-in', 'signed-out', 'unknown', 'unavailable'].includes(String(value.state)) || (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 512))) { invalid(); }
		return { site: 'luogu', state: value.state as LoginSummary['state'], label: value.label as string | undefined };
	}
	async reconcile(attemptId: string): Promise<SubmissionOutcome> { return validateOutcome(await this.call('reconcile', attemptId)); }
	async cancel(handle: string): Promise<void> { await this.call('cancel', handle); }
	async cancelRecord(record: RecordRef): Promise<void> { await this.call('cancelRecord', record); }
	async release(handle: string): Promise<void> { await this.call('release', handle); }
}
function invalid(): never { throw new Error('oj-connect-invalid-host-response'); }

/** Transport only. No browser cookies, native view IDs, scripts or generic network request are exposed. */
export class CommandBrowserHost implements IAtCoderBridge, AtCoderHost {
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
	async submit(page: IAtCoderPageRef, payload: IAtCoderSourcePayload): Promise<IAtCoderShortcutResult> {
		const value = object(await this.call('submit', page, payload));
		if (typeof value.status !== 'string' || value.status.length > 200 || typeof value.verified !== 'boolean' || (value.stopped !== undefined && typeof value.stopped !== 'boolean')) { invalid(); }
		for (const field of ['id', 'url', 'owner', 'score']) { if (value[field] !== undefined && (typeof value[field] !== 'string' || (value[field] as string).length > 2048)) { invalid(); } }
		if (value.verified) {
			if (typeof value.id !== 'string' || !/^[1-9][0-9]*$/.test(value.id) || typeof value.url !== 'string') { invalid(); }
			const task = new URL(page.url), detail = new URL(value.url);
			if (detail.origin !== 'https://atcoder.jp' || detail.username || detail.password || detail.pathname !== task.pathname.replace(/\/tasks\/[^/]+\/?$/, '/submissions/' + value.id)) { invalid(); }
		}
		return { status: value.status, verified: value.verified, id: value.id as string | undefined, url: value.url as string | undefined, score: value.score as string | undefined, owner: value.owner as string | undefined, stopped: value.stopped as boolean | undefined };
	}
	async revealResult(page: IAtCoderPageRef): Promise<void> { await this.call('revealResult', page); }
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
		const value = object(await this.call('loginSummary'));
		if (value.site !== 'atcoder' || !['signed-in', 'signed-out', 'unknown', 'unavailable'].includes(String(value.state)) || (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 512))) { invalid(); }
		return { site: 'atcoder', state: value.state as LoginSummary['state'], label: value.label as string | undefined };
	}
	async reconcile(attemptId: string): Promise<SubmissionOutcome> { return validateOutcome(await this.call('reconcile', attemptId)); }
	async cancel(page: IAtCoderPageRef): Promise<void> { await this.call('cancel', page); }
	async release(page: IAtCoderPageRef): Promise<void> { await this.call('release', page); }
}

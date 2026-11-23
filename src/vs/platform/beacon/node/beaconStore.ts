/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../base/common/path.js';
import * as fs from 'fs/promises';
import { constants, type BigIntStats } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import type { IBeaconConversation, IBeaconHistoryItem, IBeaconStoredConversation, IBeaconResume } from '../common/beaconContext.js';
import { acquireBeaconLease } from './beaconLease.js';

export interface IBeaconWorkspaceBinding { path: string; canonicalPath: string; assetsPath: string; identity: string; rootIdentity: string; assetsIdentity: string }
import type { BeaconProducer, IBeaconRuntimeRecord, IBeaconConsumedRecord, BeaconRecentProducer, IBeaconRecordRef, IBeaconRecentRecord, IBeaconRecentWrite, IBeaconCodeObservation, IBeaconCodeSnapshot, IBeaconCodeSave } from '../common/beaconContextTypes.js';
export type { BeaconProducer, IBeaconRuntimeRecord, IBeaconConsumedRecord } from '../common/beaconContextTypes.js';

const fileIdentity = (stat: BigIntStats) => `${stat.dev}:${stat.ino}`;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const samePath = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

export function checkBeaconIdentifier(id: string): void {
	if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) { throw new Error('beacon-invalid-id'); }
}

export function checkBeaconResume(value: IBeaconResume): void {
	if (!value || !['home', 'conversation'].includes(value.screen) || (value.screen === 'conversation' && !value.id) || (value.screen === 'home' && value.id !== undefined)) { throw new Error('beacon-invalid-view'); }
	if (value.id !== undefined) { checkBeaconIdentifier(value.id); }
	if (value.homeId !== undefined) { checkBeaconIdentifier(value.homeId); }
}

export async function prepareBeaconWorkspace(root: string, create: boolean): Promise<IBeaconWorkspaceBinding> {
	if (typeof root !== 'string' || !path.isAbsolute(root) || root.includes('\0')) { throw new Error('beacon-invalid-root'); }
	const canonicalPath = await fs.realpath(root);
	const rootStat = await fs.stat(canonicalPath, { bigint: true });
	if (!rootStat.isDirectory()) { throw new Error('beacon-invalid-root'); }
	const assetsPath = path.join(canonicalPath, '.beaconWork');
	if (create) {
		try { await fs.mkdir(assetsPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; } }
	}
	const assets = await fs.lstat(assetsPath, { bigint: true });
	if (!assets.isDirectory() || assets.isSymbolicLink() || !samePath(await fs.realpath(assetsPath), assetsPath)) { throw new Error('beacon-invalid-assets'); }
	await fs.access(assetsPath, constants.R_OK | constants.W_OK);
	if (fileIdentity(await fs.stat(canonicalPath, { bigint: true })) !== fileIdentity(rootStat)) { throw new Error('beacon-workspace-changed'); }
	const rootIdentity = fileIdentity(rootStat);
	const assetsIdentity = fileIdentity(assets);
	return { path: root, canonicalPath, assetsPath, identity: `${canonicalPath.toLowerCase()}\0${rootIdentity}\0${assetsIdentity}`, rootIdentity, assetsIdentity };
}

export class BeaconStore {
	constructor(readonly binding: IBeaconWorkspaceBinding, private readonly publication: Pick<typeof fs, 'rename' | 'unlink'> & Partial<Pick<typeof fs, 'rm'>> = fs) { }

	async validate(): Promise<void> {
		let current: IBeaconWorkspaceBinding;
		try { current = await prepareBeaconWorkspace(this.binding.path, false); } catch (cause) { throw new Error('beacon-workspace-unavailable', { cause }); }
		if (current.identity !== this.binding.identity) { throw new Error('beacon-workspace-changed'); }
	}

	private async directory(parts: string[], create: boolean): Promise<string> {
		await this.validate();
		let current = this.binding.assetsPath;
		for (const part of parts) {
			checkBeaconIdentifier(part);
			current = path.join(current, part);
			if (create) {
				try { await fs.mkdir(current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; } }
			}
			const stat = await fs.lstat(current);
			if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await fs.realpath(current), current)) { throw new Error('beacon-invalid-assets'); }
		}
		return current;
	}

	private async readJson(file: string): Promise<unknown> {
		const before = await fs.lstat(file, { bigint: true });
		if (!before.isFile() || before.isSymbolicLink()) { throw new Error('beacon-invalid-assets'); }
		const handle = await fs.open(file, 'r');
		try {
			if (fileIdentity(await handle.stat({ bigint: true })) !== fileIdentity(before)) { throw new Error('beacon-file-changed'); }
			const text = await handle.readFile('utf8');
			if (fileIdentity(await fs.lstat(file, { bigint: true })) !== fileIdentity(before)) { throw new Error('beacon-file-changed'); }
			await this.validate();
			if (!samePath(await fs.realpath(file), file)) { throw new Error('beacon-invalid-assets'); }
			return JSON.parse(text);
		} finally { await handle.close(); }
	}

	private async writeJson(parts: string[], name: string, value: unknown, beforePublish?: () => void): Promise<void> {
		const directory = await this.directory(parts, true);
		const destination = path.join(directory, name);
		let previous: BigIntStats | undefined;
		try { previous = await fs.lstat(destination, { bigint: true }); } catch (error) { if (!missing(error)) { throw error; } }
		if (previous && (!previous.isFile() || previous.isSymbolicLink())) { throw new Error('beacon-invalid-assets'); }
		const temporary = path.join(directory, `${randomUUID()}.tmp`);
		const handle = await fs.open(temporary, 'wx', 0o600);
		let owned: string | undefined;
		let closed = false;
		const failures: unknown[] = [];
		try {
			owned = fileIdentity(await handle.stat({ bigint: true }));
			await handle.writeFile(JSON.stringify(value));
			await handle.sync();
			await handle.close();
			closed = true;
			await this.directory(parts, false);
			if (fileIdentity(await fs.lstat(temporary, { bigint: true })) !== owned) { throw new Error('beacon-file-changed'); }
			let current: BigIntStats | undefined;
			try { current = await fs.lstat(destination, { bigint: true }); } catch (error) { if (!missing(error)) { throw error; } }
			if ((previous && (!current || fileIdentity(current) !== fileIdentity(previous))) || (!previous && current)) { throw new Error('beacon-file-changed'); }
			beforePublish?.();
			await this.publication.rename(temporary, destination);
			await this.validate();
			if (fileIdentity(await fs.lstat(destination, { bigint: true })) !== owned) { throw new Error('beacon-file-changed'); }
		} catch (error) { failures.push(error); }
		finally {
			if (!closed) { try { await handle.close(); } catch (error) { failures.push(error); } }
			if (owned !== undefined) {
				try { if (fileIdentity(await fs.lstat(temporary, { bigint: true })) === owned) { await this.publication.unlink(temporary); } } catch (error) { if (!missing(error)) { failures.push(error); } }
			}
		}
		if (failures.length === 1) { throw failures[0]; }
		if (failures.length > 1) { throw new AggregateError(failures, failures[0] instanceof Error ? failures[0].message : 'beacon-save-failed', { cause: failures[0] }); }
	}

	async readConversation(id: string): Promise<IBeaconStoredConversation | undefined> {
		checkBeaconIdentifier(id);
		let directory: string;
		try { directory = await this.directory(['conversations', id], false); } catch (error) { if (missing(error)) { return undefined; } throw error; }
		let value: unknown;
		try { value = await this.readJson(path.join(directory, 'conversation.json')); } catch (error) { if (missing(error)) { return undefined; } throw error; }
		const record = value as IBeaconStoredConversation & { version?: number };
		if (!record || record.version !== 1 || !Number.isSafeInteger(record.revision) || record.revision < 1 || record.data?.id !== id || !Array.isArray(record.data.messages) || typeof record.data.title !== 'string' || !Number.isFinite(record.data.updatedAt)) { throw new Error('beacon-unreadable-history'); }
		return { revision: record.revision, data: record.data };
	}

	async readResume(): Promise<IBeaconResume | undefined> {
		await this.validate();
		try {
			const value = await this.readJson(path.join(this.binding.assetsPath, 'resume.json')) as { version?: number; view?: IBeaconResume };
			if (value?.version !== 1 || !value.view) { throw new Error('beacon-invalid-view'); }
			checkBeaconResume(value.view); return value.view;
		} catch (error) { if (missing(error)) { return undefined; } throw error; }
	}

	async saveResume(view: IBeaconResume): Promise<void> {
		checkBeaconResume(view);
		await this.writeJson([], 'resume.json', { version: 1, view });
	}

	async listHistory(includeDrafts = false): Promise<IBeaconHistoryItem[]> {
		let directory: string;
		try { directory = await this.directory(['conversations'], false); } catch (error) { if (missing(error)) { return []; } throw error; }
		const result: IBeaconHistoryItem[] = [];
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(entry.name)) { continue; }
			if (entry.isSymbolicLink()) { throw new Error('beacon-invalid-assets'); }
			if (!entry.isDirectory()) { continue; }
			const record = await this.readConversation(entry.name);
			if (record && (includeDrafts || record.data.draftOnly !== true)) { const { id, title, updatedAt, workspace } = record.data; result.push({ id, title, updatedAt, workspace, revision: record.revision }); }
		}
		return result.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	async saveConversation(data: IBeaconConversation, revision: number, beforePublish?: () => void): Promise<IBeaconStoredConversation> {
		checkBeaconIdentifier(data?.id);
		if (!Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(data.messages) || typeof data.title !== 'string' || !Number.isFinite(data.updatedAt) || typeof data.error !== 'string') { throw new Error('beacon-invalid-history'); }
		if ((data.draft !== undefined && (!data.draft || typeof data.draft.text !== 'string' || !Array.isArray(data.draft.attachments))) || (data.draftOnly !== undefined && typeof data.draftOnly !== 'boolean') || (data.draftOnly === true && data.messages.length > 0)) { throw new Error('beacon-invalid-history'); }
		const release = await acquireBeaconLease(this.binding.identity, `write:${data.id}`);
		try {
			const current = await this.readConversation(data.id);
			if ((current?.revision ?? 0) !== revision) { throw new Error('beacon-history-conflict'); }
			const result = { revision: revision + 1, data: { ...data, workspace: [{ name: path.basename(this.binding.path), path: this.binding.path }] } };
			await this.writeJson(['conversations', data.id], 'conversation.json', { version: 1, ...result }, beforePublish);
			return result;
		} finally { await release(); }
	}

	async deleteConversation(id: string): Promise<void> {
		checkBeaconIdentifier(id);
		const release = await acquireBeaconLease(this.binding.identity, `write:${id}`);
		try {
			let directory: string;
			try { directory = await this.directory(['conversations', id], false); } catch (error) { if (missing(error)) { return; } throw error; }
			const identity = fileIdentity(await fs.lstat(directory, { bigint: true }));
			if ((await fs.readdir(directory)).some(name => /^[a-f0-9]{8}-[a-f0-9-]{27}\.deleted$/i.test(name))) { throw new Error('beacon-delete-incomplete'); }
			const verify = async () => {
				await this.directory(['conversations', id], false);
				if (fileIdentity(await fs.lstat(directory, { bigint: true })) !== identity) { throw new Error('beacon-file-changed'); }
			};
			const originals = new Map<string, BigIntStats>();
			for (const name of ['conversation.json', 'code-snapshots.json', 'materials']) {
				try { originals.set(name, await fs.lstat(path.join(directory, name), { bigint: true })); } catch (error) { if (!missing(error)) { throw error; } }
			}
			await verify(); await this.readConversation(id); await verify();
			for (const name of ['code-snapshots.json', 'materials', 'conversation.json']) {
				const before = originals.get(name); if (!before) { continue; }
				const recursive = name === 'materials';
				if (before.isSymbolicLink() || (recursive ? !before.isDirectory() : !before.isFile())) { throw new Error('beacon-invalid-assets'); }
				await verify();
				const file = path.join(directory, name), removed = path.join(directory, `${randomUUID()}.deleted`);
				if (fileIdentity(await fs.lstat(file, { bigint: true })) !== fileIdentity(before)) { throw new Error('beacon-file-changed'); }
				await verify(); await this.publication.rename(file, removed); await verify();
				if (fileIdentity(await fs.lstat(removed, { bigint: true })) !== fileIdentity(before)) { throw new Error('beacon-file-changed'); }
				if (recursive) {
					const relative = path.relative(this.binding.assetsPath, removed);
					if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep) || !samePath(await fs.realpath(removed), removed)) { throw new Error('beacon-invalid-assets'); }
					try { await (this.publication.rm ?? fs.rm)(removed, { recursive: true }); }
					catch (cause) {
						try {
							await verify();
							if (fileIdentity(await fs.lstat(removed, { bigint: true })) !== fileIdentity(before)) { throw new Error('beacon-file-changed'); }
							try { await fs.lstat(file); throw new Error('beacon-file-changed'); } catch (error) { if (!missing(error)) { throw error; } }
							await this.publication.rename(removed, file); await verify();
							if (fileIdentity(await fs.lstat(file, { bigint: true })) !== fileIdentity(before)) { throw new Error('beacon-file-changed'); }
						} catch (restore) { throw new AggregateError([cause, restore], 'beacon-delete-incomplete'); }
						throw cause;
					}
				} else { await fs.unlink(removed); }
			}
			// Unknown files and independently saved learning assets in this directory are retained.
		} finally { await release(); }
	}

	private producer(value: BeaconProducer): void {
		if (value !== 'runner' && value !== 'cph' && value !== 'notebook') { throw new Error('beacon-invalid-producer'); }
	}

	private recentProducer(value: BeaconRecentProducer): void {
		if (!['runner', 'cph', 'notebook', 'problem', 'oj'].includes(value)) { throw new Error('beacon-invalid-producer'); }
	}

	async listRecentRecords(producer: BeaconRecentProducer): Promise<IBeaconRecentRecord[]> {
		this.recentProducer(producer);
		try {
			const directory = await this.directory(['cache', producer], false);
			const value = await this.readJson(path.join(directory, 'records.json')) as { version?: number; records?: unknown[] };
			if (!value || !Array.isArray(value.records)) { throw new Error('beacon-unreadable-queue'); }
			if (value.version === 1 && ['runner', 'cph', 'notebook'].includes(producer)) {
				return value.records.map((raw, index) => {
					const record = raw as IBeaconRuntimeRecord;
					if (!record || typeof record.code !== 'string' || !Array.isArray(record.events) || !Number.isFinite(record.startedAt) || !Number.isSafeInteger(record.revision) || record.revision < 1 || !Number.isSafeInteger(record.sequence) || record.sequence < 0) { throw new Error('beacon-unreadable-queue'); }
					checkBeaconIdentifier(record.id);
					const capture = (record.events[0] as { sourceSnapshot?: { originalPath?: string; sha256?: string } } | undefined)?.sourceSnapshot;
					return { producer, id: record.id, revision: record.revision, sequence: index + 1, dedupKey: record.id, capturedAt: record.startedAt,
						...(capture?.originalPath ? { sourceUri: pathToFileURL(capture.originalPath).href } : {}), ...(capture?.sha256 ? { sourceDigest: { value: capture.sha256, representation: 'compiler-bytes' as const } } : {}),
						state: record.events.some(event => (event as { type?: string })?.type === 'finished') ? 'finished' as const : 'unknown' as const, coverage: { channels: [] },
						payload: { kind: 'runtime' as const, activityId: record.id, code: record.code, events: record.events, startedAt: record.startedAt, lastEventSequence: record.sequence } };
				});
			}
			if (value.version !== 2) { throw new Error('beacon-unreadable-queue'); }
			const records = value.records as IBeaconRecentRecord[];
			const ids = new Set<string>();
			for (const record of records) {
				if (!record || record.producer !== producer || typeof record.dedupKey !== 'string' || !record.dedupKey || !Number.isFinite(record.capturedAt) || !Number.isSafeInteger(record.sequence) || record.sequence < 1 || !Number.isSafeInteger(record.revision) || record.revision < 1 || !record.payload || !['runtime', 'problem', 'oj', 'oj-evaluation'].includes(record.payload.kind) || !record.coverage || !Array.isArray(record.coverage.channels) || !['available', 'active', 'finished', 'unknown'].includes(record.state) || ids.has(record.id)) { throw new Error('beacon-unreadable-queue'); }
				checkBeaconIdentifier(record.id); ids.add(record.id);
				if (record.payload.kind === 'runtime' && (typeof record.payload.code !== 'string' || !Array.isArray(record.payload.events) || typeof record.payload.activityId !== 'string' || !Number.isSafeInteger(record.payload.lastEventSequence))) { throw new Error('beacon-unreadable-queue'); }
			}
			return records;
		} catch (error) {
			if (missing(error)) { return []; }
			if (error instanceof SyntaxError) { throw new Error('beacon-unreadable-queue', { cause: error }); }
			throw error;
		}
	}

	async readRecentRecord(ref: IBeaconRecordRef): Promise<IBeaconRecentRecord> {
		checkBeaconIdentifier(ref.id);
		const record = (await this.listRecentRecords(ref.producer)).find(record => record.id === ref.id);
		if (!record) { throw new Error('beacon-record-evicted'); }
		if (!Number.isSafeInteger(ref.revision) || record.revision !== ref.revision) { throw new Error('beacon-record-changed'); }
		return record;
	}

	private retained(records: IBeaconRecentRecord[], producer: BeaconRecentProducer, activeKeys: ReadonlySet<string>): IBeaconRecentRecord[] {
		const recent = new Set(records.slice(producer === 'problem' ? -13 : -20).map(record => record.id));
		return records.filter(record => recent.has(record.id) || activeKeys.has(record.dedupKey) || (record.payload.kind === 'runtime' && activeKeys.has(record.payload.activityId)) || (!!record.submission?.attemptId && activeKeys.has(record.submission.attemptId)) || (!!record.submission?.recordKey && activeKeys.has(record.submission.recordKey)));
	}

	async saveRecentRecord(producer: BeaconRecentProducer, input: IBeaconRecentWrite, activeKeys: ReadonlySet<string>, promote: boolean): Promise<IBeaconRecordRef> {
		this.recentProducer(producer);
		if (!input || input.producer !== producer || typeof input.dedupKey !== 'string' || !input.dedupKey || !Number.isFinite(input.capturedAt) || Buffer.byteLength(JSON.stringify(input), 'utf8') > 8 * 1024 * 1024 - 512) { throw new Error('beacon-invalid-record'); }
		const release = await acquireBeaconLease(this.binding.identity, `queue:${producer}`);
		try {
			const records = await this.listRecentRecords(producer);
			const previous = records.find(record => record.dedupKey === input.dedupKey || (!!input.submission?.attemptId && record.submission?.attemptId === input.submission.attemptId) || (!!input.submission?.recordKey && record.submission?.recordKey === input.submission.recordKey));
			const next: IBeaconRecentRecord = { ...structuredClone(input), id: previous?.id ?? randomUUID(), revision: (previous?.revision ?? 0) + 1, sequence: promote || !previous ? Math.max(0, ...records.map(record => record.sequence)) + 1 : previous.sequence };
			if (previous) { records.splice(records.indexOf(previous), 1, next); } else { records.push(next); }
			records.sort((a, b) => a.sequence - b.sequence);
			await this.writeJson(['cache', producer], 'records.json', { version: 2, records: this.retained(records, producer, activeKeys) });
			return { producer, id: next.id, revision: next.revision };
		} finally { await release(); }
	}

	async trimRecent(producer: BeaconRecentProducer, activeKeys: ReadonlySet<string>): Promise<void> {
		const release = await acquireBeaconLease(this.binding.identity, `queue:${producer}`);
		try {
			const records = await this.listRecentRecords(producer); const retained = this.retained(records, producer, activeKeys);
			if (retained.length !== records.length) { await this.writeJson(['cache', producer], 'records.json', { version: 2, records: retained }); }
		} finally { await release(); }
	}

	async listCodeSnapshots(conversationId: string): Promise<Omit<IBeaconCodeSnapshot, 'contents'>[]> {
		return (await this.codeSnapshots(conversationId)).map(({ contents: _contents, ...metadata }) => metadata);
	}

	private async codeSnapshots(conversationId: string): Promise<IBeaconCodeSnapshot[]> {
		checkBeaconIdentifier(conversationId);
		if (!await this.readConversation(conversationId)) { throw new Error('beacon-missing-conversation'); }
		try {
			const directory = await this.directory(['conversations', conversationId], false);
			const value = await this.readJson(path.join(directory, 'code-snapshots.json')) as { version?: number; records?: IBeaconCodeSnapshot[] };
			if (value?.version !== 1 || !Array.isArray(value.records) || value.records.length > 10 || value.records.some(record => !record || typeof record.contents !== 'string' || Buffer.byteLength(record.contents, 'utf8') > 262144 || record.contentSha256 !== createHash('sha256').update(record.contents, 'utf8').digest('hex') || typeof record.sourceUri !== 'string' || !Number.isFinite(record.capturedAt))) { throw new Error('beacon-unreadable-queue'); }
			for (const record of value.records) { checkBeaconIdentifier(record.id); }
			return value.records;
		} catch (error) { if (missing(error)) { return []; } throw error; }
	}

	async readCodeSnapshot(conversationId: string, id: string): Promise<IBeaconCodeSnapshot> {
		checkBeaconIdentifier(id);
		const record = (await this.codeSnapshots(conversationId)).find(record => record.id === id);
		if (!record) { throw new Error('beacon-record-evicted'); }
		return record;
	}

	async saveCodeRead(conversationId: string, observation: IBeaconCodeObservation): Promise<IBeaconCodeSave> {
		checkBeaconIdentifier(conversationId);
		if (!observation || typeof observation.contents !== 'string' || typeof observation.sourceUri !== 'string' || !['c', 'cpp'].includes(observation.languageId) || !Number.isFinite(observation.observedAt) || observation.contentSha256 !== createHash('sha256').update(observation.contents, 'utf8').digest('hex')) { throw new Error('beacon-invalid-code'); }
		if (Buffer.byteLength(observation.contents, 'utf8') > 262144) { return { state: 'not-saved', reason: 'too-large' }; }
		const release = await acquireBeaconLease(this.binding.identity, `write:${conversationId}`);
		try {
			const records = await this.codeSnapshots(conversationId);
			const sameUri = (uri: string) => process.platform === 'win32' ? uri.toLowerCase() === observation.sourceUri.toLowerCase() : uri === observation.sourceUri;
			const previous = records.find(record => sameUri(record.sourceUri) && record.contents === observation.contents);
			if (previous) { records.splice(records.indexOf(previous), 1); }
			const next: IBeaconCodeSnapshot = previous ? { ...previous, lastObservedAt: observation.observedAt, lastObservedVersion: observation.version } : { ...structuredClone(observation), id: randomUUID(), capturedAt: Date.now(), lastObservedAt: observation.observedAt, lastObservedVersion: observation.version };
			records.push(next);
			await this.writeJson(['conversations', conversationId], 'code-snapshots.json', { version: 1, records: records.slice(-10) });
			return { state: 'saved', id: next.id, reused: !!previous };
		} catch (error) {
			await this.validate();
			if (!await this.readConversation(conversationId)) { throw new Error('beacon-missing-conversation'); }
			return { state: 'not-saved', reason: 'save-failed' };
		} finally { await release(); }
	}

	async listRuntimeRecords(producer: BeaconProducer): Promise<IBeaconRuntimeRecord[]> {
		this.producer(producer);
		return (await this.listRecentRecords(producer)).flatMap(record => record.payload.kind === 'runtime' ? [{ id: record.payload.activityId, code: record.payload.code, startedAt: record.payload.startedAt, events: record.payload.events, revision: record.revision, sequence: record.payload.lastEventSequence }] : []);
	}

	/** Call only after captured code enters the real compilation start; producers are wired separately. */
	async commitRuntimeRecord(producer: BeaconProducer, input: Omit<IBeaconRuntimeRecord, 'revision' | 'sequence'>, activeKeys: ReadonlySet<string> = new Set()): Promise<void> {
		this.producer(producer); checkBeaconIdentifier(input.id);
		if (typeof input.code !== 'string' || !Number.isFinite(input.startedAt) || !Array.isArray(input.events)) { throw new Error('beacon-invalid-record'); }
		if ((await this.listRuntimeRecords(producer)).some(record => record.id === input.id)) { return; }
		const capture = (input.events[0] as { sourceSnapshot?: { originalPath?: string; sha256?: string }; details?: { problem?: { url?: string } } } | undefined)?.sourceSnapshot;
		await this.saveRecentRecord(producer, { producer, dedupKey: input.id, capturedAt: input.startedAt, ...(capture?.originalPath ? { sourceUri: pathToFileURL(capture.originalPath).href } : {}), ...(capture?.sha256 ? { sourceDigest: { value: capture.sha256, representation: 'compiler-bytes' } } : {}), state: 'active', coverage: { channels: [] }, payload: { kind: 'runtime', activityId: input.id, code: input.code, events: input.events, startedAt: input.startedAt, lastEventSequence: 0 } }, activeKeys, true);
	}

	async appendRuntimeEvents(producer: BeaconProducer, id: string, sequence: number, events: unknown[], activeKeys: ReadonlySet<string> = new Set()): Promise<boolean> {
		this.producer(producer); checkBeaconIdentifier(id);
		if (!Number.isSafeInteger(sequence) || sequence < 1 || !Array.isArray(events)) { throw new Error('beacon-invalid-record'); }
		const release = await acquireBeaconLease(this.binding.identity, `queue:${producer}`);
		try {
			const records = await this.listRecentRecords(producer);
			const current = records.find(record => record.payload.kind === 'runtime' && record.payload.activityId === id);
			if (!current || current.payload.kind !== 'runtime' || sequence <= current.payload.lastEventSequence) { return false; }
			for (const event of structuredClone(events)) {
				const channel = event as { type?: string; channelId?: string; phase: string; stream: string; sampleId?: string; blockId?: string; byteRepresentation: 'process-bytes' | 'utf8-observed-text'; observedBytes: number; sourceOmittedBytes?: number; ranges?: { offset: number; bytesBase64: string }[]; sourceTruncated: boolean };
				if (channel?.type === 'stream' && typeof channel.channelId === 'string' && Array.isArray(channel.ranges)) {
					const retainedRanges: [number, number][] = []; let cursor = 0;
					const omittedRanges: [number, number][] = [];
					if (!Number.isSafeInteger(channel.observedBytes) || channel.observedBytes < 0 || !['process-bytes', 'utf8-observed-text'].includes(channel.byteRepresentation)) { throw new Error('beacon-invalid-record'); }
					for (const range of channel.ranges) {
						const end = range.offset + Buffer.byteLength(range.bytesBase64, 'base64');
						if (!Number.isSafeInteger(range.offset) || range.offset < cursor || end > channel.observedBytes) { throw new Error('beacon-invalid-record'); }
						if (cursor < range.offset) { omittedRanges.push([cursor, range.offset]); }
						retainedRanges.push([range.offset, end]); cursor = end;
					}
					if (cursor < channel.observedBytes) { omittedRanges.push([cursor, channel.observedBytes]); }
					const old = current.payload.events.findIndex(value => (value as { channelId?: string })?.channelId === channel.channelId);
					if (old >= 0) { current.payload.events.splice(old, 1); }
					const coverage = { phase: channel.phase, stream: channel.stream, sampleId: channel.sampleId, blockId: channel.blockId, byteRepresentation: channel.byteRepresentation, observedBytes: channel.observedBytes, sourceOmittedBytes: channel.sourceOmittedBytes, retainedRanges, omittedRanges, sourceTruncated: channel.sourceTruncated };
					const prior = current.coverage.channels.findIndex(value => value.phase === channel.phase && value.stream === channel.stream && value.sampleId === channel.sampleId && value.blockId === channel.blockId);
					if (prior >= 0) { current.coverage.channels.splice(prior, 1); } current.coverage.channels.push(coverage);
				}
				current.payload.events.push(event);
			}
			current.revision++; current.payload.lastEventSequence = sequence;
			if (events.some(event => (event as { type?: string })?.type === 'finished')) { current.state = 'finished'; }
			if (Buffer.byteLength(JSON.stringify(current), 'utf8') > 8 * 1024 * 1024) { throw new Error('beacon-invalid-record'); }
			await this.writeJson(['cache', producer], 'records.json', { version: 2, records: this.retained(records, producer, activeKeys) });
			return true;
		} finally { await release(); }
	}

	async consumeRuntimeRecord(conversationId: string, producer: BeaconProducer, id: string, revision?: number): Promise<IBeaconConsumedRecord> {
		checkBeaconIdentifier(conversationId); this.producer(producer); checkBeaconIdentifier(id);
		const release = await acquireBeaconLease(this.binding.identity, `queue:${producer}`);
		try {
			const record = (await this.listRuntimeRecords(producer)).find(record => record.id === id);
			if (!record) { throw new Error('beacon-record-evicted'); }
			if (revision !== undefined && record.revision !== revision) { throw new Error('beacon-record-changed'); }
			const releaseConversation = await acquireBeaconLease(this.binding.identity, `write:${conversationId}`);
			try {
				if (!await this.readConversation(conversationId)) { throw new Error('beacon-missing-conversation'); }
				const result = { ...record, materialId: `${producer}-${id}-${record.revision}` };
				const previous = await this.readMaterial(conversationId, result.materialId);
				if (previous) {
					if (JSON.stringify(previous) !== JSON.stringify(result)) { throw new Error('beacon-material-conflict'); }
				} else { await this.writeJson(['conversations', conversationId, 'materials'], `${result.materialId}.json`, result); }
				return result;
			} finally { await releaseConversation(); }
		} finally { await release(); }
	}

	async readMaterial(conversationId: string, materialId: string): Promise<IBeaconConsumedRecord | undefined> {
		checkBeaconIdentifier(conversationId);
		const match = typeof materialId === 'string' ? /^(runner|cph|notebook)-([a-zA-Z0-9][a-zA-Z0-9_-]{0,127})-([1-9][0-9]{0,15})$/.exec(materialId) : null;
		if (!match || !Number.isSafeInteger(Number(match[3]))) { throw new Error('beacon-invalid-id'); }
		if (!await this.readConversation(conversationId)) { throw new Error('beacon-missing-conversation'); }
		try {
			const directory = await this.directory(['conversations', conversationId, 'materials'], false);
			const record = await this.readJson(path.join(directory, `${materialId}.json`)) as IBeaconConsumedRecord;
			if (record?.materialId !== materialId || record.id !== match[2] || record.revision !== Number(match[3]) || typeof record.code !== 'string' || !Array.isArray(record.events)) { throw new Error('beacon-unreadable-material'); }
			return record;
		} catch (error) { if (missing(error)) { return undefined; } throw error; }
	}
}

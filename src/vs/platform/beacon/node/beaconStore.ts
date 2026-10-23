/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../base/common/path.js';
import * as fs from 'fs/promises';
import { constants, type Stats } from 'fs';
import { randomUUID } from 'crypto';
import type { IBeaconConversation, IBeaconHistoryItem, IBeaconStoredConversation, IBeaconResume } from '../common/beaconContext.js';
import { acquireBeaconLease } from './beaconLease.js';

export interface IBeaconWorkspaceBinding { path: string; canonicalPath: string; assetsPath: string; identity: string; rootIdentity: string; assetsIdentity: string }
import type { BeaconProducer, IBeaconRuntimeRecord, IBeaconConsumedRecord } from '../common/beaconContextTypes.js';
export type { BeaconProducer, IBeaconRuntimeRecord, IBeaconConsumedRecord } from '../common/beaconContextTypes.js';

const fileIdentity = (stat: Stats) => `${stat.dev}:${stat.ino}`;
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
	const rootStat = await fs.stat(canonicalPath);
	if (!rootStat.isDirectory()) { throw new Error('beacon-invalid-root'); }
	const assetsPath = path.join(canonicalPath, '.beaconWork');
	if (create) {
		try { await fs.mkdir(assetsPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; } }
	}
	const assets = await fs.lstat(assetsPath);
	if (!assets.isDirectory() || assets.isSymbolicLink() || !samePath(await fs.realpath(assetsPath), assetsPath)) { throw new Error('beacon-invalid-assets'); }
	await fs.access(assetsPath, constants.R_OK | constants.W_OK);
	if (fileIdentity(await fs.stat(canonicalPath)) !== fileIdentity(rootStat)) { throw new Error('beacon-workspace-changed'); }
	const rootIdentity = fileIdentity(rootStat);
	const assetsIdentity = fileIdentity(assets);
	return { path: root, canonicalPath, assetsPath, identity: `${canonicalPath.toLowerCase()}\0${rootIdentity}\0${assetsIdentity}`, rootIdentity, assetsIdentity };
}

export class BeaconStore {
	constructor(readonly binding: IBeaconWorkspaceBinding, private readonly publication: Pick<typeof fs, 'rename' | 'unlink'> = fs) { }

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
		const before = await fs.lstat(file);
		if (!before.isFile() || before.isSymbolicLink()) { throw new Error('beacon-invalid-assets'); }
		const handle = await fs.open(file, 'r');
		try {
			if (fileIdentity(await handle.stat()) !== fileIdentity(before)) { throw new Error('beacon-file-changed'); }
			const text = await handle.readFile('utf8');
			if (fileIdentity(await fs.lstat(file)) !== fileIdentity(before)) { throw new Error('beacon-file-changed'); }
			await this.validate();
			if (!samePath(await fs.realpath(file), file)) { throw new Error('beacon-invalid-assets'); }
			return JSON.parse(text);
		} finally { await handle.close(); }
	}

	private async writeJson(parts: string[], name: string, value: unknown): Promise<void> {
		const directory = await this.directory(parts, true);
		const destination = path.join(directory, name);
		let previous: Stats | undefined;
		try { previous = await fs.lstat(destination); } catch (error) { if (!missing(error)) { throw error; } }
		if (previous && (!previous.isFile() || previous.isSymbolicLink())) { throw new Error('beacon-invalid-assets'); }
		const temporary = path.join(directory, `${randomUUID()}.tmp`);
		const handle = await fs.open(temporary, 'wx', 0o600);
		let owned: string | undefined;
		let closed = false;
		const failures: unknown[] = [];
		try {
			owned = fileIdentity(await handle.stat());
			await handle.writeFile(JSON.stringify(value));
			await handle.sync();
			await handle.close();
			closed = true;
			await this.directory(parts, false);
			if (fileIdentity(await fs.lstat(temporary)) !== owned) { throw new Error('beacon-file-changed'); }
			let current: Stats | undefined;
			try { current = await fs.lstat(destination); } catch (error) { if (!missing(error)) { throw error; } }
			if ((previous && (!current || fileIdentity(current) !== fileIdentity(previous))) || (!previous && current)) { throw new Error('beacon-file-changed'); }
			await this.publication.rename(temporary, destination);
			await this.validate();
			if (fileIdentity(await fs.lstat(destination)) !== owned) { throw new Error('beacon-file-changed'); }
		} catch (error) { failures.push(error); }
		finally {
			if (!closed) { try { await handle.close(); } catch (error) { failures.push(error); } }
			if (owned !== undefined) {
				try { if (fileIdentity(await fs.lstat(temporary)) === owned) { await this.publication.unlink(temporary); } } catch (error) { if (!missing(error)) { failures.push(error); } }
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

	async saveConversation(data: IBeaconConversation, revision: number): Promise<IBeaconStoredConversation> {
		checkBeaconIdentifier(data?.id);
		if (!Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(data.messages) || typeof data.title !== 'string' || !Number.isFinite(data.updatedAt) || typeof data.error !== 'string') { throw new Error('beacon-invalid-history'); }
		if ((data.draft !== undefined && (!data.draft || typeof data.draft.text !== 'string' || !Array.isArray(data.draft.attachments))) || (data.draftOnly !== undefined && typeof data.draftOnly !== 'boolean') || (data.draftOnly === true && data.messages.length > 0)) { throw new Error('beacon-invalid-history'); }
		const release = await acquireBeaconLease(this.binding.identity, `write:${data.id}`);
		try {
			const current = await this.readConversation(data.id);
			if ((current?.revision ?? 0) !== revision) { throw new Error('beacon-history-conflict'); }
			const result = { revision: revision + 1, data: { ...data, workspace: [{ name: path.basename(this.binding.path), path: this.binding.path }] } };
			await this.writeJson(['conversations', data.id], 'conversation.json', { version: 1, ...result });
			return result;
		} finally { await release(); }
	}

	async deleteConversation(id: string): Promise<void> {
		checkBeaconIdentifier(id);
		const release = await acquireBeaconLease(this.binding.identity, `write:${id}`);
		try {
			const current = await this.readConversation(id);
			if (!current) {
				try { await fs.rm(path.join(await this.directory(['conversations', id], false), 'materials'), { recursive: true, force: true }); }
				catch (error) { if (!missing(error)) { throw error; } }
				return;
			}
			const directory = await this.directory(['conversations', id], false);
			const file = path.join(directory, 'conversation.json');
			const identity = fileIdentity(await fs.lstat(file));
			const removed = path.join(directory, `${randomUUID()}.deleted`);
			await fs.rm(path.join(directory, 'materials'), { recursive: true, force: true });
			await fs.rename(file, removed);
			if (fileIdentity(await fs.lstat(removed)) !== identity) { throw new Error('beacon-file-changed'); }
			await fs.unlink(removed);
			// Unknown files and independently saved learning assets in this directory are retained.
		} finally { await release(); }
	}

	private producer(value: BeaconProducer): void {
		if (value !== 'runner' && value !== 'cph' && value !== 'notebook') { throw new Error('beacon-invalid-producer'); }
	}

	async listRuntimeRecords(producer: BeaconProducer): Promise<IBeaconRuntimeRecord[]> {
		this.producer(producer);
		try {
			const directory = await this.directory(['cache', producer], false);
			const value = await this.readJson(path.join(directory, 'records.json')) as { version?: number; records?: IBeaconRuntimeRecord[] };
			if (value?.version !== 1 || !Array.isArray(value.records) || value.records.length > (producer === 'notebook' ? 30 : 10) || value.records.some(record => !record || typeof record.code !== 'string' || !Array.isArray(record.events) || !Number.isFinite(record.startedAt) || !Number.isSafeInteger(record.revision) || record.revision < 1 || !Number.isSafeInteger(record.sequence) || record.sequence < 0)) { return []; }
			for (const record of value.records) { checkBeaconIdentifier(record.id); }
			return value.records;
		} catch (error) { if (missing(error) || error instanceof SyntaxError) { return []; } throw error; }
	}

	/** Call only after captured code enters the real compilation start; producers are wired separately. */
	async commitRuntimeRecord(producer: BeaconProducer, input: Omit<IBeaconRuntimeRecord, 'revision' | 'sequence'>): Promise<void> {
		this.producer(producer); checkBeaconIdentifier(input.id);
		if (typeof input.code !== 'string' || !Number.isFinite(input.startedAt) || !Array.isArray(input.events)) { throw new Error('beacon-invalid-record'); }
		const release = await acquireBeaconLease(this.binding.identity, `queue:${producer}`);
		try {
			const records = await this.listRuntimeRecords(producer);
			if (records.some(record => record.id === input.id)) { return; }
			records.push({ ...structuredClone(input), revision: 1, sequence: 0 });
			await this.writeJson(['cache', producer], 'records.json', { version: 1, records: records.slice(producer === 'notebook' ? -30 : -10) });
		} finally { await release(); }
	}

	async appendRuntimeEvents(producer: BeaconProducer, id: string, sequence: number, events: unknown[]): Promise<boolean> {
		this.producer(producer); checkBeaconIdentifier(id);
		if (!Number.isSafeInteger(sequence) || sequence < 1 || !Array.isArray(events)) { throw new Error('beacon-invalid-record'); }
		const release = await acquireBeaconLease(this.binding.identity, `queue:${producer}`);
		try {
			const records = await this.listRuntimeRecords(producer);
			const current = records.find(record => record.id === id);
			if (!current || sequence <= current.sequence) { return false; }
			current.events.push(...structuredClone(events)); current.revision++; current.sequence = sequence;
			await this.writeJson(['cache', producer], 'records.json', { version: 1, records });
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

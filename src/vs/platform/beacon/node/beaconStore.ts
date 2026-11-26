/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../base/common/path.js';
import * as fs from 'fs/promises';
import { constants, type BigIntStats } from 'fs';
import { randomUUID } from 'crypto';
import type { IBeaconConversation, IBeaconHistoryItem, IBeaconStoredConversation, IBeaconResume } from '../common/beaconContext.js';
import { acquireBeaconLease } from './beaconLease.js';
import { appendBeaconRecord, validateBeaconRecord } from '../common/beaconRecords.js';
import { checkRunRecordSize } from '../common/beaconRunRecord.js';
import type { BeaconRecordKind, IBeaconRecordByKind, IBeaconRecordWrite } from '../common/beaconContextTypes.js';

export interface IBeaconWorkspaceBinding { path: string; canonicalPath: string; assetsPath: string; identity: string; rootIdentity: string; assetsIdentity: string }

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
	async listRecords<K extends BeaconRecordKind>(kind: K): Promise<IBeaconRecordByKind[K][]> {
		if (!['problem', 'run', 'verdict'].includes(kind)) { throw new Error('beacon-invalid-record'); }
		try {
			const directory = await this.directory(['cache', 'context'], false);
			const value = await this.readJson(path.join(directory, `${kind}.json`)) as { version?: unknown; records?: unknown };
			if (value?.version !== 1 || !Array.isArray(value.records)) { throw new Error('beacon-unreadable-queue'); }
			const ids = new Set<string>();
			for (const record of value.records) { validateBeaconRecord(kind, record); if (ids.has(record.id)) { throw new Error('beacon-unreadable-queue'); } ids.add(record.id); }
			if (value.records.length > ({ problem: 13, run: 30, verdict: 20 }[kind])) { throw new Error('beacon-unreadable-queue'); }
			return value.records as IBeaconRecordByKind[K][];
		} catch (error) { if (missing(error)) { return []; } throw error; }
	}
	async readRecord<K extends BeaconRecordKind>(kind: K, id: string): Promise<IBeaconRecordByKind[K]> {
		checkBeaconIdentifier(id);
		const record = (await this.listRecords(kind)).find(record => record.id === id);
		if (!record) { throw new Error('beacon-record-not-found'); }
		if (kind === 'run') { checkRunRecordSize(record as IBeaconRecordByKind['run']); }
		return record;
	}
	async appendRecord<K extends BeaconRecordKind>(kind: K, input: IBeaconRecordWrite<K>): Promise<string> {
		if (!['problem', 'run', 'verdict'].includes(kind)) { throw new Error('beacon-invalid-record'); }
		const release = await acquireBeaconLease(this.binding.identity, `context:${kind}`);
		try {
			const id = randomUUID(), records = appendBeaconRecord(kind, await this.listRecords(kind), input, id);
			await this.writeJson(['cache', 'context'], `${kind}.json`, { version: 1, records }, undefined, true);
			return id;
		} finally { await release(); }
	}

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

	private async writeJson(parts: string[], name: string, value: unknown, beforePublish?: () => void, recordPublication = false): Promise<void> {
		const directory = await this.directory(parts, true);
		const destination = path.join(directory, name);
		let previous: BigIntStats | undefined;
		try { previous = await fs.lstat(destination, { bigint: true }); } catch (error) { if (!missing(error)) { throw error; } }
		if (previous && (!previous.isFile() || previous.isSymbolicLink())) { throw new Error('beacon-invalid-assets'); }
		const temporary = path.join(directory, `${randomUUID()}.tmp`);
		const handle = await fs.open(temporary, 'wx', 0o600);
		let owned: string | undefined;
		let closed = false;
		let published = false;
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
			published = true;
			await this.validate();
			if (fileIdentity(await fs.lstat(destination, { bigint: true })) !== owned) { throw new Error('beacon-file-changed'); }
		} catch (error) { failures.push(error); }
		finally {
			if (!closed) { try { await handle.close(); } catch (error) { failures.push(error); } }
			if (owned !== undefined) {
				try { if (fileIdentity(await fs.lstat(temporary, { bigint: true })) === owned) { await this.publication.unlink(temporary); } } catch (error) { if (!missing(error)) { failures.push(error); } }
			}
		}
		if (recordPublication && published && failures.length) { throw new Error('beacon-record-publication-uncertain', { cause: failures[0] }); }
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

}

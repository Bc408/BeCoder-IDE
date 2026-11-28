/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { type BigIntStats } from 'fs';
import { createHash, randomUUID } from 'crypto';
import * as path from '../../../base/common/path.js';
import { isStatementLanguage, selectStatementVersion, statementCacheCapacity, statementContent, statementKey, validateStatementVersion } from '../common/ojStatementCache.js';
// eslint-disable-next-line local/code-import-patterns -- Internal statement DTOs.
import type { ProblemRef, StatementContent, StatementLanguage, StatementRead, StatementVersion, StatementTranslationTicket } from 'becoder-oj-connect';

interface CacheEntry { document: StatementContent; dependencies: Partial<Record<StatementLanguage, { language: StatementLanguage; hash: string }>> }
const identity = (stat: BigIntStats) => `${stat.dev}:${stat.ino}`;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
export const statementSourceHash = (read: StatementRead): string => createHash('sha256').update(JSON.stringify(read)).digest('hex');

/** One instance is owned by the application service. Reads never mutate retention order. */
export class OjStatementCacheStore {
	readonly directory: string;
	readonly filePath: string;
	private tail: Promise<unknown> = Promise.resolve();
	constructor(private readonly userDataPath: string, private readonly publication: Pick<typeof fs, 'rename'> = fs) {
		this.directory = path.join(userDataPath, 'becoder'); this.filePath = path.join(this.directory, 'problem-statements.json');
	}
	private async directoryIdentity(create: boolean): Promise<string> {
		const root = await fs.realpath(this.userDataPath);
		if (!samePath(root, this.userDataPath)) { throw new Error('statement-cache-invalid-path'); }
		if (create) { try { await fs.mkdir(this.directory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; } } }
		const stat = await fs.lstat(this.directory, { bigint: true });
		if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await fs.realpath(this.directory), this.directory)) { throw new Error('statement-cache-invalid-path'); }
		return identity(stat);
	}
	private async load(): Promise<{ entries: CacheEntry[]; raw?: string }> {
		try {
			const directoryId = await this.directoryIdentity(false), before = await fs.lstat(this.filePath, { bigint: true });
			if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(8 * 1024 * 1024 * statementCacheCapacity + 65536)) { throw new Error('statement-cache-unreadable'); }
			const handle = await fs.open(this.filePath, 'r');
			let raw: string;
			try { if (identity(await handle.stat({ bigint: true })) !== identity(before)) { throw new Error('statement-cache-changed'); } raw = await handle.readFile('utf8'); } finally { await handle.close(); }
			if (identity(await fs.lstat(this.filePath, { bigint: true })) !== identity(before) || await this.directoryIdentity(false) !== directoryId) { throw new Error('statement-cache-changed'); }
			const value = JSON.parse(raw) as { version?: unknown; entries?: CacheEntry[] };
			if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > statementCacheCapacity) { throw new Error('statement-cache-unreadable'); }
			const keys = new Set<string>();
			const entries = value.entries.map(entry => {
				const document = statementContent(entry.document), key = statementKey(document.ref);
				if (keys.has(key) || !entry.dependencies || typeof entry.dependencies !== 'object' || Array.isArray(entry.dependencies)) { throw new Error('statement-cache-unreadable'); } keys.add(key);
				for (const [language, dependency] of Object.entries(entry.dependencies)) {
					if (!isStatementLanguage(language) || !dependency || !isStatementLanguage(dependency.language) || !/^[a-f0-9]{64}$/.test(dependency.hash)) { throw new Error('statement-cache-unreadable'); }
					const source = selectStatementVersion(document, dependency.language), translated = selectStatementVersion(document, language);
					if (!source || source.version.origin !== 'site' || translated?.version.origin !== 'translation' || statementSourceHash(source) !== dependency.hash) { throw new Error('statement-cache-unreadable'); }
				}
				if (document.bodies.some(body => body.origin === 'translation' && !entry.dependencies[body.locale as StatementLanguage])) { throw new Error('statement-cache-unreadable'); }
				return { document, dependencies: entry.dependencies };
			});
			return { entries, raw };
		} catch (error) {
			if (missing(error)) { return { entries: [] }; }
			if (error instanceof Error && error.message.startsWith('statement-cache-')) { throw error; }
			throw new Error('statement-cache-unreadable', { cause: error });
		}
	}
	private async write(entries: CacheEntry[], expected: string | undefined, beforePublish?: () => void): Promise<void> {
		const dirId = await this.directoryIdentity(true), temporary = path.join(this.directory, randomUUID() + '.tmp');
		const handle = await fs.open(temporary, 'wx', 0o600);
		const owned = identity(await handle.stat({ bigint: true }));
		let published = false;
		try {
			await handle.writeFile(JSON.stringify({ version: 1, entries })); await handle.sync(); await handle.close();
			if (await this.directoryIdentity(false) !== dirId || identity(await fs.lstat(temporary, { bigint: true })) !== owned || (await this.load()).raw !== expected) { throw new Error('statement-cache-changed'); }
			beforePublish?.();
			await this.publication.rename(temporary, this.filePath); published = true;
			if (await this.directoryIdentity(false) !== dirId || identity(await fs.lstat(this.filePath, { bigint: true })) !== owned) { throw new Error('statement-cache-publication-uncertain'); }
		} catch (error) { if (published) { throw new Error('statement-cache-publication-uncertain', { cause: error }); } throw error; }
		finally {
			await handle.close();
			try { if (await this.directoryIdentity(false) === dirId && identity(await fs.lstat(temporary, { bigint: true })) === owned) { await fs.unlink(temporary); } } catch (error) { if (!missing(error)) { /* Never remove a replacement or mask the publication result. */ } }
		}
	}
	private serial<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.tail.then(operation); this.tail = result.then(() => undefined, () => undefined); return result;
	}
	async read(ref: ProblemRef, language: StatementLanguage): Promise<StatementRead | undefined> {
		const key = statementKey(ref); if (!isStatementLanguage(language)) { throw new Error('statement-invalid-language'); }
		await this.tail;
		const entry = (await this.load()).entries.find(entry => statementKey(entry.document.ref) === key);
		return entry && selectStatementVersion(entry.document, language);
	}
	async merge(input: StatementContent): Promise<StatementContent> {
		const document = statementContent(input), key = statementKey(document.ref);
		await this.tail;
		const cached = (await this.load()).entries.find(entry => statementKey(entry.document.ref) === key)?.document;
		if (!cached) { return document; }
		for (const body of document.bodies) {
			if (body.origin === 'translation') { continue; }
			const language = body.locale as StatementLanguage, fresh = selectStatementVersion(document, language)!, previous = selectStatementVersion(cached, language);
			if (!previous || statementSourceHash(fresh) !== statementSourceHash(previous)) { return document; }
		}
		return statementContent({ ...document, bodies: [...document.bodies, ...cached.bodies.filter(body => !document.bodies.some(item => item.locale === body.locale))] });
	}
	publishAcquired(input: StatementContent): Promise<StatementContent> {
		return this.serial(async () => {
			const document = statementContent(input), key = statementKey(document.ref), current = await this.load();
			if (document.bodies.some(body => body.origin !== 'site')) { throw new Error('statement-invalid-content'); }
			const previous = current.entries.find(entry => statementKey(entry.document.ref) === key), dependencies: CacheEntry['dependencies'] = {};
			const bodies = [...document.bodies];
			if (previous) {
				const { title: _title, bodies: _bodies, ...facts } = document, { title: _oldTitle, bodies: _oldBodies, ...oldFacts } = previous.document;
				if (JSON.stringify(facts) === JSON.stringify(oldFacts)) {
					for (const body of previous.document.bodies) { if (body.origin === 'site' && !bodies.some(item => item.locale === body.locale)) { bodies.push(body); } }
				}
				for (const body of previous.document.bodies) {
					const language = body.locale as StatementLanguage, dependency = previous.dependencies[language];
					const source = dependency && selectStatementVersion({ ...document, bodies }, dependency.language);
					if (body.origin === 'translation' && dependency && source && statementSourceHash(source) === dependency.hash && !bodies.some(item => item.locale === language)) { bodies.push(body); dependencies[language] = dependency; }
				}
			}
			const merged = statementContent({ ...document, bodies });
			await this.write([...current.entries.filter(entry => statementKey(entry.document.ref) !== key), { document: merged, dependencies }].slice(-statementCacheCapacity), current.raw);
			return merged;
		});
	}
	publishTranslation(source: StatementRead, input: StatementVersion, beforePublish?: () => void): Promise<StatementContent> {
		return this.serial(async () => {
			const version = validateStatementVersion(input, source.samples.length), key = statementKey(source.ref);
			if (source.version.origin !== 'site' || version.origin !== 'translation' || version.language === source.version.language) { throw new Error('statement-invalid-content'); }
			const current = await this.load(), previous = current.entries.find(entry => statementKey(entry.document.ref) === key);
			const latest = previous && selectStatementVersion(previous.document, source.version.language);
			if (previous && (!latest || statementSourceHash(latest) !== statementSourceHash(source))) { throw new Error('statement-source-changed'); }
			if (previous?.document.bodies.some(body => body.locale === version.language && body.origin === 'site')) { throw new Error('statement-source-changed'); }
			const { version: original, ...facts } = source;
			const base = previous?.document ?? { ...facts, title: original.title, bodies: [{ locale: original.language, ...original }] };
			const document = statementContent({ ...base, bodies: [...base.bodies.filter(body => body.locale !== version.language), { locale: version.language, title: version.title, origin: version.origin, sections: version.sections }] });
			const dependencies = { ...previous?.dependencies, [version.language]: { language: source.version.language, hash: statementSourceHash(source) } };
			await this.write([...current.entries.filter(entry => statementKey(entry.document.ref) !== key), { document, dependencies }].slice(-statementCacheCapacity), current.raw, beforePublish);
			return document;
		});
	}
	flush(): Promise<void> { return this.tail.then(() => undefined); }
}

/** Active task ownership is memory-only, independent of retained cache entries. */
export class OjStatementCacheOwner {
	private readonly tickets = new Map<string, { windowId: number; ticket: StatementTranslationTicket }>();
	private readonly acquiring = new Set<string>();
	private readonly epochs = new Map<number, number>();
	constructor(readonly store: OjStatementCacheStore) { }
	read(ref: ProblemRef, language: StatementLanguage): Promise<StatementRead | undefined> { return this.store.read(ref, language); }
	merge(document: StatementContent): Promise<StatementContent> { return this.store.merge(document); }
	async publishAcquired(document: StatementContent): Promise<StatementContent> {
		const result = await this.store.publishAcquired(document), key = statementKey(result.ref);
		for (const [id, { ticket }] of this.tickets) {
			if (statementKey(ticket.source.ref) !== key) { continue; }
			const source = selectStatementVersion(result, ticket.source.version.language);
			if (!source || statementSourceHash(source) !== statementSourceHash(ticket.source) || result.bodies.some(body => body.locale === ticket.targetLanguage && body.origin === 'site')) { this.tickets.delete(id); }
		}
		return result;
	}
	async acquireTranslation(windowId: number, input: StatementRead, target: StatementLanguage): Promise<StatementTranslationTicket> {
		const { version, ...facts } = input;
		const document = statementContent({ ...facts, title: version.title, bodies: [{ locale: version.language, title: version.title, sections: version.sections, origin: version.origin }] });
		const source = selectStatementVersion(document, version.language)!;
		if (!isStatementLanguage(target) || target === source.version.language || source.version.origin !== 'site') { throw new Error('statement-invalid-language'); }
		const key = statementKey(source.ref) + ':' + statementSourceHash(source) + ':' + target;
		if (this.acquiring.has(key) || [...this.tickets.values()].some(({ ticket }) => statementKey(ticket.source.ref) + ':' + statementSourceHash(ticket.source) + ':' + ticket.targetLanguage === key)) { throw new Error('statement-translation-busy'); }
		this.acquiring.add(key);
		const epoch = this.epochs.get(windowId) ?? 0;
		try {
			const latest = await this.store.read(source.ref, source.version.language);
			if (latest && statementSourceHash(latest) !== statementSourceHash(source)) { throw new Error('statement-source-changed'); }
			if ((this.epochs.get(windowId) ?? 0) !== epoch) { throw new Error('statement-translation-owner'); }
			const ticket = { id: randomUUID(), source, targetLanguage: target };
			this.tickets.set(ticket.id, { windowId, ticket }); return structuredClone(ticket);
		} finally { this.acquiring.delete(key); }
	}
	async publishTranslation(windowId: number, id: string, version: StatementVersion): Promise<StatementContent> {
		const current = this.tickets.get(id);
		const verify = () => { if (!current || current.windowId !== windowId || this.tickets.get(id) !== current || version.language !== current.ticket.targetLanguage) { throw new Error('statement-translation-owner'); } };
		verify();
		try { return await this.store.publishTranslation(current!.ticket.source, version, verify); }
		finally { if (current?.windowId === windowId) { this.tickets.delete(id); } }
	}
	releaseTranslation(windowId: number, id: string): void { if (this.tickets.get(id)?.windowId === windowId) { this.tickets.delete(id); } }
	resetWindow(windowId: number): void {
		this.epochs.set(windowId, (this.epochs.get(windowId) ?? 0) + 1);
		for (const [id, entry] of this.tickets) { if (entry.windowId === windowId) { this.tickets.delete(id); } }
	}
}

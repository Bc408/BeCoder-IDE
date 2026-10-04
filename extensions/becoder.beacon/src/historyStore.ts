/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { readHistory, type HistoryData } from './history';

/** Atomic shared history writes. Only locally changed conversations participate in a merge. */
export class HistoryStore {
	private baseline: HistoryData = readHistory(undefined);
	constructor(private readonly directory: string) { }
	async load(): Promise<HistoryData> {
		await fs.mkdir(this.directory, { recursive: true });
		const data = await this.read();
		this.useBaseline(data);
		return data;
	}
	useBaseline(data: HistoryData): void { this.baseline = structuredClone(data); }
	async read(): Promise<HistoryData> {
		const file = path.join(this.directory, 'history.json');
		try {
			if ((await fs.lstat(file)).isSymbolicLink()) { throw new Error('linked-history'); }
			return readHistory(JSON.parse(await fs.readFile(file, 'utf8')));
		} catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return readHistory(undefined); } throw error; }
	}
	async save(data: HistoryData): Promise<HistoryData> {
		const lock = path.join(this.directory, 'history.lock');
		let handle: fs.FileHandle | undefined;
		for (let attempt = 0; attempt < 200; attempt++) {
			try { handle = await fs.open(lock, 'wx'); break; }
			catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; }
				await this.recoverLock(lock);
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		}
		if (!handle) { throw new Error('history-busy'); }
		const temporary = path.join(this.directory, `history-${randomUUID()}.tmp`);
		try {
			await handle.writeFile(String(process.pid));
			const current = await this.read();
			const previous = new Map(this.baseline.conversations.map(item => [item.id, item]));
			const local = new Map(data.conversations.map(item => [item.id, item]));
			const merged = new Map(current.conversations.map(item => [item.id, item]));
			for (const id of new Set([...previous.keys(), ...local.keys()])) {
				const before = previous.get(id);
				const after = local.get(id);
				if (JSON.stringify(before) === JSON.stringify(after) || JSON.stringify(after) === JSON.stringify(merged.get(id))) { continue; }
				if (JSON.stringify(merged.get(id)) !== JSON.stringify(before)) { throw new Error('history-conflict'); }
				if (after) { merged.set(id, after); } else { merged.delete(id); }
			}
			const result = { version: 1 as const, activeId: merged.has(data.activeId) ? data.activeId : '', conversations: [...merged.values()] };
			await fs.writeFile(temporary, JSON.stringify(result), { flag: 'wx' });
			await fs.rename(temporary, path.join(this.directory, 'history.json'));
			this.useBaseline(result);
			return result;
		} finally {
			await fs.rm(temporary, { force: true });
			await handle.close();
			await fs.unlink(lock);
		}
	}
	private async recoverLock(lock: string): Promise<void> {
		// Serialize recovery so two windows cannot unlink a newly acquired writer's lock.
		const recovery = lock + '.recovery';
		let handle: fs.FileHandle;
		try { handle = await fs.open(recovery, 'wx'); } catch { return; }
		try {
			const pid = Number(await fs.readFile(lock, 'utf8'));
			if (!Number.isSafeInteger(pid) || pid <= 0) { return; }
			try { process.kill(pid, 0); } catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ESRCH') { await fs.unlink(lock); }
			}
		} catch { /* Another writer may have already released the lock. */ }
		finally { await handle.close(); await fs.unlink(recovery); }
	}
}

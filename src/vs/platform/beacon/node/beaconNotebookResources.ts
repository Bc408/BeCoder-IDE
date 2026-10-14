/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from '../../../base/common/path.js';
import { randomUUID } from 'crypto';
import { acquireBeaconLease } from './beaconLease.js';

interface Claim { window: number; file: string; key: string; kind: 'run' | 'edit' }
export class BeaconNotebookResources {
	private readonly claims = new Map<string, Claim>();
	private readonly groups = new Map<string, { release(): Promise<void>; handles: Set<string> }>();
	private readonly views = new Map<number, Map<string, boolean>>();
	private readonly tails = new Map<string, Promise<unknown>>();
	constructor(private readonly changed: () => void = () => {}) { }
	private async key(file: string): Promise<string> {
		if (!path.isAbsolute(file) || file.includes('\0')) { throw new Error('notebook-invalid-path'); }
		let ancestor = file; const suffix: string[] = []; let canonical: string;
		while (true) { try { canonical = path.join(await fs.realpath(ancestor), ...suffix); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(ancestor) === ancestor) { throw error; } suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); } }
		return canonical.toLowerCase();
	}
	private async serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
		const result = (this.tails.get(key) ?? Promise.resolve()).then(operation); const tail = result.catch(() => {}); this.tails.set(key, tail);
		try { return await result; } finally { if (this.tails.get(key) === tail) { this.tails.delete(key); } }
	}
	async report(window: number, files: { file: string; dirty: boolean }[]): Promise<void> {
		const entries = await Promise.all(files.map(async value => [await this.key(value.file), value.dirty] as const)); this.views.set(window, new Map(entries));
	}
	async editing(file: string): Promise<boolean> { const key = await this.key(file); return [...this.claims.values()].some(claim => claim.key === key && claim.kind === 'edit'); }
	async begin(window: number, file: string, kind: 'run' | 'edit'): Promise<string> {
		const key = await this.key(file);
		return this.serial(key, async () => {
			if ([...this.claims.values()].some(claim => claim.key === key && (kind === 'edit' || claim.kind === 'edit'))) { throw new Error('notebook-busy'); }
			if (kind === 'edit' && [...this.views].some(([owner, files]) => owner !== window && files.get(key))) { throw new Error('notebook-other-window-dirty'); }
			let group = this.groups.get(key);
			if (!group) { group = { release: await acquireBeaconLease(key, 'notebook'), handles: new Set() }; this.groups.set(key, group); }
			const handle = randomUUID(); this.claims.set(handle, { window, file, key, kind }); group.handles.add(handle); if (kind === 'edit') { this.changed(); } return handle;
		});
	}
	verify(window: number, handle: string): Claim { const claim = this.claims.get(handle); if (!claim || claim.window !== window) { throw new Error('notebook-owner'); } return claim; }
	async release(window: number, handle: string): Promise<void> {
		const claim = this.claims.get(handle); if (!claim) { return; } this.verify(window, handle);
		await this.serial(claim.key, async () => {
			this.claims.delete(handle); const group = this.groups.get(claim.key); group?.handles.delete(handle);
			if (group && !group.handles.size) { this.groups.delete(claim.key); await group.release(); }
			if (claim.kind === 'edit') { this.changed(); }
		});
	}
	async reset(window: number): Promise<void> { for (const [handle, claim] of this.claims) { if (claim.window === window) { await this.release(window, handle); } } this.views.delete(window); }
	async dispose(): Promise<void> { for (const [handle, claim] of this.claims) { await this.release(claim.window, handle); } this.views.clear(); }
}

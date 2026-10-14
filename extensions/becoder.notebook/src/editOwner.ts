/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeNotebook, type NotebookData } from './model';
import { notebookContent, type ContentCell } from './edits';

export interface NotebookCreatePort { begin(): Promise<void>; prepare(): Promise<void>; verify(): Promise<void>; create(bytes: Uint8Array): Promise<boolean>; open(): Promise<void>; release(): Promise<void> }

/** Complete generated content enters native file creation once; no empty file or rollback. */
export async function createNotebook(cells: ContentCell[], port: NotebookCreatePort, signal?: AbortSignal): Promise<Record<string, unknown>> {
	const bytes = encodeNotebook(notebookContent({ cells: [] }, cells));
	let acquired = false; let created = false; let opened = false; let released = true; let error: string | undefined;
	try {
		signal?.throwIfAborted(); await port.begin(); acquired = true; released = false;
		signal?.throwIfAborted(); await port.prepare(); await port.verify(); signal?.throwIfAborted();
		if (!await port.create(bytes)) { throw new Error('notebook-create-not-applied'); }
		created = true; await port.open(); opened = true;
	} catch (failure) { error = String(failure); }
	finally {
		if (acquired) { try { await port.release(); released = true; } catch (failure) { error = [error, String(failure)].filter(Boolean).join('; '); } }
	}
	return { ...(created ? { created: true } : {}), applied: created, saved: created, opened, released, ...(error ? { error } : {}) };
}
export interface NotebookEditPort { snapshot(): NotebookData; version(): number; dirty(): boolean; closed(): boolean; verify(): Promise<void>; backup(data: NotebookData): Promise<string>; apply(data: NotebookData): Promise<void>; save(): Promise<boolean>; release(): Promise<void> }
export class NotebookEditOwner {
	private revision = -1;
	private applied = false;
	private saved = false;
	private released = false;
	private data: NotebookData | undefined;
	constructor(private readonly port: NotebookEditPort) { }
	get isReleased(): boolean { return this.released; }
	private async guard(): Promise<void> { if (this.released || this.port.closed()) { throw new Error('notebook-closed'); } await this.port.verify(); }
	async begin(): Promise<{ revision: number; backup: string }> {
		try {
			await this.guard(); this.revision = this.port.version(); this.data = structuredClone(this.port.snapshot()); const backup = await this.port.backup(this.data);
			if (this.port.version() !== this.revision) { throw new Error('notebook-changed-during-backup'); }
			await this.guard(); return { revision: this.revision, backup };
		} catch (error) { try { await this.cancel(); } catch (release) { throw new Error(String(error) + '; release: ' + String(release), { cause: error }); } throw error; }
	}
	async read(): Promise<NotebookData> { await this.guard(); if (!this.data || this.port.version() !== this.revision) { throw new Error('notebook-changed'); } return structuredClone(this.data); }
	status(): { applied: boolean; saved: boolean; dirty: boolean; revision: number } { return { applied: this.applied, saved: this.saved, dirty: this.port.dirty(), revision: this.port.version() }; }
	async apply(cells: ContentCell[], revision: number): Promise<{ revision: number; dirty: boolean }> {
		await this.guard(); if (!this.data || revision !== this.revision || this.port.version() !== this.revision) { throw new Error('notebook-changed'); }
		const candidate = notebookContent(this.data, cells);
		try { await this.port.apply(candidate); this.applied = true; }
		finally { if (this.port.version() !== this.revision) { this.applied = true; this.revision = this.port.version(); this.data = structuredClone(this.port.snapshot()); } }
		return { revision: this.revision, dirty: this.port.dirty() };
	}
	async finish(): Promise<{ applied: boolean; saved: boolean; dirty: boolean }> {
		try { await this.guard(); if (this.port.version() !== this.revision) { throw new Error('notebook-changed'); } this.saved = this.applied ? await this.port.save() : false; return { applied: this.applied, saved: this.saved, dirty: this.port.dirty() }; }
		finally { await this.cancel(); }
	}
	async cancel(): Promise<{ applied: boolean; saved: boolean; dirty: boolean }> { if (!this.released) { await this.port.release(); this.released = true; } return { applied: this.applied, saved: this.saved, dirty: this.port.dirty() }; }
}

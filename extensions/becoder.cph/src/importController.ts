/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { ImportedProblem, parseImportedProblem } from './problem';
import { ImportResult, ProblemStore, ProblemStoreError, StoredProblem } from './problemStore';
import { SourcePreferences } from './importPreferences';
import * as path from 'path';

export interface ImportDestination { directory: string; fileName: string }

/** UI adapter supplies only folders from this window, never paths from the page. */
export interface ImportHost {
	workspaceFolders(): readonly string[];
	selectFolder(folders: readonly string[]): Promise<string | undefined>;
	requestWorkspace(): Promise<void>;
	confirmReplacement(existing: StoredProblem): Promise<boolean>;
	showProblem(result: ImportResult): Promise<void>;
	sourcePreferences?(problem: ImportedProblem, folder: string, language?: 'cpp'): Promise<SourcePreferences | undefined>;
}

export class ImportController {
	private active: AbortController | undefined;
	private disposed = false;
	private requestId: string | undefined;
	private readonly cancelledRequests = new Set<string>();

	constructor(private readonly host: ImportHost) { }
	get isBusy(): boolean { return !!this.active; }

	async import(json: string, pageUrl: string, destination?: ImportDestination, requestId?: string): Promise<ImportResult | undefined> {
		if (requestId && this.cancelledRequests.delete(requestId)) { throw new DOMException('Import cancelled.', 'AbortError'); }
		if (this.disposed || this.active) {
			throw new ProblemStoreError('busy', 'An import is already active or this window is closed.');
		}
		const controller = new AbortController();
		this.active = controller;
		this.requestId = requestId;
		try {
			const problem = parseImportedProblem(json, pageUrl);
			if (destination && (typeof destination.directory !== 'string' || typeof destination.fileName !== 'string' || !/^[A-Za-z0-9_@.-]+\.cpp$/.test(destination.fileName) || destination.fileName.length > 200 || destination.fileName.startsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(destination.fileName))) { throw new ProblemStoreError('unsafe-path', 'Invalid import destination.'); }
			const folders = [...this.host.workspaceFolders()];
			if (!folders.length) {
				await this.host.requestWorkspace();
				return undefined;
			}
			const folder = folders.length === 1 ? folders[0] : await this.host.selectFolder(folders);
			controller.signal.throwIfAborted();
			if (!folder) {
				return undefined;
			}
			if (!folders.includes(folder) || !this.host.workspaceFolders().includes(folder)) {
				throw new ProblemStoreError('changed', 'The selected workspace changed.');
			}
			const preferences = await this.host.sourcePreferences?.(problem, folder, destination ? 'cpp' : undefined);
			if (this.host.sourcePreferences && !preferences) { return undefined; }
			controller.signal.throwIfAborted();
			if (!this.host.workspaceFolders().includes(folder)) { throw new ProblemStoreError('changed', 'The selected workspace changed.'); }
			const rootStore = new ProblemStore(folder), store = destination ? rootStore.child(destination.directory) : rootStore;
			const result = await store.importProblem(problem, async existing => {
				const accepted = await this.host.confirmReplacement(existing);
				if (!this.host.workspaceFolders().includes(folder)) {
					controller.abort();
				}
				return accepted;
			}, controller.signal, destination && preferences ? { ...preferences, language: 'cpp' } : preferences,
				destination ? { source: path.join(store.root, destination.fileName), create: true } : undefined);
			controller.signal.throwIfAborted();
			await this.host.showProblem(result);
			return result;
		} finally {
			this.active = undefined;
			this.requestId = undefined;
		}
	}

	cancel(requestId: string): void {
		if (!requestId) { return; }
		if (requestId === this.requestId) { this.active?.abort(); return; }
		// Cancellation can arrive before the import command finishes extension activation.
		this.cancelledRequests.add(requestId);
		if (this.cancelledRequests.size > 64) { this.cancelledRequests.delete(this.cancelledRequests.values().next().value!); }
	}

	dispose(): void {
		this.disposed = true;
		this.active?.abort();
	}
}

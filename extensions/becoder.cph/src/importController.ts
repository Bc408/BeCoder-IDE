/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { ImportedProblem, parseImportedProblem } from './problem';
import { ImportResult, ProblemStore, ProblemStoreError, StoredProblem } from './problemStore';
import { SourcePreferences } from './importPreferences';

/** UI adapter supplies only folders from this window, never paths from the page. */
export interface ImportHost {
	workspaceFolders(): readonly string[];
	selectFolder(folders: readonly string[]): Promise<string | undefined>;
	requestWorkspace(): Promise<void>;
	confirmReplacement(existing: StoredProblem): Promise<boolean>;
	showProblem(result: ImportResult): Promise<void>;
	sourcePreferences?(problem: ImportedProblem, folder: string): Promise<SourcePreferences | undefined>;
}

export class ImportController {
	private active: AbortController | undefined;
	private disposed = false;

	constructor(private readonly host: ImportHost) { }

	async import(json: string, pageUrl: string): Promise<ImportResult | undefined> {
		if (this.disposed || this.active) {
			throw new ProblemStoreError('busy', 'An import is already active or this window is closed.');
		}
		const controller = new AbortController();
		this.active = controller;
		try {
			const problem = parseImportedProblem(json, pageUrl);
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
			const preferences = await this.host.sourcePreferences?.(problem, folder);
			if (this.host.sourcePreferences && !preferences) { return undefined; }
			controller.signal.throwIfAborted();
			const result = await new ProblemStore(folder).importProblem(problem, async existing => {
				const accepted = await this.host.confirmReplacement(existing);
				if (!this.host.workspaceFolders().includes(folder)) {
					controller.abort();
				}
				return accepted;
			}, controller.signal, preferences);
			controller.signal.throwIfAborted();
			await this.host.showProblem(result);
			return result;
		} finally {
			this.active = undefined;
		}
	}

	dispose(): void {
		this.disposed = true;
		this.active?.abort();
	}
}

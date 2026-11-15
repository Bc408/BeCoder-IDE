/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { pathToFileURL } from 'url';
import type { OjAdapter } from './adapters/adapter';
import { type ProblemDocument, validateProblem } from './domain';
import type { SiteDirectories } from './settings';
import { SourceStore } from './sourceStore';

export interface ImportHost {
	folders(): readonly string[];
	selectFolder(folders: readonly string[]): Promise<string | undefined>;
	directories(): SiteDirectories;
	open(sourceUri: string, document: ProblemDocument): Promise<void>;
}
export class ImportController {
	private active: AbortController | undefined;
	private disposed = false;
	constructor(private readonly adapters: readonly OjAdapter[], private readonly host: ImportHost, private readonly store = new SourceStore()) { }
	async import(input: unknown): Promise<{ sourceUri: string } | undefined> {
		if (this.disposed || this.active) { throw new Error('A problem import is already in progress or OJ Connect is stopped.'); }
		const controller = new AbortController(); this.active = controller;
		try {
			const document = validateProblem(input), adapter = this.adapters.find(item => item.site === document.ref.site);
			if (!adapter) { throw new Error('This site is not available yet.'); }
			const folders = [...this.host.folders()];
			if (!folders.length) { throw new Error('Open a folder before importing a problem.'); }
			const root = folders.length === 1 ? folders[0] : await this.host.selectFolder(folders);
			controller.signal.throwIfAborted(); if (!root) { return undefined; }
			if (!folders.includes(root) || !this.host.folders().includes(root)) { throw new Error('The selected workspace changed.'); }
			const result = await this.store.openOrCreate(root, this.host.directories()[document.ref.site], adapter.fileName(document.ref), controller.signal);
			controller.signal.throwIfAborted();
			const sourceUri = pathToFileURL(result.sourcePath).href;
			await this.host.open(sourceUri, document); return { sourceUri };
		} finally { this.active = undefined; }
	}
	dispose(): void { this.disposed = true; this.active?.abort(); }
}

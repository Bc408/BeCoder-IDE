/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pathToFileURL } from 'url';
import type { OjAdapter } from './adapters/adapter';
import { type ProblemDocument, validateProblem } from './domain';
import type { SiteDirectories } from './settings';
import { SourceStore } from './sourceStore';
import { browserProblem } from './browserProblem';
import type { IBeaconAcquisition } from 'becoder-beacon';

export function browserImportTarget(input: string, directories: () => SiteDirectories, adapters: readonly OjAdapter[]): { directory: string; fileName: string } | undefined {
	const problem = browserProblem(input);
	if (!problem) { return undefined; }
	const adapter = adapters.find(adapter => adapter.site === problem.site);
	if (!adapter) { return undefined; }
	return { directory: directories()[problem.site], fileName: adapter.fileName(problem) };
}

export interface ImportHost {
	folders(): readonly string[];
	selectFolder(folders: readonly string[]): Promise<string | undefined>;
	directories(): SiteDirectories;
	open(sourceUri: string, document: ProblemDocument): Promise<void>;
	acquired?(document: ProblemDocument, sourceUri: string, acquisition: IBeaconAcquisition | undefined): Promise<void>;
}
export class ImportController {
	private active: AbortController | undefined;
	private requestId: string | undefined;
	private readonly cancelledRequests = new Set<string>();
	private disposed = false;
	constructor(private readonly adapters: readonly OjAdapter[], private readonly host: ImportHost, private readonly store = new SourceStore()) { }
	async import(input: unknown, requestId?: string, acquisition?: IBeaconAcquisition): Promise<{ sourceUri: string } | undefined> {
		if (requestId && this.cancelledRequests.delete(requestId)) { throw new DOMException('Import cancelled.', 'AbortError'); }
		if (this.disposed || this.active) { throw new Error('A problem import is already in progress or OJ Connect is stopped.'); }
		const controller = new AbortController(); this.active = controller; this.requestId = requestId;
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
			await this.host.open(sourceUri, document);
			try { await this.host.acquired?.(document, sourceUri, acquisition); } catch { /* Evidence storage cannot undo a successful user import. */ }
			return { sourceUri };
		} finally { this.active = undefined; this.requestId = undefined; }
	}
	cancel(requestId: string): void {
		if (!requestId) { return; }
		if (this.requestId === requestId) { this.active?.abort(); return; }
		// A navigation may cancel the command while its extension is still activating.
		this.cancelledRequests.add(requestId);
		if (this.cancelledRequests.size > 64) { this.cancelledRequests.delete(this.cancelledRequests.values().next().value!); }
	}
	dispose(): void { this.disposed = true; this.active?.abort(); }
}

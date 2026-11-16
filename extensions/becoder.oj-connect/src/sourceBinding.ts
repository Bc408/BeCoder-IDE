/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
export interface SourceDocument { readonly uri: { readonly fsPath: string; toString(): string }; readonly isClosed: boolean }
/** Panel-local affinity, not a persistent problem binding or a path lookup at submit time. */
export class SourceBinding<T extends SourceDocument> {
	readonly uri: string;
	readonly filePath: string;
	private identity: fs.BigIntStats;
	private invalid = false;
	constructor(readonly source: T) {
		this.uri = source.uri.toString(); this.filePath = source.uri.fsPath;
		this.identity = fs.statSync(this.filePath, { bigint: true }); this.assertCurrent();
	}
	invalidate(): void { this.invalid = true; }
	refreshAfterSave(document: T): void {
		if (document === this.source && !this.invalid && !document.isClosed && document.uri.toString() === this.uri) { this.identity = fs.statSync(this.filePath, { bigint: true }); }
	}
	assertCurrent(): void {
		try {
			const stat = fs.statSync(this.filePath, { bigint: true });
			if (!this.invalid && !this.source.isClosed && this.source.uri.toString() === this.uri && stat.isFile() && stat.dev === this.identity.dev && stat.ino === this.identity.ino) { return; }
		} catch { /* Deleted or moved sources require an explicit new source context. */ }
		this.invalid = true;
		throw new Error('The original source is unavailable. Reopen the problem from the source editor.');
	}
}

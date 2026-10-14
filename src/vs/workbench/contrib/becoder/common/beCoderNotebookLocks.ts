/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';

/** Window-local presentation of main-process resource occupancy, never OS file permissions. */
export class BeCoderNotebookLocks {
	private readonly emitter = new Emitter<string>();
	readonly onDidChange = this.emitter.event;
	private readonly values = new Set<string>();
	isReadonly(uri: string): boolean { return this.values.has(uri); }
	set(uri: string, readonly: boolean): void { if (this.values.has(uri) === readonly) { return; } if (readonly) { this.values.add(uri); } else { this.values.delete(uri); } this.emitter.fire(uri); }
}
export const beCoderNotebookLocks = new BeCoderNotebookLocks();

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

const reads = new Map<string, AbortController>();
export function cancelOjRead(id: string): void { reads.get(id)?.abort(); }
export async function withOjRead<T>(id: string, read: (signal: AbortSignal) => Promise<T>): Promise<T> {
	if (reads.has(id)) { throw new Error('A read is already in progress.'); }
	const controller = new AbortController(); reads.set(id, controller);
	try { const value = await read(controller.signal); controller.signal.throwIfAborted(); return value; }
	finally { reads.delete(id); }
}

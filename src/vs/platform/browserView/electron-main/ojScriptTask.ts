/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface OjScriptTask {
	readonly controller: AbortController;
	dispatched: boolean;
}

export async function runOjScript<T>(task: OjScriptTask, read: () => Promise<string>, execute: (script: string) => Promise<T>): Promise<T> {
	const signal = task.controller.signal;
	signal.throwIfAborted();
	let rejectInterrupted!: (error: unknown) => void;
	const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
	const stop = () => rejectInterrupted(signal.reason);
	signal.addEventListener('abort', stop, { once: true });
	try {
		const script = await Promise.race([read(), interrupted]);
		signal.throwIfAborted();
		// Mark before calling Electron: after dispatch, failure cannot prove that no POST occurred.
		task.dispatched = true;
		return await Promise.race([execute(script), interrupted]);
	} finally {
		signal.removeEventListener('abort', stop);
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CompilationSourceSnapshot } from './compilationSnapshot';

/** Optional execution observation. Implementations must isolate observer failures. No storage policy. */
export interface ExecutionObserver {
	start(snapshot: CompilationSourceSnapshot, metadata: unknown): void;
	event(value: unknown): void;
	finish(outcome: unknown): void;
}

export function safeExecutionObserver(observer: ExecutionObserver | undefined): ExecutionObserver | undefined {
	if (!observer) { return undefined; }
	return {
		start(snapshot, metadata) { try { observer.start(snapshot, metadata); } catch { /* Optional observer. */ } },
		event(value) { try { observer.event(value); } catch { /* Optional observer. */ } },
		finish(outcome) { try { void Promise.resolve(observer.finish(outcome)).catch(() => { }); } catch { /* Optional observer. */ } }
	};
}

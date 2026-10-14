/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/** Compiler policy is supplied by the bundled Runner extension, not copied here. */
export interface CompilationSourceSnapshot {
	readonly originalPath: string;
	readonly canonicalPath: string;
	readonly path: string;
	readonly capturedAt: number;
	readonly bytesBase64: string;
	readonly byteLength: number;
	readonly sha256: string;
}

export interface CompilationPlan {
	readonly compiler: string;
	readonly args: readonly string[];
	readonly environment: Record<string, string>;
	readonly sourceSnapshot?: CompilationSourceSnapshot;
}

export interface RuntimeEvidence {
	start(snapshot: CompilationSourceSnapshot, metadata: unknown): void;
	event(value: unknown): void;
	finish(outcome: unknown): Promise<void>;
}

export interface RunnerCompilerApi {
	prepareCompilation(source: string, output: string, session: string): CompilationPlan;
	prepareCapturedCompilation(source: string, output: string, session: string): Promise<CompilationPlan & { readonly sourceSnapshot: CompilationSourceSnapshot }>;
	createEvidence(handle: string, producer: 'runner' | 'cph', failed: (error: unknown) => void): RuntimeEvidence;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/** Compiler policy is supplied by the bundled Runner extension, not copied here. */
export interface CompilationPlan {
	readonly compiler: string;
	readonly args: readonly string[];
	readonly environment: Record<string, string>;
}

export interface RunnerCompilerApi {
	prepareCompilation(source: string, output: string, session: string): CompilationPlan;
}

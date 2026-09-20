/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Competitive Programming Helper contributors and BeCoder contributors.
 *  Licensed under GPL-3.0-or-later. See LICENSE and UPSTREAM.md for provenance.
 *--------------------------------------------------------------------------------------------*/
// CPH UI types, adapted for BeCoder's separate-stream executor (GPL-3.0-or-later).
import type { DiffResult } from '../src/diffOutput';
export interface Case {
	id: number;
	testcase: { id: number; input: string; output: string };
	result: null | { pass: boolean; verdict: string; stdout: string; stderr: string; signal: string | null; timeOut: boolean; time: number;
		diff?: DiffResult; checkerRun?: { command: string; stdout: string; stderr: string; exitCode: number | null; durationMs?: number; signal: string | null }; };
}

export interface PanelState {
	customCheckerPath?: string;
	pythonCommand?: string;
	hideOutputDifference?: boolean;
	revision: string;
	name: string;
	source: string;
	url?: string;
	local?: boolean;
	busy: boolean;
	phase?: 'compile' | 'running' | 'checking';
	activeId?: number;
	message: string;
	cases: Case[];
}

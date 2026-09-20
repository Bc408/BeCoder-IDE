/*---------------------------------------------------------------------------------------------
 *  Derived from Competitive Programming Helper, src/judge.ts.
 *  Copyright (c) Competitive Programming Helper contributors and BeCoder contributors.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/** Preserve CPH's line comparison, without logging users' outputs. */
export function isResultCorrect(expectedOutput: string, stdout: string): boolean {
	const expected = expectedOutput.replace(/\r\n/g, '\n').trim().split('\n');
	const actual = stdout.replace(/\r\n/g, '\n').trim().split('\n');
	return expected.length === actual.length && expected.every((line, index) => line.trim() === actual[index].trim());
}

export interface SampleExecution {
	readonly durationMs?: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number | null;
	readonly signal: string | null;
	readonly timedOut: boolean;
	readonly cancelled: boolean;
	readonly outputLimitExceeded: boolean;
	readonly launchError?: string;
}

export type SampleVerdict = 'passed' | 'wrong-answer' | 'runtime-error' | 'time-limit' | 'cancelled' | 'output-limit';

export function judgeSample(expectedOutput: string, result: SampleExecution): SampleVerdict {
	if (result.cancelled) {
		return 'cancelled';
	}
	if (result.outputLimitExceeded) {
		return 'output-limit';
	}
	if (result.timedOut) {
		return 'time-limit';
	}
	if (result.launchError || result.signal || result.exitCode !== 0) {
		return 'runtime-error';
	}
	// stderr is retained for display; debug output is not a failure criterion.
	return isResultCorrect(expectedOutput, result.stdout) ? 'passed' : 'wrong-answer';
}

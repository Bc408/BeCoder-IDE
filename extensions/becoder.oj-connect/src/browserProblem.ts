/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { luoguProblem } from './adapters/luogu/task';
import { atCoderProblem } from './adapters/atcoder/task';
import { codeforcesProblem } from './adapters/codeforces/task';
import { nowcoderProblem } from './adapters/nowcoder/task';
import { lanqiaoProblem } from './adapters/lanqiao/task';
import type { ProblemRef } from './domain';

/** Pure entry also used by the browser host, without activating the extension. */
export function browserProblem(input: string): ProblemRef | undefined {
	if (typeof input !== 'string' || !input.startsWith('https://')) { return undefined; }
	return luoguProblem(input) ?? atCoderProblem(input) ?? nowcoderProblem(input) ?? codeforcesProblem(input) ?? lanqiaoProblem(input);
}

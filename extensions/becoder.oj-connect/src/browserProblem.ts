/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { luoguProblem } from './adapters/luogu/task';
import { atCoderProblem } from './adapters/atcoder/task';
import { codeforcesProblem } from './adapters/codeforces/task';
import { nowcoderProblem } from './adapters/nowcoder/task';
import { lanqiaoProblem } from './adapters/lanqiao/task';
import type { ProblemRef, SiteId } from './domain';

/** Canonical tool identity; never guesses a different task or asks for a second URL. */
export function resolveBeaconProblemId(oj: SiteId, problemId: string): ProblemRef {
	const parsers = { luogu: luoguProblem, atcoder: atCoderProblem, nowcoder: nowcoderProblem, codeforces: codeforcesProblem, lanqiao: lanqiaoProblem };
	if (typeof problemId !== 'string' || !Object.hasOwn(parsers, oj)) { throw new Error('oj-connect-invalid-problem'); }
	const ref = parsers[oj](problemId);
	if (!ref || ref.site !== oj || ref.nativeId !== problemId) { throw new Error('oj-connect-invalid-problem'); }
	return ref;
}

/** Pure entry also used by the browser host, without activating the extension. */
export function browserProblem(input: string): ProblemRef | undefined {
	if (typeof input !== 'string' || !input.startsWith('https://')) { return undefined; }
	return luoguProblem(input) ?? atCoderProblem(input) ?? nowcoderProblem(input) ?? codeforcesProblem(input) ?? lanqiaoProblem(input);
}

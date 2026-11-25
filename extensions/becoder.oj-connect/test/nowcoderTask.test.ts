/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { nowcoderProblem } from '../src/adapters/nowcoder/task';
import { resolveProblem } from '../src/problemResolver';
import { defaultDirectories, readDirectories } from '../src/settings';

const adapters = [{ site: 'nowcoder' as const, resolve: nowcoderProblem }];
test('Nowcoder canonical identifiers round trip without requiring the model to provide another URL', () => {
	for (const problemId of ['problem/18204', 'contest/5657/A']) { assert.strictEqual(nowcoderProblem(problemId)?.nativeId, problemId); }
});
test('Nowcoder resolves explicit ACM public and contest entries without converting their context', () => {
	for (const input of ['18204', '18204.cpp', 'https://ac.nowcoder.com/acm/problem/18204/']) {
		assert.strictEqual(nowcoderProblem(input)?.nativeId, 'problem/18204');
	}
	for (const input of ['5657_A.cpp', '5657/A', 'https://ac.nowcoder.com/acm/contest/5657/A']) {
		assert.strictEqual(nowcoderProblem(input)?.nativeId, 'contest/5657/A');
	}
	for (const input of ['0', 'solution.cpp', 'https://user@ac.nowcoder.com/acm/problem/18204', 'https://ac.nowcoder.com/acm/problem/18204?x=1', 'https://www.nowcoder.com/practice/abc', 'https://ac.nowcoder.com/acm/problem/18204#x']) {
		assert.strictEqual(nowcoderProblem(input), undefined, input);
	}
});
test('Nowcoder guesses filenames only inside its configured site directory', () => {
	for (const name of ['18204.cpp', '5657_A.cpp']) {
		assert.strictEqual(resolveProblem('C:/cpp/nowcoder/' + name, defaultDirectories, adapters).kind, 'problem');
		assert.deepStrictEqual(resolveProblem('C:/cpp/' + name, defaultDirectories, adapters), { kind: 'inputRequired' });
		assert.strictEqual(resolveProblem('C:/cpp/nc/' + name, readDirectories({ nowcoder: 'nc' }), adapters).kind, 'problem');
	}
});

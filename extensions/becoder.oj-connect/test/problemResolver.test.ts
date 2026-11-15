/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { test } from 'node:test';
import { resolveProblem } from '../src/problemResolver';
import { defaultDirectories, readDirectories } from '../src/settings';
import { atCoderProblem } from '../src/adapters/atcoder/task';
import { luoguProblem } from '../src/adapters/luogu/task';

const adapters = [{ site: 'luogu' as const, resolve: luoguProblem }, { site: 'atcoder' as const, resolve: atCoderProblem }];

test('shared resolver respects site folders and asks on ambiguous imported aliases', () => {
	assert.deepStrictEqual(resolveProblem('C:/cpp/luogu/P1001.cpp', defaultDirectories, adapters), { kind: 'problem', problem: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' } });
	const collected = resolveProblem('C:/cpp/luogu/AT_abc086_a.cpp', defaultDirectories, adapters);
	assert.strictEqual(collected.kind === 'problem' && collected.problem.site, 'luogu');
	const native = resolveProblem('C:/cpp/atcoder/abc-86_a.cpp', defaultDirectories, adapters);
	assert.strictEqual(native.kind === 'problem' && native.problem.nativeId, 'abc086/abc086_a');
	assert.deepStrictEqual(resolveProblem('C:/cpp/AT_abc086_a.cpp', defaultDirectories, adapters), { kind: 'inputRequired' });
	assert.deepStrictEqual(resolveProblem('C:/cpp/nowcoder/abc086_a.cpp', defaultDirectories, adapters), { kind: 'unsupported', site: 'nowcoder' });
	assert.deepStrictEqual(resolveProblem('C:/cpp/atcoder/solution.cpp', defaultDirectories, adapters), { kind: 'inputRequired', site: 'atcoder' });
	assert.strictEqual(resolveProblem('C:/cpp/练习/P1001.cpp', readDirectories({ luogu: '练习' }), adapters).kind, 'problem');
});

test('explicit contest identifiers remain reversible without a binding database', () => {
	assert.strictEqual(luoguProblem('P1001@123.cpp')?.nativeId, 'P1001@123');
	assert.strictEqual(atCoderProblem('tenka1-2019-beginner@tenka1_2019_a.cpp')?.nativeId, 'tenka1-2019-beginner/tenka1_2019_a');
});

test('directory and simple filenames resolve AtCoder without stored bindings', () => {
	for (const name of ['abc086_a.cpp', 'abc-86_a.cpp', 'AT_abc086_a.cpp']) {
		assert.deepStrictEqual(resolveProblem('C:/c++/atcoder/' + name, defaultDirectories, adapters), { kind: 'problem', problem: { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' } });
	}
	assert.deepStrictEqual(resolveProblem('C:/c++/abc086_a.cpp', defaultDirectories, adapters), { kind: 'problem', problem: { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' } });
});
test('another site directory wins over a filename that resembles AtCoder', () => {
	assert.deepStrictEqual(resolveProblem('C:/c++/luogu/abc086_a.cpp', defaultDirectories, adapters), { kind: 'inputRequired', site: 'luogu' });
	assert.deepStrictEqual(resolveProblem('C:/c++/atcoder/solution.cpp', defaultDirectories, adapters), { kind: 'inputRequired', site: 'atcoder' });
});
test('configured directory is used by the same resolver', () => {
	const directories = readDirectories({ atcoder: '竞赛题' });
	assert.deepStrictEqual(resolveProblem('C:/c++/竞赛题/abc086_a.cpp', directories, adapters), { kind: 'problem', problem: { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' } });
});

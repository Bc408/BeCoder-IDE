/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { parseImportedProblem, problemIdentity } from '../src/problem';
import { isResultCorrect, judgeSample, SampleExecution } from '../src/judge';

const url = 'https://codeforces.com/problemset/problem/1/A';
const fixture = () => ({
	name: 'A. Theatre Square', group: 'Codeforces', url,
	timeLimit: 1000, memoryLimit: 256, interactive: false,
	tests: [{ input: '6 6 4', output: '4' }],
	batch: { id: 'request-1', size: 1 },
	input: { type: 'stdin' }, output: { type: 'stdout' }, testType: 'single'
});
const parse = (value: unknown) => parseImportedProblem(JSON.stringify(value), url);

test('imports samples and discards page-provided local authority', () => {
	const problem = parse({ ...fixture(), srcPath: 'C:\\foreign.cpp', compiler: 'evil.exe' });
	assert.deepStrictEqual(problem.tests, [{ input: '6 6 4\n', output: '4\n' }]);
	assert.strictEqual('srcPath' in problem, false);
	assert.strictEqual('compiler' in problem, false);
});

test('preserves sample spaces, intentional blank lines and empty EOF', () => {
	const problem = parse({ ...fixture(), tests: [{ input: '', output: '  a \r\n\r\n' }] });
	assert.deepStrictEqual(problem.tests, [{ input: '', output: '  a \n\n' }]);
});

test('allows an empty sample list without manufacturing a passed case', () => {
	assert.deepStrictEqual(parse({ ...fixture(), tests: [] }).tests, []);
});

test('rejects unsupported input and test types', () => {
	for (const change of [{ interactive: true }, { input: { type: 'file' } }, { output: { type: 'file' } }, { testType: 'multiNumber' }, { batch: { id: 'x', size: 2 } }]) {
		assert.throws(() => parse({ ...fixture(), ...change }));
	}
});

test('rejects malformed and oversized data', () => {
	for (const change of [{ timeLimit: -1 }, { memoryLimit: 0 }, { name: '' }, { interactive: undefined }, { tests: [null] }, { tests: Array(101).fill({ input: '', output: '' }) }]) {
		assert.throws(() => parse({ ...fixture(), ...change }));
	}
	assert.throws(() => parseImportedProblem('x'.repeat(8 * 1024 * 1024 + 1), url));
	assert.throws(() => parseImportedProblem('{', url));
});

test('binds the import to the expected URL and rejects local URLs', () => {
	assert.throws(() => parse({ ...fixture(), url: 'https://atcoder.jp/' }));
	assert.throws(() => problemIdentity('file:///C:/secret'));
	assert.throws(() => problemIdentity('https://user:password@example.com/'));
	assert.strictEqual(problemIdentity(`${url}#samples`), url);
	assert.notStrictEqual(problemIdentity(`${url}?a=1`), problemIdentity(`${url}?a=2`));
});

test('retains CPH line comparison rather than token comparison', () => {
	assert.strictEqual(isResultCorrect(' a \r\n b\n', 'a\nb'), true);
	assert.strictEqual(isResultCorrect('1 2', '1\n2'), false);
	assert.strictEqual(isResultCorrect('1  2', '1 2'), false);
	assert.strictEqual(isResultCorrect('a\n\nb', 'a\nb'), false);
});

const success: SampleExecution = {
	stdout: '4\n', stderr: '\u001b[31mdebug\u001b[0m', exitCode: 0,
	signal: null, timedOut: false, cancelled: false, outputLimitExceeded: false
};

test('stderr debug is displayed independently, not judged as a runtime error', () => {
	assert.strictEqual(judgeSample('4', success), 'passed');
	assert.strictEqual(judgeSample('5', success), 'wrong-answer');
	assert.strictEqual(judgeSample('4', { ...success, stdout: '\u001b[31m4\u001b[0m' }), 'wrong-answer');
});

test('execution failures cannot be hidden by matching stdout', () => {
	assert.strictEqual(judgeSample('4', { ...success, exitCode: 1 }), 'runtime-error');
	assert.strictEqual(judgeSample('4', { ...success, exitCode: null }), 'runtime-error');
	assert.strictEqual(judgeSample('4', { ...success, signal: 'SIGTERM' }), 'runtime-error');
	assert.strictEqual(judgeSample('4', { ...success, launchError: 'missing' }), 'runtime-error');
	assert.strictEqual(judgeSample('4', { ...success, timedOut: true }), 'time-limit');
	assert.strictEqual(judgeSample('4', { ...success, cancelled: true }), 'cancelled');
	assert.strictEqual(judgeSample('4', { ...success, outputLimitExceeded: true }), 'output-limit');
});

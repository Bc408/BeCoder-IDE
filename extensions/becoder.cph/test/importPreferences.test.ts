/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { test } from 'node:test';
import { fillTemplate, problemFileStem, problemDisplayName } from '../src/importPreferences';
import { ImportedProblem } from '../src/problem';
import { ProblemStore } from '../src/problemStore';
import { diffOutput } from '../src/diffOutput';

const problem: ImportedProblem = { name: 'A - Theatre Square', group: 'CF', url: 'https://codeforces.com/problemset/problem/1/A', timeLimit: 1000, memoryLimit: 256,
	interactive: false, tests: [{ input: '1\n', output: '2\n' }], batch: { id: 'a', size: 1 }, input: { type: 'stdin' }, output: { type: 'stdout' }, testType: 'single' };

test('upstream naming and template substitutions respect selected preferences', () => {
	assert.strictEqual(problemFileStem(problem, (_key, fallback) => fallback), 'Theatre_Square');
	assert.strictEqual(problemFileStem(problem, (key, fallback) => key === 'general.useShortCodeForcesName' ? true as typeof fallback : fallback), '1A');
	assert.strictEqual(fillTemplate('$name$ $url$ $date$', problem, new Date(2026, 8, 19)), `${problem.name} ${problem.url} 2026-09-19`);
	assert.throws(() => problemFileStem(problem, (key, fallback) => key === 'general.wordRegex' ? '[' as typeof fallback : fallback));
	assert.strictEqual(problemDisplayName(problem, false), 'Theatre Square');
	assert.strictEqual(fillTemplate('$name$ $srcPath$ $name$', { ...problem, name: problemDisplayName(problem, false), srcPath: 'a.cpp' }), 'Theatre Square a.cpp $name$');
});

test('template initializes only new source and checker survives edits and repeat import', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-settings-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const store = new ProblemStore(root);
	const created = await store.importProblem(problem, async () => true, undefined, { language: 'c', contents: 'user template', stem: '1A' });
	assert.strictEqual(path.extname(created.problem.srcPath), '.c');
	assert.strictEqual(fs.readFileSync(created.problem.srcPath, 'utf8'), 'user template');
	const saved = await store.saveSamples(store.load(created.problem.srcPath)!, problem.tests.map((item, id) => ({ ...item, id })), 'checker.py');
	assert.strictEqual(store.load(created.problem.srcPath)!.problem.customCheckerPath, 'checker.py');
	await assert.rejects(store.saveSamples(saved, saved.problem.tests, 'bad\0path'));
	await store.importProblem(problem, async () => true, undefined, { language: 'cpp', contents: 'must not overwrite', stem: 'other' });
	assert.strictEqual(fs.readFileSync(created.problem.srcPath, 'utf8'), 'user template');
	assert.strictEqual(store.load(created.problem.srcPath)!.problem.customCheckerPath, 'checker.py');
});

test('upstream difference tokens and bounded large-output fallback', () => {
	const diff = diffOutput('1 2\n', '1 3\n');
	assert.ok(diff.tokenDiff.some(item => item.token === '2' && item.status === 'missing'));
	assert.ok(diff.tokenDiff.some(item => item.token === '3' && item.status === 'extra'));
	assert.strictEqual(diffOutput('a '.repeat(20000), 'b '.repeat(20000)).tokenDiff.length, 2);
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test, TestContext } from 'node:test';
import { JudgeSession, JudgeEngine } from '../src/judgeSession';
import { ProblemStore } from '../src/problemStore';
import { ImportedProblem } from '../src/problem';
import { displayOutput } from '../src/outputPresentation';

test('display truncation is explicit and leaves captured output unchanged', () => {
	const raw = '123456';
	assert.strictEqual(displayOutput(raw, '[truncated]', 4), '[truncated]\n1234');
	assert.strictEqual(raw, '123456');
	assert.strictEqual(displayOutput('1234', '[truncated]', 4), '1234');
});

async function setup(t: TestContext) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-session-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const store = new ProblemStore(root);
	const problem: ImportedProblem = { name: 'Test', group: 'test', url: 'https://example.com/a', timeLimit: 1000, memoryLimit: 256,
		interactive: false, tests: [{ input: 'a', output: 'b' }, { input: 'c', output: 'd' }],
		batch: { id: 'one', size: 1 }, input: { type: 'stdin' }, output: { type: 'stdout' }, testType: 'single' };
	const imported = await store.importProblem(problem, async () => true);
	let calls = 0;
	let selected: ImportedProblem | undefined;
	const engine: JudgeEngine = {
		judge: async (value, source) => {
			calls++;
			selected = value;
			assert.strictEqual(source, imported.problem.srcPath);
			return { compile: { stdout: '', stderr: '', exitCode: 0, signal: null, timedOut: false, cancelled: false, outputLimitExceeded: false }, samples: [] };
		}, cancel() { }, dispose() { }
	};
	return { root, store, source: imported.problem.srcPath, engine, calls: () => calls, selected: () => selected };
}

test('sample edits persist exact bytes and reopen; stale sessions cannot overwrite', async t => {
	const state = await setup(t);
	const session = new JudgeSession(state.engine, async () => undefined);
	const current = session.open(state.source)!;
	const other = new JudgeSession(state.engine, async () => undefined);
	other.open(state.source);
	const saved = await session.save(current.revision, [{ id: 5, input: '', output: '  no newline  ' }]);
	assert.notStrictEqual(saved.revision, current.revision);
	assert.strictEqual(new ProblemStore(state.root).load(state.source)!.problem.tests[0].output, '  no newline  ');
	await assert.rejects(other.save(current.revision, []), { code: 'changed' });
	assert.strictEqual(fs.readFileSync(state.source, 'utf8'), '');
});

test('single sample run saves source first and cannot choose a different path', async t => {
	const state = await setup(t);
	let saved = false;
	const originalJudge = state.engine.judge;
	state.engine.judge = async (...args) => { assert.ok(saved); return originalJudge(...args); };
	const session = new JudgeSession(state.engine, async source => { assert.strictEqual(source, state.source); saved = true; });
	const current = session.open(state.source)!;
	const result = await session.run(current.revision, [{ id: 7, input: 'x', output: 'y', srcPath: 'foreign' }, { id: 8, input: '', output: '' }], 7);
	assert.deepStrictEqual(result.ids, [7]);
	assert.deepStrictEqual(state.selected()!.tests, [{ id: 7, input: 'x', output: 'y' }]);
});

test('run owner rejects concurrent edits and cancellation during source-save prevents execution', async t => {
	const state = await setup(t);
	let release!: () => void;
	let entered!: () => void;
	const saving = new Promise<void>(resolve => { entered = resolve; });
	const session = new JudgeSession(state.engine, () => new Promise(resolve => { release = resolve; entered(); }));
	const current = session.open(state.source)!;
	const pending = session.run(current.revision, current.problem.tests);
	assert.throws(() => session.open(state.source), /busy/);
	await assert.rejects(session.save(current.revision, []), /busy/);
	await saving;
	session.cancel();
	release();
	await assert.rejects(pending, /cancelled/);
	assert.strictEqual(state.calls(), 0);
	assert.strictEqual(session.busy, false);
});

test('zero samples, malformed edits and duplicate IDs never start the compiler', async t => {
	const state = await setup(t);
	const session = new JudgeSession(state.engine, async () => undefined);
	const current = session.open(state.source)!;
	await assert.rejects(session.save(current.revision, [{ id: 1, input: 123, output: '' }]), /Invalid/);
	await assert.rejects(session.save(current.revision, [{ id: 1, input: '', output: '' }, { id: 1, input: '', output: '' }]), /Duplicate/);
	await assert.rejects(session.run(current.revision, []), /No sample/);
	assert.strictEqual(state.calls(), 0);
});

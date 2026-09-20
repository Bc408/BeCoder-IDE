/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test, TestContext } from 'node:test';
import { ProblemStore, metadataName, safeSourceName } from '../src/problemStore';
import { ImportedProblem } from '../src/problem';

function workspace(t: TestContext): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-test-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	return fs.realpathSync(root);
}

function problem(url = 'https://codeforces.com/problemset/problem/1/A'): ImportedProblem {
	return {
		name: '中文题目', group: 'Codeforces', url, timeLimit: 1000, memoryLimit: 256,
		interactive: false, tests: [{ input: '1\n', output: '2\n' }],
		batch: { id: 'one', size: 1 }, input: { type: 'stdin' }, output: { type: 'stdout' }, testType: 'single'
	};
}

test('creates C++ source and CPH-compatible metadata inside selected workspace', async t => {
	const root = workspace(t);
	const result = await new ProblemStore(root).importProblem(problem(), async () => assert.fail('new import must not confirm'));
	assert.strictEqual(result.kind, 'created');
	assert.strictEqual(fs.readFileSync(result.problem.srcPath, 'utf8'), '');
	const stored = JSON.parse(fs.readFileSync(path.join(root, '.cph', metadataName(result.problem.srcPath)), 'utf8'));
	assert.deepStrictEqual(stored, result.problem);
	assert.deepStrictEqual(fs.readdirSync(path.join(root, '.cph')), [metadataName(result.problem.srcPath)]);
});

test('creates an upstream-style local problem without changing the existing source', async t => {
	const root = workspace(t);
	const source = path.join(root, 'manual.cpp');
	fs.writeFileSync(source, 'int main() { return 0; }');
	const store = new ProblemStore(root);
	const created = await store.createLocal(source);
	assert.strictEqual(fs.readFileSync(source, 'utf8'), 'int main() { return 0; }');
	assert.strictEqual(created.problem.local, true);
	assert.strictEqual(created.problem.url, source);
	assert.strictEqual(created.problem.name, 'Local: manual');
	assert.deepStrictEqual(created.problem.tests, [{ id: 0, input: '', output: '' }]);
	assert.deepStrictEqual(store.load(source)?.problem, created.problem);
	assert.strictEqual((await store.createLocal(source)).revision, created.revision);
});

test('same URL preserves source and declined replacement preserves exact metadata', async t => {
	const root = workspace(t);
	const store = new ProblemStore(root);
	const original = await store.importProblem(problem(), async () => false);
	fs.writeFileSync(original.problem.srcPath, 'user code');
	const file = path.join(root, '.cph', metadataName(original.problem.srcPath));
	const before = fs.readFileSync(file, 'utf8');
	const kept = await store.importProblem({ ...problem(), name: 'new title' }, async () => false);
	assert.strictEqual(kept.kind, 'kept');
	assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
	const updated = await store.importProblem({ ...problem(), tests: [{ input: '', output: '3' }] }, async () => true);
	assert.strictEqual(updated.kind, 'replaced');
	assert.strictEqual(updated.problem.srcPath, original.problem.srcPath);
	assert.strictEqual(fs.readFileSync(original.problem.srcPath, 'utf8'), 'user code');
	assert.strictEqual(updated.problem.tests[0].output, '3\n');
});

test('different URLs reuse the CPH filename and replace metadata without overwriting source', async t => {
	const root = workspace(t);
	fs.writeFileSync(path.join(root, '中文题目.cpp'), 'existing');
	const store = new ProblemStore(root);
	const a = await store.importProblem(problem(), async () => true);
	const b = await store.importProblem(problem('https://atcoder.jp/contests/abc001/tasks/abc001_1'), async () => true);
	assert.strictEqual(a.problem.srcPath, b.problem.srcPath);
	assert.strictEqual(store.load(a.problem.srcPath)?.problem.url, b.problem.url);
	assert.strictEqual(fs.readFileSync(path.join(root, '中文题目.cpp'), 'utf8'), 'existing');
});

test('template initialization receives final source and sample IDs, and is skipped for existing files', async t => {
	const root = workspace(t);
	const store = new ProblemStore(root);
	let calls = 0;
	const preferences = { language: 'cpp' as const, stem: 'A', name: 'Title', contents: '', initialize: (value: { srcPath: string }) => {
		calls++;
		return `// ${value.srcPath}`;
	} };
	const first = await store.importProblem(problem(), async () => true, undefined, preferences);
	assert.strictEqual(first.problem.name, 'Title');
	assert.strictEqual(fs.readFileSync(first.problem.srcPath, 'utf8'), `// ${first.problem.srcPath}`);
	preferences.initialize = () => assert.fail('existing sources must not load templates');
	await store.importProblem(problem(), async () => true, undefined, preferences);
	await store.importProblem(problem('https://example.com/b'), async () => true, undefined, preferences);
	assert.strictEqual(calls, 1);
});

test('filename reuse rejects linked source files and preserves their target', async t => {
	const root = workspace(t);
	const target = path.join(root, 'target.cpp');
	fs.writeFileSync(target, 'protected');
	fs.linkSync(target, path.join(root, '中文题目.cpp'));
	await assert.rejects(new ProblemStore(root).importProblem(problem(), async () => true), { code: 'unsafe-path' });
	assert.strictEqual(fs.readFileSync(target, 'utf8'), 'protected');
});

test('refuses changed metadata after confirmation without overwriting the edit', async t => {
	const root = workspace(t);
	const store = new ProblemStore(root);
	const created = await store.importProblem(problem(), async () => true);
	const file = path.join(root, '.cph', metadataName(created.problem.srcPath));
	await assert.rejects(store.importProblem(problem(), async () => {
		fs.writeFileSync(file, 'edited during confirmation');
		return true;
	}), { code: 'changed' });
	assert.strictEqual(fs.readFileSync(file, 'utf8'), 'edited during confirmation');
});

test('rejects another importer during confirmation and unlocks afterwards', async t => {
	const root = workspace(t);
	const store = new ProblemStore(root);
	await store.importProblem(problem(), async () => true);
	await store.importProblem(problem(), async () => {
		await assert.rejects(new ProblemStore(root).importProblem(problem(), async () => true), { code: 'busy' });
		return false;
	});
	assert.strictEqual((await store.importProblem(problem(), async () => true)).kind, 'replaced');
});

test('aborted confirmation retires the lock and preserves source and samples', async t => {
	const root = workspace(t);
	const store = new ProblemStore(root);
	const created = await store.importProblem(problem(), async () => true);
	const controller = new AbortController();
	await assert.rejects(store.importProblem(problem(), async () => {
		controller.abort();
		return true;
	}, controller.signal), { name: 'AbortError' });
	assert.ok(fs.existsSync(created.problem.srcPath));
	assert.strictEqual((await store.importProblem(problem(), async () => false)).kind, 'kept');
});

test('loads legacy CPH transport-less metadata without importing settings', async t => {
	const root = workspace(t);
	const source = path.join(root, 'legacy.cpp');
	fs.writeFileSync(source, 'existing');
	fs.mkdirSync(path.join(root, '.cph'));
	const old = { name: 'old', url: problem().url, group: 'cf', timeLimit: 1000, memoryLimit: 256, interactive: false,
		srcPath: source, tests: [{ id: 42, input: 'no newline', output: '  meaningful ' }] };
	fs.writeFileSync(path.join(root, '.cph', metadataName(source)), JSON.stringify(old));
	const result = await new ProblemStore(root).importProblem(problem(), async () => false);
	assert.strictEqual(result.problem.srcPath, source);
	assert.deepStrictEqual(result.problem.tests, old.tests);
});

test('rejects redirected .cph junction without writing outside the workspace', async t => {
	const root = workspace(t);
	const outside = workspace(t);
	fs.symlinkSync(outside, path.join(root, '.cph'), 'junction');
	await assert.rejects(new ProblemStore(root).importProblem(problem(), async () => true), { code: 'unsafe-path' });
	assert.deepStrictEqual(fs.readdirSync(outside), []);
});

test('does not follow page path separators or Windows device names', () => {
	for (const name of ['../../evil', 'CON', 'NUL.txt', 'a:b', 'a\\b', '...', '中文题目']) {
		const stem = safeSourceName(name);
		assert.ok(!/[<>:"/\\|?*]/.test(stem));
		assert.ok(!stem.startsWith('.'));
		assert.ok(!/^(CON|NUL)(\.|$)/i.test(stem));
	}
});

test('failed metadata publication preserves original data, removes only owned temporary file and releases lease', async t => {
	const root = workspace(t);
	const store = new ProblemStore(root);
	const original = await store.importProblem(problem(), async () => true);
	const snapshot = store.load(original.problem.srcPath)!;
	const before = fs.readFileSync(snapshot.metadataPath, 'utf8');
	const rename = t.mock.method(require('fs'), 'renameSync', () => { throw Object.assign(new Error('injected publication failure'), { code: 'EACCES' }); });
	await assert.rejects(store.importProblem(problem(), async () => true), /injected publication/);
	await assert.rejects(store.saveSamples(snapshot, [{ id: 0, input: '', output: 'edit' }]), /injected publication/);
	assert.strictEqual(fs.readFileSync(snapshot.metadataPath, 'utf8'), before);
	assert.deepStrictEqual(fs.readdirSync(path.join(root, '.cph')), [metadataName(original.problem.srcPath)]);
	rename.mock.restore();
	assert.strictEqual((await store.importProblem(problem(), async () => true)).kind, 'replaced');
});

test('old prototype lock file is not deleted and cannot block new imports', async t => {
	const root = workspace(t);
	fs.mkdirSync(path.join(root, '.cph'));
	const oldLock = path.join(root, '.cph', '.becoder-import.lock');
	fs.writeFileSync(oldLock, 'old owner');
	await new ProblemStore(root).importProblem(problem(), async () => true);
	assert.strictEqual(fs.readFileSync(oldLock, 'utf8'), 'old owner');
});

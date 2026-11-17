/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { ImportController, ImportHost } from '../src/importController';

const url = 'https://codeforces.com/problemset/problem/1/A';
const json = JSON.stringify({ name: 'A', group: 'CF', url, timeLimit: 1000, memoryLimit: 256,
	interactive: false, tests: [], batch: { id: 'one', size: 1 }, input: { type: 'stdin' }, output: { type: 'stdout' }, testType: 'single' });

test('no workspace prompts without writing; picker cancellation does not import', async () => {
	let prompted = 0;
	const host: ImportHost = {
		workspaceFolders: () => [], selectFolder: async () => undefined,
		requestWorkspace: async () => { prompted++; }, confirmReplacement: async () => false,
		showProblem: async () => assert.fail('must not show a problem')
	};
	assert.strictEqual(await new ImportController(host).import(json, url), undefined);
	assert.strictEqual(prompted, 1);
	host.workspaceFolders = () => ['one', 'two'];
	assert.strictEqual(await new ImportController(host).import(json, url), undefined);
});

test('multi-root import uses the selected folder, single root needs no picker', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-controller-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const a = path.join(root, 'a');
	const b = path.join(root, 'b');
	fs.mkdirSync(a);
	fs.mkdirSync(b);
	let shown = 0;
	const host: ImportHost = {
		workspaceFolders: () => [a, b], selectFolder: async () => b,
		requestWorkspace: async () => assert.fail(), confirmReplacement: async () => false,
		showProblem: async result => { assert.strictEqual(path.dirname(result.problem.srcPath), fs.realpathSync(b)); shown++; }
	};
	await new ImportController(host).import(json, url);
	assert.deepStrictEqual(fs.readdirSync(a), []);
	host.workspaceFolders = () => [b];
	host.selectFolder = async () => assert.fail('single root must not show a picker');
	await new ImportController(host).import(json, url);
	assert.strictEqual(shown, 2);
});

test('workspace change during selection rejects import', async () => {
	let folders = ['a', 'b'];
	const host: ImportHost = {
		workspaceFolders: () => folders,
		selectFolder: async () => { folders = []; return 'b'; },
		requestWorkspace: async () => undefined, confirmReplacement: async () => false, showProblem: async () => assert.fail()
	};
	await assert.rejects(new ImportController(host).import(json, url), { code: 'changed' });
});

test('rejects concurrent requests and window disposal cancels pending import', async () => {
	let release!: (value: string) => void;
	const host: ImportHost = {
		workspaceFolders: () => ['a', 'b'], selectFolder: () => new Promise(resolve => { release = resolve; }),
		requestWorkspace: async () => undefined, confirmReplacement: async () => false, showProblem: async () => assert.fail()
	};
	const controller = new ImportController(host);
	const pending = controller.import(json, url);
	await assert.rejects(controller.import(json, url), { code: 'busy' });
	controller.dispose();
	release('b');
	await assert.rejects(pending, { name: 'AbortError' });
});

test('explicit OJ destinations preserve template root and reuse the exact source through both CPH paths', async t => {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cph-oj-target-')));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const opened: string[] = [];
	const host: ImportHost = {
		workspaceFolders: () => [root], selectFolder: async () => assert.fail(), requestWorkspace: async () => assert.fail(),
		confirmReplacement: async () => false, showProblem: async result => { opened.push(result.problem.srcPath); },
		sourcePreferences: async (_problem, folder) => {
			assert.strictEqual(folder, root, 'template lookup remains relative to workspace');
			return { language: 'c', contents: '', stem: 'CPH default', initialize: () => 'template\n' };
		}
	};
	const controller = new ImportController(host);
	for (const [directory, fileName] of [['luogu', 'P1001.cpp'], ['atcoder', 'abc086_a.cpp'], ['nowcoder', '5657_A.cpp']]) {
		const target = { directory, fileName };
		const first = await controller.import(json, url, target); assert.ok(first);
		const source = path.join(root, directory, fileName);
		assert.strictEqual(first.problem.srcPath, source);
		assert.strictEqual(fs.readFileSync(source, 'utf8'), 'template\n');
		fs.writeFileSync(source, 'solution stays');
		await controller.import(json, url, target);
		assert.strictEqual(fs.readFileSync(source, 'utf8'), 'solution stays');
		assert.deepStrictEqual(fs.readdirSync(path.join(root, directory)).sort(), ['.cph', fileName].sort());
	}
	assert.strictEqual(opened.length, 6);
	await assert.rejects(controller.import(json, url, { directory: '../escape', fileName: 'x.cpp' }), /destination/i);
	await assert.rejects(controller.import(json, url, { directory: 'okay', fileName: '../x.cpp' }), /destination/i);
});

test('cancelling a browser request during workspace selection prevents file publication', async t => {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cph-oj-abort-')));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	let release!: (value: string) => void;
	const controller = new ImportController({ workspaceFolders: () => [root, 'other'], selectFolder: () => new Promise(resolve => { release = resolve; }),
		requestWorkspace: async () => assert.fail(), confirmReplacement: async () => assert.fail(), showProblem: async () => assert.fail() });
	const pending = controller.import(json, url, { directory: 'atcoder', fileName: 'abc086_a.cpp' }, 'browser-one');
	controller.cancel('unrelated'); controller.cancel('browser-one'); release(root);
	await assert.rejects(pending, { name: 'AbortError' });
	assert.deepStrictEqual(fs.readdirSync(root), []);
});

test('cancellation delivered before extension activation cannot start an import', async () => {
	const controller = new ImportController({ workspaceFolders: () => assert.fail('cancelled request must not query folders'), selectFolder: async () => assert.fail(),
		requestWorkspace: async () => assert.fail(), confirmReplacement: async () => assert.fail(), showProblem: async () => assert.fail() });
	controller.cancel('pending-activation');
	await assert.rejects(controller.import(json, url, undefined, 'pending-activation'), { name: 'AbortError' });
});

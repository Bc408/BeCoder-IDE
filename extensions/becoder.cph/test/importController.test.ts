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

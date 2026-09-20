/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { test } from 'node:test';

test('VSCE inventory includes runtime and sources but excludes development dependencies', async () => {
	const vsce = createRequire(path.resolve('build/package.json'))('@vscode/vsce');
	const files: string[] = (await vsce.listFiles({ cwd: path.resolve('extensions/becoder.cph'), packageManager: vsce.PackageManager.Npm }))
		.map((file: string) => file.replace(/\\/g, '/'));
	for (const file of ['out/extension.js', 'out/judgeView.js', 'out/execution.js', 'dist/judge.js', 'dist/judge.css', 'dist/problem-parser.js',
		'LICENSE', 'ThirdPartyNotices.txt', 'companion/LICENSE', 'licenses/babel-runtime.txt', 'UPSTREAM.md', 'src/extension.ts', 'webview/CaseView.tsx', 'companion/entry.ts', 'resources/judge.svg', 'resources/icon.png']) {
		assert.ok(files.includes(file), `Missing package file: ${file}`);
	}
	assert.ok(!files.some(file => /(^|\/)(node_modules|out-test|test)\//.test(file)));
});

test('build and provenance are registered without external Companion reception', () => {
	const manifest = JSON.parse(fs.readFileSync('extensions/becoder.cph/package.json', 'utf8'));
	const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
	assert.ok(root.scripts['compile-oi-extensions'].includes('extensions/becoder.cph run vscode:prepublish'));
	assert.ok(fs.readFileSync('build/npm/dirs.ts', 'utf8').includes("'extensions/becoder.cph'"));
	assert.ok(fs.readFileSync('build/lib/extensions.ts', 'utf8').includes("'becoder.cph'"));
	assert.strictEqual(`${manifest.publisher}.${manifest.name}`, 'becoder.cph');
	assert.strictEqual(manifest.capabilities.untrustedWorkspaces.supported, false);
	assert.deepStrictEqual(manifest.contributes.keybindings, [
		{ key: 'ctrl+alt+b', command: 'becoder.cph.runTestCases' },
		{ key: 'ctrl+alt+d', command: 'becoder.cph.judge.focus' }
	]);
	assert.ok(manifest.contributes.commands.some((command: { command: string }) => command.command === 'becoder.cph.runTestCases'));
	assert.ok(!manifest.contributes.commands.some((command: { command: string }) => /submit/i.test(command.command)));
	assert.ok(!manifest.contributes.keybindings.some((binding: { command: string }) => /submit/i.test(binding.command)));
	const inventory = JSON.parse(fs.readFileSync('resources/oi-defaults/BUNDLED-COMPONENTS.json', 'utf8'));
	assert.ok(inventory.components.some((item: { id: string }) => item.id === 'becoder.cph'));
	for (const filename of fs.readdirSync('extensions/becoder.cph/src').filter(name => name.endsWith('.ts'))) {
		const source = fs.readFileSync(path.join('extensions/becoder.cph/src', filename), 'utf8');
		assert.ok(!/27121|setupCompanionServer|from ['"]https?['"]/.test(source), filename);
	}
});

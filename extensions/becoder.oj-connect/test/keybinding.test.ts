/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';

test('submission shortcut belongs to one extension command in source-editor context', () => {
	const root = path.resolve(__dirname, '../..');
	const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	assert.deepStrictEqual(manifest.contributes.keybindings, [
		{ command: 'becoder.ojConnect.submit', key: 'ctrl+alt+s', when: 'editorTextFocus && (editorLangId == c || editorLangId == cpp)' },
		{ command: 'becoder.ojConnect.showProblem', key: 'ctrl+alt+p', when: 'editorTextFocus && (editorLangId == c || editorLangId == cpp)' }
	]);
	assert.strictEqual(fs.existsSync(path.resolve(root, '../../src/vs/workbench/contrib/browserView/electron-browser/features/browserAtCoderShortcutFeature.ts')), false);
});

test('account view belongs to a valid independent activity bar container', () => {
	const root = path.resolve(__dirname, '../..');
	const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	const containers = manifest.contributes.viewsContainers.activitybar;
	assert.strictEqual(containers.length, 1);
	const container = containers[0];
	// ViewsExtensionHandler rejects punctuation other than underscore and hyphen.
	assert.match(container.id, /^[a-z0-9_-]+$/i);
	assert.strictEqual(container.title, 'OJ Connect');
	assert.ok(fs.existsSync(path.join(root, container.icon)));
	assert.deepStrictEqual(Object.keys(manifest.contributes.views), [container.id]);
	assert.deepStrictEqual(manifest.contributes.views[container.id].map((view: { id: string }) => view.id), ['becoder.ojConnect.accounts']);
});

test('compiler settings allow only the shipped symbolic preselection in its owning site and family', () => {
	const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
	const properties = manifest.contributes.configuration.properties;
	for (const site of ['luogu', 'atcoder', 'codeforces', 'nowcoder']) {
		for (const family of ['c', 'cpp']) {
			const pattern = new RegExp(properties['becoder.ojConnect.' + site + '.' + family + 'Compiler'].pattern);
			assert.strictEqual(pattern.test('catalogue:atcoder-c23-gcc'), site === 'atcoder' && family === 'c');
			assert.strictEqual(pattern.test('catalogue:atcoder-guessed'), false);
			assert.strictEqual(pattern.test('6017'), true);
			assert.strictEqual(pattern.test(''), true);
		}
	}
});

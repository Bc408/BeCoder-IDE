/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
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

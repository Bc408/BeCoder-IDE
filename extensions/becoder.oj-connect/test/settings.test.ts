/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { test } from 'node:test';
import { readDirectories } from '../src/settings';

test('ACM mode is a default-off application setting with translated personal-preference wording', () => {
	const root = join(__dirname, '..', '..');
	const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	const setting = manifest.contributes.configuration.properties['becoder.ojConnect.acmMode'];
	assert.ok(setting, 'the setting must survive extension restarts in the native configuration service');
	assert.strictEqual(setting.type, 'boolean');
	assert.strictEqual(setting.default, false);
	assert.strictEqual(setting.scope, 'application', 'workspace settings cannot silently enable the personal mode');
	for (const file of ['package.nls.json', 'package.nls.zh-cn.json']) {
		const strings = JSON.parse(readFileSync(join(root, file), 'utf8'));
		assert.ok(strings[setting.description.slice(1, -1)], 'each manifest locale describes the setting');
	}
	const strings = JSON.parse(readFileSync(join(root, 'l10n', 'bundle.l10n.zh-cn.json'), 'utf8'));
	assert.strictEqual(strings['ACM Mode'], 'ACM 模式');
});

test('defaults are the five confirmed site directory names', () => {
	assert.deepStrictEqual(readDirectories(undefined), { luogu: 'luogu', codeforces: 'codeforces', atcoder: 'atcoder', lanqiao: 'lanqiao', nowcoder: 'nowcoder' });
});
test('rejects escapes, reserved names and ambiguous Windows directories', () => {
	for (const value of ['../ac', 'D:\\ac', 'CON', '..', 'ac.', ' ac', '']) {
		assert.throws(() => readDirectories({ atcoder: value }), /directories/);
	}
	assert.throws(() => readDirectories({ atcoder: 'LUOGU' }), /directories/);
	assert.throws(() => readDirectories({ typo: 'ac' }), /directories/);
	assert.throws(() => readDirectories({ constructor: 'ac' }), /directories/);
});

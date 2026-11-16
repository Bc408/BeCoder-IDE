/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { test } from 'node:test';
import { readDirectories } from '../src/settings';

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

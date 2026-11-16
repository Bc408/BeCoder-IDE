/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { OjPreferences } from '../src/preferences';

test('AtCoder explicit choices survive reconstruction without mixing C, C++ or statement locale', async () => {
	const values = new Map<string, unknown>();
	const store = { get: <T>(key: string) => values.get(key) as T | undefined, update: async (key: string, value: unknown) => { values.set(key, value); } };
	const first = new OjPreferences(store);
	assert.strictEqual(first.statementLocale(['ja', 'en']), 'en');
	assert.strictEqual(first.language('cpp'), undefined);
	await first.selectStatementLocale('ja');
	await first.selectLanguage('cpp', '6017');
	await first.selectLanguage('c', '6016');
	const next = new OjPreferences(store);
	assert.strictEqual(next.statementLocale(['en']), 'en');
	assert.strictEqual(next.statementLocale(['en', 'ja']), 'ja', 'fallback must not replace the user choice');
	assert.strictEqual(next.language('cpp'), '6017');
	assert.strictEqual(next.language('c'), '6016');
});

test('invalid stored preferences do not become a submission option or unavailable statement', () => {
	const store = { get: <T>(_key: string) => ({ invalid: true }) as T, update: async () => { } };
	const preferences = new OjPreferences(store);
	assert.strictEqual(preferences.language('cpp'), undefined);
	assert.strictEqual(preferences.statementLocale(['ja']), 'ja');
	assert.strictEqual(preferences.statementLocale([]), undefined);
});

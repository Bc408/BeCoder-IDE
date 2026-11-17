/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { OjPreferences } from '../src/preferences';

function store() {
	const values = new Map<string, unknown>();
	return { values, get: <T>(key: string) => values.get(key) as T | undefined, update: async (key: string, value: unknown) => { if (value === undefined) { values.delete(key); } else { values.set(key, value); } } };
}

test('Nowcoder keeps its C and C++ language IDs separate from both existing sites', async () => {
	const settings = store(), preferences = new OjPreferences(settings);
	await preferences.selectLanguage('nowcoder', 'cpp', '38');
	await preferences.selectLanguage('nowcoder', 'c', '1');
	await preferences.selectLanguage('luogu', 'cpp', '28:o2');
	await preferences.selectLanguage('atcoder', 'cpp', '6017');
	assert.strictEqual(preferences.language('nowcoder', 'cpp'), '38');
	assert.strictEqual(preferences.language('nowcoder', 'c'), '1');
	assert.strictEqual(preferences.language('luogu', 'cpp'), '28:o2');
	assert.strictEqual(preferences.language('atcoder', 'cpp'), '6017');
});

test('both sites use the same persistent settings authority without mixing C and C++', async () => {
	const settings = store(), first = new OjPreferences(settings);
	await first.selectLanguage('atcoder', 'cpp', '6017');
	await first.selectLanguage('atcoder', 'c', '6016');
	await first.selectLanguage('luogu', 'cpp', '28:o2');
	await first.selectLanguage('luogu', 'c', '2');
	await first.selectStatementLocale('ja');
	const next = new OjPreferences(settings);
	assert.strictEqual(next.language('atcoder', 'cpp'), '6017');
	assert.strictEqual(next.language('atcoder', 'c'), '6016');
	assert.strictEqual(next.language('luogu', 'cpp'), '28:o2');
	assert.strictEqual(next.language('luogu', 'c'), '2');
	assert.strictEqual(next.statementLocale(['en']), 'en');
	assert.strictEqual(next.statementLocale(['en', 'ja']), 'ja');
	settings.values.set('luogu.cppCompiler', '27');
	assert.strictEqual(first.language('luogu', 'cpp'), '27', 'settings changes apply without reconstructing the controller');
});

test('legacy AtCoder choices migrate once and never overwrite an explicit setting', async () => {
	const settings = store(), legacy = store(), preferences = new OjPreferences(settings);
	legacy.values.set('atcoder.language.cpp', '6017');
	legacy.values.set('atcoder.language.c', '6016');
	legacy.values.set('atcoder.statementLocale', 'ja');
	settings.values.set('atcoder.cppCompiler', '7017');
	await preferences.migrate(legacy, (key: string) => settings.values.has(key));
	assert.strictEqual(preferences.language('atcoder', 'cpp'), '7017');
	assert.strictEqual(preferences.language('atcoder', 'c'), '6016');
	assert.strictEqual(preferences.statementLocale(['ja', 'en']), 'ja');
	assert.strictEqual(legacy.values.size, 0);
	settings.values.set('atcoder.cCompiler', '');
	await preferences.migrate(legacy, (key: string) => settings.values.has(key));
	assert.strictEqual(preferences.language('atcoder', 'c'), undefined, 'clearing a setting cannot resurrect an old hidden choice');
});

test('failed migration keeps the original value for a later retry', async () => {
	const legacy = store(); legacy.values.set('atcoder.language.cpp', '6017');
	const preferences = new OjPreferences({ get: () => undefined, update: async () => { throw new Error('settings write failed'); } });
	await assert.rejects(preferences.migrate(legacy, () => false), /settings write failed/);
	assert.strictEqual(legacy.values.get('atcoder.language.cpp'), '6017');
});

test('invalid personal settings are not silently turned into compiler choices', async () => {
	const settings = store(), preferences = new OjPreferences(settings);
	settings.values.set('atcoder.cppCompiler', { invalid: true });
	assert.strictEqual(preferences.language('atcoder', 'cpp'), undefined);
	assert.strictEqual(preferences.statementLocale(['ja']), 'ja');
	assert.strictEqual(preferences.statementLocale([]), undefined);
	await assert.rejects(preferences.selectLanguage('atcoder', 'cpp', '27:o2'), /language/);
	await assert.rejects(preferences.selectLanguage('luogu', 'cpp', '27:invalid'), /language/);
	await assert.rejects(preferences.selectStatementLocale('zh'), /locale/);
});

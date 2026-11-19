/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { defaultLanguage, OjPreferences } from '../src/preferences';
import type { LanguageOption } from '../src/domain';

function store() {
	const values = new Map<string, unknown>();
	return { values, get: <T>(key: string) => values.get(key) as T | undefined, update: async (key: string, value: unknown) => { if (value === undefined) { values.delete(key); } else { values.set(key, value); } } };
}

test('compiler defaults prefer GNU, O2 and msys2 while moving upwards from C++20 and C17', () => {
	const cpp = (id: string, label: string): LanguageOption => ({ id, label, family: 'cpp' });
	const c = (id: string, label: string): LanguageOption => ({ id, label, family: 'c' });
	const options = [cpp('17', 'GNU G++17 7.3.0'), cpp('20', 'GNU G++20 13.2 (64 bit, winlibs)'), cpp('23', 'GNU G++23 14.2 (64 bit, msys2)'), cpp('26', 'GNU G++26 16.1 (64 bit, msys2)'), c('c17', 'GNU GCC C17 7.3.0')];
	assert.strictEqual(defaultLanguage(options, 'cpp')?.id, '23');
	assert.strictEqual(defaultLanguage(options.filter(option => !option.label.includes('msys2')), 'cpp')?.id, '20');
	assert.strictEqual(defaultLanguage([cpp('clang20', 'C++20 (Clang 18)'), cpp('gcc23', 'C++23 (GCC 15.2.0)')], 'cpp')?.id, 'gcc23');
	assert.strictEqual(defaultLanguage([cpp('plain', 'C++20 (GCC 13)'), cpp('o2', 'C++20 (GCC 13) (O2)')], 'cpp')?.id, 'o2');
	assert.strictEqual(defaultLanguage([c('11', 'GNU GCC C11 5.1'), c('23', 'C23 (GCC 14.2)'), c('17', 'C17 (GCC 12.2)')], 'c')?.id, '17');
	assert.strictEqual(defaultLanguage([c('11', 'C11 (GCC 5.1)'), c('23', 'C23 (GCC 14.2)')], 'c')?.id, '23');
	assert.strictEqual(defaultLanguage([cpp('98', 'C++98 (GCC 13)'), cpp('03', 'C++03'), cpp('17', 'C++17'), c('17', 'C17')], 'cpp'), undefined);
	assert.strictEqual(defaultLanguage([c('90', 'C90'), c('99', 'C99'), c('11', 'C11')], 'c'), undefined);
	assert.strictEqual(defaultLanguage([cpp('unknown', 'C++ (GCC13)'), cpp('known', 'C++23 (GCC 13)')], 'cpp')?.id, 'known');
	assert.strictEqual(defaultLanguage([cpp('unknown', 'C++ (GCC13)')], 'cpp')?.label, 'C++ (GCC13)', 'unversioned official choices retain their exact name');
	assert.strictEqual(defaultLanguage([cpp('clang', 'C++（clang++18）'), cpp('gnu', 'C++(g++ 13)')], 'cpp')?.id, 'gnu', 'a parenthesized g++ compiler version is not a language standard');
	assert.strictEqual(defaultLanguage([cpp('old', 'C++20 (GCC 12.2)'), cpp('new', 'C++20 (GCC 13.2)')], 'cpp')?.id, 'new');
	assert.strictEqual(defaultLanguage([], 'cpp'), undefined);
	assert.strictEqual(options[0].id, '17', 'selection must not reorder the official catalogue');
});

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

test('only the built-in site and language family may persist an offline symbolic compiler', async () => {
	const settings = store(), preferences = new OjPreferences(settings);
	await preferences.selectLanguage('atcoder', 'c', 'catalogue:atcoder-c23-gcc');
	assert.strictEqual(preferences.language('atcoder', 'c'), 'catalogue:atcoder-c23-gcc');
	for (const [site, family, id] of [
		['atcoder', 'cpp', 'catalogue:atcoder-c23-gcc'], ['codeforces', 'c', 'catalogue:atcoder-c23-gcc'],
		['luogu', 'c', 'catalogue:atcoder-c23-gcc'], ['nowcoder', 'c', 'catalogue:atcoder-c23-gcc'],
		['atcoder', 'c', 'catalogue:atcoder-guessed']
	] as const) {
		await assert.rejects(preferences.selectLanguage(site, family, id), /language/);
		settings.values.set(site + '.' + family + 'Compiler', id);
		assert.strictEqual(preferences.language(site, family), undefined);
	}
});

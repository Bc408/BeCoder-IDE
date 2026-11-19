/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { compilerCatalogue, resolveCompiler } from '../src/compilerCatalogue';
import { defaultLanguage } from '../src/preferences';
import type { LanguageOption } from '../src/domain';

test('captured catalogues preserve verified IDs and expose C23 without inventing its numeric website ID', () => {
	assert.deepStrictEqual(compilerCatalogue('codeforces').map(option => option.id), ['43', '54', '89', '91']);
	assert.strictEqual(defaultLanguage(compilerCatalogue('codeforces'), 'cpp')?.id, '91');
	assert.strictEqual(defaultLanguage(compilerCatalogue('codeforces'), 'c'), undefined, 'the captured C11 option cannot be presented as a C17 default');
	assert.deepStrictEqual(compilerCatalogue('atcoder'), [
		{ id: '6017', label: 'C++23 (GCC 15.2.0)', family: 'cpp' },
		{ id: 'catalogue:atcoder-c23-gcc', label: 'C23 (GCC 14.2.0)', family: 'c' }
	]);
	assert.deepStrictEqual(compilerCatalogue('luogu'), []);
	assert.deepStrictEqual(compilerCatalogue('nowcoder'), []);
});

test('symbolic preselection needs one numeric current match of both the official label and family', () => {
	const id = 'catalogue:atcoder-c23-gcc';
	const option: LanguageOption = { id: '6123', label: 'C23 (GCC 14.2.0)', family: 'c' };
	assert.strictEqual(resolveCompiler('atcoder', 'c', id, [option]), '6123');
	assert.strictEqual(resolveCompiler('atcoder', 'c', id, [{ ...option, label: 'C23 (GCC 15.0.0)' }]), undefined);
	assert.strictEqual(resolveCompiler('atcoder', 'c', id, [{ ...option, family: 'cpp' }]), undefined);
	assert.strictEqual(resolveCompiler('atcoder', 'c', id, [option, { ...option, id: '7123' }]), undefined);
	assert.strictEqual(resolveCompiler('atcoder', 'c', id, [{ ...option, id }]), undefined);
	assert.strictEqual(resolveCompiler('codeforces', 'c', id, [option]), undefined);
	assert.strictEqual(resolveCompiler('atcoder', 'c', '6123', [option]), '6123', 'an existing numeric preference remains authoritative');
});

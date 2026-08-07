/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import { DiagnosticStore } from '../src/diagnosticStore';

suite('diagnostic ownership store', () => {
	test('merges shared-header diagnostics from multiple translation units', () => {
		const store = new DiagnosticStore<string>();
		assert.deepStrictEqual([...store.replace('file:///a.cpp', new Map([
			['file:///a.cpp', ['a source']],
			['file:///shared.h', ['a header']]
		]))].sort(), ['file:///a.cpp', 'file:///shared.h']);
		store.replace('file:///b.cpp', new Map([['file:///shared.h', ['b header']]]));
		assert.deepStrictEqual(store.merged('file:///shared.h'), ['a header', 'b header']);

		assert.deepStrictEqual([...store.remove('file:///a.cpp')].sort(), ['file:///a.cpp', 'file:///shared.h']);
		assert.deepStrictEqual(store.merged('file:///shared.h'), ['b header']);
	});

	test('atomically replaces an owner and reports old and new affected URIs', () => {
		const store = new DiagnosticStore<number>();
		store.replace('owner', new Map([['old', [1]]]));
		assert.deepStrictEqual([...store.replace('owner', new Map([['new', [2]]]))].sort(), ['new', 'old']);
		assert.deepStrictEqual(store.merged('old'), []);
		assert.deepStrictEqual(store.merged('new'), [2]);
	});

	test('removes a deleted diagnostic URI from every translation-unit owner', () => {
		const store = new DiagnosticStore<string>();
		store.replace('a', new Map([['shared.h', ['from a']]]));
		store.replace('b', new Map([['shared.h', ['from b']]]));
		assert.deepStrictEqual([...store.removeUri('shared.h')], ['shared.h']);
		assert.deepStrictEqual(store.merged('shared.h'), []);
		assert.deepStrictEqual([...store.removeUri('missing.h')], []);
	});
});

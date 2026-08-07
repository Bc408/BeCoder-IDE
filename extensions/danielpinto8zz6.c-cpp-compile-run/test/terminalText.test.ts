/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import { nextGraphemeEnd, previousGraphemeStart, terminalCellWidth } from '../src/terminalText';

suite('Terminal text metrics', () => {
	test('matches terminal cells for ASCII, CJK, combining text, and emoji', () => {
		assert.strictEqual(terminalCellWidth('abc'), 3);
		assert.strictEqual(terminalCellWidth('\u4e2d\u6587'), 4);
		assert.strictEqual(terminalCellWidth('e\u0301'), 1);
		assert.strictEqual(terminalCellWidth('\u0301'), 0);
		assert.strictEqual(terminalCellWidth('\u200b'), 0);
		assert.strictEqual(terminalCellWidth('\ud83d\udc69\u200d\ud83d\udcbb'), 2);
		assert.strictEqual(terminalCellWidth('1\ufe0f\u20e3'), 2);
		assert.strictEqual(terminalCellWidth('\ud83c\udde8\ud83c\uddf3'), 2);
	});

	test('moves over a complete grapheme cluster', () => {
		const value = 'ae\u0301\ud83d\udc69\u200d\ud83d\udcbbb';
		assert.strictEqual(nextGraphemeEnd(value, 1), 3);
		assert.strictEqual(nextGraphemeEnd(value, 3), 8);
		assert.strictEqual(previousGraphemeStart(value, 8), 3);
		assert.strictEqual(previousGraphemeStart(value, 3), 1);
	});
});

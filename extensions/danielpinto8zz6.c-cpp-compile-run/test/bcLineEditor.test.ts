/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import { BcLineEditor, CommandHistory } from '../src/bcLineEditor';

suite('BC line editor', () => {
	test('edits at the cursor and clears only the current line with Esc', () => {
		const editor = new BcLineEditor(new CommandHistory());
		editor.handleInput('ac');
		editor.handleInput('\x1b[D');
		editor.handleInput('b');
		assert.strictEqual(editor.text, 'abc');
		assert.strictEqual(editor.cursorColumn, 2);
		editor.handleInput('\x7f');
		assert.strictEqual(editor.text, 'ac');
		assert.deepStrictEqual(editor.handleInput('\x1b'), []);
		assert.deepStrictEqual(editor.flushPendingEscape(), [{ kind: 'redraw' }]);
		assert.strictEqual(editor.text, '');
	});

	test('preserves Unicode code points while moving and deleting', () => {
		const editor = new BcLineEditor(new CommandHistory());
		editor.handleInput('a😀b');
		editor.handleInput('\x1b[D\x1b[D');
		editor.handleInput('\x1b[3~');
		assert.strictEqual(editor.text, 'ab');
	});

	test('moves and deletes complete grapheme clusters', () => {
		const editor = new BcLineEditor(new CommandHistory());
		editor.handleInput('e\u0301x');
		editor.handleInput('\x1b[D');
		editor.handleInput('\x7f');
		assert.strictEqual(editor.text, 'x');
		assert.strictEqual(editor.cursorColumn, 0);
	});

	test('browses process-local history and restores the draft', () => {
		const history = new CommandHistory();
		history.record('run first.cpp');
		history.record('run second.cpp -WithInput');
		const editor = new BcLineEditor(history);
		editor.handleInput('draft');
		editor.handleInput('\x1b[A');
		assert.strictEqual(editor.text, 'run second.cpp -WithInput');
		editor.handleInput('\x1b[A');
		assert.strictEqual(editor.text, 'run first.cpp');
		editor.handleInput('\x1b[B\x1b[B');
		assert.strictEqual(editor.text, 'draft');
	});

	test('submits and interrupts without recording rejected input', () => {
		const history = new CommandHistory();
		const editor = new BcLineEditor(history);
		editor.handleInput('run main.cpp');
		assert.deepStrictEqual(editor.handleInput('\r'), [{ kind: 'submit', value: 'run main.cpp' }]);
		assert.deepStrictEqual(history.values(), []);
		editor.handleInput('partial');
		assert.deepStrictEqual(editor.handleInput('\x03'), [{ kind: 'interrupt' }]);
		assert.strictEqual(editor.text, '');
	});

	test('treats CRLF as one submission and drops the rest of a busy paste', () => {
		const editor = new BcLineEditor(new CommandHistory());
		editor.handleInput('run main.cpp');
		assert.deepStrictEqual(editor.handleInput('\r\nrun stale.cpp'), [{ kind: 'submit', value: 'run main.cpp' }]);
		assert.strictEqual(editor.text, '');
	});

	test('reassembles a split navigation escape sequence', () => {
		const history = new CommandHistory();
		history.record('run main.cpp');
		const editor = new BcLineEditor(history);
		assert.deepStrictEqual(editor.handleInput('\x1b['), []);
		assert.deepStrictEqual(editor.handleInput('A'), [{ kind: 'redraw' }]);
		assert.strictEqual(editor.text, 'run main.cpp');
		const firstByteSplit = new BcLineEditor(history);
		assert.deepStrictEqual(firstByteSplit.handleInput('\x1b'), []);
		assert.deepStrictEqual(firstByteSplit.handleInput('[A'), [{ kind: 'redraw' }]);
		assert.strictEqual(firstByteSplit.text, 'run main.cpp');
	});
});

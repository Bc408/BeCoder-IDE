/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import { ProgramInputEditor, TerminalOpenTracker } from '../src/terminalInput';

suite('program terminal input', () => {
	test('erases a complete combining grapheme using its visible width', () => {
		const editor = new ProgramInputEditor();
		editor.handleInput('e\u0301');
		assert.deepStrictEqual(editor.handleInput('\x7f'), [{ kind: 'erase', width: 1 }]);
	});
	test('normalizes CRLF without sending an extra empty line', () => {
		const editor = new ProgramInputEditor();
		const actions = editor.handleInput('12\r\n34\n');
		assert.deepStrictEqual(actions.filter(action => action.kind === 'submit'), [
			{ kind: 'submit', value: '12\n' },
			{ kind: 'submit', value: '34\n' }
		]);
	});

	test('normalizes CRLF split across input events', () => {
		const editor = new ProgramInputEditor();
		assert.deepStrictEqual(editor.handleInput('12\r').at(-1), { kind: 'submit', value: '12\n' });
		assert.deepStrictEqual(editor.handleInput('\n34\r\n').filter(action => action.kind === 'submit'), [
			{ kind: 'submit', value: '34\n' }
		]);
	});

	test('reassembles and ignores split navigation sequences', () => {
		const editor = new ProgramInputEditor();
		assert.deepStrictEqual(editor.handleInput('\x1b['), []);
		assert.deepStrictEqual(editor.handleInput('A'), []);
		assert.deepStrictEqual(editor.handleInput('\x1b'), []);
		assert.deepStrictEqual(editor.handleInput('[A'), []);
		assert.deepStrictEqual(editor.handleInput('7'), [{ kind: 'echo', value: '7' }]);
	});

	test('Esc clears editing while Ctrl+C interrupts', () => {
		const editor = new ProgramInputEditor();
		editor.handleInput('测试');
		assert.deepStrictEqual(editor.handleInput('\x1b'), []);
		assert.deepStrictEqual(editor.flushPendingEscape(), [{ kind: 'erase', width: 4 }]);
		editor.handleInput('partial');
		assert.deepStrictEqual(editor.handleInput('\x03'), [{ kind: 'interrupt' }]);
	});
});

suite('terminal open tracker', () => {
	test('measures the first terminal open', async () => {
		const tracker = new TerminalOpenTracker();
		const result = tracker.wait(100);
		tracker.open(135);
		assert.strictEqual(await result, 35);
	});

	test('returns zero when reusing an open terminal', async () => {
		const tracker = new TerminalOpenTracker();
		tracker.open(135);
		assert.strictEqual(await tracker.wait(200), 0);
	});

	test('returns undefined when closed before the first open', async () => {
		const tracker = new TerminalOpenTracker();
		const result = tracker.wait(100);
		tracker.close();
		assert.strictEqual(await result, undefined);
	});
});

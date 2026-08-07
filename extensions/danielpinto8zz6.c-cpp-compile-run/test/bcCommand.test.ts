/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import { formatRunCommand, parseBcCommand, resolveCommandSource, tokenizeBcCommand } from '../src/bcCommand';

suite('BC command parser', () => {
	test('accepts only the closed command set', () => {
		assert.deepStrictEqual(parseBcCommand('run main.cpp'), {
			kind: 'command',
			command: { kind: 'run', source: 'main.cpp', withInput: false }
		});
		assert.deepStrictEqual(parseBcCommand('run \'template folder\\heap.cpp\' -WithInput'), {
			kind: 'command',
			command: { kind: 'run', source: 'template folder\\heap.cpp', withInput: true }
		});
		assert.deepStrictEqual(parseBcCommand('clear'), { kind: 'command', command: { kind: 'clear' } });
		assert.deepStrictEqual(parseBcCommand('help'), { kind: 'command', command: { kind: 'help' } });
		assert.deepStrictEqual(parseBcCommand(''), { kind: 'empty' });
	});

	test('rejects shell syntax and unsupported arguments', () => {
		for (const command of [
			'Get-ChildItem',
			'run main.cpp | more',
			'run main.cpp -O2',
			'run main.cpp -WithInput extra',
			'run \'unterminated'
		]) {
			assert.strictEqual(parseBcCommand(command).kind, 'error', command);
		}
	});

	test('formats quoted relative paths that round-trip through the parser', () => {
		const command = formatRunCommand('D:\\contest folder\\template folder\\heap.cpp', 'D:\\contest folder', true);
		assert.strictEqual(command, 'run \'template folder\\heap.cpp\' -WithInput');
		const parsed = parseBcCommand(command);
		assert.strictEqual(parsed.kind, 'command');
		if (parsed.kind === 'command' && parsed.command.kind === 'run') {
			assert.strictEqual(resolveCommandSource(parsed.command.source, 'D:\\contest folder'), 'D:\\contest folder\\template folder\\heap.cpp');
		}
	});

	test('returns source ranges from the parser-owned tokenizer', () => {
		assert.deepStrictEqual(tokenizeBcCommand('  run \'template folder\\heap.cpp\' -WithInput  '), {
			tokens: [
				{ value: 'run', start: 2, end: 5 },
				{ value: 'template folder\\heap.cpp', start: 6, end: 32 },
				{ value: '-WithInput', start: 33, end: 43 }
			],
			complete: true
		});
		assert.deepStrictEqual(tokenizeBcCommand('run \'unfinished'), {
			tokens: [
				{ value: 'run', start: 0, end: 3 },
				{ value: 'unfinished', start: 4, end: 15 }
			],
			complete: false
		});
	});
});

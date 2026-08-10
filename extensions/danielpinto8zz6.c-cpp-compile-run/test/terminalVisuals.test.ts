/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import { osc633CommandExecuted, osc633CommandFinished, osc633CommandStart, osc633PromptStart, Osc633Filter, renderBcCommand, renderBcFlowFailure, renderBcPrompt, renderBcStatus } from '../src/terminalVisuals';

suite('BC terminal visuals', () => {
	test('colors supported command parts and clearly invalid input', () => {
		const rendered = renderBcCommand('run \'this is a test.cpp\' -WithInput');
		assert.strictEqual(stripAnsi(rendered), 'run \'this is a test.cpp\' -WithInput');
		assert.match(rendered, /^\x1b\[93mrun\x1b\[0m /);
		assert.match(rendered, /\x1b\[97m'this is a test\.cpp'\x1b\[0m/);
		assert.match(rendered, /\x1b\[39m-WithInput\x1b\[0m/);
		assert.match(renderBcCommand('r'), /^\x1b\[93mr/);
		assert.match(renderBcCommand('run main.cpp -Wi'), /\x1b\[39m-Wi\x1b\[0m/);
		assert.match(renderBcCommand('Get-ChildItem'), /^\x1b\[91mGet-ChildItem/);
		assert.match(renderBcCommand('run main.cpp -O2'), /\x1b\[91m-O2\x1b\[0m/);
	});

	test('renders a PowerShell-like prompt and isolated status colors', () => {
		assert.strictEqual(renderBcPrompt('d:\\c++'), '\x1b[0mBC D:\\c++> ');
		assert.strictEqual(stripAnsi(renderBcPrompt('D:\\c++')), 'BC D:\\c++> ');
		assert.strictEqual(stripAnsi(renderBcPrompt('\\\\server\\share')), 'BC \\\\server\\share> ');
		assert.strictEqual(stripAnsi(renderBcPrompt('/workspace')), 'BC /workspace> ');
		assert.match(renderBcStatus('Run Complete', 'success'), /^\x1b\[92m===== Run Complete =====\x1b\[0m$/);
		assert.match(renderBcStatus('Executable Program Removed', 'success'), /^\x1b\[92m===== Executable Program Removed =====\x1b\[0m$/);
		assert.match(renderBcStatus('Runtime Error (exit code 7)', 'error'), /^\x1b\[91m===== Runtime Error \(exit code 7\) =====\x1b\[0m$/);
	});

	test('renders fixed Runner flow failures entirely in yellow and resets the color', () => {
		const failures = [
			['Unable to Start', 'Old .exe is in use, run cancelled, close it and retry'],
			['Compilation Failed', 'No executable remains, build artifacts removed'],
			['Executable Creation Failed', 'New .exe creation failed, build artifacts removed, no stale executable will run'],
			['Cleanup Failed', 'Could not remove .exe, close the related process and retry']
		] as const;
		for (const [title, description] of failures) {
			const rendered = renderBcFlowFailure(title, description);
			assert.strictEqual(rendered, `\x1b[93m===== ${title} =====\r\n${description}\x1b[0m`);
			assert.ok(rendered.endsWith('\x1b[0m'));
			assert.strictEqual(`${rendered}plain`, `\x1b[93m===== ${title} =====\r\n${description}\x1b[0mplain`);
		}
	});

	test('emits complete OSC 633 command lifecycle markers', () => {
		assert.strictEqual(osc633PromptStart(), '\x1b]633;A\x07');
		assert.strictEqual(osc633CommandStart(), '\x1b]633;B\x07');
		assert.strictEqual(
			osc633CommandExecuted('run folder\\main.cpp;next'),
			'\x1b]633;E;run\\x20folder\\\\main.cpp\\x3bnext\x07\x1b]633;C\x07');
		assert.strictEqual(
			osc633CommandExecuted('run \u009dmain.cpp'),
			'\x1b]633;E;run\\x20\\x9dmain.cpp\x07\x1b]633;C\x07');
		assert.strictEqual(osc633CommandFinished(7), '\x1b]633;D;7\x07');
		assert.strictEqual(osc633CommandFinished(), '\x1b]633;D\x07');
	});

	test('filters OSC 633 across chunks while preserving ordinary ANSI', () => {
		const filter = new Osc633Filter();
		assert.strictEqual(filter.write('before\x1b]63'), 'before');
		assert.strictEqual(filter.write('3;D;0\x07after'), 'after');
		assert.strictEqual(filter.write('\x1b'), '');
		assert.strictEqual(filter.write('[31merror\x1b[0m'), '\x1b[31merror\x1b[0m');
		assert.strictEqual(filter.write('\x1b\x1b]633;C\x1b\\safe'), 'safe');
		assert.strictEqual(filter.write('\u009d63'), '');
		assert.strictEqual(filter.write('3;D;0\u009csafe'), 'safe');
		assert.strictEqual(filter.write('\x1b\u009d633;D;0\u009c]633;D;0\x07safe'), ']633;D;0\x07safe');
		assert.strictEqual(filter.end(), '');

		const unterminated = new Osc633Filter();
		assert.strictEqual(unterminated.write('visible\x1b]633;E;spoofed'), 'visible');
		assert.strictEqual(unterminated.end(), '');
	});
});

function stripAnsi(value: string): string {
	return value.replace(/\x1b\[[0-9;]*m/g, '');
}

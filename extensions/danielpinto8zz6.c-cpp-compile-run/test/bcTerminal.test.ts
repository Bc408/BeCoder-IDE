/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter as NodeEventEmitter } from 'events';
import Module = require('module');
import { suite, test } from 'node:test';

import { CommandHistory } from '../src/bcLineEditor';
import { osc633CommandExecuted, osc633CommandFinished, osc633CommandStart, osc633PromptStart } from '../src/terminalVisuals';

class MockEventEmitter<T> extends NodeEventEmitter {
	readonly event = (listener: (value: T) => void): { dispose(): void } => {
		this.on('event', listener);
		return { dispose: () => this.off('event', listener) };
	};

	fire(value: T): void {
		this.emit('event', value);
	}

	dispose(): void {
		this.removeAllListeners();
	}
}

const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
const vscodeMock = { EventEmitter: MockEventEmitter };
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (request: unknown, ...args: unknown[]): unknown {
	return request === 'vscode' ? vscodeMock : originalLoad.call(this, request, ...args);
};
const { BcTerminal } = require('../src/bcTerminal') as typeof import('../src/bcTerminal');
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = originalLoad;

suite('BC pseudoterminal protocol', () => {
	test('does not insert blank lines for split ConPTY startup and trailing ANSI controls', () => {
		let output = '';
		const terminal = new BcTerminal('D:\\c++', new CommandHistory(), {
			phase: () => 'compiling', submit: () => undefined, cancel: () => undefined,
			programInput: () => false, busyAttempt: () => undefined, close: () => undefined
		});
		terminal.onDidWrite(text => output += text);
		terminal.open();
		terminal.echoCommand('run main.cpp -WithInput');
		for (const text of ['\x1b[', '6n', '\x1b]0;Runner', '\x1b', '\\', '\x1b[m', '\x1b[?25h']) {
			terminal.writeProcessOutput(text);
		}
		const startup = output;
		terminal.writeStatus('Compilation Successful, Running', 'success');
		assert.ok(output.slice(startup.length).startsWith('\x1b[92m'));
		terminal.writeProcessOutput('hello\r\n\r\n\x1b[');
		terminal.writeProcessOutput('0m');
		const completed = output;
		terminal.writeStatus('Run Complete', 'success');
		assert.ok(output.slice(completed.length).startsWith('\x1b[92m'));
		assert.ok(output.includes('hello\r\n\r\n'));
		terminal.writeProcessOutput('no-newline\x1b[0m');
		const partial = output;
		terminal.writeStatus('Run Complete', 'success');
		assert.ok(output.slice(partial.length).startsWith('\r\n\x1b[92m'));
		terminal.close();
	});

	test('accepts split cursor replies during WithInput startup but rejects keyboard input', () => {
		const replies: string[] = [];
		let inputs = 0;
		let cancellations = 0;
		const terminal = new BcTerminal('D:\\c++', new CommandHistory(), {
			phase: () => 'compiling', submit: () => undefined, cancel: () => cancellations++,
			programInput: () => { inputs++; return true; }, terminalResponse: text => replies.push(text),
			busyAttempt: () => undefined, close: () => undefined
		});
		terminal.setProgramInputEnabled(false);
		terminal.setPtyInput(true);
		terminal.handleInput('\x1b[');
		terminal.handleInput('12;');
		terminal.handleInput('1R');
		terminal.handleInput('123\r');
		terminal.handleInput('\x03');
		assert.deepStrictEqual(replies, ['\x1b[12;1R']);
		assert.strictEqual(inputs, 0);
		assert.strictEqual(cancellations, 1);
		terminal.close();
	});

	test('forwards PTY input without local echo and preserves the last valid size', () => {
		let output = '';
		let cancellations = 0;
		const input: string[] = [];
		const sizes: number[][] = [];
		const terminal = new BcTerminal('D:\\c++', new CommandHistory(), {
			phase: () => 'running', submit: () => undefined,
			cancel: () => cancellations++,
			programInput: text => { input.push(text); return true; },
			busyAttempt: () => undefined, close: () => undefined,
			resize: (cols, rows) => sizes.push([cols, rows])
		});
		terminal.onDidWrite(text => output += text);
		terminal.open({ columns: 100, rows: 30 });
		terminal.setPtyInput(true);
		terminal.handleInput('中文\r');
		terminal.handleInput('\x1b[D');
		terminal.handleInput('\x03');
		terminal.setDimensions({ columns: 0, rows: 0 });
		assert.deepStrictEqual(input, ['中文\r', '\x1b[D']);
		assert.strictEqual(output, '');
		assert.strictEqual(cancellations, 1);
		assert.deepStrictEqual(terminal.programDimensions, { cols: 100, rows: 30 });
		assert.deepStrictEqual(sizes, [[100, 30]]);
		terminal.setProgramInputEnabled(false);
		terminal.handleInput('ignored');
		assert.strictEqual(input.length, 2);
		terminal.close();
	});

	test('emits A/B before E/C on the first toolbar Run', () => {
		let output = '';
		const terminal = new BcTerminal('D:\\c++', new CommandHistory(), {
			phase: () => 'preparing',
			submit: () => undefined,
			cancel: () => undefined,
			programInput: () => false,
			busyAttempt: () => undefined,
			close: () => undefined
		});
		terminal.onDidWrite(value => output += value);
		terminal.open();
		assert.strictEqual(output, '');

		const command = 'run main.cpp';
		terminal.echoCommand(command);
		const promptStart = output.indexOf(osc633PromptStart());
		const commandStart = output.indexOf(osc633CommandStart());
		const commandExecuted = output.indexOf(osc633CommandExecuted(command));
		assert.ok(promptStart >= 0);
		assert.ok(commandStart > promptStart);
		assert.ok(commandExecuted > commandStart);

		terminal.finishCommand(0);
		const commandFinished = output.indexOf(osc633CommandFinished(0));
		assert.ok(commandFinished > commandExecuted);
		assert.ok(output.indexOf(osc633PromptStart(), commandFinished) > commandFinished);
		terminal.close();
	});

	test('routes Ctrl+C through cancellation and finishes it without a synthetic Ctrl+C line', () => {
		let output = '';
		let cancellationCount = 0;
		const terminal = new BcTerminal('d:\\c++', new CommandHistory(), {
			phase: () => 'running',
			submit: () => undefined,
			cancel: () => cancellationCount++,
			programInput: () => false,
			busyAttempt: () => undefined,
			close: () => undefined
		});
		terminal.onDidWrite(value => output += value);
		terminal.open();
		terminal.echoCommand('run main.cpp');
		terminal.handleInput('\x03');
		assert.strictEqual(cancellationCount, 1);
		assert.ok(!output.includes('^C'));
		terminal.finishCommand(1);

		assert.ok(output.includes(osc633CommandFinished(1)));
		assert.ok(output.includes('BC D:\\c++> '));
		terminal.close();
	});

	test('clears the visible screen and scrollback before showing the next prompt', () => {
		let output = '';
		const terminal = new BcTerminal('D:\\c++', new CommandHistory(), {
			phase: () => 'ready',
			submit: () => undefined,
			cancel: () => undefined,
			programInput: () => false,
			busyAttempt: () => undefined,
			close: () => undefined
		});
		terminal.onDidWrite(value => output += value);
		terminal.open();
		terminal.echoCommand('clear');
		terminal.clearScreen();
		terminal.finishCommand(0);

		assert.ok(output.includes('\x1b[2J\x1b[3J\x1b[H'));
		assert.ok(output.indexOf('\x1b[2J\x1b[3J\x1b[H') < output.lastIndexOf('BC D:\\c++> '));
		terminal.close();
	});

	test('runs a final presentation transaction only while the terminal is open', () => {
		let operationCount = 0;
		const terminal = new BcTerminal('D:\\c++', new CommandHistory(), {
			phase: () => 'ready',
			submit: () => undefined,
			cancel: () => undefined,
			programInput: () => false,
			busyAttempt: () => undefined,
			close: () => undefined
		});
		assert.strictEqual(terminal.performWhileOpen(() => operationCount++), true);
		terminal.close();
		assert.strictEqual(terminal.performWhileOpen(() => operationCount++), false);
		assert.strictEqual(operationCount, 1);
	});
});

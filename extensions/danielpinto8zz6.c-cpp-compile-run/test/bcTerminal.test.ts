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

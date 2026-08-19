/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter as NodeEventEmitter } from 'events';
import Module = require('module');
import { suite, test } from 'node:test';

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

class MockTerminalProfile {
	constructor(readonly options: unknown) { }
}

class MockTerminal {
	exitStatus: unknown;
	disposed = false;

	constructor(readonly creationOptions: unknown) { }

	dispose(): void {
		this.disposed = true;
	}

	show(): void { }
}

const opened = new MockEventEmitter<MockTerminal>();
const closed = new MockEventEmitter<MockTerminal>();
const activated = new MockEventEmitter<MockTerminal | undefined>();
const warnings: string[] = [];
const vscodeMock = {
	EventEmitter: MockEventEmitter,
	TerminalProfile: MockTerminalProfile,
	ThemeIcon: class { constructor(readonly id: string) { } },
	l10n: { t: (message: string) => message },
	window: {
		activeTextEditor: undefined as unknown,
		createOutputChannel: (): { appendLine(): void; dispose(): void } => ({ appendLine: () => undefined, dispose: () => undefined }),
		createTerminal: (options: unknown) => new MockTerminal(options),
		onDidOpenTerminal: opened.event,
		onDidCloseTerminal: closed.event,
		onDidChangeActiveTerminal: activated.event,
		showWarningMessage: (message: string) => {
			warnings.push(message);
			return Promise.resolve(undefined);
		},
		showErrorMessage: () => Promise.resolve(undefined)
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: 'D:\\workspace' } }],
		textDocuments: [] as unknown[],
		getConfiguration: (): { get(_key: string, fallback: unknown): unknown; inspect(): undefined } => ({ get: (_key: string, fallback: unknown) => fallback, inspect: () => undefined })
	}
};

const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (request: unknown, ...args: unknown[]): unknown {
	return request === 'vscode' ? vscodeMock : originalLoad.call(this, request, ...args);
};
const { CompileRunManager } = require('../src/compile-run-manager') as typeof import('../src/compile-run-manager');
const { BcTerminal } = require('../src/bcTerminal') as typeof import('../src/bcTerminal');
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = originalLoad;

suite('BC terminal profile lifecycle', () => {
	test('keeps independently created and split BC terminals alive and interactive', () => {
		const manager = createManager();
		try {
			const first = profileTerminal(manager);
			const second = profileTerminal(manager);
			const firstTerminal = open(first);
			const secondTerminal = open(second);

			assert.strictEqual(firstTerminal.disposed, false);
			assert.strictEqual(secondTerminal.disposed, false);
			assertClears(first);
			assertClears(second);
		} finally {
			manager.dispose();
		}
	});

	test('tracks rapid profile requests without losing the earlier pending terminal', () => {
		const manager = createManager();
		try {
			const first = profileTerminal(manager);
			const second = profileTerminal(manager);
			const secondTerminal = open(second);
			const firstTerminal = open(first);

			activated.fire(secondTerminal);
			closed.fire(firstTerminal);
			assert.strictEqual(secondTerminal.disposed, false);
			assertClears(second);
		} finally {
			manager.dispose();
		}
	});

	test('rejects input from another BC while one terminal owns the active request', () => {
		warnings.length = 0;
		const manager = createManager();
		try {
			const first = profileTerminal(manager);
			const second = profileTerminal(manager);
			open(first);
			open(second);
			const beginRequest = (manager as unknown as { beginRequest(terminal: InstanceType<typeof BcTerminal>): unknown }).beginRequest.bind(manager);
			assert.ok(beginRequest(first));

			second.handleInput('run main.cpp\r');
			assert.deepStrictEqual(warnings, ['BeCoder Runner is busy. Cancel the active request or wait for it to finish.']);
		} finally {
			manager.dispose();
		}
	});
});

function createManager(): InstanceType<typeof CompileRunManager> {
	return new CompileRunManager({
		globalStorageUri: { fsPath: 'D:\\storage' },
		extensionPath: 'D:\\extension'
	} as never);
}

function profileTerminal(manager: InstanceType<typeof CompileRunManager>): InstanceType<typeof BcTerminal> {
	const profile = manager.provideTerminalProfile() as unknown as { options: { pty: InstanceType<typeof BcTerminal> } };
	return profile.options.pty;
}

function open(pseudoterminal: InstanceType<typeof BcTerminal>): MockTerminal {
	const terminal = new MockTerminal({ pty: pseudoterminal });
	opened.fire(terminal);
	pseudoterminal.open();
	return terminal;
}

function assertClears(pseudoterminal: InstanceType<typeof BcTerminal>): void {
	let output = '';
	pseudoterminal.onDidWrite((value: string) => output += value);
	pseudoterminal.handleInput('clear\r');
	assert.ok(output.includes('\x1b[2J\x1b[3J\x1b[H'));
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { runInNewContext } from 'vm';
import { RunnerLifecycle } from '../src/runnerLifecycle';
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

for (const withInput of [false, true]) {
	test(`Runner ${withInput ? 'Run With Input' : 'Run'} rejects repeats through evidence retirement and unlocks with final output`, async () => {
		let releaseEvidence!: () => void; let evidenceRetiring!: () => void;
		const evidence = new Promise<void>(resolve => { releaseEvidence = resolve; });
		const retiring = new Promise<void>(resolve => { evidenceRetiring = resolve; });
		const statuses: string[] = []; let executions = 0; let rejected = 0; let runtimeEnds = 0;
		const source = { path: 'C:\\project\\main.cpp', executablePath: 'C:\\project\\main.exe', language: 'cpp' };
		const modulePath = path.resolve(__dirname, '../src/compile-run-manager.js');
		const originalRequire = createRequire(modulePath); const compiled = { exports: {} as any };
		const api = { workspace: {}, window: { activeTextEditor: { document: { fileName: source.path, uri: { fsPath: source.path } } } }, commands: { executeCommand: async (_command: string, operation: string) => {
			if (operation === 'beginRuntimeActivity') { return 'runtime'; }
			if (operation === 'beginActivity') { return 'evidence'; }
			if (operation === 'endActivity') { evidenceRetiring(); await evidence; }
			if (operation === 'endRuntimeActivity') { runtimeEnds++; }
			return undefined;
		} }, l10n: { t: (text: string) => text } };
		runInNewContext(fs.readFileSync(modulePath, 'utf8'), { exports: compiled.exports, require: (name: string) => {
			if (name === 'vscode') { return api; }
			if (name === './compiler') { return { prepareActiveSource: async () => ({ source, saveMs: 0 }), exactInputPath: async () => 'input', bundledCompiler: () => 'g++', runnerSettings: () => ({}) }; }
			if (name === './runnerProcess') { return { finalizePublishedExecutable: (result: unknown) => result }; }
			if (name === './runnerPresentation') { return { presentRunnerResult: () => ({ outcome: 'run-complete', exitCode: 0, showExecutableRemoved: true }) }; }
			if (name === './bcTerminal') { return {}; }
			return originalRequire(name);
		} });
		const manager = Object.create(compiled.exports.CompileRunManager.prototype);
		const terminal = { cwd: 'C:\\project', waitForOpen: async () => 0, echoCommand() {}, setPhase() {}, setProgramInputEnabled() {}, setPtyInput() {}, finishCommand() {}, performWhileOpen: (run: () => void) => { run(); return true; }, writeStatus: (status: string) => {
			statuses.push(status);
			if (status === 'Executable Program Removed') { assert.equal(manager.lifecycle.busy, false); assert.equal(runtimeEnds, executions); }
		} };
		Object.assign(manager, { context: { extensionPath: '' }, history: { record() {} }, lifecycle: new RunnerLifecycle(), terminals: new Map([[terminal, {}]]), trace: { warn() {} }, executor: { execute: async () => { executions++; return { status: 'completed' }; } }, ensureTerminal: () => ({ terminal: { show() {} }, pseudoterminal: terminal }), traceResult() {}, rejectBusy: () => { rejected++; } });
		const first = manager.run(withInput); await retiring;
		assert.equal(statuses.includes('Executable Program Removed'), false);
		await Promise.all([manager.run(false), manager.run(true), manager.run(false)]);
		assert.equal(rejected, 3); assert.equal(executions, 1);
		releaseEvidence(); await first;
		assert.equal(statuses.at(-1), 'Executable Program Removed');
		await manager.run(withInput); assert.equal(executions, 2); assert.equal(rejected, 3);
		// Release failures, including an unavailable log channel, must still retire the local request.
		manager.endRuntimeActivity = async () => { runtimeEnds++; throw new Error('release tracking failed'); };
		await assert.rejects(manager.run(withInput), /release tracking failed/);
		assert.equal(manager.lifecycle.busy, false);
		manager.endRuntimeActivity = async () => { runtimeEnds++; };
		manager.executor.execute = async () => { manager.activeRequest.cancelled = true; return { status: 'cancelled' }; };
		const beforeCancellation = statuses.length;
		await manager.run(withInput);
		assert.equal(statuses.length, beforeCancellation);
		assert.equal(manager.lifecycle.busy, false);
		manager.executor.execute = async () => { throw new Error('execution failed'); };
		manager.handleRequestError = () => { };
		await manager.run(withInput);
		assert.equal(manager.lifecycle.busy, false);
		assert.equal(statuses.length, beforeCancellation);
	});
}

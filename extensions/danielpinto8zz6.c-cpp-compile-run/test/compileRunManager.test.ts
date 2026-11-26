/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRequire } from 'module';
import { runInNewContext } from 'vm';
import { RunnerLifecycle } from '../src/runnerLifecycle';
import { safeExecutionObserver } from '../src/executionResults';
import { captureCompilationSource } from '../src/compilationSnapshot';
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
		const originalRequire = createRequire(modulePath); const compiled = { exports: {} as typeof import('../src/compile-run-manager') };
		const api = {
			workspace: {}, window: { activeTextEditor: { document: { fileName: source.path, uri: { fsPath: source.path } } } }, commands: {
				executeCommand: async (_command: string, operation: string) => {
					if (operation === 'beginRuntimeActivity') { return 'runtime'; }
					if (operation === 'beginActivity') { return 'evidence'; }
					if (operation === 'endActivity') { evidenceRetiring(); await evidence; }
					if (operation === 'endRuntimeActivity') { runtimeEnds++; }
					return undefined;
				}
			}, l10n: { t: (text: string) => text }
		};
		runInNewContext(fs.readFileSync(modulePath, 'utf8'), {
			exports: compiled.exports, require: (name: string) => {
				if (name === 'vscode') { return api; }
				if (name === './compiler') { return { prepareActiveSource: async () => ({ source, saveMs: 0 }), exactInputPath: async () => 'input', bundledCompiler: () => 'g++', runnerSettings: () => ({}) }; }
				if (name === './runnerProcess') { return { finalizePublishedExecutable: (result: unknown) => result }; }
				if (name === './runnerPresentation') { return { presentRunnerResult: () => ({ outcome: 'run-complete', exitCode: 0, showExecutableRemoved: true }) }; }
				if (name === './bcTerminal') { return {}; }
				return originalRequire(name);
			}
		});
		const manager = Object.create(compiled.exports.CompileRunManager.prototype);
		const terminal = {
			cwd: 'C:\\project', waitForOpen: async () => 0, echoCommand() { }, setPhase() { }, setProgramInputEnabled() { }, setPtyInput() { }, finishCommand() { }, performWhileOpen: (run: () => void) => { run(); return true; }, writeStatus: (status: string) => {
				statuses.push(status);
				if (status === 'Executable Program Removed') { assert.equal(manager.lifecycle.busy, false); assert.equal(runtimeEnds, executions); }
			}
		};
		Object.assign(manager, { context: { extensionPath: '' }, history: { record() { } }, lifecycle: new RunnerLifecycle(), terminals: new Map([[terminal, {}]]), trace: { warn() { } }, executor: { execute: async () => { executions++; return { status: 'completed' }; } }, ensureTerminal: () => ({ terminal: { show() { } }, pseudoterminal: terminal }), traceResult() { }, rejectBusy: () => { rejected++; } });
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

function evidenceManager(execute: (observer: ReturnType<typeof safeExecutionObserver>, setPhase: (phase: 'running') => void) => void, collect = true, language = 'en') {
	const warnings: string[] = [];
	const errors: string[] = [];
	const operations: { operation: string; input: any }[] = [];
	let publish: (input: any) => Promise<unknown> = async () => 'record-id';
	let registrationFailure: string | undefined;
	const source = { path: 'C:\\project\\main.cpp', executablePath: 'C:\\project\\main.exe', language: 'cpp' };
	const entry = path.resolve(__dirname, '../src/compile-run-manager.js');
	const nativeRequire = createRequire(entry);
	const compiled = { exports: {} as typeof import('../src/compile-run-manager') };
	const translations = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../l10n/bundle.l10n.zh-cn.json'), 'utf8')) as Record<string, string>;
	const api = {
		workspace: {}, window: {
			activeTextEditor: { document: { fileName: source.path, uri: { fsPath: source.path } } },
			showWarningMessage: async (message: string) => { warnings.push(message); },
			showErrorMessage: async (message: string) => { errors.push(message); }
		}, commands: {
			executeCommand: async (_command: string, operation: string, input: unknown) => {
				operations.push({ operation, input });
				if (operation === registrationFailure) { throw new Error('registration unavailable'); }
				if (operation === 'captureCollectionScope') { return collect ? { slot: 'chosen', root: 'C:\\project', workspaceIdentity: 'root', rootSelectionEpoch: 1 } : undefined; }
				if (operation === 'beginRuntimeActivity') { return 'runtime'; }
				if (operation === 'beginActivity') { return collect ? 'activity' : undefined; }
				if (operation === 'captureRun') { return publish(input); }
				return undefined;
			}
		}, l10n: { t: (message: string) => language === 'zh-cn' ? translations[message] ?? message : message }
	};
	runInNewContext(fs.readFileSync(entry, 'utf8'), {
		exports: compiled.exports, require: (name: string) => {
			if (name === 'vscode') { return api; }
			if (name === './compiler') { return { prepareActiveSource: async () => ({ source, saveMs: 0 }), exactInputPath: async () => 'input', bundledCompiler: () => 'g++', runnerSettings: () => ({}) }; }
			if (name === './runnerProcess') { return { finalizePublishedExecutable: (result: unknown) => result }; }
			if (name === './runnerPresentation') { return { presentRunnerResult: () => ({ outcome: 'run-complete', exitCode: 0, showExecutableRemoved: true }) }; }
			if (name === './bcTerminal') { return {}; }
			return nativeRequire(name);
		}
	});
	const manager = Object.create(compiled.exports.CompileRunManager.prototype);
	const terminal = { cwd: 'C:\\project', programDimensions: { cols: 80, rows: 24 }, waitForOpen: async () => 0, echoCommand() { }, setPhase() { }, setProgramInputEnabled() { }, setPtyInput() { }, finishCommand() { }, writeError() { }, writeStatus() { }, performWhileOpen: (run: () => void) => { run(); return true; } };
	Object.assign(manager, {
		context: { extensionPath: '' }, history: { record() { } }, lifecycle: new RunnerLifecycle(), terminals: new Map([[terminal, {}]]), trace: { warn() { } },
		executor: { resizeProgram() { }, execute: async (_request: unknown, callbacks: any) => { execute(safeExecutionObserver(callbacks.evidence), callbacks.setPhase); return { status: 'completed' }; } },
		ensureTerminal: () => ({ terminal: { show() { } }, pseudoterminal: terminal }), traceResult() { }
	});
	return { manager, warnings, errors, operations, setPublication: (callback: typeof publish) => { publish = callback; }, failRegistration: (operation: string) => { registrationFailure = operation; } };
}

const evidenceSnapshot = { originalPath: 'C:\\project\\main.cpp', canonicalPath: 'C:\\project\\main.cpp', path: 'C:\\private\\main.cpp', capturedAt: 1, bytesBase64: Buffer.from('int main(){}').toString('base64'), byteLength: 12, sha256: 'hash' };

for (const [phase, error, expected] of [
	['start', 'adapter start failed', 'Beacon could not save this run evidence. Program execution is unaffected.'],
	['event', 'adapter event failed', 'Beacon could not save this run evidence. Program execution is unaffected.'],
	['publication', 'Error: beacon-run-record-too-large', 'This run record exceeds 32 KB and was not saved to Beacon context. Program execution is unaffected.'],
	['publication', 'Error: beacon-record-publication-uncertain', 'Beacon could not confirm whether this run record was saved. Program execution is unaffected.'],
	['publication', 'disk failed', 'Beacon could not save this run evidence. Program execution is unaffected.']
]) {
	test(`Runner ${phase} ${error} produces one warning and preserves execution`, async () => {
		const failure = new Error(error);
		const { manager, warnings, errors, setPublication } = evidenceManager(observer => {
			observer!.start(evidenceSnapshot, phase === 'start' ? { get input(): never { throw failure; } } : {});
			observer!.event(phase === 'event' ? { get type(): never { throw failure; } } : { type: 'compiled', exitCode: 0 });
			observer!.finish({ status: 'completed', exitCode: 0 });
			observer!.finish({ status: 'completed', exitCode: 0 });
		});
		setPublication(async () => { throw failure; });
		await manager.run(false);
		assert.equal(warnings.length, 1);
		assert.equal(warnings[0], `Runner: ${expected}`);
		assert.deepStrictEqual(errors, []);
		assert.equal(manager.lifecycle.busy, false);
	});
}

test('Runner retires and accepts another run while the first evidence publication is pending', async () => {
	let complete!: () => void;
	const publication = new Promise<void>(resolve => { complete = resolve; });
	const { manager, operations, warnings, setPublication } = evidenceManager(observer => {
		observer!.start(evidenceSnapshot, {});
		observer!.event({ type: 'compiled', exitCode: 0 });
		observer!.finish({ status: 'completed', exitCode: 0 });
	});
	let publications = 0;
	setPublication(async () => { if (++publications === 1) { await publication; } return 'record-id'; });
	await manager.run(false);
	assert.equal(manager.lifecycle.busy, false);
	assert.equal(operations.filter(item => item.operation === 'endRuntimeActivity').length, 1);
	await manager.run(true);
	assert.equal(publications, 2, 'the second run must execute without queueing behind evidence');
	assert.deepStrictEqual(warnings, []);
	complete(); await publication;
});

test('Runner does not report an intentional no-root or outside-root exclusion', async () => {
	const { manager, warnings, operations } = evidenceManager(observer => {
		observer!.start(evidenceSnapshot, { get input(): never { throw new Error('excluded metadata must not be adapted'); } });
		observer!.finish({ status: 'completed' });
	}, false);
	await manager.run(false);
	assert.deepStrictEqual(warnings, []);
	assert.equal(operations.some(item => item.operation === 'captureRun'), false);
});

for (const operation of ['captureCollectionScope', 'beginActivity']) {
	test(`Runner ${operation} registration failure warns once and preserves both Run actions`, async () => {
		let executions = 0;
		const { manager, warnings, operations, errors, failRegistration } = evidenceManager(observer => {
			executions++; observer!.start(evidenceSnapshot, {}); observer!.finish({ status: 'completed', exitCode: 0 });
		});
		failRegistration(operation);
		for (const withInput of [false, true]) {
			await manager.run(withInput);
			assert.equal(manager.lifecycle.busy, false);
		}
		assert.equal(executions, 2);
		assert.deepStrictEqual(warnings, [
			'Runner: Beacon could not save this run evidence. Program execution is unaffected.',
			'Runner: Beacon could not save this run evidence. Program execution is unaffected.'
		]);
		assert.deepStrictEqual(errors, []); assert.equal(operations.some(item => item.operation === 'captureRun'), false);
	});
}

test('Runner reports publication uncertainty in Chinese without claiming the record was not saved', async () => {
	const { manager, warnings, setPublication } = evidenceManager(observer => {
		observer!.start(evidenceSnapshot, {});
		observer!.finish({ status: 'compile-error' });
	}, true, 'zh-cn');
	setPublication(async () => { throw new Error('beacon-record-publication-uncertain'); });
	await manager.run(false);
	assert.deepStrictEqual(warnings, ['Runner: 无法确认本次运行记录是否已保存至 Beacon，程序运行不受影响。']);
});

test('Runner manager reports the actual PTY started phase before cancellation evidence is finalized', async () => {
	const { manager, operations } = evidenceManager((observer, setPhase) => {
		observer!.start(evidenceSnapshot, {}); observer!.event({ type: 'compiled', exitCode: 0 });
		setPhase('running');
		observer!.finish({ status: 'cancelled' });
	});
	await manager.run(false);
	const record = operations.find(item => item.operation === 'captureRun')?.input.record;
	assert.equal(record.runs[0].status, 'cancelled');
	assert.equal(record.runs[0].skipReason, undefined);
});

for (const barrier of ['beginRuntimeActivity', 'beginActivity']) {
	for (const withInput of [false, true]) {
		test(`Runner keeps the click-time source across ${barrier} for ${withInput ? 'Run With Input' : 'Run'}`, async t => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-click-source-'));
			t.after(() => fs.rmSync(root, { recursive: true, force: true }));
			const a = path.join(root, 'a.cpp'), b = path.join(root, 'b.cpp');
			fs.writeFileSync(a, '// saved A'); fs.writeFileSync(b, '// saved B'); fs.writeFileSync(path.join(root, 'input'), '1\n');
			const saves: string[] = [], executed: string[] = [], records: any[] = [], warnings: string[] = [];
			const document = (fileName: string, text: string) => ({
				fileName, uri: { fsPath: fileName }, languageId: 'cpp', isUntitled: false, isDirty: true,
				save: async () => { saves.push(fileName); fs.writeFileSync(fileName, text); return true; }
			});
			const sourceA = document(a, '// dirty A'), sourceB = document(b, '// dirty B');
			let entered!: () => void, release!: () => void, activitySource: string | undefined;
			const blocked = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
			t.after(release);
			const api = {
				workspace: {}, window: {
					activeTextEditor: { document: sourceA },
					showWarningMessage: async (message: string) => { warnings.push(message); }, showErrorMessage: async (message: string) => { assert.fail(message); }
				},
				l10n: { t: (message: string) => message }, commands: {
					executeCommand: async (_command: string, operation: string, input: any) => {
						if (operation === barrier) { entered(); await gate; }
						if (operation === 'beginRuntimeActivity') { return 'runtime'; }
						if (operation === 'beginActivity') { activitySource = input.source; return 'activity'; }
						if (operation === 'captureRun') { if (input.record.program.filePath !== activitySource) { throw new Error('beacon-invalid-activity'); } records.push(input.record); }
						return undefined;
					}
				}
			};
			const entry = path.resolve(__dirname, '../src/compile-run-manager.js'), nativeRequire = createRequire(entry);
			const compiler = { exports: {} as typeof import('../src/compiler') }, compiled = { exports: {} as typeof import('../src/compile-run-manager') };
			runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/compiler.js'), 'utf8'), { exports: compiler.exports, require: (name: string) => name === 'vscode' ? api : nativeRequire(name) });
			runInNewContext(fs.readFileSync(entry, 'utf8'), {
				exports: compiled.exports, require: (name: string) => {
					if (name === 'vscode') { return api; }
					if (name === './compiler') { return { ...compiler.exports, bundledCompiler: () => 'g++', runnerSettings: () => ({}) }; }
					if (name === './runnerProcess') { return { finalizePublishedExecutable: (result: unknown) => result }; }
					if (name === './runnerPresentation') { return { presentRunnerResult: () => ({ outcome: 'run-complete', exitCode: 0 }) }; }
					if (name === './bcTerminal') { return {}; }
					return nativeRequire(name);
				}
			});
			const terminal = { cwd: root, programDimensions: { cols: 80, rows: 24 }, waitForOpen: async () => 0, echoCommand() { }, setPhase() { }, setProgramInputEnabled() { }, setPtyInput() { }, finishCommand() { }, writeError() { }, writeStatus() { }, performWhileOpen: (run: () => void) => { run(); return true; } };
			const manager = Object.create(compiled.exports.CompileRunManager.prototype);
			Object.assign(manager, {
				context: { extensionPath: '' }, history: { record() { } }, lifecycle: new RunnerLifecycle(), terminals: new Map([[terminal, {}]]), trace: { warn() { } },
				executor: {
					resizeProgram() { }, execute: async (request: any, callbacks: any) => {
						executed.push(request.source.path);
						const evidence = safeExecutionObserver(callbacks.evidence)!;
						evidence.start(await captureCompilationSource(request.source.path, root), {}); evidence.event({ type: 'compiled', exitCode: 0 });
						callbacks.setPhase('running'); evidence.finish({ status: 'completed', exitCode: 0 });
						return { status: 'completed' };
					}
				}, ensureTerminal: () => ({ terminal: { show() { } }, pseudoterminal: terminal }), traceResult() { }
			});
			const running = manager.run(withInput); await blocked;
			api.window.activeTextEditor = { document: sourceB }; release(); await running;
			assert.deepStrictEqual(executed, [a], 'switching editors must not retarget the clicked Run');
			assert.deepStrictEqual(saves, [a], 'only the clicked dirty document is saved');
			assert.equal(activitySource, a); assert.equal(records.length, 1); assert.equal(records[0].program.filePath, a);
			assert.equal(records[0].program.code, '// dirty A'); assert.equal(fs.readFileSync(b, 'utf8'), '// saved B');
			assert.deepStrictEqual(warnings, []); assert.equal(manager.lifecycle.busy, false);
		});
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EventEmitter } from 'events';
import test, { mock } from 'node:test';
import type { IPty } from 'node-pty';

import { RunnerPtyProcess, type RunnerPtyProcessDependencies } from '../src/runnerPtyProcess';

class FakePty {
	readonly writes: string[] = [];
	readonly resizes: Array<[number, number]> = [];
	killCount = 0;
	private readonly dataListeners: Array<(data: string) => void> = [];
	private readonly exitListeners: Array<(exit: { exitCode: number; signal?: number }) => void> = [];

	onData(listener: (data: string) => void): { dispose: () => void } {
		this.dataListeners.push(listener);
		return { dispose: () => this.dataListeners.splice(this.dataListeners.indexOf(listener), 1) };
	}

	onExit(listener: (exit: { exitCode: number; signal?: number }) => void): { dispose: () => void } {
		this.exitListeners.push(listener);
		return { dispose: () => this.exitListeners.splice(this.exitListeners.indexOf(listener), 1) };
	}

	write(data: string): void { this.writes.push(data); }
	resize(cols: number, rows: number): void { this.resizes.push([cols, rows]); }
	kill(): void { this.killCount++; }

	emitData(data: string): void { for (const listener of this.dataListeners) { listener(data); } }
	emitExit(exitCode: number): void { for (const listener of this.exitListeners) { listener({ exitCode }); } }
}

function dependencies(fake: FakePty): RunnerPtyProcessDependencies {
	return { spawn: (() => fake) as unknown as RunnerPtyProcessDependencies['spawn'] };
}

test('releases queued operations when ConPTY connects before producing output', { skip: process.platform !== 'win32' }, () => {
	class SilentConpty extends FakePty {
		readonly _socket = new EventEmitter();
		_isReady = false;
		_deferreds: Array<{ run(): void }> = [];

		override write(data: string): void {
			if (this._isReady) {
				super.write(data);
			} else {
				this._deferreds.push({ run: () => this.write(data) });
			}
		}

		override resize(cols: number, rows: number): void {
			if (this._isReady) {
				super.resize(cols, rows);
			} else {
				this._deferreds.push({ run: () => this.resize(cols, rows) });
			}
		}

		override kill(): void {
			if (this._isReady) {
				super.kill();
			} else {
				this._deferreds.push({ run: () => this.kill() });
			}
		}
	}

	const fake = new SilentConpty();
	const ptyModule: typeof import('node-pty') = require('node-pty');
	const mockedSpawn = mock.method(ptyModule, 'spawn', () => fake as unknown as IPty);
	let runner: RunnerPtyProcess | undefined;
	try {
		runner = new RunnerPtyProcess({ file: 'program.exe', args: [], cwd: '.', env: {}, cols: 80, rows: 24 }, {
			onData: () => assert.fail('This program has not produced output'),
			onExit: () => undefined
		});
		assert.strictEqual(runner.write('input\n'), true);
		assert.strictEqual(runner.resize(100, 30), true);
		assert.strictEqual(runner.kill(), true);
		assert.deepStrictEqual(fake.writes, []);
		assert.deepStrictEqual(fake.resizes, []);
		assert.strictEqual(fake.killCount, 0);
		assert.strictEqual(fake._deferreds.length, 3);

		fake._socket.emit('ready_datapipe');
		fake._socket.emit('ready_datapipe');
		assert.deepStrictEqual(fake.writes, ['input\n']);
		assert.deepStrictEqual(fake.resizes, [[100, 30]]);
		assert.strictEqual(fake.killCount, 1);
		assert.deepStrictEqual(fake._deferreds, []);
	} finally {
		runner?.dispose();
		mockedSpawn.mock.restore();
	}
});

test('forwards one PTY data stream without reordering', () => {
	const fake = new FakePty();
	const output: string[] = [];
	const process = new RunnerPtyProcess({ file: 'program.exe', args: [], cwd: '.', env: { TERM: 'xterm-256color', NO_COLOR: '1' }, cols: 80, rows: 24 }, {
		onData: data => output.push(data),
		onExit: () => undefined
	}, dependencies(fake));

	fake.emitData('cout-1');
	fake.emitData('cerr-1');
	fake.emitData('cout-2');

	assert.deepStrictEqual(output, ['cout-1', 'cerr-1', 'cout-2']);
	assert.strictEqual(process.write('input\n'), true);
	assert.deepStrictEqual(fake.writes, ['input\n']);
	process.dispose();
});

test('validates dimensions and disposes the PTY exactly once', () => {
	const fake = new FakePty();
	let exitCode: number | undefined;
	const process = new RunnerPtyProcess({ file: 'program.exe', args: [], cwd: '.', env: { TERM: 'xterm-256color' }, cols: 80, rows: 24 }, {
		onData: () => undefined,
		onExit: exit => exitCode = exit.exitCode
	}, dependencies(fake));

	assert.strictEqual(process.resize(0, 24), false);
	assert.strictEqual(process.resize(100, 30), true);
	assert.deepStrictEqual(fake.resizes, [[100, 30]]);
	fake.emitExit(7);
	assert.strictEqual(exitCode, 7);
	assert.strictEqual(process.write('late'), false);
	assert.strictEqual(process.kill(), false);
	process.dispose();
	process.dispose();
	assert.strictEqual(fake.killCount, 1);
});

test('kills an active PTY when disposed before exit', () => {
	const fake = new FakePty();
	const process = new RunnerPtyProcess({ file: 'program.exe', args: [], cwd: '.', env: { TERM: 'xterm-256color' }, cols: 80, rows: 24 }, {
		onData: () => undefined,
		onExit: () => undefined
	}, dependencies(fake));

	process.dispose();
	assert.strictEqual(fake.killCount, 1);
});

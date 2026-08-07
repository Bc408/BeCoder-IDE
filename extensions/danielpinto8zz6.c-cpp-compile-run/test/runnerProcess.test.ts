/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { suite, test } from 'node:test';

import type { BeCoderSource, RunnerSettings } from '../src/compiler';
import { buildCompilerArguments, privateRunnerEnvironment, RunnerExecutor } from '../src/runnerProcess';

const settings: RunnerSettings = {
	cStandard: 'c17',
	cppStandard: 'c++20',
	cFlags: ['-O2', '-Wall', '-DDEBUG'],
	cppFlags: ['-O2', '-Wall', '-DDEBUG'],
	cleanupExecutable: true
};

suite('Runner process boundary', () => {
	test('builds the fixed compiler command and rejects path or linker controls', () => {
		const source = sourceAt('D:\\contest\\main.cpp');
		assert.deepStrictEqual(buildCompilerArguments(source, settings, 'D:\\contest\\main.exe'), [
			'-O2', '-Wall', '-DDEBUG', '-std=c++20',
			'-finput-charset=UTF-8', '-fexec-charset=UTF-8', '-fdiagnostics-color=always',
			'D:\\contest\\main.cpp', '-o', 'D:\\contest\\main.exe'
		]);
		for (const flag of ['-Ioutside', '-Loutside', '-luser32', '-Wl,--subsystem,windows', '-fplugin=x.dll', '@options.txt']) {
			assert.throws(() => buildCompilerArguments(source, { ...settings, cppFlags: [flag] }, 'D:\\contest\\main.exe'));
		}
		assert.deepStrictEqual(buildCompilerArguments(source, { ...settings, cppFlags: [] }, 'D:\\contest\\main.exe').slice(0, 3), [
			'-O2', '-Wall', '-DDEBUG'
		]);
		for (const flag of ['-O0', '-O3', '-Ofast', '-UDEBUG', '-DDEBUG=0', '-Wno-all']) {
			assert.throws(() => buildCompilerArguments(source, { ...settings, cppFlags: [flag] }, 'D:\\contest\\main.exe'));
		}
	});

	test('creates a private allowlisted environment', () => {
		const environment = privateRunnerEnvironment('C:\\BeCoder\\runner', 'C:\\BeCoder\\toolchain\\bin\\g++.exe');
		assert.strictEqual(environment['HOME'], 'C:\\BeCoder\\runner\\user');
		assert.strictEqual(environment['TEMP'], 'C:\\BeCoder\\runner\\tmp');
		assert.ok(environment['PATH'].startsWith('C:\\BeCoder\\toolchain\\bin' + path.delimiter));
		for (const name of ['CLANGD_FLAGS', 'GCC_EXEC_PREFIX', 'COMPILER_PATH', 'CPATH', 'CPLUS_INCLUDE_PATH', 'LIBRARY_PATH']) {
			assert.strictEqual(environment[name], undefined);
		}
	});

	test('does not accept a replacement request until cancellation fully retires the child', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			const source = sourceAt(sourcePath);
			let activeProgram: FakeChild | undefined;
			let holdProgram = true;
			let programSpawned!: () => void;
			const reachedProgramSpawn = new Promise<void>(resolve => programSpawned = resolve);
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					if (arguments_.length > 0) {
						const outputPath = arguments_[arguments_.indexOf('-o') + 1];
						fs.writeFileSync(outputPath, 'fake executable');
						child.close(0);
					} else if (holdProgram) {
						activeProgram = child;
						programSpawned();
					} else {
						child.close(0);
					}
				});
				return child as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
			const executor = new RunnerExecutor(path.join(root, 'sessions'), {
				spawn: fakeSpawn,
				terminate: async () => undefined
			});
			let running!: () => void;
			let acceptedAtRunning = false;
			const reachedRunning = new Promise<void>(resolve => running = resolve);
			const first = executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: phase => {
					if (phase === 'running') {
						acceptedAtRunning = executor.writeProgramInput('7\n');
						running();
					}
				}
			});
			await reachedRunning;
			await reachedProgramSpawn;
			assert.ok(activeProgram);
			assert.strictEqual(acceptedAtRunning, true);
			assert.strictEqual(await executor.cancel(), true);
			await assert.rejects(executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			}), /only one active request/);
			activeProgram.close(1);
			const cancelled = await first;
			assert.strictEqual(cancelled.status, 'cancelled');
			assert.ok(cancelled.timings.compileMs >= 0);
			assert.ok(cancelled.timings.compileToRunStartMs !== undefined);
			assert.ok(cancelled.timings.totalMs >= cancelled.timings.cleanupMs);

			holdProgram = false;
			const replacement = await executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});
			assert.strictEqual(replacement.status, 'completed');
			assert.strictEqual(fs.existsSync(source.executablePath), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('classifies a non-zero program exit as a runtime error and removes the executable', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-runtime-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			const source = sourceAt(sourcePath);
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					if (arguments_.length > 0) {
						const outputPath = arguments_[arguments_.indexOf('-o') + 1];
						fs.writeFileSync(outputPath, 'fake executable');
						child.close(0);
					} else {
						child.close(7);
					}
				});
				return child as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
			const executor = new RunnerExecutor(path.join(root, 'sessions'), {
				spawn: fakeSpawn,
				terminate: async () => undefined
			});
			const result = await executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});
			assert.strictEqual(result.status, 'runtime-error');
			assert.strictEqual(result.exitCode, 7);
			assert.strictEqual(result.executableRemoved, true);
			assert.strictEqual(fs.existsSync(source.executablePath), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('treats a zero compiler exit without an executable as a runner error', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-missing-output-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			const fakeSpawn = ((_file: string) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					child.close(0);
				});
				return child as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
			const executor = new RunnerExecutor(path.join(root, 'sessions'), {
				spawn: fakeSpawn,
				terminate: async () => undefined
			});
			const result = await executor.execute(requestFor(sourceAt(sourcePath), compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});
			assert.strictEqual(result.status, 'runner-error');
			assert.strictEqual(result.exitCode, 1);
			assert.match(result.message ?? '', /did not produce an executable/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('does not announce running when cancellation wins before program spawn', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-spawn-cancel-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			let programChild!: FakeChild;
			let programCreated!: () => void;
			const reachedProgramCreation = new Promise<void>(resolve => programCreated = resolve);
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				if (arguments_.length > 0) {
					process.nextTick(() => {
						child.emit('spawn');
						const outputPath = arguments_[arguments_.indexOf('-o') + 1];
						fs.writeFileSync(outputPath, 'fake executable');
						child.close(0);
					});
				} else {
					programChild = child;
					process.nextTick(programCreated);
				}
				return child as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
			const executor = new RunnerExecutor(path.join(root, 'sessions'), {
				spawn: fakeSpawn,
				terminate: async () => undefined
			});
			const phases: string[] = [];
			const execution = executor.execute(requestFor(sourceAt(sourcePath), compilerPath), {
				write: () => undefined,
				setPhase: phase => phases.push(phase)
			});
			await reachedProgramCreation;
			await executor.cancel();
			programChild.emit('spawn');
			programChild.close(1);
			const result = await execution;
			assert.strictEqual(result.status, 'cancelled');
			assert.deepStrictEqual(phases, ['compiling']);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

class FakeChild extends EventEmitter {
	readonly stdin = new PassThrough();
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly pid = 424242;
	exitCode: number | null = null;

	close(exitCode: number): void {
		this.exitCode = exitCode;
		this.stdout.end();
		this.stderr.end();
		this.emit('close', exitCode);
	}
}

function sourceAt(filePath: string): BeCoderSource {
	return {
		path: filePath,
		name: path.basename(filePath),
		directory: path.dirname(filePath),
		executablePath: path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}.exe`),
		language: 'cpp'
	};
}

function requestFor(source: BeCoderSource, compilerPath: string) {
	return {
		source,
		compilerPath,
		settings,
		requestStartedAt: Date.now(),
		panelReadyMs: 0,
		saveMs: 0
	};
}

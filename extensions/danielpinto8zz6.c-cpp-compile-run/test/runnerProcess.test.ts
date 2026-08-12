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
import { buildCompilerArguments, finalizePublishedExecutable, privateRunnerEnvironment, publishExecutable, RunnerExecutionResult, RunnerExecutor } from '../src/runnerProcess';

const settings: RunnerSettings = {
	cStandard: 'c17',
	cppStandard: 'c++20',
	cFlags: ['-O2', '-Wall', '-DDEBUG'],
	cppFlags: ['-O2', '-Wall', '-DDEBUG']
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

	test('publishes an executable through a target-volume staging file', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-publish-'));
		try {
			const source = path.join(root, 'private-session', 'program.exe');
			const destination = path.join(root, 'source-folder', 'main.exe');
			fs.mkdirSync(path.dirname(source), { recursive: true });
			fs.mkdirSync(path.dirname(destination), { recursive: true });
			fs.writeFileSync(source, 'new executable');
			const rename = (async (from: fs.PathLike, to: fs.PathLike) => {
				assert.strictEqual(path.dirname(String(from)), path.dirname(destination));
				assert.strictEqual(String(to), destination);
				await fs.promises.rename(from, to);
			}) as typeof fs.promises.rename;

			await publishExecutable(source, destination, {
				copyFile: fs.promises.copyFile,
				rename,
				rm: fs.promises.rm
			});

			assert.strictEqual(fs.readFileSync(destination, 'utf8'), 'new executable');
			assert.strictEqual(fs.readFileSync(source, 'utf8'), 'new executable');
			assert.deepStrictEqual(fs.readdirSync(path.dirname(destination)), ['main.exe']);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

		test('deletes the old target before compiling but preserves a same-name file created during compilation', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-compile-failure-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			const source = sourceAt(sourcePath);
			const unrelatedExecutable = path.join(root, 'other.exe');
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			fs.writeFileSync(source.executablePath, 'old executable');
			fs.writeFileSync(unrelatedExecutable, 'unrelated executable');
			let compilerSpawned = false;
			let programSpawned = false;
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					if (arguments_.length > 0) {
						compilerSpawned = true;
						assert.strictEqual(fs.existsSync(source.executablePath), false);
							const outputPath = arguments_[arguments_.indexOf('-o') + 1];
							fs.writeFileSync(outputPath, 'partial executable');
							fs.writeFileSync(source.executablePath, 'external executable');
							child.close(1);
					} else {
						programSpawned = true;
						child.close(0);
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

			assert.strictEqual(result.status, 'compile-error');
			assert.strictEqual(result.cleanupFailed, false);
			assert.strictEqual(compilerSpawned, true);
			assert.strictEqual(programSpawned, false);
				assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'external executable');
			assert.strictEqual(fs.readFileSync(unrelatedExecutable, 'utf8'), 'unrelated executable');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('cancels before compilation when the old target cannot be removed', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-old-target-locked-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			const source = sourceAt(sourcePath);
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			fs.writeFileSync(source.executablePath, 'old executable');
			let spawnCount = 0;
			const rm = (async (candidate: fs.PathLike, options?: fs.RmOptions) => {
				if (path.resolve(String(candidate)) === path.resolve(source.executablePath)) {
					throw Object.assign(new Error('locked'), { code: 'EBUSY' });
				}
				await fs.promises.rm(candidate, options);
			}) as typeof fs.promises.rm;
			const fakeSpawn = ((_file: string) => {
				spawnCount++;
				return new FakeChild() as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
			const executor = new RunnerExecutor(path.join(root, 'sessions'), {
				spawn: fakeSpawn,
				terminate: async () => undefined,
				rm
			});

			const result = await executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});

			assert.strictEqual(result.status, 'unable-to-start');
			assert.strictEqual(result.cleanupFailed, false);
			assert.strictEqual(spawnCount, 0);
			assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'old executable');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('preserves an external target when executable publication loses a creation race', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-publication-failure-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			const source = sourceAt(sourcePath);
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			fs.writeFileSync(source.executablePath, 'old executable');
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					assert.ok(arguments_.length > 0);
					assert.strictEqual(fs.existsSync(source.executablePath), false);
					const outputPath = arguments_[arguments_.indexOf('-o') + 1];
					fs.writeFileSync(outputPath, 'new executable');
					child.close(0);
				});
				return child as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
				const rename = (async (_from: fs.PathLike, to: fs.PathLike) => {
					fs.writeFileSync(to, 'external executable');
					throw Object.assign(new Error('injected publication conflict'), { code: 'EEXIST' });
			}) as typeof fs.promises.rename;
			const executor = new RunnerExecutor(path.join(root, 'sessions'), {
				spawn: fakeSpawn,
				terminate: async () => undefined,
				rename
			});

			const result = await executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});

				assert.strictEqual(result.status, 'executable-creation-error');
				assert.strictEqual(result.cleanupFailed, false);
				assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'external executable');
				assert.ok(!fs.readdirSync(root).some(name => name.startsWith('.main.exe.')));
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('rejects and preserves a target replaced immediately after publication', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-post-rename-replacement-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			const source = sourceAt(sourcePath);
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			let programSpawned = false;
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					if (arguments_.length > 0) {
						const outputPath = arguments_[arguments_.indexOf('-o') + 1];
						fs.writeFileSync(outputPath, 'published executable');
						child.close(0);
					} else {
						programSpawned = true;
						child.close(0);
					}
				});
				return child as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
			const rename = (async (from: fs.PathLike, to: fs.PathLike) => {
				await fs.promises.rename(from, to);
				fs.rmSync(to, { force: true });
				fs.writeFileSync(to, 'external executable');
			}) as typeof fs.promises.rename;
			const executor = new RunnerExecutor(path.join(root, 'sessions'), {
				spawn: fakeSpawn,
				terminate: async () => undefined,
				rename
			});

			const result = await executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});

			assert.strictEqual(result.status, 'executable-creation-error');
			assert.strictEqual(result.cleanupFailed, true);
			assert.strictEqual(result.publishedExecutable, false);
			assert.strictEqual(programSpawned, false);
			assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'external executable');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('removes an incomplete publication when cancellation happens before publication succeeds', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-cancelled-publication-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			const source = sourceAt(sourcePath);
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					const outputPath = arguments_[arguments_.indexOf('-o') + 1];
					fs.writeFileSync(outputPath, 'new executable');
					child.close(0);
				});
				return child as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
			let publicationStarted!: () => void;
			let releasePublication!: () => void;
			const reachedPublication = new Promise<void>(resolve => publicationStarted = resolve);
			const publicationMayFail = new Promise<void>(resolve => releasePublication = resolve);
			const rename = (async (_from: fs.PathLike, to: fs.PathLike) => {
				fs.writeFileSync(to, 'external executable');
				publicationStarted();
				await publicationMayFail;
				throw Object.assign(new Error('injected publication failure'), { code: 'EIO' });
			}) as typeof fs.promises.rename;
			const executor = new RunnerExecutor(path.join(root, 'sessions'), {
				spawn: fakeSpawn,
				terminate: async () => undefined,
				rename
			});
			const execution = executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});
			await reachedPublication;
			assert.strictEqual(await executor.cancel(), true);
			releasePublication();
			const result = await execution;
			assert.strictEqual(result.status, 'cancelled');
			assert.strictEqual(result.executableRemoved, false);
			assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'external executable');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('does not report a preserved same-name compile-failure target as a cleanup failure', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-cleanup-failure-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			const source = sourceAt(sourcePath);
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			fs.writeFileSync(source.executablePath, 'old executable');
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					assert.ok(arguments_.length > 0);
					const outputPath = arguments_[arguments_.indexOf('-o') + 1];
					fs.writeFileSync(outputPath, 'partial executable');
					fs.writeFileSync(source.executablePath, 'recreated locked executable');
					child.close(1);
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

			assert.strictEqual(result.status, 'compile-error');
			assert.strictEqual(result.cleanupFailed, false);
			assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'recreated locked executable');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('compiles in the private session before publishing into a Unicode source folder', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-unicode-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourceDirectory = path.join(root, '路径 空格');
			const sourcePath = path.join(sourceDirectory, '题目.cpp');
			const sessionRoot = path.join(root, 'sessions');
			fs.mkdirSync(sourceDirectory, { recursive: true });
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			let compilerOutputPath = '';
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					if (arguments_.length > 0) {
						compilerOutputPath = arguments_[arguments_.indexOf('-o') + 1];
						fs.writeFileSync(compilerOutputPath, 'fake executable');
					}
					child.close(0);
				});
				return child as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
			const executor = new RunnerExecutor(sessionRoot, {
				spawn: fakeSpawn,
				terminate: async () => undefined
			});
			const source = sourceAt(sourcePath);
			const result = await executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});
			assert.strictEqual(result.status, 'completed');
			assert.strictEqual(result.publishedExecutable, true);
			assert.strictEqual(result.executableRemoved, false);
			assert.ok(path.resolve(compilerOutputPath).startsWith(path.resolve(sessionRoot) + path.sep));
			assert.ok(!path.resolve(compilerOutputPath).startsWith(path.resolve(sourceDirectory) + path.sep));
			assert.strictEqual(fs.existsSync(source.executablePath), true);
			const finalized = finalizePublishedExecutable(result, source.executablePath);
			assert.strictEqual(finalized.executableRemoved, true);
			assert.strictEqual(fs.existsSync(source.executablePath), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('accepts publication when a removable filesystem changes file identity during rename', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-removable-publication-'));
		try {
			const source = path.join(root, 'staging.exe');
			const destination = path.join(root, 'program.exe');
			fs.writeFileSync(source, 'published executable');
			let renamedFromIdentity: fs.BigIntStats | undefined;
			const rename = (async (from: fs.PathLike, to: fs.PathLike) => {
				renamedFromIdentity = fs.statSync(from, { bigint: true });
				await fs.promises.copyFile(from, to);
				await fs.promises.rm(from);
			}) as typeof fs.promises.rename;

			const identity = await publishExecutable(source, destination, {
				copyFile: fs.promises.copyFile,
				rename,
				rm: fs.promises.rm
			});

			const destinationIdentity = fs.statSync(destination, { bigint: true });
			assert.ok(renamedFromIdentity);
			assert.notStrictEqual(destinationIdentity.ino, renamedFromIdentity.ino);
			assert.strictEqual(identity.inode, destinationIdentity.ino.toString());
			assert.strictEqual(fs.readFileSync(destination, 'utf8'), 'published executable');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
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
			assert.strictEqual(cancelled.executableRemoved, false);
			assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'fake executable');
			assert.ok(cancelled.timings.compileMs >= 0);
			assert.ok(cancelled.timings.compileToRunStartMs !== undefined);
			assert.ok(cancelled.timings.totalMs >= cancelled.timings.cleanupMs);

			holdProgram = false;
			const replacement = await executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});
			assert.strictEqual(replacement.status, 'completed');
			assert.strictEqual(replacement.publishedExecutable, true);
			assert.strictEqual(replacement.executableRemoved, false);
			const finalized = finalizePublishedExecutable(replacement, source.executablePath);
			assert.strictEqual(finalized.executableRemoved, true);
			assert.strictEqual(fs.existsSync(source.executablePath), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('preserves the published executable when cancellation wins immediately after program exit', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-post-exit-cancel-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			const source = sourceAt(sourcePath);
			let programChild!: FakeChild;
			let programStarted!: () => void;
			const reachedProgram = new Promise<void>(resolve => programStarted = resolve);
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					if (arguments_.length > 0) {
						const outputPath = arguments_[arguments_.indexOf('-o') + 1];
						fs.writeFileSync(outputPath, 'fake executable');
						child.close(0);
					} else {
						programChild = child;
						programStarted();
					}
				});
				return child as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
			const executor = new RunnerExecutor(path.join(root, 'sessions'), {
				spawn: fakeSpawn,
				terminate: async () => undefined
			});
			const execution = executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});
			await reachedProgram;
			programChild.close(0);
			assert.strictEqual(await executor.cancel(), true);
			const result = await execution;
			assert.strictEqual(result.status, 'cancelled');
			assert.strictEqual(result.executableRemoved, false);
			assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'fake executable');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

		test('classifies a non-zero program exit and defers executable removal to terminal presentation', async () => {
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
				assert.strictEqual(result.publishedExecutable, true);
				assert.strictEqual(result.executableRemoved, false);
				assert.strictEqual(result.cleanupFailed, false);
				assert.strictEqual(fs.existsSync(source.executablePath), true);
				const finalized = finalizePublishedExecutable(result, source.executablePath);
				assert.strictEqual(finalized.executableRemoved, true);
				assert.strictEqual(fs.existsSync(source.executablePath), false);
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		test('preserves a replacement executable when terminal-owned cleanup verifies a different identity', async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-runtime-replacement-'));
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
							fs.writeFileSync(outputPath, 'published executable');
							child.close(0);
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
				const result = await executor.execute(requestFor(source, compilerPath), {
					write: () => undefined,
					setPhase: () => undefined
				});
				assert.strictEqual(result.status, 'completed');
				fs.rmSync(source.executablePath, { force: true });
				fs.writeFileSync(source.executablePath, 'replacement executable');

				const finalized = finalizePublishedExecutable(result, source.executablePath);
				assert.strictEqual(finalized.executableRemoved, false);
				assert.strictEqual(finalized.cleanupFailed, true);
				assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'replacement executable');
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

	test('preserves the published executable when private artifact cleanup fails', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-post-run-cleanup-failure-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			const source = sourceAt(sourcePath);
			const sessionRoot = path.join(root, 'sessions');
			const rm = (async (candidate: fs.PathLike, options?: fs.RmOptions) => {
				if (options?.recursive && path.resolve(String(candidate)).startsWith(path.resolve(sessionRoot) + path.sep)) {
					throw Object.assign(new Error('private cleanup failed'), { code: 'EBUSY' });
				}
				await fs.promises.rm(candidate, options);
			}) as typeof fs.promises.rm;
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					child.emit('spawn');
					if (arguments_.length > 0) {
						const outputPath = arguments_[arguments_.indexOf('-o') + 1];
						fs.writeFileSync(outputPath, 'fake executable');
					}
					child.close(0);
				});
				return child as unknown as ChildProcessWithoutNullStreams;
			}) as typeof spawn;
			const executor = new RunnerExecutor(sessionRoot, {
				spawn: fakeSpawn,
				terminate: async () => undefined,
				rm
			});
			const result = await executor.execute(requestFor(source, compilerPath), {
				write: () => undefined,
				setPhase: () => undefined
			});
			assert.strictEqual(result.status, 'completed');
			assert.strictEqual(result.publishedExecutable, true);
			assert.strictEqual(result.executableRemoved, false);
			assert.strictEqual(result.cleanupFailed, true);
			assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'fake executable');
			assert.strictEqual(finalizePublishedExecutable(result, source.executablePath), result);
			assert.strictEqual(fs.readFileSync(source.executablePath, 'utf8'), 'fake executable');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('reports target deletion failure without claiming the executable was removed', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-target-cleanup-failure-'));
		try {
			const executablePath = path.join(root, 'main.exe');
			fs.mkdirSync(executablePath);
			const result = executionResult('completed', true);
			const finalized = finalizePublishedExecutable(result, executablePath);
			assert.strictEqual(finalized.executableRemoved, false);
			assert.strictEqual(finalized.cleanupFailed, true);
			assert.strictEqual(fs.statSync(executablePath).isDirectory(), true);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('retains a published executable for terminal-owned cleanup when program launch fails', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-runner-launch-failure-'));
		try {
			const compilerPath = path.join(root, 'g++.exe');
			const sourcePath = path.join(root, 'main.cpp');
			const source = sourceAt(sourcePath);
			fs.writeFileSync(compilerPath, 'fake');
			fs.writeFileSync(sourcePath, 'int main() {}');
			const fakeSpawn = ((_file: string, arguments_: readonly string[] = []) => {
				const child = new FakeChild();
				process.nextTick(() => {
					if (arguments_.length > 0) {
						child.emit('spawn');
						const outputPath = arguments_[arguments_.indexOf('-o') + 1];
						fs.writeFileSync(outputPath, 'fake executable');
						child.close(0);
					} else {
						child.emit('error', new Error('injected program launch failure'));
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
			assert.strictEqual(result.status, 'runner-error');
			assert.match(result.message ?? '', /injected program launch failure/);
			assert.strictEqual(result.publishedExecutable, true);
			assert.strictEqual(result.executableRemoved, false);
			assert.strictEqual(fs.existsSync(source.executablePath), true);
			const finalized = finalizePublishedExecutable(result, source.executablePath);
			assert.strictEqual(finalized.executableRemoved, true);
			assert.strictEqual(finalized.cleanupFailed, false);
			assert.strictEqual(fs.existsSync(source.executablePath), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('treats a zero compiler exit without an executable as an executable creation error', async () => {
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
			assert.strictEqual(result.status, 'executable-creation-error');
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
			assert.strictEqual(result.executableRemoved, false);
			assert.strictEqual(fs.readFileSync(sourceAt(sourcePath).executablePath, 'utf8'), 'fake executable');
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

function requestFor(source: BeCoderSource, compilerPath: string, runnerSettings = settings) {
	return {
		source,
		compilerPath,
		settings: runnerSettings,
		requestStartedAt: Date.now(),
		panelReadyMs: 0,
		saveMs: 0
	};
}

function executionResult(status: RunnerExecutionResult['status'], publishedExecutable: boolean): RunnerExecutionResult {
	return {
		status,
		publishedExecutable,
		executableRemoved: false,
		cleanupFailed: false,
		timings: {
			panelReadyMs: 0,
			saveMs: 0,
			compilerSpawnMs: 0,
			compileMs: 0,
			cleanupMs: 0,
			totalMs: 0
		}
	};
}

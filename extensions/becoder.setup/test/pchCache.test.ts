/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { suite, test } from 'node:test';
import { acquireGchGenerationLock, generateGchCache, isGchCachePath, removeGchCaches } from '../src/pchCache';

suite('BeCoder generated gch cache', () => {
	test('classifies cache files and cache directories separately from toolchain assets', () => {
		assert.strictEqual(isGchCachePath('ucrt64/include/bits/stdc++.h.gch'), true);
		assert.strictEqual(isGchCachePath('ucrt64/include/bits/stdc++.h.gch/cache.bin'), true);
		assert.strictEqual(isGchCachePath('ucrt64/include/bits/stdc++.h'), false);
	});

	test('rejects a second live generator and releases the installation lock', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-gch-lock-'));
		try {
			const first = await acquireGchGenerationLock(root);
			await assert.rejects(acquireGchGenerationLock(root), /already running/i);
			await first.dispose();
			const second = await acquireGchGenerationLock(root);
			await second.dispose();
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('rejects a generator in another process while the installation lock is held', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-gch-cross-process-'));
		const lock = await acquireGchGenerationLock(root);
		try {
			const modulePath = path.resolve(__dirname, '../src/pchCache.js');
			const child = spawn(process.execPath, ['-e', 'require(process.argv[1]).acquireGchGenerationLock(process.argv[2]).then(lock=>lock.dispose().then(()=>process.exit(1)),error=>process.exit(/already running/.test(error.message)?0:2));', modulePath, root], { windowsHide: true });
			const exitCode = await new Promise<number | null>((resolve, reject) => {
				child.once('error', reject);
				child.once('close', resolve);
			});
			assert.strictEqual(exitCode, 0);
		} finally {
			await lock.dispose();
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('removes every gch file and directory under the toolchain without following links', async t => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-gch-cleanup-'));
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-gch-outside-'));
		try {
			const toolchain = path.join(root, 'toolchains');
			fs.mkdirSync(path.join(toolchain, 'nested', 'stdc++.h.gch'), { recursive: true });
			fs.writeFileSync(path.join(toolchain, 'old.gch'), 'partial cache');
			fs.writeFileSync(path.join(toolchain, 'nested', 'stdc++.h.gch', 'partial'), 'partial cache');
			fs.writeFileSync(path.join(toolchain, 'keep.txt'), 'preserved');
			fs.writeFileSync(path.join(outside, 'keep.txt'), 'external');
			try {
				fs.symlinkSync(outside, path.join(toolchain, 'linked.gch'), 'junction');
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('Windows symbolic-link creation is unavailable'); return; }
				throw error;
			}

			const removed = await removeGchCaches(toolchain);
			assert.deepStrictEqual(removed.map(file => path.basename(file)).sort(), ['linked.gch', 'old.gch', 'stdc++.h.gch']);
			assert.strictEqual(fs.existsSync(path.join(toolchain, 'old.gch')), false);
			assert.strictEqual(fs.existsSync(path.join(toolchain, 'nested', 'stdc++.h.gch')), false);
			assert.strictEqual(fs.readFileSync(path.join(toolchain, 'keep.txt'), 'utf8'), 'preserved');
			assert.strictEqual(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'external');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	test('only reports success after GCC confirms an actual cache hit', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-gch-generate-'));
		try {
			const toolchain = path.join(root, 'toolchains');
			const bits = path.join(toolchain, 'ucrt64', 'include', 'bits');
			fs.mkdirSync(bits, { recursive: true });
			fs.mkdirSync(path.join(toolchain, 'ucrt64', 'bin'), { recursive: true });
			const compiler = path.join(toolchain, 'ucrt64', 'bin', 'g++.exe');
			const header = path.join(bits, 'stdc++.h');
			fs.writeFileSync(compiler, 'stub compiler');
			fs.writeFileSync(header, 'stub header');
			fs.writeFileSync(path.join(bits, 'old.gch'), 'old cache');
			const spec = {
				headerDirectory: bits,
				prepare: async (temporaryOutput: string) => ({
					compiler,
					cwd: bits,
					buildArgs: ['build', temporaryOutput],
					probeArgs: ['probe', '-H'],
					environment: {}
				}),
				execute: async (file: string, args: readonly string[]) => {
					if (file !== compiler) { throw new Error('unexpected compiler'); }
					if (args[0] === 'build') {
						fs.writeFileSync(args[1], 'new cache');
						return { status: 0, stderr: '' };
					}
					return { status: 0, stderr: args.includes('-H') ? `! ${path.join(bits, 'stdc++.h.gch')}
` : '' };
				}
			};
			const result = await generateGchCache(toolchain, spec);
			assert.strictEqual(result.status, 'generated');
			assert.strictEqual(fs.existsSync(path.join(bits, 'old.gch')), false);
			assert.strictEqual(fs.readFileSync(path.join(bits, 'stdc++.h.gch'), 'utf8'), 'new cache');
			await assert.rejects(generateGchCache(toolchain, {
				...spec,
				prepare: async () => { throw new Error('invalid compile settings'); }
			}), /invalid compile settings/);
			assert.strictEqual(fs.readFileSync(path.join(bits, 'stdc++.h.gch'), 'utf8'), 'new cache');
			await assert.rejects(generateGchCache(toolchain, {
				...spec,
				execute: async (_file, args) => {
					if (args[0] === 'build') { fs.writeFileSync(args[1], 'incompatible cache'); }
					else { fs.writeFileSync(path.join(bits, 'another-old.gch'), 'old cache'); }
					return { stderr: '' };
				}
			}), /without using/);
			assert.strictEqual(fs.existsSync(path.join(bits, 'stdc++.h.gch')), false);
			assert.strictEqual(fs.existsSync(path.join(bits, 'another-old.gch')), false);
			const cancelled = new AbortController();
			cancelled.abort();
			await assert.rejects(generateGchCache(toolchain, { ...spec, signal: cancelled.signal }), /cancelled/);
			const retry = await generateGchCache(toolchain, spec);
			assert.strictEqual(retry.status, 'generated');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import type * as vscode from 'vscode';

import { CompilerRunner } from '../src/compilerRunner';

function environment(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
	);
}

function runner(): CompilerRunner {
	const context = {
		globalStorageUri: { fsPath: path.join(os.tmpdir(), 'becoder-gcc-diagnostics-process-tests') }
	} as unknown as vscode.ExtensionContext;
	return new CompilerRunner(context);
}

suite('compiler process lifecycle', () => {
	test('waits for an aborted child process to close', async () => {
		const compilerRunner = runner();
		const controller = new AbortController();
		const running = compilerRunner.runCompilerProcess(
			process.execPath,
			['-e', 'setInterval(() => {}, 1000)'],
			process.cwd(),
			environment(),
			controller.signal,
			1024,
			5000
		);
		setTimeout(() => {
			controller.abort();
			compilerRunner.dispose();
		}, 50);
		const result = await running;
		assert.strictEqual(controller.signal.aborted, true);
		assert.notStrictEqual(result.exitCode, 0);
		assert.strictEqual(result.timedOut, false);
	});

	test('terminates a process that exceeds the timeout', async () => {
		const compilerRunner = runner();
		const result = await compilerRunner.runCompilerProcess(
			process.execPath,
			['-e', 'setInterval(() => {}, 1000)'],
			process.cwd(),
			environment(),
			new AbortController().signal,
			1024,
			100
		);
		assert.strictEqual(result.timedOut, true);
		compilerRunner.dispose();
	});

	test('terminates a process that exceeds the output limit', async () => {
		const compilerRunner = runner();
		const startedAt = Date.now();
		const result = await compilerRunner.runCompilerProcess(
			process.execPath,
			['-e', 'process.stderr.write("x".repeat(4096)); setInterval(() => {}, 1000)'],
			process.cwd(),
			environment(),
			new AbortController().signal,
			1024,
			5000
		);
		assert.strictEqual(result.overflowed, true);
		assert.strictEqual(result.timedOut, false);
		assert.notStrictEqual(result.exitCode, 0);
		assert.ok(Date.now() - startedAt < 2000);
		compilerRunner.dispose();
	});

	test('rejects a process that cannot spawn', async () => {
		const compilerRunner = runner();
		await assert.rejects(compilerRunner.runCompilerProcess(
			path.join(os.tmpdir(), 'missing-becoder-compiler.exe'),
			[],
			process.cwd(),
			environment(),
			new AbortController().signal,
			1024,
			5000
		));
		compilerRunner.dispose();
	});
});

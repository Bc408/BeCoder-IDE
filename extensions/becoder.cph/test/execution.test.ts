/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { test } from 'node:test';
import { CphExecutor } from '../src/execution';
import { ImportedProblem } from '../src/problem';
import { compilerArguments } from '../src/toolchain';

const problem: ImportedProblem = {
	name: 'probe', group: 'local test', url: 'https://example.com/problem', timeLimit: 1000, memoryLimit: 256,
	interactive: false, tests: [{ input: '21', output: '42' }, { input: '', output: 'EOF' }, { input: '125', output: '250' }],
	batch: { id: 'probe', size: 1 }, input: { type: 'stdin' }, output: { type: 'stdout' }, testType: 'single'
};

test('external Python checker receives input and actual output, reports logs and cleans sessions', { timeout: 110000 }, async t => {
	const application = path.resolve('../VSCode-win32-x64');
	const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-checker-'));
	t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
	const checker = path.join(dataRoot, 'checker.py');
	fs.writeFileSync(checker, 'import sys\nfrom pathlib import Path\na = Path(sys.argv[1]).read_text()\nb = Path(sys.argv[2]).read_text()\nprint("checker log")\nprint("checker stderr", file=sys.stderr)\nsys.exit(0 if int(b) == 2 * int(a) else 1)\n');
	const sessions = path.join(dataRoot, 'sessions');
	let pythonCommand = 'python3';
	let cancelChecker = false;
	const executor = new CphExecutor({ extensionPath: path.join(application, 'resources/app/extensions/becoder.cph'),
		inputHelper: path.join(application, 'resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe'), dataRoot: sessions,
		preferences: () => ({ timeOut: 1000, ignoreSTDERROR: true, pythonCommand }), onCheckerStarted: () => { if (cancelChecker) { executor.cancel(); } } });
	t.after(() => executor.dispose());
	const source = path.resolve('extensions/becoder.cph/test/fixtures/streams.cpp');
	const selected = { ...problem, customCheckerPath: checker, tests: [{ input: '21', output: 'deliberately wrong expected output' }] };
	const result = await executor.judge(selected, source);
	assert.strictEqual(result.samples[0].verdict, 'passed');
	assert.match(result.samples[0].checkerRun!.stdout, /checker log/);
	assert.match(result.samples[0].checkerRun!.stderr, /checker stderr/);
	assert.deepStrictEqual(fs.readdirSync(sessions), []);
	fs.writeFileSync(checker, 'import sys\nsys.exit(1)\n');
	assert.strictEqual((await executor.judge(selected, source)).samples[0].verdict, 'wrong-answer');
	fs.writeFileSync(checker, 'import time\ntime.sleep(30)\n');
	assert.strictEqual((await executor.judge(selected, source)).samples[0].verdict, 'time-limit');
	cancelChecker = true;
	assert.strictEqual((await executor.judge(selected, source)).samples[0].verdict, 'cancelled');
	cancelChecker = false;
	pythonCommand = path.join(dataRoot, 'missing-python.exe');
	const missing = await executor.judge(selected, source);
	assert.strictEqual(missing.samples[0].verdict, 'runtime-error');
	assert.ok(missing.samples[0].checkerRun!.launchError);
	assert.deepStrictEqual(fs.readdirSync(sessions), []);
});

test('compiler flags preserve stream and macro policy for C and C++', () => {
	const cpp = compilerArguments(problem, 'a.cpp', 'private/program.exe');
	assert.ok(cpp.includes('-DDEBUG'));
	assert.ok(cpp.includes('-static'));
	assert.ok(!cpp.some(flag => flag.includes('ONLINE_JUDGE')));
	assert.ok(!compilerArguments(problem, 'a.c', 'private/program.exe').includes('-static-libstdc++'));
	assert.ok(compilerArguments(problem, 'a.cpp', 'private/program.exe', '-std=c++20 -O0').includes('-std=c++20'));
	for (const args of ['-o foreign.exe', '-DONLINE_JUDGE', '-UDEBUG', '-Bother-compiler', '-c', '@options']) {
		assert.throws(() => compilerArguments(problem, 'a.cpp', 'private/program.exe', args));
	}
});

test('real bundled GCC and pipe helper preserve EOF, stderr, exit125, timeout and cleanup', { timeout: 110000 }, async t => {
	const application = path.resolve('../VSCode-win32-x64');
	const extensionPath = path.join(application, 'resources/app/extensions/becoder.cph');
	const inputHelper = path.join(application, 'resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe');
	assert.ok(fs.statSync(inputHelper).isFile());
	const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-executor-'));
	t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
	const events: string[] = [];
	const executor = new CphExecutor({ extensionPath, inputHelper, dataRoot,
		onCompileStarted: () => events.push('compile'), onCompileFinished: () => events.push('compiled'),
		onSampleStarted: index => events.push(`start:${index}`), onSampleFinished: index => events.push(`result:${index}`) });
	t.after(() => executor.dispose());
	const source = path.resolve('extensions/becoder.cph/test/fixtures/streams.cpp');
	const originalEnvironment = { ...process.env };
	const result = await executor.judge(problem, source);
	assert.strictEqual(result.compile.exitCode, 0, result.compile.stderr);
	assert.deepStrictEqual(result.samples.map(sample => sample.verdict), ['passed', 'passed', 'runtime-error']);
	assert.deepStrictEqual(events, ['compile', 'compiled', 'start:0', 'result:0', 'start:1', 'result:1', 'start:2', 'result:2']);
	assert.strictEqual(result.samples[0].result.stderr.trim(), 'debug:21');
	assert.strictEqual(result.samples[2].result.exitCode, 125);
	assert.deepStrictEqual(fs.readdirSync(dataRoot), []);
	const timeout = await executor.judge({ ...problem, tests: [{ input: '-1', output: '' }], timeLimit: 300 }, source);
	assert.strictEqual(timeout.samples[0].verdict, 'time-limit');
	assert.deepStrictEqual(fs.readdirSync(dataRoot), []);
	const cancellationExecutor: CphExecutor = new CphExecutor({ extensionPath, inputHelper, dataRoot,
		onSampleStarted: () => cancellationExecutor.cancel() });
	const cancelled = await cancellationExecutor.judge({ ...problem, tests: [{ input: '-1', output: '' }] }, source);
	assert.strictEqual(cancelled.samples[0].verdict, 'cancelled');
	assert.deepStrictEqual(fs.readdirSync(dataRoot), []);
	cancellationExecutor.dispose();
	const failed = await executor.judge(problem, path.join(dataRoot, 'missing.cpp'));
	assert.notStrictEqual(failed.compile.exitCode, 0);
	assert.deepStrictEqual(failed.samples, []);
	const changedEnvironmentKeys = [...new Set([...Object.keys(originalEnvironment), ...Object.keys(process.env)])]
		.filter(key => originalEnvironment[key] !== process.env[key]);
	assert.deepStrictEqual(changedEnvironmentKeys, [], 'Parent environment keys changed (values intentionally omitted).');
	assert.deepStrictEqual(fs.readdirSync(dataRoot), []);
});

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
import { spawnSync } from 'child_process';
import { stripVTControlCharacters } from 'util';
import type { CompilationPlan } from '../src/toolchain';

// The owning Runner test compilation must precede this suite.
const { buildCompilerArguments, privateRunnerEnvironment } = require(path.resolve('extensions/danielpinto8zz6.c-cpp-compile-run/out-test/src/compilation.js'));
const compilerRoot = path.resolve(process.env.BECODER_TEST_TOOLCHAIN_ROOT ?? '../VSCode-win32-x64/data/toolchains/ucrt64');
const settings = { cStandard: 'c17', cppStandard: 'c++20', cFlags: [], cppFlags: [] };
function prepareCompilation(source: string, output: string, session: string, standard = 'c++20'): CompilationPlan {
	const language = /\.c$/i.test(source) ? 'c' : 'cpp';
	const compiler = path.join(compilerRoot, 'bin', language === 'c' ? 'gcc.exe' : 'g++.exe');
	return { compiler, args: buildCompilerArguments({ path: source, language }, { ...settings, cppStandard: standard }, output), environment: privateRunnerEnvironment(session, compiler) };
}

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
	const executor = new CphExecutor({ prepareCompilation,
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

test('shared compiler policy retains required flags without CPH or static linking', () => {
	const cpp = prepareCompilation('a.cpp', 'private/program.exe', 'private').args;
	for (const flag of ['-O2', '-Wall', '-DDEBUG', '-std=c++20', '-finput-charset=UTF-8', '-fexec-charset=UTF-8']) { assert.ok(cpp.includes(flag)); }
	assert.ok(!cpp.some(flag => /CPH|static|ONLINE_JUDGE/.test(flag)));
	assert.ok(!prepareCompilation('a.c', 'private/program.exe', 'private').args.includes('-include'));
	for (const flag of ['-o', '-O0', '-UDEBUG', '-Bother-compiler', '-c', '@options']) {
		assert.throws(() => buildCompilerArguments({ path: 'a.cpp', language: 'cpp' }, { ...settings, cppFlags: [flag] }, 'private/program.exe'));
	}
});

test('real bundled GCC and pipe helper preserve EOF, stderr, exit125, timeout and cleanup', { timeout: 110000 }, async t => {
	const application = path.resolve('../VSCode-win32-x64');
	const inputHelper = path.join(application, 'resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe');
	assert.ok(fs.statSync(inputHelper).isFile());
	const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-executor-'));
	t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
	const events: string[] = [];
	const executor = new CphExecutor({ prepareCompilation, inputHelper, dataRoot,
		onCompileStarted: () => events.push('compile'), onCompileFinished: () => events.push('compiled'),
		onSampleStarted: index => events.push(`start:${index}`), onSampleFinished: index => events.push(`result:${index}`) });
	t.after(() => executor.dispose());
	const source = path.resolve('extensions/becoder.cph/test/fixtures/streams.cpp');
	const originalEnvironment = { ...process.env };
	const result = await executor.judge(problem, source);
	assert.strictEqual(result.compile.exitCode, 0, result.compile.stderr);
	assert.deepStrictEqual(result.samples.map(sample => sample.verdict), ['passed', 'passed', 'runtime-error']);
	assert.deepStrictEqual(events, ['compile', 'compiled', 'start:0', 'result:0', 'start:1', 'result:1', 'start:2', 'result:2']);
	assert.match(stripVTControlCharacters(result.samples[0].result.stderr), /n: 21/);
	assert.strictEqual(result.samples[2].result.exitCode, 125);
	assert.deepStrictEqual(fs.readdirSync(dataRoot), []);
	const timeout = await executor.judge({ ...problem, tests: [{ input: '-1', output: '' }], timeLimit: 300 }, source);
	assert.strictEqual(timeout.samples[0].verdict, 'time-limit');
	assert.deepStrictEqual(fs.readdirSync(dataRoot), []);
	const cancellationExecutor: CphExecutor = new CphExecutor({ prepareCompilation, inputHelper, dataRoot,
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

test('real shared compiler hits PCH and preserves debug across supported standards and UTF-8 paths', { timeout: 110000 }, t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-编译 space-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const source = path.join(root, '测试.cpp');
	fs.copyFileSync(path.resolve('extensions/becoder.cph/test/fixtures/debug.cpp'), source);
	let baseline: string | undefined;
	for (const standard of ['c++20', 'c++11', 'c++14', 'c++17', 'c++23']) {
		const executable = path.join(root, 'probe.exe');
		const plan = prepareCompilation(source, executable, root, standard);
		for (const key of ['TEMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) { fs.mkdirSync(plan.environment[key], { recursive: true }); }
		const built = spawnSync(plan.compiler, [...plan.args, '-H', '-Winvalid-pch'], { cwd: root, env: plan.environment, windowsHide: true, timeout: 30000, encoding: 'utf8' });
		assert.strictEqual(built.status, 0, built.stderr);
		assert.match(built.stderr, standard === 'c++20' ? /! .*stdc\+\+\.h\.gch/ : /x .*stdc\+\+\.h\.gch/);
		const run = spawnSync(executable, [], { cwd: root, env: plan.environment, windowsHide: true, timeout: 5000, encoding: 'utf8' });
		assert.strictEqual(run.status, 0, run.stderr);
		assert.strictEqual(run.stdout.trim(), '中文 stdout');
		const stderr = stripVTControlCharacters(run.stderr).replace(/\r/g, '');
		assert.match(stderr, /1267650600228229401496703205376/);
		if (baseline === undefined) { baseline = stderr; } else { assert.strictEqual(stderr, baseline); }
	}
});

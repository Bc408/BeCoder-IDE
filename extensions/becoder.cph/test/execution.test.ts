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
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { createConnection, type Socket } from 'net';

// The owning Runner test compilation must precede this suite.
const runnerTestRoot = path.resolve(process.env.BECODER_RUNNER_TEST_ROOT ?? 'extensions/danielpinto8zz6.c-cpp-compile-run/out-test/extensions/danielpinto8zz6.c-cpp-compile-run/src');
const { buildCompilerArguments, privateRunnerEnvironment } = require(path.join(runnerTestRoot, 'compilation.js'));
const { captureCompilationSource } = require(path.join(runnerTestRoot, 'compilationSnapshot.js'));
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

for (const started of [false, true]) {
	test(`helper startup cancellation ${started ? 'after' : 'before'} student start preserves execution facts`, { timeout: 10000 }, async t => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cph-start-cancel-'));
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		const source = path.join(root, 'main.cpp'); fs.writeFileSync(source, 'int main(){}');
		const { BeaconEvidence } = require(path.join(runnerTestRoot, 'beaconEvidence.js'));
		const processApi = require('child_process') as typeof import('child_process'), originalSpawn = processApi.spawn;
		let studentStarts = 0, record: any, socket: Socket | undefined;
		const events: any[] = [];
		const spawn = t.mock.method(processApi, 'spawn', ((file: string, args: string[], options: any) => {
			if (file !== 'held-helper') { return originalSpawn(file, args, options); }
			const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), pid: 424242, exitCode: null,
				kill: () => { socket?.destroy(); queueMicrotask(() => { child.stdout.end(); child.stderr.end(); child.emit('close', null, null); }); return true; } });
			queueMicrotask(() => {
				child.emit('spawn');
				if (!started) { executor.cancel(); return; }
				socket = createConnection(args[2]);
				socket.on('error', () => {});
				socket.on('connect', () => socket!.write(JSON.stringify({ type: 'started', pid: 424242 }) + '\n'));
			});
			return child;
		}) as typeof processApi.spawn);
		t.after(() => { spawn.mock.restore(); socket?.destroy(); });
		const evidence = new BeaconEvidence('activity', 'cph', async (_operation: string, input: any) => { record = input.record; }, (error: unknown) => assert.fail(String(error)));
		const executor = new CphExecutor({ dataRoot: path.join(root, 'sessions'), inputHelper: 'held-helper',
			prepareCompilation: async (original, output, session) => ({ compiler: process.execPath, args: ['-e', 'require("fs").writeFileSync(process.argv[1], "executable")', output], environment: { ...process.env } as Record<string, string>, sourceSnapshot: await captureCompilationSource(original, session) }),
			onSampleStarted: () => { studentStarts++; executor.cancel(); },
			evidence: () => ({ start: (snapshot, metadata) => evidence.start(snapshot, metadata), event: value => { events.push(value); evidence.event(value); }, finish: async outcome => { await evidence.finish(outcome); } }) });
		t.after(() => executor.dispose());
		const result = await executor.judge({ ...problem, tests: [{ input: '1', output: '1' }, { input: '2', output: '2' }] }, source);
		assert.equal(result.compile.exitCode, 0); assert.equal(studentStarts, started ? 1 : 0);
		assert.equal(record.status, 'cancelled'); assert.equal(record.compile.status, 'succeeded');
		assert.equal(record.runs[0].status, started ? 'cancelled' : 'not-run');
		assert.equal(record.runs[0].skipReason, started ? undefined : 'cancelled');
		assert.equal(record.runs[0].check, started ? 'cancelled' : undefined);
		assert.equal(typeof record.runs[0].durationMs, started ? 'number' : 'undefined');
		assert.equal(events.some(event => event.type === 'sample-executed'), started);
		assert.equal(record.runs[1].status, 'not-run'); assert.equal(record.runs[1].skipReason, 'cancelled');
		if (!started) { assert.equal(record.runs[0].output, undefined); assert.equal(record.runs[0].exitCode, undefined); }
		assert.deepStrictEqual(fs.readdirSync(path.join(root, 'sessions')), []);
	});
}

test('reports_actual_execution_directories', { timeout: 30000 }, async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-cwd-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const source = path.join(root, 'main.cpp');
	fs.writeFileSync(source, '#include <filesystem>\n#include <iostream>\nint main(){std::cout << std::filesystem::current_path().string();}\n');
	let metadata: Record<string, unknown> | undefined;
	const executor = new CphExecutor({ dataRoot: path.join(root, 'sessions'),
		inputHelper: process.env.BECODER_NOTEBOOK_HELPER ?? path.resolve('../VSCode-win32-x64/resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe'),
		prepareCompilation: async (original, output, session) => {
			const sourceSnapshot = await captureCompilationSource(original, session);
			return { ...prepareCompilation(sourceSnapshot.path, output, session), sourceSnapshot };
		},
		evidence: () => ({ start(_snapshot, value) { metadata = value as Record<string, unknown>; }, event() {}, async finish() {} })
	});
	t.after(() => executor.dispose());
	const result = await executor.judge({ ...problem, tests: [{ input: '', output: '' }] }, source);
	assert.strictEqual(result.compile.exitCode, 0, result.compile.stderr);
	assert.strictEqual(result.samples[0].result.exitCode, 0);
	assert.strictEqual(metadata?.compilerCwd, root);
	assert.strictEqual(path.normalize(result.samples[0].result.stdout), path.normalize(String(metadata?.runtimeCwd)));
	assert.notStrictEqual(metadata?.runtimeCwd, root);
});

test('CPH bound source survives original edits and remains available after session cleanup', { timeout: 110000 }, async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-bound-source-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const source = path.join(root, 'main.cpp');
	fs.writeFileSync(source, '#include<bits/stdc++.h>\nusing namespace std;\nint main() {\n  return 0;\n}\n');
	const observations: { type: string; value: any }[] = [];
	const options = {
		dataRoot: path.join(root, 'sessions'), inputHelper: 'unused-in-compile-only',
		evidence: () => ({
			start: (snapshot: unknown, value: unknown) => { observations.push({ type: 'start', value: { snapshot, metadata: value } }); },
			event: (value: unknown) => { observations.push({ type: 'event', value }); },
			finish: async (value: unknown) => { observations.push({ type: 'finish', value }); }
		}),
		prepareCompilation: async (original: string, output: string, session: string) => {
			const sourceSnapshot = await captureCompilationSource(original, session);
			const plan = prepareCompilation(sourceSnapshot.path, output, session);
			return { ...plan, args: buildCompilerArguments({ path: sourceSnapshot.path, originalPath: original, language: 'cpp' }, settings, output), sourceSnapshot };
		},
		onCompileStarted: () => fs.writeFileSync(source, '#error later_version\n')
	};
	const executor = new CphExecutor(options);
	t.after(() => executor.dispose());
	const result = await executor.judge(problem, source, true);
	assert.strictEqual(result.compile.exitCode, 0, result.compile.stderr);
	assert.strictEqual(result.sourceSnapshot!.originalPath, source);
	assert.match(Buffer.from(result.sourceSnapshot!.bytesBase64, 'base64').toString('utf8'), /return 0;/);
	assert.strictEqual(fs.existsSync(result.sourceSnapshot!.path), false);
	assert.strictEqual(fs.readFileSync(source, 'utf8'), '#error later_version\n');
	assert.deepStrictEqual(observations, [], 'standalone compile-only never reaches the collection observer');
});

test('CPH cleans its execution and accepts a new run while evidence publication remains pending', { timeout: 30000 }, async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-evidence-pending-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const source = path.join(root, 'main.cpp');
	fs.writeFileSync(source, 'int main() {}\n');
	let release!: () => void;
	const pending = new Promise<void>(resolve => { release = resolve; });
	t.after(release);
	const published: any[] = [];
	const { BeaconEvidence } = require(path.join(runnerTestRoot, 'beaconEvidence.js'));
	let actions = 0;
	const executor = new CphExecutor({ dataRoot: path.join(root, 'sessions'),
		inputHelper: process.env.BECODER_NOTEBOOK_HELPER ?? path.resolve('../VSCode-win32-x64/resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe'),
		prepareCompilation: async (original, output, session) => {
			const sourceSnapshot = await captureCompilationSource(original, session);
			return { ...prepareCompilation(sourceSnapshot.path, output, session), sourceSnapshot };
		},
		evidence: () => new BeaconEvidence(`action-${++actions}`, 'cph', async (_operation: string, input: any) => {
			published.push(input);
			if (input.handle === 'action-1') { await pending; }
		}, (error: unknown) => assert.fail(String(error)))
	});
	t.after(() => executor.dispose());
	const samples = { ...problem, tests: [{ input: '', output: '' }] };
	const first = await executor.judge(samples, source);
	assert.equal(first.samples[0].verdict, 'passed');
	assert.deepStrictEqual(fs.readdirSync(path.join(root, 'sessions')), [], 'execution cleanup cannot wait for publication');
	const second = await executor.judge(samples, source);
	assert.equal(second.samples[0].verdict, 'passed');
	assert.deepStrictEqual(published.map(item => item.handle), ['action-1', 'action-2']);
	assert.equal(published[0].record.runs[0].check, 'passed');
	release(); await pending;
});

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
		inputHelper: process.env.BECODER_NOTEBOOK_HELPER ?? path.join(application, 'resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe'), dataRoot: sessions,
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

test('missing checker preserves the already completed program facts before failure', { timeout: 30000 }, async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-checker-facts-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const events: { type?: string; result?: { exitCode: number; durationMs: number; stdout: string } }[] = [];
	const executor = new CphExecutor({ dataRoot: path.join(root, 'sessions'), prepareCompilation,
		inputHelper: process.env.BECODER_NOTEBOOK_HELPER ?? path.resolve('../VSCode-win32-x64/resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe'), evidence: () => ({ start() {}, event(value) { events.push(value as typeof events[number]); }, async finish() {} }) });
	t.after(() => executor.dispose());
	await assert.rejects(executor.judge({ ...problem, customCheckerPath: path.join(root, 'missing.py'), tests: [{ input: '21', output: '42' }] }, path.resolve('extensions/becoder.cph/test/fixtures/streams.cpp')), /ENOENT|not found/);
	const result = events.find(event => event.type === 'sample-executed')?.result;
	assert.ok(result, 'The student process terminal fact precedes checker access');
	assert.strictEqual(result.exitCode, 0); assert.ok(result.durationMs >= 0); assert.strictEqual(result.stdout.trim(), '42');
	assert.strictEqual(events.some(event => event.type === 'sample-finished'), false);
});

test('real bundled GCC and pipe helper preserve EOF, stderr, exit125, timeout and cleanup', { timeout: 110000 }, async t => {
	const application = path.resolve('../VSCode-win32-x64');
	const inputHelper = process.env.BECODER_NOTEBOOK_HELPER ?? path.join(application, 'resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe');
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
	const cachePath = path.join(compilerRoot, 'include', 'c++', '16.2.0', 'x86_64-w64-mingw32', 'bits', 'stdc++.h.gch');
	if (!fs.existsSync(cachePath)) {
		t.skip('Requires a user-generated gch cache; packaged toolchains intentionally omit it.');
		return;
	}
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

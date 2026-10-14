/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'util';
import { buildCompilerArguments, privateRunnerEnvironment } from '../src/compilation';
import { captureCompilationSource, CompilerPathMapper } from '../src/compilationSnapshot';

const settings = { cStandard: 'c17', cppStandard: 'c++20', cFlags: [] as string[], cppFlags: [] as string[] };
const compilerRoot = path.resolve(process.env.BECODER_TEST_TOOLCHAIN_ROOT ?? '../VSCode-win32-x64/data/toolchains/ucrt64');

test('snapshot preserves exact bytes, hash, timestamp and the original file', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-snapshot-bytes-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const source = path.join(root, 'main.cpp');
	const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0xff, 0x0d, 0x0a]);
	fs.writeFileSync(source, bytes);
	const stat = fs.statSync(source);
	const snapshot = await captureCompilationSource(source, root);
	assert.deepStrictEqual(fs.readFileSync(snapshot.path), bytes);
	assert.deepStrictEqual(Buffer.from(snapshot.bytesBase64, 'base64'), bytes);
	assert.strictEqual(snapshot.sha256, createHash('sha256').update(bytes).digest('hex'));
	assert.strictEqual(snapshot.byteLength, bytes.length);
	assert.strictEqual(Math.floor(fs.statSync(snapshot.path).mtimeMs / 1000), Math.floor(stat.mtimeMs / 1000));
	assert.deepStrictEqual(fs.readFileSync(source), bytes);
	assert.notStrictEqual((await captureCompilationSource(source, root)).path, snapshot.path);
	await assert.rejects(captureCompilationSource(root, root));
});

test('compiler path mapping works across every possible split and preserves program text', () => {
	const snapshot = { path: 'C:\\private\\source-123\\main.cpp', originalPath: 'D:\\我的项目 space\\main.cpp', canonicalPath: 'D:\\我的项目 space\\main.cpp', bytesBase64: '', byteLength: 0, capturedAt: 0, sha256: '' };
	for (const spelling of [snapshot.path, snapshot.path.replace(/\\/g, '/')]) {
		const raw = `prefix ${spelling}:5: error\n${spelling}:6: note\npartial C:\\priv`;
		const expected = raw.split(spelling).join(snapshot.originalPath);
		for (let split = 0; split <= raw.length; split++) {
			const mapper = new CompilerPathMapper(snapshot);
			assert.strictEqual(mapper.write(raw.slice(0, split)) + mapper.write(raw.slice(split)) + mapper.end(), expected);
		}
	}
});

for (const standard of ['c++11', 'c++14', 'c++17', 'c++20', 'c++23']) {
	test(`real GCC mirror preserves includes, macros, timestamp and debug under ${standard}`, { timeout: 110000 }, async t => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-源码 space-'));
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		const directory = path.join(root, '题目');
		fs.mkdirSync(path.join(directory, 'nested'), { recursive: true });
		fs.writeFileSync(path.join(directory, 'nested', 'value.h'), 'constexpr int nestedValue=42;\n');
		fs.writeFileSync(path.join(directory, 'local.h'), '#include"nested/value.h"\nconstexpr int v=nestedValue;\n');
		const source = path.join(directory, '测试.cpp');
		fs.writeFileSync(source, '#include<bits/stdc++.h>\n#include"local.h"\nusing namespace std;\nint main() {\n  cin.tie(0)->sync_with_stdio(0);\n  cout<<__FILE__<<"\\n"<<__BASE_FILE__<<"\\n"<<__builtin_FILE()<<"\\n"<<__TIMESTAMP__<<"\\n"<<v<<"\\n";\n  debug(v);\n  return 0;\n}\n');
		const compiler = path.join(compilerRoot, 'bin', 'g++.exe');
		const environment = privateRunnerEnvironment(root, compiler);
		for (const name of ['TEMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) { fs.mkdirSync(environment[name], { recursive: true }); }
		const compile = (input: string, executable: string, originalPath?: string) => {
			const args = buildCompilerArguments({ path: input, language: 'cpp', originalPath }, { ...settings, cppStandard: standard }, executable);
			const result = spawnSync(compiler, [...args, '-H', '-Winvalid-pch'], { cwd: directory, env: environment, windowsHide: true, timeout: 30000, encoding: 'utf8' });
			assert.strictEqual(result.status, 0, result.stderr);
			assert.match(result.stderr, standard === 'c++20' ? /! .*stdc\+\+\.h\.gch/ : /x .*stdc\+\+\.h\.gch/);
			const run = spawnSync(executable, [], { cwd: directory, env: environment, windowsHide: true, timeout: 5000, encoding: 'utf8' });
			assert.strictEqual(run.status, 0, run.stderr);
			return { stdout: run.stdout, stderr: stripVTControlCharacters(run.stderr) };
		};
		const baseline = compile(source, path.join(root, 'baseline.exe'));
		const snapshot = await captureCompilationSource(source, root);
		// Deliberate barrier: the compiler must not observe this later source.
		fs.writeFileSync(source, '#error changed_after_capture\n');
		assert.deepStrictEqual(compile(snapshot.path, path.join(root, 'captured.exe'), source), baseline);
		assert.match(baseline.stdout, /42\r?\n$/);
		assert.match(baseline.stderr, /v: 42/);
		assert.strictEqual(snapshot.sha256, createHash('sha256').update(fs.readFileSync(snapshot.path)).digest('hex'));
	});
}

test('real GCC C mirror preserves relative includes and maps failure locations', { timeout: 110000 }, async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-c-mirror-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const source = path.join(root, 'main.c');
	fs.writeFileSync(path.join(root, 'local.h'), '#define VALUE 42\n');
	fs.writeFileSync(source, '#include<stdio.h>\n#include"local.h"\nint main() {\n  printf("%s\\n%d\\n",__FILE__,VALUE);\n  return 0;\n}\n');
	const compiler = path.join(compilerRoot, 'bin', 'gcc.exe');
	const environment = privateRunnerEnvironment(root, compiler);
	for (const name of ['TEMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) { fs.mkdirSync(environment[name], { recursive: true }); }
	const snapshot = await captureCompilationSource(source, root);
	fs.writeFileSync(source, '#error V2\n');
	const executable = path.join(root, 'captured.exe');
	const args = buildCompilerArguments({ path: snapshot.path, originalPath: source, language: 'c' }, settings, executable);
	const built = spawnSync(compiler, [...args], { cwd: root, env: environment, windowsHide: true, timeout: 30000, encoding: 'utf8' });
	assert.strictEqual(built.status, 0, built.stderr);
	const run = spawnSync(executable, [], { cwd: root, env: environment, windowsHide: true, timeout: 5000, encoding: 'utf8' });
	assert.strictEqual(run.status, 0, run.stderr);
	assert.strictEqual(run.stdout.trim().replace(/\r/g, ''), source + '\n42');
	const failing = await captureCompilationSource(source, root);
	const failure = spawnSync(compiler, [...buildCompilerArguments({ path: failing.path, originalPath: source, language: 'c' }, settings, executable)], { cwd: root, env: environment, windowsHide: true, timeout: 30000, encoding: 'utf8' });
	assert.notStrictEqual(failure.status, 0);
	const mapper = new CompilerPathMapper(failing);
	const output = mapper.write(failure.stderr) + mapper.end();
	assert.ok(output.includes(source + ':1:'), output);
	assert.ok(!output.includes(failing.path));
});

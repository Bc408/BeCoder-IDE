/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import * as fsSync from 'fs';
import { runNotebookProgram } from '../src/notebookProcess';
import { buildCompilerArguments, privateRunnerEnvironment } from '../src/compilation';
import type { RunnerSettings } from '../src/compiler';

test('Notebook compilation uses a short named source while runtime retains notebook cwd', async () => {
	const request = { code: 'captured', language: 'cpp' as const, input: '', inputName: '', cellId: 'code', cwd: process.cwd(), notebookPath: path.join(process.cwd(), '动态规划.bcnb'), codeNumber: 2 };
	const result = await runNotebookProgram(request, new AbortController().signal, { phase: () => {}, output: () => {} }, 'unused', source => ({
		compiler: process.execPath,
		args: ['-e', 'process.stderr.write(require("path").basename(process.argv[1])+"|"+process.cwd());process.exit(1)', source],
		environment: { ...process.env } as Record<string, string>
	}));
	assert.equal(path.basename(result.sourceSnapshot!.path), '动态规划-code2.cpp');
	assert.equal(result.compileStderr, '动态规划-code2.cpp|' + path.dirname(result.sourceSnapshot!.path));
	assert.match(path.basename(path.dirname(result.sourceSnapshot!.path)), /^bcnb-/);
	assert.equal(result.code, 'captured');
});

test('Notebook compilation uses captured memory source and reports actual compile failure without running', async () => {
	const request = { code: 'dirty V1', language: 'cpp' as const, input: '1\n', inputName: 'input one', codeNumber: 1, cellId: 'one', cwd: process.cwd() };
	const phases: string[] = [];
	const result = await runNotebookProgram(request, new AbortController().signal, { phase: phase => phases.push(phase), output: () => {} }, 'unused-helper', (source) => {
		assert.ok(source.endsWith('.cpp'));
		request.code = 'later V2';
		return { compiler: process.execPath, args: ['-e', 'process.stderr.write("actual compilation error");process.exit(1)'], environment: { ...process.env } as Record<string, string> };
	});
	assert.equal(result.code, 'dirty V1'); assert.equal(result.status, 'compile-error');
	assert.equal(result.compileStderr, 'actual compilation error'); assert.deepEqual(phases, ['compiling']);
	assert.ok((result as typeof result & { compileMs?: number }).compileMs! >= 0);
	assert.equal((result as typeof result & { runMs?: number }).runMs, undefined);
	await assert.rejects(fs.stat(result.sourceSnapshot!.path), { code: 'ENOENT' });
});
test('a missing Notebook helper reports its actual spawn error rather than inventing a program result', async () => {
	const result = await runNotebookProgram({ code: 'captured', language: 'cpp', input: '', inputName: '', codeNumber: 1, cellId: 'missing-helper', cwd: process.cwd() }, new AbortController().signal, { phase: () => {}, output: () => {} }, path.join(process.cwd(), 'tmp', 'no-notebook-helper.exe'), (_source, output) => ({ compiler: process.execPath, args: ['-e', 'require("fs").writeFileSync(process.argv[1],"fixture")', output], environment: { ...process.env } as Record<string, string> }));
	assert.equal(result.status, 'unable-to-start'); assert.match(result.error!, /ENOENT/); assert.equal(result.exitCode, undefined);
});

function runNotebookWithNodeHelper(script: string, limits?: { maxRuntimeMs: number; maxOutputBytes: number }, compileDelayMs = 0, signal = new AbortController().signal, phase: (phase: 'compiling' | 'running') => void = () => {}) {
	return runNotebookProgram({ code: 'captured', language: 'cpp', input: '', inputName: '', codeNumber: 1, cellId: 'bounded-run', cwd: process.cwd() }, signal, { phase, output: () => {} }, process.execPath, (_source, output) => ({
		compiler: process.execPath,
		args: ['-e', 'setTimeout(()=>require("fs").writeFileSync(process.argv[1], ' + JSON.stringify(script) + '), ' + compileDelayMs + ')', output],
		environment: { ...process.env } as Record<string, string>
	}), limits);
}

test('Notebook program time limit starts after the runtime helper reports the program started', async () => {
	const script = `const net=require('net');const socket=net.createConnection(process.argv[3]);socket.on('connect',()=>socket.write(JSON.stringify({type:'started',pid:process.pid})+'\\n'));socket.once('data',()=>{while(true){}});`;
	const result = await runNotebookWithNodeHelper(script, { maxRuntimeMs: 100, maxOutputBytes: 1024 });
	assert.equal(result.status, 'timed-out'); assert.ok(result.runMs! >= 50); assert.equal(result.output, ''); assert.equal(result.compileMs! >= 0, true);
	await assert.rejects(fs.stat(result.sourceSnapshot!.path), { code: 'ENOENT' });
});

test('Notebook default runtime limit is two seconds and starts after compilation', async () => {
	const script = `const net=require('net');const socket=net.createConnection(process.argv[3]);socket.on('connect',()=>socket.write(JSON.stringify({type:'started',pid:process.pid})+'\\n'));socket.once('data',()=>{while(true){}});`;
	const result = await runNotebookWithNodeHelper(script, undefined, 250);
	assert.equal(result.status, 'timed-out'); assert.equal(result.runtimeLimitMs, 2000); assert.ok(result.compileMs! >= 200); assert.ok(result.runMs! >= 1900); assert.ok(result.runMs! < 5000);
});

test('Notebook runtime limit excludes time spent compiling', async () => {
	const script = `const net=require('net');const socket=net.createConnection(process.argv[3]);socket.on('connect',()=>socket.write(JSON.stringify({type:'started',pid:process.pid})+'\\n'));socket.once('data',()=>{socket.write(JSON.stringify({type:'exit',code:0,runMs:1})+'\\n');socket.end();});`;
	const result = await runNotebookWithNodeHelper(script, { maxRuntimeMs: 100, maxOutputBytes: 1024 }, 250);
	assert.equal(result.status, 'completed'); assert.ok(result.compileMs! >= 200); assert.ok(result.runMs! < 100);
});

test('Notebook output limit stops a continuously writing program and retains only bounded output', async () => {
	const script = `const net=require('net');const socket=net.createConnection(process.argv[3]);socket.on('connect',()=>socket.write(JSON.stringify({type:'started',pid:process.pid})+'\\n'));socket.once('data',()=>setInterval(()=>process.stdout.write(Buffer.alloc(16384,120)),0));`;
	const result = await runNotebookWithNodeHelper(script, { maxRuntimeMs: 1000, maxOutputBytes: 64 * 1024 });
	assert.equal(result.status, 'output-limit'); assert.equal(Buffer.byteLength(result.output), 64 * 1024); assert.ok(result.omittedBytes > 0); assert.equal(result.truncated, true);
});

test('Notebook default output limit accepts exactly 262144 bytes without truncation', async () => {
	const script = `const net=require('net');const socket=net.createConnection(process.argv[3]);socket.on('connect',()=>socket.write(JSON.stringify({type:'started',pid:process.pid})+'\\n'));socket.once('data',()=>{process.stdout.write(Buffer.alloc(262144,120));setTimeout(()=>{socket.write(JSON.stringify({type:'exit',code:0,runMs:1})+'\\n');socket.end();},20);});`;
	const result = await runNotebookWithNodeHelper(script);
	assert.equal(result.status, 'completed'); assert.equal(result.outputLimitBytes, 262144); assert.equal(Buffer.byteLength(result.output), 262144); assert.equal(result.truncated, false); assert.equal(result.omittedBytes, 0);
});

test('Notebook output cap reports overflow and preserves only the configured byte prefix', async () => {
	const script = `const net=require('net');const socket=net.createConnection(process.argv[3]);socket.on('connect',()=>socket.write(JSON.stringify({type:'started',pid:process.pid})+'\\n'));socket.once('data',()=>{process.stdout.write(Buffer.alloc(65536,120));process.stdout.write(Buffer.alloc(1,121));});`;
	const result = await runNotebookWithNodeHelper(script, { maxRuntimeMs: 1000, maxOutputBytes: 64 * 1024 });
	assert.equal(result.status, 'output-limit'); assert.equal(Buffer.byteLength(result.output), 64 * 1024); assert.ok(result.output.endsWith('x')); assert.ok(result.omittedBytes >= 1); assert.equal(result.truncated, true);
});

test('Notebook runtime output cap does not count helper diagnostics as program output', async () => {
	const script = `const net=require('net');const socket=net.createConnection(process.argv[3]);socket.on('connect',()=>socket.write(JSON.stringify({type:'started',pid:process.pid})+'\\n'));socket.once('data',()=>{process.stdout.write('ok');process.stderr.write('d'.repeat(65537));socket.write(JSON.stringify({type:'exit',code:0,runMs:1})+'\\n');socket.end();});`;
	const result = await runNotebookWithNodeHelper(script, { maxRuntimeMs: 1000, maxOutputBytes: 64 * 1024 });
	assert.equal(result.status, 'completed'); assert.equal(result.output, 'ok'); assert.equal(result.helperStderr.length, 65537); assert.equal(result.truncated, false);
});

test('Notebook explicit cancellation takes precedence over the runtime deadline', async () => {
	const abort = new AbortController();
	const script = `const net=require('net');const socket=net.createConnection(process.argv[3]);socket.on('connect',()=>socket.write(JSON.stringify({type:'started',pid:process.pid})+'\\n'));socket.once('data',()=>{setTimeout(()=>process.stdout.write('started'),0);setInterval(()=>{},1000);});`;
	const result = await runNotebookWithNodeHelper(script, { maxRuntimeMs: 200, maxOutputBytes: 1024 }, 0, abort.signal, phase => { if (phase === 'running') { abort.abort(); } });
	assert.equal(result.status, 'cancelled'); assert.notEqual(result.status, 'timed-out');
	await assert.rejects(fs.stat(result.sourceSnapshot!.path), { code: 'ENOENT' });
});

const repositoryRoot = path.resolve(__dirname, '../../../../');
const stagedApplication = path.resolve(repositoryRoot, '../VSCode-win32-x64');
const compiler = process.env['BECODER_NOTEBOOK_COMPILER'] ?? path.join(stagedApplication, 'data/toolchains/ucrt64/bin/g++.exe');
const helper = process.env['BECODER_NOTEBOOK_HELPER'] ?? path.join(stagedApplication, 'resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe');
const actual = { skip: !fsSync.existsSync(compiler) || !fsSync.existsSync(helper), timeout: 30000 };
const settings: RunnerSettings = { cStandard: 'c17', cppStandard: 'c++20', cFlags: [], cppFlags: [] };
test('Notebook actual GCC diagnostics identify the notebook and program without a temporary path', actual, async () => {
	const result = await runNotebookProgram({ code: 'int main() { broken }', language: 'cpp', input: '', inputName: '', cellId: 'bad', codeNumber: 3, notebookPath: path.join(process.cwd(), '动态规划.bcnb'), cwd: process.cwd() }, new AbortController().signal, { phase: () => {}, output: () => {} }, helper!, (source, output, session, language, cwd) => ({ compiler: compiler!, args: buildCompilerArguments({ path: source, originalPath: path.join(cwd, path.basename(source)), language }, settings, output), environment: privateRunnerEnvironment(session, compiler!) }));
	assert.equal(result.status, 'compile-error');
	assert.match(result.compileStderr, /动态规划-code3\.cpp/);
	assert.ok(!result.compileStderr.includes(path.dirname(result.sourceSnapshot!.path)));
	assert.equal(result.runMs, undefined);
});
test('Notebook merged output keeps cout, plain cerr and debug ANSI in actual write order', actual, async () => {
	const output: string[] = []; const streams = new Set<string>();
	const code = '#include<bits/stdc++.h>\nusing namespace std;\nint main() {\n  cout<<"out\\n"<<flush;\n  cerr<<"err\\n";\n  debug(88);\n  cout<<"tail\\n"<<flush;\n  return 0;\n}\n';
	const result = await runNotebookProgram({ code, language: 'cpp', input: '', inputName: 'merged', codeNumber: 1, cellId: 'program', inputCellId: 'input', cwd: process.cwd() }, new AbortController().signal, { phase: () => {}, output: (phase, stream, text) => { if (phase === 'running') { streams.add(stream); output.push(text); } } }, helper!, (source, target, session, language, cwd) => ({ compiler: compiler!, args: buildCompilerArguments({ path: source, originalPath: path.join(cwd, 'program.cpp'), language }, settings, target), environment: privateRunnerEnvironment(session, compiler!) }));
	assert.equal(result.status, 'completed');
	assert.equal(result.helperStderr, '');
	assert.equal(result.output!.replace(/\r/g, '').replace(/\u001b\[[0-9;]*m/g, ''), 'out\nerr\n88: 88\ntail\n');
	assert.match(result.output!, /^out\r?\nerr\r?\n\u001b\[35m88: /);
	assert.deepEqual([...streams], ['merged']); assert.equal(output.join(''), result.output);
	assert.ok(result.compileMs! >= 0); assert.ok(result.runMs! >= 0);
});
test('Notebook actual C compilation and empty stdin complete without a C++ wrapper', actual, async () => {
	const cCompiler = path.join(path.dirname(compiler!), 'gcc.exe');
	const code = '#include<stdio.h>\nint main() {\n  int x;\n  printf("%d",scanf("%d",&x)==EOF);\n  return 0;\n}\n';
	const result = await runNotebookProgram({ code, language: 'c', input: '', inputName: 'empty', codeNumber: 1, cellId: 'c-cell', cwd: process.cwd() }, new AbortController().signal, { phase: () => {}, output: () => {} }, helper!, (source, output, session, language, cwd) => ({ compiler: cCompiler, args: buildCompilerArguments({ path: source, originalPath: path.join(cwd, 'program.c'), language }, settings, output), environment: privateRunnerEnvironment(session, cCompiler) }));
	assert.equal(result.status, 'completed'); assert.equal(result.output, '1'); assert.equal(result.exitCode, 0);
});

test('Notebook actual GCC run sees selected stdin EOF, local include, cwd, stderr and exit 125', actual, async () => {
	const fixture = await fs.mkdtemp(path.join(tmpdir(), 'becoder-notebook-execution-'));
	try {
		await fs.writeFile(path.join(fixture, 'local.h'), '#define LOCAL_VALUE 7\n');
		const code = '#include<bits/stdc++.h>\n#include"local.h"\nusing namespace std;\nint main() {\n  int x,sum=0;\n  while (cin>>x) sum+=x;\n  cout<<sum+LOCAL_VALUE<<\'\\n\';\n  cerr<<"actual stderr\\n";\n  ofstream("result.txt")<<"cwd";\n  return 125;\n}\n';
		const result = await runNotebookProgram({ code, language: 'cpp', input: '2 3\n', inputName: 'selected', codeNumber: 1, cellId: 'one', cwd: fixture }, new AbortController().signal, { phase: () => {}, output: () => {} }, helper!, (source, output, session, language, cwd) => ({ compiler: compiler!, args: buildCompilerArguments({ path: source, originalPath: path.join(cwd, 'program.cpp'), language }, settings, output), environment: privateRunnerEnvironment(session, compiler!) }));
		assert.equal(result.status, 'runtime-error'); assert.equal(result.exitCode, 125);
		assert.equal(result.output.replace(/\r/g, ''), '12\nactual stderr\n'); assert.equal(result.helperStderr, '');
		assert.equal(await fs.readFile(path.join(fixture, 'result.txt'), 'utf8'), 'cwd');
		assert.equal(result.inputName, 'selected'); assert.equal(result.cleanupError, undefined);
		await assert.rejects(fs.stat(result.sourceSnapshot!.path), { code: 'ENOENT' });
	} finally { await fs.rm(fixture, { recursive: true }); }
});
test('Notebook actual running cancellation terminates the helper and cleans its private executable', actual, async () => {
	const abort = new AbortController();
	const code = '#include<bits/stdc++.h>\nusing namespace std;\nint main() {\n  cout<<"started"<<flush;\n  for (;;) this_thread::sleep_for(chrono::milliseconds(10));\n  return 0;\n}\n';
	const result = await runNotebookProgram({ code, language: 'cpp', input: '', inputName: '', codeNumber: 1, cellId: 'two', cwd: process.cwd() }, abort.signal, { phase: () => {}, output: (_phase, _stream, text) => { if (text.includes('started')) { abort.abort(); } } }, helper!, (source, output, session, language, cwd) => ({ compiler: compiler!, args: buildCompilerArguments({ path: source, originalPath: path.join(cwd, 'program.cpp'), language }, settings, output), environment: privateRunnerEnvironment(session, compiler!) }));
	assert.equal(result.status, 'cancelled'); assert.ok(result.output.includes('started')); assert.equal(result.cleanupError, undefined);
	await assert.rejects(fs.stat(result.sourceSnapshot!.path), { code: 'ENOENT' });
});
test('Notebook actual non-output loop is stopped by the two-second runtime limit', { ...actual, timeout: 10000 }, async () => {
	const code = 'int main() { for (;;) {} }\n';
	const result = await runNotebookProgram({ code, language: 'cpp', input: '', inputName: '', codeNumber: 1, cellId: 'time-limit', cwd: process.cwd() }, new AbortController().signal, { phase: () => {}, output: () => {} }, helper!, (source, output, session, language, cwd) => ({ compiler: compiler!, args: buildCompilerArguments({ path: source, originalPath: path.join(cwd, 'program.cpp'), language }, settings, output), environment: privateRunnerEnvironment(session, compiler!) }));
	assert.equal(result.status, 'timed-out'); assert.equal(result.runtimeLimitMs, 2000); assert.ok(result.runMs! >= 1900); assert.ok(result.runMs! < 5000);
});
test('Notebook output cap stops the actual program and retains only bounded output', actual, async () => {
	const code = '#include<bits/stdc++.h>\nusing namespace std;\nint main() {\n  string chunk(65536, \'x\');\n  while (true) cout<<chunk<<flush;\n}\n';
	const result = await runNotebookProgram({ code, language: 'cpp', input: '', inputName: '', codeNumber: 1, cellId: 'three', cwd: process.cwd() }, new AbortController().signal, { phase: () => {}, output: () => {} }, helper!, (source, output, session, language, cwd) => ({ compiler: compiler!, args: buildCompilerArguments({ path: source, originalPath: path.join(cwd, 'program.cpp'), language }, settings, output), environment: privateRunnerEnvironment(session, compiler!) }));
	assert.equal(result.status, 'output-limit'); assert.equal(result.helperStderr, '');
	assert.equal(result.outputLimitBytes, 262144); assert.equal(Buffer.byteLength(result.output), 262144); assert.ok(result.omittedBytes > 0); assert.equal(result.truncated, true);
});

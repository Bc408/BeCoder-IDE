/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { BeaconEvidence } from '../src/beaconEvidence';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { RunnerExecutor } from '../src/runnerProcess';
import { runNotebookProgramGroup } from '../src/notebookProcess';

const snapshot = { originalPath: 'C:\\project\\main.cpp', canonicalPath: 'C:\\project\\main.cpp', path: 'C:\\private\\main.cpp', capturedAt: 1, bytesBase64: Buffer.from('int main(){}').toString('base64'), byteLength: 12, sha256: 'captured-hash' };

for (const producer of ['runner', 'cph', 'notebook'] as const) {
	test(`${producer} hashes the complete actual program before evidence truncation`, async () => {
		let record: any;
		const evidence = new BeaconEvidence('handle', producer, async (_op, input: any) => { record = input.record; }, error => assert.fail(String(error)));
		const code = '// 😀\r\n' + 'x'.repeat(8192) + '\r\nTAIL';
		const original = { ...snapshot, bytesBase64: Buffer.from(code).toString('base64'), byteLength: Buffer.byteLength(code) };
		evidence.start(original, {});
		await evidence.finish({ status: 'compile-error' });
		assert.strictEqual(record.program.codeHash, 'a20dcadf032ef995e7ed1d07ee2a5a39af9855f7294307d29e27b34fab16b021');
		assert.deepStrictEqual(record.program.code, { text: '// 😀\r\n' + 'x'.repeat(8186), truncated: true });
		assert.strictEqual(Buffer.from(original.bytesBase64, 'base64').toString('utf8'), code);
		assert.strictEqual(original.sha256, 'captured-hash', 'the byte snapshot identity is independent of the text hash');
	});
}

test('program hashes normalize only CRLF and retain all other source differences', async () => {
	const code = '// 中😀\nint main() { return 0; }\n';
	const cases = [
		[code, 'cb0b697d6c2979c00245331c72ee7efcfc44dcb0d312e1ca7feb6ced73e258d7'],
		[code.replace(/\n/g, '\r\n'), 'cb0b697d6c2979c00245331c72ee7efcfc44dcb0d312e1ca7feb6ced73e258d7'],
		[code.replace('return 0', 'return  0'), 'ce727c72257bf912395aa763a440b86e5c0d1a34dcf0db75f40c4df4aba5dc95'],
		[code.replace('// 中😀', '// 中😀 changed'), '0eabdf4d262dcb04da2810c558a271c4bc1ba3efc85c4fe15e1dc2568d882bd9'],
		[code + '\n', '697ee52e4351cbf24c2bcbebf58bb8e6418ae618708e0e481fb5b1dbed918078'],
		[code.replace(/\n/g, '\r'), '0d3c0ef1ec0b1128f8e986372e15d3d5fdd49069918ba1743e6f3f8a4f5c4088'],
		['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855']
	];
	for (const [source, hash] of cases) {
		let record: any;
		const evidence = new BeaconEvidence('handle', 'runner', async (_op, input: any) => { record = input.record; }, error => assert.fail(String(error)));
		evidence.start({ ...snapshot, bytesBase64: Buffer.from(source).toString('base64'), byteLength: Buffer.byteLength(source) }, {});
		await evidence.finish({ status: 'compile-error' });
		assert.strictEqual(record.program.codeHash, hash);
		assert.strictEqual(record.program.code, source, 'hash normalization must not change retained code');
	}
});

test('Notebook legacy code ordinal never becomes a whole-notebook cell position or a new legacy field', async () => {
	let record: any;
	const evidence = new BeaconEvidence('handle', 'notebook', async (_op, input: any) => { record = input.record; }, error => assert.fail(String(error)));
	const metadata = { codeNumber: 2, inputs: [{ text: '', name: 'input', cellNumber: 6 }] };
	evidence.start(snapshot, metadata);
	await evidence.finish({ status: 'compile-error' });
	assert.strictEqual(Object.hasOwn(record.program, 'codeCellNumber'), false);
	assert.strictEqual(Object.hasOwn(record.program, 'codeBlockNumber'), false);
	assert.strictEqual(record.runs[0].inputCellNumber, 6);
	assert.strictEqual(metadata.codeNumber, 2);
});

test('publishes one complete record only at finish and keeps observed values', async () => {
	const calls: { operation: string; input: any }[] = [];
	const evidence = new BeaconEvidence('handle', 'runner', async (operation, input) => { calls.push({ operation, input }); }, () => assert.fail('unexpected failure'));
	const metadata = { compiler: 'GCC V1', input: { source: 'C:/project/input', bytesBase64: Buffer.from('2 3\n').toString('base64') } };
	evidence.start(snapshot, metadata); metadata.compiler = 'changed';
	evidence.event({ type: 'compiled', exitCode: 0, compileMs: 15 });
	evidence.event({ type: 'stream', phase: 'running', stream: 'merged-pty', text: '5\n' });
	assert.strictEqual(calls.length, 0, 'no active queue placeholder');
	await evidence.finish({ status: 'completed', exitCode: 0, programRuntimeMs: 2 });
	assert.deepStrictEqual(calls.map(call => call.operation), ['captureRun']);
	const record = calls[0].input.record;
	assert.strictEqual(record.program.code, 'int main(){}'); assert.strictEqual(record.compile.compiler, 'GCC V1');
	assert.strictEqual(record.runs[0].input.text, '2 3\n'); assert.strictEqual(record.runs[0].output.merged, '5\n');
	assert.strictEqual(record.operation, 'run-with-input'); assert.strictEqual(record.compile.durationMs, 15);
	evidence.event({ type: 'late' }); await evidence.finish({ status: 'late' }); assert.strictEqual(calls.length, 1);
});

test('CPH keeps source sample ordinal, empty expected and check, strips problem and checker details', async () => {
	let record: any;
	const evidence = new BeaconEvidence('handle', 'cph', async (_op, input: any) => { record = input.record; }, () => assert.fail('unexpected failure'));
	evidence.start(snapshot, { compiler: 'GCC', inputs: [{ input: '', output: '' }], sampleNumbers: [5], problem: { url: 'secret-topic', customCheckerPath: 'checker.py' }, timeout: 3000 });
	evidence.event({ type: 'compiled', exitCode: 0, durationMs: 7 });
	evidence.event({ type: 'sample-finished', index: 0, sampleId: '5', result: { stdout: '', stderr: '', exitCode: 0, durationMs: 1 }, verdict: 'time-limit', checkerRun: { stderr: 'checker diagnostic' } });
	await evidence.finish({ status: 'completed' });
	assert.strictEqual(record.runs[0].testCaseNumber, 5); assert.strictEqual(record.runs[0].expectedOutput, '');
	assert.strictEqual(record.runs[0].check, 'time-limit'); assert.strictEqual(record.runs[0].status, 'completed');
	assert.strictEqual(/secret-topic|checker|timeout|runtimeLimits|events/.test(JSON.stringify(record)), false);
});

test('only-compile and missing workspace do not publish; publication failure cannot reject execution', async () => {
	for (const [handle, compileOnly] of [[undefined, false], ['handle', true]] as const) {
		let calls = 0;
		const evidence = new BeaconEvidence(handle, 'cph', async () => { calls++; }, () => assert.fail('unexpected failure'));
		evidence.start(snapshot, { compileOnly }); await evidence.finish({ status: 'compile-only' }); assert.strictEqual(calls, 0);
	}
	let errors = 0;
	const evidence = new BeaconEvidence('handle', 'runner', async () => { throw new Error('disk failed'); }, () => { errors++; });
	evidence.start(snapshot, {}); await evidence.finish({ status: 'compile-error' }); assert.strictEqual(errors, 1);
});

test('retains a Unicode output prefix without splitting UTF-8 or saving a tail', async () => {
	let record: any;
	const evidence = new BeaconEvidence('handle', 'runner', async (_op, input: any) => { record = input.record; }, () => assert.fail('unexpected failure'));
	evidence.start(snapshot, {}); evidence.event({ type: 'compiled', exitCode: 0 });
	evidence.event({ type: 'stream', phase: 'running', stream: 'merged-pty', text: 'HEAD' + '中😀'.repeat(5000) + 'TAIL' });
	await evidence.finish({ status: 'completed', exitCode: 0 });
	const output = record.runs[0].output.merged;
	assert.deepStrictEqual(output, { text: 'HEAD' + '中😀'.repeat(2046), truncated: true });
	assert.strictEqual(record.runs[0].input.text, null); assert.ok(record.gaps.length);
});

test('compile and input streams have independent limits and preserve source omissions', async () => {
	let record: any;
	const evidence = new BeaconEvidence('handle', 'cph', async (_op, input: any) => { record = input.record; }, () => assert.fail('unexpected failure'));
	evidence.start(snapshot, { inputs: [{ input: '9223372036854775807\n', output: '' }, { input: '', output: 'ok' }], operation: 'test-all' });
	evidence.event({ type: 'stream', phase: 'compiling', stream: 'stderr', text: 'short' });
	evidence.event({ type: 'compiled', exitCode: 0 });
	for (const index of [0, 1]) {
		for (const stream of ['stdout', 'stderr']) {
			evidence.event({ type: 'stream', phase: 'running', stream, index, text: 'H' + 'x'.repeat(10000) + 'T', sourceOmittedBytes: index === 1 ? 11 : 0 });
		}
		evidence.event({ type: 'sample-finished', index, verdict: 'passed', result: { exitCode: 0 } });
	}
	await evidence.finish({ status: 'completed' });
	assert.strictEqual(record.compile.output.stderr, 'short');
	for (const run of record.runs) {
		for (const value of Object.values(run.output)) { assert.deepStrictEqual(value, { text: 'H' + 'x'.repeat(4095), truncated: true }); }
	}
	assert.strictEqual(record.runs[0].input.text, '9223372036854775807\n');
});

test('static source, input, expected and errors are bounded only in the evidence copy', async () => {
	let record: any;
	const evidence = new BeaconEvidence('handle', 'cph', async (_op, input: any) => { record = input.record; }, () => assert.fail('unexpected failure'));
	const original = { ...snapshot, bytesBase64: Buffer.from('c'.repeat(8193)).toString('base64') };
	const meta = { inputs: [{ input: 'x'.repeat(1600017), output: 'y'.repeat(4097) }] };
	evidence.start(original, meta);
	evidence.event({ type: 'compiled', exitCode: 1, error: 'e'.repeat(1025) });
	await evidence.finish({ status: 'compile-error' });
	assert.deepStrictEqual(record.program.code, { text: 'c'.repeat(8192), truncated: true });
	assert.deepStrictEqual(record.runs[0].input.text, { text: 'x'.repeat(4096), truncated: true });
	assert.deepStrictEqual(record.runs[0].expectedOutput, { text: 'y'.repeat(4096), truncated: true });
	assert.deepStrictEqual(record.compile.error, { text: 'e'.repeat(1024), truncated: true });
	assert.strictEqual(meta.inputs[0].input.length, 1600017);
	assert.strictEqual(Buffer.from(original.bytesBase64, 'base64').length, 8193);
});

test('stream boundaries preserve emoji and exact limits; upstream omissions mark a short prefix incomplete', async () => {
	let record: any;
	const evidence = new BeaconEvidence('handle', 'runner', async (_op, input: any) => { record = input.record; }, () => assert.fail('unexpected failure'));
	evidence.start(snapshot, {});
	const bytes = Buffer.from('😀'.repeat(4096));
	for (let offset = 0; offset < bytes.length; offset += 7) { evidence.event({ type: 'stream', phase: 'compiling', stream: 'stderr', bytesBase64: bytes.subarray(offset, offset + 7).toString('base64') }); }
	evidence.event({ type: 'compiled', exitCode: 0 });
	evidence.event({ type: 'stream', phase: 'running', text: 'ok', sourceOmittedBytes: 500 });
	evidence.event({ type: 'stream', phase: 'running', text: 'after a missing span' });
	await evidence.finish({ status: 'completed', exitCode: 0 });
	assert.strictEqual(record.compile.output.stderr, '😀'.repeat(4096));
	assert.deepStrictEqual(record.runs[0].output.merged, { text: 'ok', truncated: true });
});

test('Runner owner errors after compilation never fabricate a completed input', async () => {
	let record: any;
	const evidence = new BeaconEvidence('handle', 'runner', async (_op, input: any) => { record = input.record; }, () => assert.fail('unexpected failure'));
	evidence.start(snapshot, {}); evidence.event({ type: 'compiled', exitCode: 0 });
	await evidence.finish({ status: 'runner-error', message: 'Helper could not start.' });
	assert.strictEqual(record.status, 'failed'); assert.strictEqual(record.runs[0].status, 'start-failed');
	assert.strictEqual(record.runs[0].exitCode, undefined); assert.strictEqual(record.runs[0].error, 'Helper could not start.');
});

test('CPH preserves program completion before a checker exception without inventing a check', async () => {
	let record: any;
	const evidence = new BeaconEvidence('handle', 'cph', async (_op, input: any) => { record = input.record; }, () => assert.fail('unexpected failure'));
	evidence.start(snapshot, { inputs: [{ input: '1', output: '1' }], operation: 'test-one' }); evidence.event({ type: 'compiled', exitCode: 0 });
	evidence.event({ type: 'sample-started', index: 0 });
	evidence.event({ type: 'sample-executed', index: 0, result: { stdout: '1', stderr: '', exitCode: 0, durationMs: 2 } });
	await evidence.finish({ status: 'failed' });
	assert.strictEqual(record.runs[0].status, 'completed'); assert.strictEqual(record.runs[0].exitCode, 0);
	assert.strictEqual(record.runs[0].durationMs, 2); assert.strictEqual(record.runs[0].check, undefined);
});

for (const phase of ['start', 'event', 'finish', 'publication'] as const) {
	test(`adapter ${phase} failures are reported once and never interrupt execution`, async () => {
		const failure = new Error(`${phase} failed`);
		const errors: unknown[] = [];
		let publications = 0;
		const evidence = new BeaconEvidence('handle', 'runner', async () => { publications++; throw failure; }, error => {
			errors.push(error);
			throw new Error('notification unavailable');
		});
		const invalid = { get status(): string { throw failure; } };
		evidence.start(snapshot, phase === 'start' ? invalid : {});
		evidence.event(phase === 'event' ? { get type(): string { throw failure; } } : { type: 'compiled', exitCode: 0 });
		await evidence.finish(phase === 'finish' ? invalid : { status: 'completed', exitCode: 0 });
		evidence.start(snapshot, {});
		evidence.event({ type: 'compiled', exitCode: 0 });
		await evidence.finish({ status: 'completed', exitCode: 0 });
		assert.deepStrictEqual(errors, [failure]);
		assert.equal(publications, phase === 'publication' ? 1 : 0, 'a failed adapter must not publish incomplete facts or retry');
	});
}

test('a delayed publication retains its own record while a later action can publish independently', async () => {
	let complete!: () => void;
	const pending = new Promise<void>(resolve => { complete = resolve; });
	const records: any[] = [];
	const first = new BeaconEvidence('first', 'runner', async (_operation, input: any) => { records.push(input); await pending; }, () => assert.fail('unexpected failure'));
	first.start(snapshot, {});
	const publishing = first.finish({ status: 'compile-error' });
	const second = new BeaconEvidence('second', 'runner', async (_operation, input: any) => { records.push(input); }, () => assert.fail('unexpected failure'));
	second.start({ ...snapshot, originalPath: 'C:\\project\\second.cpp' }, {});
	await second.finish({ status: 'compile-error' });
	assert.deepStrictEqual(records.map(item => [item.handle, item.record.program.filePath]), [['first', snapshot.originalPath], ['second', 'C:\\project\\second.cpp']]);
	complete(); await publishing;
});

test('Runner compile cancellation is preserved separately from a compiler error', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-evidence-compile-stop-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const sourcePath = path.join(root, 'main.cpp'), compilerPath = path.join(root, 'g++.exe');
	fs.writeFileSync(sourcePath, 'int main(){}'); fs.writeFileSync(compilerPath, 'compiler');
	let record: any, spawns = 0;
	const failures: unknown[] = [];
	const evidence = new BeaconEvidence('activity', 'runner', async (_operation, input: any) => { record = input.record; }, error => failures.push(error));
	const executor = new RunnerExecutor(path.join(root, 'sessions'), {
		spawn: (() => {
			spawns++;
			const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), pid: 424242, exitCode: null });
			process.nextTick(() => child.emit('spawn'));
			return child as unknown as ChildProcessWithoutNullStreams;
		}) as typeof spawn,
		terminate: async child => { child.stdout.emit('end'); child.stderr.emit('end'); process.nextTick(() => child.emit('close', null)); }
	});
	const result = await executor.execute({ source: { path: sourcePath, directory: root, name: 'main.cpp', executablePath: path.join(root, 'main.exe'), language: 'cpp' },
		compilerPath, settings: { cStandard: 'c17', cppStandard: 'c++20', cFlags: [], cppFlags: [] }, requestStartedAt: Date.now(), preCompileMs: 0, panelReadyMs: 0, saveMs: 0 }, {
		write() {}, setPhase() {}, evidence: {
			start: (snapshot, metadata) => evidence.start(snapshot, metadata),
			event: (value: any) => { evidence.event(value); if (value.type === 'process-spawned' && value.phase === 'compiling') { void executor.cancel(); } },
			finish: outcome => evidence.finish(outcome)
		}
	});
	assert.equal(result.status, 'cancelled'); assert.equal(spawns, 1); assert.deepStrictEqual(failures, []);
	assert.equal(record.status, 'cancelled'); assert.equal(record.compile.status, 'cancelled');
	assert.equal(record.runs[0].status, 'not-run'); assert.equal(record.runs[0].skipReason, 'cancelled');
});

test('a real Runner stop after successful compilation preserves the input as not run before program spawn', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-evidence-stop-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const sourcePath = path.join(root, 'main.cpp'), compilerPath = path.join(root, 'g++.exe');
	fs.writeFileSync(sourcePath, 'int main(){}'); fs.writeFileSync(compilerPath, 'compiler');
	let spawns = 0, record: any;
	const failures: unknown[] = [];
	const evidence = new BeaconEvidence('activity', 'runner', async (_operation, input: any) => { record = input.record; }, error => failures.push(error));
	const executor = new RunnerExecutor(path.join(root, 'sessions'), {
		spawn: ((_file: string, args: string[]) => {
			spawns++;
			const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), pid: 424242, exitCode: null });
			process.nextTick(() => {
				child.emit('spawn'); fs.writeFileSync(args[args.indexOf('-o') + 1], 'executable');
				child.stdout.end(); child.stderr.end(); child.emit('close', 0);
			});
			return child as unknown as ChildProcessWithoutNullStreams;
		}) as typeof spawn
	});
	const result = await executor.execute({ source: { path: sourcePath, directory: root, name: 'main.cpp', executablePath: path.join(root, 'main.exe'), language: 'cpp' },
		compilerPath, settings: { cStandard: 'c17', cppStandard: 'c++20', cFlags: [], cppFlags: [] }, requestStartedAt: Date.now(), preCompileMs: 0, panelReadyMs: 0, saveMs: 0 }, {
		write() {}, setPhase() {}, evidence: {
			start: (snapshot, metadata) => evidence.start(snapshot, metadata),
			event: (value: any) => { evidence.event(value); if (value.type === 'compiled') { void executor.cancel(); } },
			finish: outcome => evidence.finish(outcome)
		}
	});
	assert.equal(result.status, 'cancelled'); assert.equal(spawns, 1, 'only the compiler was spawned');
	assert.deepStrictEqual(failures, []);
	assert.equal(record.compile.status, 'succeeded');
	assert.equal(record.runs[0].status, 'not-run');
	assert.equal(record.runs[0].skipReason, 'cancelled');
});

test('a real Notebook input cancelled after compilation but before startup remains not run', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notebook-evidence-stop-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const notebookPath = path.join(root, 'lesson.bcnb'); fs.writeFileSync(notebookPath, '{}');
	let record: any; const failures: unknown[] = [];
	const abort = new AbortController();
	const evidence = new BeaconEvidence('activity', 'notebook', async (_operation, input: any) => { record = input.record; }, error => failures.push(error));
	const result = await runNotebookProgramGroup({ code: 'int main(){}', language: 'cpp', cellId: 'program', codeNumber: 1, codeCellNumber: 1, cwd: root, notebookPath, inputs: [{ text: '', name: '', cellNumber: 2 }] }, abort.signal, {
		phase() {}, output() {}, finished() {}, evidence: {
			start: (source, metadata) => evidence.start(source, metadata),
			event: (value: any) => { evidence.event(value); if (value.type === 'compiled') { abort.abort(); } },
			finish: outcome => evidence.finish(outcome)
		}
	}, 'unused-helper', (_source, output) => ({ compiler: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(output)}, 'executable')`], environment: process.env as Record<string, string> }));
	assert.equal(result.status, 'cancelled'); assert.deepStrictEqual(failures, []);
	assert.equal(record.compile.status, 'succeeded');
	assert.equal(record.runs[0].status, 'not-run');
	assert.equal(record.runs[0].skipReason, 'cancelled');
});

for (const status of ['completed', 'cancelled']) {
	test(`Runner actual start before ${status} keeps the final process outcome`, async () => {
		let record: any;
		const evidence = new BeaconEvidence('activity', 'runner', async (_operation, input: any) => { record = input.record; }, () => {});
		evidence.start(snapshot, {}); evidence.event({ type: 'compiled', exitCode: 0 });
		evidence.event({ type: 'input-started', index: 0 });
		await evidence.finish({ status, ...(status === 'completed' ? { exitCode: 0 } : {}) });
		assert.equal(record.runs[0].status, status);
		assert.equal(record.runs[0].skipReason, undefined);
	});
}

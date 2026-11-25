/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { BeaconEvidence } from '../src/beaconEvidence';

const snapshot = { originalPath: 'C:\\project\\main.cpp', canonicalPath: 'C:\\project\\main.cpp', path: 'C:\\private\\main.cpp', capturedAt: 1, bytesBase64: Buffer.from('int main(){}').toString('base64'), byteLength: 12, sha256: 'captured-hash' };

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

test('retains bounded UTF-8 output head and tail, while preserving code and input', async () => {
	let record: any;
	const evidence = new BeaconEvidence('handle', 'runner', async (_op, input: any) => { record = input.record; }, () => assert.fail('unexpected failure'));
	evidence.start(snapshot, {}); evidence.event({ type: 'compiled', exitCode: 0 });
	evidence.event({ type: 'stream', phase: 'running', stream: 'merged-pty', text: 'HEAD' + '中😀'.repeat(5000) + 'TAIL' });
	await evidence.finish({ status: 'completed', exitCode: 0 });
	const output = record.runs[0].output.merged;
	assert.ok(output.head.startsWith('HEAD')); assert.ok(output.tail.endsWith('TAIL'));
	assert.ok(Buffer.byteLength(output.head + output.tail) <= 8192);
	assert.strictEqual(output.head.includes('\uFFFD') || output.tail.includes('\uFFFD'), false);
	assert.strictEqual(output.omittedBytes, 35008 - Buffer.byteLength(output.head + output.tail));
	assert.strictEqual(record.runs[0].input.text, null); assert.ok(record.gaps.length);
});

test('several compile and input streams share exactly one output quota and preserve source omissions', async () => {
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
	const streams = [record.compile.output.stderr, ...record.runs.flatMap((run: any) => Object.values(run.output))];
	const bytes = streams.reduce((sum: number, value: any) => sum + Buffer.byteLength(typeof value === 'string' ? value : value.head + value.tail), 0);
	assert.strictEqual(bytes, 8192); assert.strictEqual(record.compile.output.stderr, 'short');
	assert.strictEqual(record.runs[0].input.text, '9223372036854775807\n');
	assert.strictEqual(record.runs[1].output.stderr.sourceOmittedBytesAtLeast, 11);
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

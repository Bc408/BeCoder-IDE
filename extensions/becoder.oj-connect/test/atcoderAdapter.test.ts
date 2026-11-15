/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { AtCoderAdapter, type AtCoderHost } from '../src/adapters/atcoder/adapter';

test('cancelling while login preparation is pending reaches the host without a page lease', async () => {
	let cancelled = 0, finish!: (value: { handle: string; url: string }) => void;
	const problem = { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
	const host = { openTask: () => new Promise(resolve => { finish = resolve; }), cancelPreparation: async () => { cancelled++; }, release: async () => undefined } as unknown as AtCoderHost;
	const controller = new AbortController();
	const preparing = new AtCoderAdapter(host).prepare(problem, 'file:///solution.cpp', () => undefined, controller.signal);
	controller.abort(); await Promise.resolve();
	finish({ handle: 'late', url: problem.url }); await assert.rejects(preparing);
	assert.strictEqual(cancelled, 1);
});
import { atCoderProblem } from '../src/adapters/atcoder/task';
const problem = atCoderProblem('abc086_a.cpp')!;
test('AtCoder maps native languages and consumes an early confirmed receipt', async () => {
	let sent = 0, released = 0;
	const host: AtCoderHost = {
		openTask: async () => ({ handle: 'page', url: problem.url }), inspectTask: async () => ({ languages: [{ id: '6017', label: 'C++23' }, { id: '5001', label: 'C (GCC)' }], hasDraft: false }),
		sendAndConfirm: async (_page, payload) => { sent++; assert.strictEqual(payload.source, 'int main() {}\n'); return { kind: 'record', record: { problem, id: '11', url: 'https://atcoder.jp/contests/abc086/submissions/11' } }; },
		cancel: async () => undefined, release: async () => { released++; },
		readRecord: async ref => ({ ref, phase: 'queued', rawStatus: 'WJ', sourceVerification: 'matched' }),
		readProblem: async () => { throw new Error('unused'); }, loginSummary: async () => ({ site: 'atcoder', state: 'unknown' }), reconcile: async () => { throw new Error('unused'); }
	};
	const adapter = new AtCoderAdapter(host), signal = new AbortController().signal;
	const session = await adapter.prepare(problem, 'file:///solution.cpp', () => undefined, signal);
	assert.deepStrictEqual(session.languages.map(value => value.family), ['cpp', 'c']);
	const outcome = await session.send({ snapshot: { uri: 'file:///solution.cpp', fileName: 'abc086_a.cpp', version: 1, source: 'int main() {}\n', family: 'cpp' }, languageId: '6017', replaceDraft: false }, () => undefined, signal);
	assert.strictEqual(outcome.kind, 'record');
	if (outcome.kind === 'record') { assert.strictEqual((await adapter.readRecord(outcome.record, signal)).phase, 'queued'); }
	await assert.rejects(session.send({ snapshot: { uri: 'file:///solution.cpp', fileName: 'abc086_a.cpp', version: 1, source: 'int main() {}\n', family: 'cpp' }, languageId: '6017', replaceDraft: false }, () => undefined, signal), /consumed/);
	await session.dispose(); assert.strictEqual(sent, 1); assert.strictEqual(released, 1);
});

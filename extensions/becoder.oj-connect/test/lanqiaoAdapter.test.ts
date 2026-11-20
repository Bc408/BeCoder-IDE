/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { LanqiaoAdapter, type LanqiaoHost } from '../src/adapters/lanqiao/adapter';
const problem = { site: 'lanqiao' as const, nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' };
test('Lanqiao adapter carries source family and a fixed unsaved snapshot through its one-use session', async () => {
	const reads: string[] = [], sends: unknown[] = [], releases: string[] = [];
	const host: LanqiaoHost = {
		readProgress: async () => undefined,
		prepare: async () => ({ handle: 'lease', languages: [{ id: 'c', label: 'C（gcc8.3.0）', family: 'c' }], hasDraft: false }),
		send: async (handle, payload) => { sends.push({ handle, payload }); return { kind: 'unconfirmed', attemptId: handle, problem, message: 'lanqiao-receipt-unconfirmed' }; },
		cancel: async () => { }, release: async handle => { releases.push(handle); },
		readProblem: async (ref, _signal, options) => { reads.push(options.family); return { ref, title: 'A+B', bodies: [], samples: [], limits: [], interactive: false }; },
		loginSummary: async () => ({ site: 'lanqiao', state: 'signed-in' }),
		readRecord: async ref => ({ ref, phase: 'finished', rawStatus: 'AC', sourceVerification: 'matched' }),
		reconcile: async handle => ({ kind: 'unconfirmed', attemptId: handle, problem, message: 'lanqiao-receipt-unconfirmed' })
	};
	const adapter = new LanqiaoAdapter(host), signal = new AbortController().signal;
	assert.strictEqual(adapter.fileName(problem), '254.cpp');
	assert.strictEqual((await adapter.readProblem(problem, signal, { family: 'c' })).title, 'A+B');
	assert.deepStrictEqual(reads, ['c']);
	const session = await adapter.prepare(problem, 'file:///lanqiao/254.c', () => { }, signal);
	const snapshot = { uri: 'file:///lanqiao/254.c', family: 'c' as const, fileName: '254.c', version: 7, source: '  int main() {}\n' };
	await session.send({ snapshot, languageId: 'c', replaceDraft: false }, () => { }, signal);
	await assert.rejects(session.send({ snapshot, languageId: 'c', replaceDraft: false }, () => { }, signal));
	assert.deepStrictEqual(sends, [{ handle: 'lease', payload: { source: snapshot.source, fileName: '254.c', languageId: 'c' } }]);
	await session.dispose(); await session.dispose(); assert.deepStrictEqual(releases, ['lease']);
});

test('Lanqiao progress is delivered while send is pending and late local reads cannot revive it', async () => {
	let finish!: (value: Awaited<ReturnType<LanqiaoHost['send']>>) => void;
	let read!: () => void, late!: (value: Awaited<ReturnType<LanqiaoHost['readProgress']>>) => void;
	const reading = new Promise<void>(resolve => { read = resolve; });
	const host: LanqiaoHost = {
		prepare: async () => ({ handle: 'lease', languages: [{ id: 'cpp', label: 'C++（g++17）', family: 'cpp' }], hasDraft: false }),
		send: async () => new Promise(resolve => { finish = resolve; }),
		readProgress: async () => { read(); return new Promise(resolve => { late = resolve; }); },
		cancel: async () => { }, release: async () => { },
		readProblem: async ref => ({ ref, title: 'A+B', bodies: [], samples: [], limits: [], interactive: false }),
		loginSummary: async () => ({ site: 'lanqiao', state: 'signed-in' }),
		readRecord: async ref => ({ ref, phase: 'finished', rawStatus: 'AC', sourceVerification: 'matched' }),
		reconcile: async attemptId => ({ kind: 'unconfirmed', attemptId, problem, message: 'pending' })
	};
	const adapter = new LanqiaoAdapter(host), signal = new AbortController().signal;
	const session = await adapter.prepare(problem, 'file:///lanqiao/254.cpp', () => { }, signal);
	const updates: string[] = [];
	let delivered!: () => void;
	const confirming = new Promise<void>(resolve => { delivered = resolve; });
	const groups = [{ name: 'Test Cases', rows: [['1', 'AC', '1 ms', '0 kb']] }];
	const pending = session.send({ snapshot: { uri: 'file:///lanqiao/254.cpp', family: 'cpp', fileName: '254.cpp', version: 1, source: 'int main(){}' }, languageId: 'cpp', replaceDraft: false }, value => {
		updates.push(value.evaluation?.phase ?? 'missing');
		if (value.evaluation?.phase === 'confirming') { assert.deepStrictEqual(value.evaluation.groups, groups); delivered(); throw new Error('display failed'); }
	}, signal);
	await reading;
	assert.deepStrictEqual(updates, ['sending'], 'the shared view can open before execution or receipt finishes');
	let reads = 0;
	host.readProgress = async () => { if (++reads === 1) { throw new Error('local progress unavailable'); } return { phase: 'confirming', groups }; };
	late({ phase: 'judging' }); await confirming;
	assert.deepStrictEqual(updates, ['sending', 'judging', 'confirming'], 'real stages arrive while the sending promise is still pending');
	const readingAgain = new Promise<void>(resolve => { read = resolve; });
	host.readProgress = async () => { read(); return new Promise(resolve => { late = resolve; }); };
	await readingAgain;
	finish({ kind: 'unconfirmed', attemptId: 'lease', problem, message: 'pending' });
	await pending;
	late({ phase: 'judging' }); await Promise.resolve(); await Promise.resolve();
	assert.deepStrictEqual(updates, ['sending', 'judging', 'confirming'], 'a late read cannot overwrite the stopped view');
	await session.dispose();
});

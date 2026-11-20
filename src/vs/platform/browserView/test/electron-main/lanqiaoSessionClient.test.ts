/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { LanqiaoSessionClient } from '../../electron-main/lanqiaoSessionClient.js';
import type { LanqiaoOperation, LanqiaoResponse } from '../../electron-main/lanqiaoTransport.js';
import { lanqiaoFixtureProblem as problem, lanqiaoFixtureData, lanqiaoFixtureHTML, lanqiaoFixtureRuntime, lanqiaoFixtureApplication, lanqiaoFixtureLanguages } from './lanqiaoFixtures.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Fixture clients disposed in teardown.
suite('Lanqiao Session ownership', () => {
	const clients: LanqiaoSessionClient[] = [];
	teardown(() => { clients.splice(0).forEach(client => client.dispose()); });
	function fixture() {
		let changed!: () => void, account = 12, status = 200, accountReads = 0, rotating = 0;
		const calls: LanqiaoOperation[] = [];
		let reply: ((operation: LanqiaoOperation) => Promise<LanqiaoResponse>) | undefined;
		const client = new LanqiaoSessionClient({
			onSessionChange(listener) { changed = listener; return { dispose() { } }; }, transport: {
				async request(operation) {
					calls.push(operation); if (reply) { return reply(operation); }
					if (operation.kind === 'account') { accountReads++; if (rotating > 0) { rotating--; changed(); } return { status, body: JSON.stringify({ id: account, name: 'Student' }) }; }
					if (operation.kind === 'problem') { return { status: 200, body: JSON.stringify(lanqiaoFixtureData) }; }
					if (operation.kind === 'catalogue-page') { return { status: 200, body: lanqiaoFixtureHTML }; }
					if (operation.kind === 'catalogue-asset') { return { status: 200, body: operation.url.endsWith('1111111.js') ? lanqiaoFixtureRuntime : operation.url.endsWith('2222222.js') ? lanqiaoFixtureApplication : lanqiaoFixtureLanguages }; }
					throw new Error('unexpected-operation');
				}
			}
		}); clients.push(client);
		return { client, calls, change: () => changed(), account: (id: number) => { account = id; changed(); }, rotate: (count: number) => { rotating = count; }, status: (value: number) => { status = value; }, reads: () => accountReads, reply: (value: typeof reply) => { reply = value; } };
	}
	test('first credential writes recheck identity once and continuous rotation fails closed', async () => {
		const f = fixture(); f.rotate(1);
		assert.strictEqual((await f.client.loginSummary(new AbortController().signal)).state, 'signed-in');
		assert.strictEqual(f.reads(), 2);
		f.rotate(3);
		assert.strictEqual((await f.client.loginSummary(new AbortController().signal)).state, 'unknown');
		assert.strictEqual(f.reads(), 4);
	});
	test('authentication failure differs from unavailable identity', async () => {
		const f = fixture(); f.status(401);
		assert.strictEqual((await f.client.loginSummary(new AbortController().signal)).state, 'signed-out');
		f.status(403); assert.strictEqual((await f.client.loginSummary(new AbortController().signal)).state, 'unknown');
	});
	test('statement and current compiler reads do not prepare or navigate and preserve family', async () => {
		const f = fixture(), signal = new AbortController().signal;
		assert.strictEqual((await f.client.readProblem(problem, { family: 'c' }, signal)).limits[0].value, '2 s');
		assert.strictEqual((await f.client.readLanguages(problem, signal))[0].id, 'cpp');
		assert.ok(f.calls.every(op => !['source', 'report', 'records'].includes(op.kind)));
		assert.strictEqual(f.calls.filter(op => op.kind === 'account').length, 0);
	});
	test('caller cancellation and disposal cannot deliver late statements', async () => {
		for (const stop of ['cancel', 'dispose']) {
			const f = fixture(), controller = new AbortController();
			let finish!: (value: LanqiaoResponse) => void;
			f.reply(async () => new Promise(resolve => { finish = resolve; }));
			const pending = f.client.readProblem(problem, { family: 'cpp' }, controller.signal);
			await Promise.resolve();
			if (stop === 'cancel') { controller.abort(); } else { f.client.dispose(); }
			finish({ status: 200, body: JSON.stringify(lanqiaoFixtureData) });
			await assert.rejects(pending);
		}
	});
});

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Transaction clients disposed in teardown.
suite('Lanqiao one-source one-report transaction', () => {
	const clients: LanqiaoSessionClient[] = [];
	teardown(() => { clients.splice(0).forEach(client => client.dispose()); });
	const id = '6aff1ff717e87398a15a4abf';
	const payload = { source: 'int main(){}\r\n', fileName: '254.cpp', languageId: 'cpp' };
	function fixture() {
		let clock = 0, sourcePosts = 0, reportPosts = 0, account = 12, mode = 'ok', changed!: () => void;
		let afterExecution: (() => void) | undefined;
		let detailReads = 0;
		const operations: string[] = [];
		const client = new LanqiaoSessionClient({
			onSessionChange(listener) { changed = listener; return { dispose() { } }; },
			transport: {
				async request(operation, signal, dispatch) {
					operations.push(operation.kind); signal.throwIfAborted(); dispatch?.();
					if (operation.kind === 'account') { return { status: 200, body: JSON.stringify({ id: account }) }; }
					if (operation.kind === 'problem') { return { status: 200, body: JSON.stringify(lanqiaoFixtureData) }; }
					if (operation.kind === 'catalogue-page') { return { status: 200, body: lanqiaoFixtureHTML }; }
					if (operation.kind === 'catalogue-asset') { return { status: 200, body: operation.url.endsWith('1111111.js') ? lanqiaoFixtureRuntime : operation.url.endsWith('2222222.js') ? lanqiaoFixtureApplication : lanqiaoFixtureLanguages }; }
					if (operation.kind === 'source') {
						sourcePosts++; assert.strictEqual(operation.source, payload.source); assert.strictEqual(operation.language, 'cpp');
						if (mode === 'source-lost') { throw new Error('network lost'); }
						return { status: mode === 'source-redirect' ? 307 : 200, body: JSON.stringify({ submission_url: 'https://opcenter.lanqiao.cn/api/v1/evaluation/questions/43756/submissions/' + id + '/?is_submit=true&judge_client=2', judge_client: 2 }) };
					}
					if (operation.kind === 'execute') { afterExecution?.(); return { status: 200, body: JSON.stringify({ code: 0, data: { execute_status: mode === 'execution-timeout' ? 1 : 2 } }) }; }
					if (operation.kind === 'report') { reportPosts++; assert.strictEqual(operation.id, id); if (mode === 'report-lost') { throw new Error('lost report'); } return { status: 200, body: JSON.stringify({ status: 'AC', test_cases: [{ status: true, millisecond: 0, memory: 0, result: 'hidden input and answer' }] }) }; }
					if (operation.kind === 'records') { return { status: 200, body: JSON.stringify({ results: sourcePosts === 0 && mode !== 'old-id' ? [] : [{ submission_id: id, language: 'cpp' }] }) }; }
					if (operation.kind === 'record') {
						detailReads++;
						if (mode === 'initial-404' && detailReads === 1 || mode === 'no-detail') { return { status: 404, body: '{}' }; }
						return { status: 200, body: JSON.stringify({ submission_id: id, problem_id: mode === 'wrong-problem' ? 255 : 254, language: mode === 'wrong-language' ? 'c' : 'cpp', content: mode === 'wrong-source' ? 'int main(){} \n' : 'int main(){}\n', status: 'AC', elapsed_time: 0, memory: 0, pass_sample: '1 / 1' }) };
					}
					throw new Error('unexpected-operation');
				}
			},
			now: () => clock, pause: async (ms, signal) => { clock += ms; signal.throwIfAborted(); }
		}); clients.push(client);
		return { client, operations, mode: (value: string) => { mode = value; }, sourcePosts: () => sourcePosts, reportPosts: () => reportPosts, account: (value: number) => { account = value; changed(); }, afterExecution: (value: () => void) => { afterExecution = value; } };
	}
	test('source and report are consumed once before dispatch, and provisional execution becomes a matched formal receipt', async () => {
		const f = fixture(), signal = new AbortController().signal;
		const prepared = await f.client.prepare(problem, signal);
		const first = f.client.send(problem, payload, prepared.ownerKey, 'attempt', signal);
		assert.strictEqual((await f.client.send(problem, payload, prepared.ownerKey, 'duplicate', signal)).kind, 'not-sent');
		const result = await first; assert.strictEqual(result.kind, 'record');
		assert.strictEqual(f.sourcePosts(), 1); assert.strictEqual(f.reportPosts(), 1);
		assert.ok(f.operations.indexOf('report') > f.operations.indexOf('execute'));
		if (result.kind === 'record') {
			const value = await f.client.readRecord(result.record, signal);
			assert.strictEqual(value.sourceVerification, 'matched'); assert.strictEqual(value.time, '0 ms');
			assert.deepStrictEqual(value.groups?.[0].rows, [['1', 'AC', '0 ms', '0 kb']]);
			assert.ok(!JSON.stringify(value).includes('hidden input'));
			f.client.releaseRecord(result.record);
			assert.strictEqual((await f.client.readRecord(result.record, signal)).groups, undefined);
			assert.strictEqual(f.reportPosts(), 1);
		}
	});
	test('local progress shows execution before formal receipt without granting record access or making requests', async () => {
		const f = fixture(), signal = new AbortController().signal;
		assert.strictEqual(f.client.readProgress('attempt'), undefined);
		const prepared = await f.client.prepare(problem, signal);
		let observed = false;
		f.afterExecution(() => {
			const before = f.operations.length;
			assert.deepStrictEqual(f.client.readProgress('attempt'), { phase: 'judging' });
			assert.strictEqual(f.client.readProgress('other'), undefined);
			assert.strictEqual(f.operations.length, before, 'progress reads are memory-only');
			observed = true;
		});
		assert.strictEqual((await f.client.send(problem, payload, prepared.ownerKey, 'attempt', signal)).kind, 'record');
		assert.ok(observed);
		assert.strictEqual(f.client.readProgress('attempt'), undefined, 'completed sends cannot leak retained progress');
		assert.strictEqual(f.sourcePosts(), 1); assert.strictEqual(f.reportPosts(), 1);
	});
	test('credential changes hide progress until the current account has been checked', async () => {
		const f = fixture(), signal = new AbortController().signal, prepared = await f.client.prepare(problem, signal);
		f.afterExecution(() => {
			f.account(13);
			assert.strictEqual(f.client.readProgress('attempt'), undefined);
		});
		await assert.rejects(f.client.send(problem, payload, prepared.ownerKey, 'attempt', signal), /lanqiao-session-changed/);
		assert.strictEqual(f.reportPosts(), 0);
	});
	test('source loss and redirects stay unconfirmed without scanning the latest AC or resending', async () => {
		for (const mode of ['source-lost', 'source-redirect']) {
			const f = fixture(); f.mode(mode); const signal = new AbortController().signal, prepared = await f.client.prepare(problem, signal);
			const listsBeforeSend = f.operations.filter(kind => kind === 'records').length;
			assert.strictEqual((await f.client.send(problem, payload, prepared.ownerKey, 'attempt', signal)).kind, 'unconfirmed');
			assert.strictEqual((await f.client.reconcile('attempt', signal)).kind, 'unconfirmed');
			assert.strictEqual(f.sourcePosts(), 1); assert.strictEqual(f.reportPosts(), 0); assert.strictEqual(f.operations.filter(kind => kind === 'records').length, listsBeforeSend);
		}
	});
	test('cancel before report and execution timeout never start report during continued GET-only reconciliation', async () => {
		for (const mode of ['cancel', 'execution-timeout']) {
			const f = fixture(), controller = new AbortController();
			if (mode === 'cancel') { f.afterExecution(() => controller.abort()); } else { f.mode(mode); }
			const prepared = await f.client.prepare(problem, controller.signal);
			assert.strictEqual((await f.client.send(problem, payload, prepared.ownerKey, 'attempt', controller.signal)).kind, 'unconfirmed');
			await f.client.reconcile('attempt', new AbortController().signal);
			assert.strictEqual(f.sourcePosts(), 1); assert.strictEqual(f.reportPosts(), 0);
		}
	});
	test('lost report and transient404 may confirm only via matching official details', async () => {
		for (const mode of ['report-lost', 'initial-404']) {
			const f = fixture(); f.mode(mode); const signal = new AbortController().signal, prepared = await f.client.prepare(problem, signal);
			const result = await f.client.send(problem, payload, prepared.ownerKey, 'attempt', signal);
			assert.strictEqual(result.kind, 'record'); assert.strictEqual(f.sourcePosts(), 1); assert.strictEqual(f.reportPosts(), 1);
		}
	});
	test('wrong problem, token or exact normalized source cannot be recognized as this receipt', async () => {
		for (const mode of ['wrong-problem', 'wrong-language', 'wrong-source']) {
			const f = fixture(); f.mode(mode); const signal = new AbortController().signal, prepared = await f.client.prepare(problem, signal);
			assert.strictEqual((await f.client.send(problem, payload, prepared.ownerKey, 'attempt', signal)).kind, 'unconfirmed');
			assert.strictEqual(f.sourcePosts(), 1); assert.strictEqual(f.reportPosts(), 1);
		}
	});
	test('a changed account invalidates a preparation and a fresh client cannot restore an old attempt', async () => {
		const f = fixture(), signal = new AbortController().signal, prepared = await f.client.prepare(problem, signal);
		f.account(13);
		const result = await f.client.send(problem, payload, prepared.ownerKey, 'old', signal).catch(() => undefined);
		assert.notStrictEqual(result?.kind, 'record'); assert.strictEqual(f.sourcePosts(), 0);
		await assert.rejects(fixture().client.reconcile('old', signal));
	});
	test('a source response pointing at an existing record cannot claim the earlier accepted solution', async () => {
		const f = fixture(); f.mode('old-id'); const signal = new AbortController().signal, prepared = await f.client.prepare(problem, signal);
		assert.strictEqual((await f.client.send(problem, payload, prepared.ownerKey, 'old-record', signal)).kind, 'unconfirmed');
		assert.strictEqual((await f.client.reconcile('old-record', signal)).kind, 'unconfirmed');
		assert.strictEqual(f.reportPosts(), 0);
	});
});

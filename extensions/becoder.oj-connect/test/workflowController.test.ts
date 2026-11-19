/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import type { OjAdapter, SubmissionSession } from '../src/adapters/adapter';
import type { ISourceSnapshot, ProblemRef, RecordRef } from '../src/domain';
import { SubmissionController, type SubmissionHost } from '../src/workflowController';
import { defaultDirectories } from '../src/settings';
import { luoguProblem } from '../src/adapters/luogu/task';
import { atCoderProblem } from '../src/adapters/atcoder/task';
import { OjPreferences } from '../src/preferences';

const snapshot = { uri: 'file:///C:/cpp/luogu/P1001.cpp', fileName: 'P1001.cpp', version: 3, family: 'cpp' as const, source: 'first\r\n稿\r\n' };
function fixture() {
	const sent: { site: string; snapshot: ISourceSnapshot; languageId: string }[] = [];
	const records: RecordRef[] = [];
	let selected = 0, released = 0, cancelled = 0;
	const make = (site: 'luogu' | 'atcoder', resolve: (input: string) => ProblemRef | undefined): OjAdapter => ({
		site, resolve, fileName: () => 'P1001.cpp', readProblem: async () => { throw new Error('unused'); }, loginSummary: async () => ({ site, state: 'unknown' }),
		prepare: async problem => ({
			languages: [{ id: site === 'luogu' ? '28:o2' : '6017', label: 'C++17', family: 'cpp' }, { id: site === 'luogu' ? '2' : '6016', label: 'C11', family: 'c' }], hasDraft: false,
			send: async input => { sent.push({ site, snapshot: input.snapshot, languageId: input.languageId }); return { kind: 'record', record: { problem, id: '11', url: site === 'luogu' ? 'https://www.luogu.com.cn/record/11' : 'https://atcoder.jp/contests/abc086/submissions/11' } }; },
			cancel: async () => { cancelled++; }, dispose: async () => { released++; }
		}),
		readRecord: async () => { throw new Error('unused'); }, reconcile: async () => { throw new Error('unused'); }
	});
	const luogu = make('luogu', luoguProblem), atcoder = make('atcoder', atCoderProblem);
	const host: SubmissionHost = {
		adapters: [luogu, atcoder], directories: () => defaultDirectories, requestProblem: async () => undefined,
		chooseLanguage: async options => { selected++; return options[0].id; }, confirmDraft: async () => true,
		runWithProgress: async (_name, operation) => operation(() => undefined), openRecord: async ref => { records.push(ref); }
	};
	const values = new Map<string, unknown>();
	const preferences = new OjPreferences({ get: <T>(key: string) => values.get(key) as T | undefined, update: async (key, value) => { values.set(key, value); } });
	return { controller: new SubmissionController(host, preferences), host, luogu, atcoder, sent, records, selected: () => selected, released: () => released, cancelled: () => cancelled };
}
test('both adapters share fixed source snapshot and remember languages separately', async () => {
	const f = fixture(), input = { ...snapshot };
	f.host.chooseLanguage = async options => { input.source = 'later'; return options[0].id; };
	await f.controller.submit(input);
	assert.strictEqual(f.sent[0].snapshot.source, 'first\n稿\n');
	assert.strictEqual(f.records[0].id, '11');
	assert.strictEqual(f.released(), 1);
	const g = fixture();
	await g.controller.submit(snapshot);
	await g.controller.submit({ ...snapshot, uri: 'file:///C:/cpp/atcoder/abc086_a.cpp' });
	await g.controller.submit(snapshot);
	assert.strictEqual(g.selected(), 2);
	assert.deepStrictEqual(g.sent.map(value => value.languageId), ['28:o2', '6017', '28:o2']);
});

test('AtCoder compiler choices persist across controllers and an expired choice asks again', async () => {
	const values = new Map<string, unknown>();
	const preferences = new OjPreferences({ get: <T>(key: string) => values.get(key) as T | undefined, update: async (key, value) => { values.set(key, value); } });
	const f = fixture(), prepare = f.atcoder.prepare;
	let compiler = '6017';
	f.atcoder.prepare = async (...args) => ({ ...await prepare(...args), languages: [{ id: compiler, label: 'C++23', family: 'cpp' }] });
	const source = { ...snapshot, uri: 'file:///C:/cpp/atcoder/abc086_a.cpp', fileName: 'abc086_a.cpp' };
	await new SubmissionController(f.host, preferences).submit(source);
	await new SubmissionController(f.host, preferences).submit(source);
	assert.strictEqual(f.selected(), 0, 'the first available default is reused without a picker');
	compiler = '7017';
	await new SubmissionController(f.host, preferences).submit(source);
	assert.strictEqual(f.selected(), 1, 'an expired saved choice still requires an explicit replacement');
	assert.deepStrictEqual(f.sent.map(value => value.languageId), ['6017', '6017', '7017']);
});

test('the statement language selector and keyboard submission use the same preference', async () => {
	const f = fixture();
	f.controller.selectLanguage('luogu', 'cpp', '28:o2');
	await f.controller.submit(snapshot);
	assert.strictEqual(f.selected(), 0);
	assert.strictEqual(f.sent[0].languageId, '28:o2');
	assert.strictEqual(f.controller.preferredLanguage('luogu', 'cpp'), '28:o2');
});

test('an offline symbolic compiler resolves only against a fresh exact official label before sending', async () => {
	const f = fixture(), prepare = f.atcoder.prepare;
	const values = new Map<string, unknown>([['atcoder.cCompiler', 'catalogue:atcoder-c23-gcc']]);
	const preferences = new OjPreferences({ get: <T>(key: string) => values.get(key) as T | undefined, update: async (key, value) => { values.set(key, value); } });
	f.atcoder.prepare = async (...args) => ({ ...await prepare(...args), languages: [{ id: '6123', label: 'C23 (GCC 14.2.0)', family: 'c' }] });
	const input = { ...snapshot, uri: 'file:///C:/cpp/atcoder/abc086_a.c', fileName: 'abc086_a.c', family: 'c' as const };
	await new SubmissionController(f.host, preferences).submit(input);
	assert.strictEqual(f.selected(), 0, 'an exact current official match preserves the prior explicit choice');
	assert.strictEqual(f.sent[0].languageId, '6123');
	assert.strictEqual(preferences.language('atcoder', 'c'), '6123', 'only the current numeric website ID is persisted after validation');
	values.set('atcoder.cCompiler', 'catalogue:atcoder-c23-gcc');
	f.atcoder.prepare = async (...args) => ({ ...await prepare(...args), languages: [{ id: '7123', label: 'C23 (GCC 15.0.0)', family: 'c' }] });
	let choices = 0;
	f.host.chooseLanguage = async () => { choices++; return undefined; };
	await new SubmissionController(f.host, preferences).submit(input);
	assert.strictEqual(choices, 1, 'a changed compiler requires an explicit replacement instead of an approximate label match');
	assert.strictEqual(f.sent.length, 1);
	f.host.chooseLanguage = async () => 'catalogue:atcoder-c23-gcc';
	await assert.rejects(new SubmissionController(f.host, preferences).submit(input), /no longer available/);
	assert.strictEqual(f.sent.length, 1, 'a symbolic selection never reaches the sending host');
});
test('late preparation after cancellation is cancelled and disposed without sending', async () => {
	const f = fixture();
	const prepare = f.luogu.prepare;
	let finish!: (session: SubmissionSession) => void, entered!: () => void;
	const started = new Promise<void>(resolve => { entered = resolve; });
	f.luogu.prepare = async (...args) => { const session = await prepare(...args); entered(); return new Promise(resolve => { finish = () => resolve(session); }); };
	const pending = f.controller.submit(snapshot);
	await started;
	await assert.rejects(f.controller.submit(snapshot), /progress/);
	await f.controller.cancel(); finish(undefined!); await pending;
	assert.strictEqual(f.sent.length, 0);
	assert.strictEqual(f.cancelled(), 1);
	assert.strictEqual(f.released(), 1);
});
test('draft refusal and cancelled language selection do not send', async () => {
	const f = fixture(), original = f.luogu.prepare;
	f.luogu.prepare = async (...args) => ({ ...await original(...args), hasDraft: true });
	f.host.confirmDraft = async () => false;
	await f.controller.submit(snapshot);
	assert.strictEqual(f.sent.length, 0);
	const g = fixture(); g.host.chooseLanguage = async () => undefined;
	await g.controller.submit(snapshot); assert.strictEqual(g.sent.length, 0);
});
test('uncertain send and record presentation failure never retry the source', async () => {
	const f = fixture(), prepare = f.luogu.prepare;
	f.luogu.prepare = async (...args) => ({
		...await prepare(...args), send: async input => {
			f.sent.push({ site: 'luogu', snapshot: input.snapshot, languageId: input.languageId });
			return { kind: 'unconfirmed', problem: luoguProblem('P1001')!, attemptId: 'attempt', message: 'Connection lost' };
		}
	});
	assert.strictEqual((await f.controller.submit(snapshot))?.kind, 'unconfirmed');
	assert.strictEqual(f.sent.length, 1); assert.strictEqual(f.records.length, 0);
	const g = fixture(); g.host.openRecord = async () => { throw new Error('panel closed'); };
	await assert.rejects(g.controller.submit(snapshot), /panel closed/);
	assert.strictEqual(g.sent.length, 1); assert.strictEqual(g.released(), 1);
});

test('cancellation after acceptance retains the formal receipt', async () => {
	const f = fixture(), prepare = f.luogu.prepare;
	f.luogu.prepare = async (...args) => {
		const session = await prepare(...args);
		return {
			...session, send: async (...sendArgs) => {
				const result = await session.send(...sendArgs);
				await f.controller.cancel();
				return result;
			}
		};
	};
	assert.strictEqual((await f.controller.submit(snapshot))?.kind, 'record');
	assert.strictEqual(f.records[0]?.id, '11');
	assert.strictEqual(f.sent.length, 1);
});

test('cancellation after sending retains the unconfirmed attempt without resending', async () => {
	const f = fixture(), prepare = f.luogu.prepare;
	f.luogu.prepare = async (...args) => {
		const session = await prepare(...args);
		return {
			...session, send: async input => {
				f.sent.push({ site: 'luogu', snapshot: input.snapshot, languageId: input.languageId });
				await f.controller.cancel();
				return { kind: 'unconfirmed', problem: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, attemptId: 'sent-attempt', message: 'Connection lost' };
			}
		};
	};
	assert.deepStrictEqual(await f.controller.submit(snapshot), {
		kind: 'unconfirmed', problem: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, attemptId: 'sent-attempt', message: 'Connection lost'
	});
	assert.strictEqual(f.sent.length, 1);
	assert.strictEqual(f.records.length, 0);
	assert.strictEqual(f.cancelled(), 1);
	assert.strictEqual(f.released(), 1);
});

test('deactivation suppresses a late unconfirmed attempt', async () => {
	const f = fixture(), prepare = f.luogu.prepare;
	f.luogu.prepare = async (...args) => {
		const session = await prepare(...args);
		return {
			...session, send: async () => {
				await f.controller.dispose();
				return { kind: 'unconfirmed', problem: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, attemptId: 'sent-attempt', message: 'Connection lost' };
			}
		};
	};
	assert.strictEqual(await f.controller.submit(snapshot), undefined);
	assert.strictEqual(f.records.length, 0);
	assert.strictEqual(f.released(), 1);
});

test('deactivation cannot reopen a result panel from a late accepted receipt', async () => {
	const f = fixture(), prepare = f.luogu.prepare;
	f.luogu.prepare = async (...args) => {
		const session = await prepare(...args);
		return {
			...session, send: async (...sendArgs) => {
				const result = await session.send(...sendArgs);
				await f.controller.dispose();
				return result;
			}
		};
	};
	assert.strictEqual(await f.controller.submit(snapshot), undefined);
	assert.strictEqual(f.records.length, 0);
});

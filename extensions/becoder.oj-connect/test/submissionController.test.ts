/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { test } from 'node:test';
import type { IAtCoderSourcePayload } from 'becoder-oj-connect';
import { SubmissionController, type SubmissionHost } from '../src/workflowController';
import { AtCoderAdapter, type AtCoderHost } from '../src/adapters/atcoder/adapter';
import { defaultDirectories } from '../src/settings';
import { OjPreferences } from '../src/preferences';

const snapshot = { uri: 'file:///C:/c++/atcoder/abc086_a.cpp', fileName: 'abc086_a.cpp', version: 7, family: 'cpp' as const, source: 'first\r\n稿\r\n' };
function fixture() {
	const sent: IAtCoderSourcePayload[] = [];
	let releases = 0, reveals = 0, cancels = 0;
	const bridge: AtCoderHost = {
		openTask: async url => ({ handle: 'opaque', url }),
		inspectTask: async () => ({ languages: [{ id: '6017', label: 'C++23' }], hasDraft: false }),
		sendAndConfirm: async (_page, payload) => { sent.push(payload); return { kind: 'record', record: { problem: { site: 'atcoder', nativeId: 'abc086/abc086_a', url: _page.url }, id: '11', url: 'https://atcoder.jp/contests/abc086/submissions/11' } }; },
		readProblem: async () => { throw new Error('unused'); }, readRecord: async () => { throw new Error('unused'); }, reconcile: async () => { throw new Error('unused'); }, loginSummary: async () => ({ site: 'atcoder', state: 'unknown' }),
		cancel: async () => { cancels++; }, release: async () => { releases++; }
	};
	const host: SubmissionHost = {
		adapters: [new AtCoderAdapter(bridge)], directories: () => defaultDirectories,
		requestProblem: async () => undefined,
		chooseLanguage: async () => '6017', confirmDraft: async () => true,
		openRecord: async () => { reveals++; }, runWithProgress: async (_name, operation) => operation(() => undefined)
	};
	const values = new Map<string, unknown>();
	const preferences = new OjPreferences({ get: <T>(key: string) => values.get(key) as T | undefined, update: async (key, value) => { values.set(key, value); } });
	return { controller: new SubmissionController(host, preferences), bridge, host, sent, releases: () => releases, reveals: () => reveals, cancels: () => cancels };
}
test('snapshot is fixed before asynchronous language choice and normalized without saving', async () => {
	const f = fixture(), draft = { ...snapshot };
	f.host.chooseLanguage = async () => { draft.source = 'later'; draft.version++; return '6017'; };
	await f.controller.submit(draft);
	assert.strictEqual(f.sent[0].source, 'first\n稿\n');
	assert.strictEqual(draft.source, 'later');
	assert.strictEqual(f.reveals(), 1); assert.strictEqual(f.releases(), 1);
});
test('cancelled language choice and refused existing draft send nothing', async () => {
	const f = fixture(); f.host.chooseLanguage = async () => undefined;
	await f.controller.submit(snapshot); assert.strictEqual(f.sent.length, 0); assert.strictEqual(f.releases(), 1);
	const g = fixture(); g.bridge.inspectTask = async () => ({ languages: [{ id: '6017', label: 'C++23' }], hasDraft: true });
	g.host.confirmDraft = async () => false;
	await g.controller.submit(snapshot); assert.strictEqual(g.sent.length, 0);
});
test('concurrent shortcut and cancel during pending choice cannot send', async () => {
	const f = fixture(); let finish!: (value: string) => void, entered!: () => void;
	const ready = new Promise<void>(resolve => { entered = resolve; });
	f.host.chooseLanguage = () => { entered(); return new Promise(resolve => { finish = resolve; }); };
	const waiting = f.controller.submit(snapshot); await ready;
	await assert.rejects(f.controller.submit(snapshot), /progress/);
	await f.controller.cancel(); finish('6017');
	assert.strictEqual(await waiting, undefined); assert.strictEqual(f.sent.length, 0); assert.strictEqual(f.cancels(), 1);
});
test('dispose before open returns releases late page without inspection or sending', async () => {
	const f = fixture(); let finish!: (value: { handle: string; url: string }) => void;
	f.bridge.openTask = () => new Promise(resolve => { finish = resolve; });
	const waiting = f.controller.submit(snapshot);
	await f.controller.dispose(); finish({ handle: 'late', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' });
	assert.strictEqual(await waiting, undefined); assert.strictEqual(f.sent.length, 0); assert.strictEqual(f.releases(), 1);
});
test('other site directory never falls back to AtCoder', async () => {
	const f = fixture();
	await assert.rejects(f.controller.submit({ ...snapshot, uri: 'file:///C:/c++/luogu/abc086_a.cpp' }), /available.*luogu/);
	assert.strictEqual(f.sent.length, 0);
});

test('confirmed submission releases its page and busy state before the result panel finishes', async () => {
	const f = fixture();
	let open!: () => void, opened!: () => void;
	const ready = new Promise<void>(resolve => { opened = resolve; });
	f.host.openRecord = () => { opened(); return new Promise(resolve => { open = resolve; }); };
	const first = f.controller.submit(snapshot);
	await ready;
	assert.strictEqual(f.releases(), 1, 'a slow result panel must not retain the task page');
	let choose!: (value: string) => void;
	f.host.chooseLanguage = () => new Promise(resolve => { choose = resolve; });
	// A different source family forces a fresh language choice to hold the next task.
	f.bridge.inspectTask = async () => ({ languages: [{ id: '5001', label: 'C17' }], hasDraft: false });
	const second = f.controller.submit({ ...snapshot, family: 'c', fileName: 'abc086_a.c' });
	await new Promise(resolve => setImmediate(resolve));
	open(); await first;
	await assert.rejects(f.controller.submit(snapshot), /progress/, 'old completion must not clear the new task');
	f.host.openRecord = async () => undefined;
	choose('5001'); await second;
	assert.strictEqual(f.releases(), 2);
});

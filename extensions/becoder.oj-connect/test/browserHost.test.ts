/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { test } from 'node:test';
import { CommandBrowserHost, CommandLuoguHost } from '../src/browserHost';

test('malformed bridge responses are rejected before becoming page or receipt', async () => {
	const host = new CommandBrowserHost(async () => ({ handle: 'x', url: 'https://evil.test/' }));
	await assert.rejects(host.openTask('https://atcoder.jp/contests/abc086/tasks/abc086_a', 'file:///test.cpp'), /response/);
	const malformed = new CommandBrowserHost(async () => ({ languages: [{ id: 'bad', label: 5 }], hasDraft: false }));
	await assert.rejects(malformed.inspectTask({ handle: 'x', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' }), /response/);
});

test('new host workflow validates record receipts and rejects mismatched returned records', async () => {
	const problem = { site: 'atcoder' as const, nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
	const record = { problem, id: '11', url: 'https://atcoder.jp/contests/abc086/submissions/11' };
	const host = new CommandBrowserHost(async command => command.endsWith('sendAndConfirm') ? { kind: 'record', record } : { ref: { ...record, id: '12', url: 'https://atcoder.jp/contests/abc086/submissions/12' }, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' });
	const result = await host.sendAndConfirm({ handle: 'page', url: problem.url }, { source: 'int main(){}', fileName: 'a.cpp', languageId: '6017', replaceDraft: false });
	assert.strictEqual(result.kind, 'record');
	await assert.rejects(host.readRecord(record), /record/);
});

test('Luogu transport rejects an invalid prepared lease before any source can be sent', async () => {
	const host = new CommandLuoguHost(async () => ({ handle: 'page', languages: [{ id: '27:o2', label: 'C++20', family: 'python' }], hasDraft: false }));
	await assert.rejects(host.prepare({ site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, 'file:///P1001.cpp'), /response/);
});

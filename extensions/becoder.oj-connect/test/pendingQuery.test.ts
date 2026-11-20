/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test, type TestContext } from 'node:test';
import type { RecordRef, SubmissionOutcome } from '../src/domain';

function deferred<T>() {
	let resolve!: (value: T) => void, reject!: (error: Error) => void;
	const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
	return { promise, resolve, reject };
}

async function fixture(t: TestContext, lanqiao = false) {
	const Module = require('module'), original = Module._load;
	const commands = new Map<string, () => Promise<void>>();
	const notices: ReturnType<typeof deferred<string | undefined>>[] = [];
	const queries: { attemptId: string; result: ReturnType<typeof deferred<SubmissionOutcome>> }[] = [];
	const opened: { record: RecordRef; sourceUri: string }[] = [];
	const problem = lanqiao ? { site: 'lanqiao' as const, nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' } : { site: 'luogu' as const, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
	const previews: { closed: boolean; adopted: RecordRef[] }[] = [];
	let attempts = 0;
	const disposable = () => ({ dispose() { } });
	const sourcePath = lanqiao ? 'C:/practice/lanqiao/254.cpp' : 'C:/practice/luogu/P1001.cpp';
	const source = { uri: { scheme: 'file', fsPath: sourcePath, toString: () => 'file:///' + sourcePath }, languageId: 'cpp', version: 1, getText: () => 'int main() {}' };
	const vscode = {
		ConfigurationTarget: { Global: 1 },
		EventEmitter: class { event = disposable; fire() { } dispose() { } },
		l10n: { t: (value: string, ...args: string[]) => value.replace('{0}', args[0]) },
		Uri: { parse: (value: string) => value }, ViewColumn: { One: 1 },
		commands: {
			registerCommand: (id: string, action: () => Promise<void>) => { commands.set(id, action); return disposable(); }, executeCommand: async (id: string, ...args: unknown[]) => {
				if (id.endsWith('.prepare')) { return { handle: 'prepared', languages: [{ id: lanqiao ? 'cpp' : '27', family: 'cpp', label: lanqiao ? 'C++（g++17）' : 'C++' }], hasDraft: false }; }
				if (id.endsWith('.send')) { return { kind: 'unconfirmed', problem, attemptId: 'attempt-' + ++attempts, message: 'Connection lost' }; }
				if (id.endsWith('.reconcile')) { const result = deferred<SubmissionOutcome>(); queries.push({ attemptId: String(args[0]), result }); return result.promise; }
				if (id.endsWith('.loginSummary')) { return { site: id.includes('.luogu.') ? 'luogu' : 'atcoder', state: 'unknown' }; }
				return undefined;
			}
		},
		workspace: { isTrusted: true, getConfiguration: () => ({ get: () => undefined, update: async () => { } }), onDidChangeConfiguration: () => ({ dispose() { } }), onDidGrantWorkspaceTrust: () => ({ dispose() { } }), openTextDocument: async () => source },
		window: {
			activeTextEditor: { document: source, viewColumn: 1 },
			registerWebviewViewProvider: disposable,
			createStatusBarItem: () => ({ show() { }, dispose() { } }),
			showQuickPick: async (options: unknown[]) => options[0], showTextDocument: async () => undefined,
			showWarningMessage: (_message: string, ...actions: string[]) => { if (!actions.length) { return Promise.resolve(undefined); } const notice = deferred<string | undefined>(); notices.push(notice); return notice.promise; },
			showErrorMessage: async () => undefined
		}
	};
	const extensionPath = require.resolve('../src/extension'); delete require.cache[extensionPath];
	Module._load = function (id: string, ...args: unknown[]) {
		if (id === 'vscode') { return vscode; }
		if (id === './views/recordPanel') { return { RecordPanel: class {
			constructor(_context: unknown, _adapters: unknown, _link: unknown, _release: unknown, private queryPending: (outcome: Extract<SubmissionOutcome, { kind: 'unconfirmed' }>, sourceUri: string, adopt: (record: RecordRef) => void, isOpen: () => boolean) => () => Promise<void>) { }
			async open(record: RecordRef, sourceUri: string) { opened.push({ record, sourceUri }); }
			beginEvaluation(_value: unknown, sourceUri: string) {
				const preview = { closed: false, adopted: [] as RecordRef[] }; previews.push(preview);
				return { update() { }, finish: (outcome?: SubmissionOutcome) => {
					if (outcome?.kind === 'unconfirmed') { this.queryPending(outcome, sourceUri, record => { if (!preview.closed) { preview.adopted.push(record); } }, () => !preview.closed); }
					return false;
				} };
			}
		} }; }
		return original.call(this, id, ...args);
	};
	const extension = require('../src/extension'); await extension.activate({ subscriptions: [], globalState: { get: () => undefined, update: async () => { } } });
	t.after(async () => { await extension.deactivate(); Module._load = original; delete require.cache[extensionPath]; });
	return {
		queries, opened, notices, previews,
		submit: () => commands.get('becoder.ojConnect.submit')!(),
		query: () => commands.get('becoder.ojConnect.continueQuery')!(),
		settle: () => new Promise<void>(resolve => setImmediate(resolve)),
		record: (id: string): SubmissionOutcome => ({ kind: 'record', record: { problem, id, url: lanqiao ? 'https://www.lanqiao.cn/problems/254/submissions/' + id + '/' : 'https://www.luogu.com.cn/record/' + id } })
	};
}

test('an old receipt query cannot clear a newer pending attempt', async t => {
	const f = await fixture(t);
	const first = f.submit(); await f.settle(); f.notices[0].resolve(undefined); await first;
	const querying = f.query(); await f.settle();
	const second = f.submit(); await f.settle(); f.notices[1].resolve(undefined); await second;
	f.queries[0].result.resolve(f.record('11')); await querying;
	const latest = f.query(); await f.settle();
	assert.deepStrictEqual(f.queries.map(query => query.attemptId), ['attempt-1', 'attempt-2']);
	f.queries[1].result.resolve(f.record('22')); await latest;
	assert.deepStrictEqual(f.opened.map(value => value.record.id), ['11', '22']);
});

test('each receipt notification queries its own attempt', async t => {
	const f = await fixture(t);
	const first = f.submit(); await f.settle();
	const second = f.submit(); await f.settle();
	f.notices[0].resolve('Continue Querying'); await f.settle();
	assert.strictEqual(f.queries[0].attemptId, 'attempt-1');
	f.queries[0].result.resolve(f.record('11')); await first;
	f.notices[1].resolve('Continue Querying'); await f.settle();
	assert.strictEqual(f.queries[1].attemptId, 'attempt-2');
	f.queries[1].result.resolve(f.record('22')); await second;
});

test('overlapping queries for one attempt share a single reconciliation and record open', async t => {
	const f = await fixture(t);
	const submitting = f.submit(); await f.settle(); f.notices[0].resolve(undefined); await submitting;
	const first = f.query(), second = f.query(); await f.settle();
	assert.strictEqual(f.queries.length, 1);
	f.queries[0].result.resolve(f.record('11')); await Promise.all([first, second]);
	assert.strictEqual(f.opened.length, 1);
});

test('a failed reconciliation can be retried without sending code again', async t => {
	const f = await fixture(t);
	const submitting = f.submit(); await f.settle(); f.notices[0].resolve(undefined); await submitting;
	const first = f.query(); await f.settle(); f.queries[0].result.reject(new Error('offline')); await first;
	const retry = f.query(); await f.settle();
	assert.deepStrictEqual(f.queries.map(query => query.attemptId), ['attempt-1', 'attempt-1']);
	f.queries[1].result.resolve(f.record('11')); await retry;
	assert.strictEqual(f.opened.length, 1);
});

test('a query started before closing the pending preview cannot reopen it on a late receipt', async t => {
	const f = await fixture(t, true);
	const submitting = f.submit(); await f.settle(); f.notices[0].resolve(undefined); await submitting;
	const query = f.query(); await f.settle(); f.previews[0].closed = true;
	f.queries[0].result.resolve(f.record('a'.repeat(24))); await query;
	assert.deepStrictEqual(f.previews[0].adopted, []); assert.deepStrictEqual(f.opened, []);
});

test('an explicit query started after closing the preview still opens the confirmed record', async t => {
	const f = await fixture(t, true);
	const submitting = f.submit(); await f.settle(); f.notices[0].resolve(undefined); await submitting;
	f.previews[0].closed = true;
	const query = f.query(); await f.settle(); f.queries[0].result.resolve(f.record('b'.repeat(24))); await query;
	assert.deepStrictEqual(f.previews[0].adopted, []); assert.strictEqual(f.opened.length, 1);
});

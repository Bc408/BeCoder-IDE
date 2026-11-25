/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test, type TestContext } from 'node:test';
import type { ProblemDocument, RecordRef, RecordSnapshot, SubmissionOutcome } from '../src/domain';
import type { RecordCapture } from '../src/views/recordPanel';
import type { IBeaconCollectionScope, IBeaconRecordWrite } from 'becoder-beacon';
import { toBeaconVerdictRecord } from '../src/beaconRecords';

function deferred<T>() {
	let resolve!: (value: T) => void, reject!: (error: Error) => void;
	const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
	return { promise, resolve, reject };
}

async function fixture(t: TestContext, lanqiao = false, options: { scope?: IBeaconCollectionScope; confirmedSend?: boolean; failCapture?: boolean } = {}) {
	const Module = require('module'), original = Module._load;
	const commands = new Map<string, () => Promise<void>>();
	const notices: ReturnType<typeof deferred<string | undefined>>[] = [];
	const queries: { attemptId: string; result: ReturnType<typeof deferred<SubmissionOutcome>> }[] = [];
	const opened: { record: RecordRef; sourceUri: string }[] = [];
	const reads: ReturnType<typeof deferred<ProblemDocument>>[] = [], shown: ProblemDocument[] = [];
	const problem = lanqiao ? { site: 'lanqiao' as const, nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' } : { site: 'luogu' as const, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
	const previews: { closed: boolean; adopted: RecordRef[] }[] = [];
	const captures: { record: IBeaconRecordWrite<'verdict'>; collectionScope: IBeaconCollectionScope }[] = [];
	let captureRecord!: (ref: RecordRef, sourceUri: string, scope?: IBeaconCollectionScope, attemptId?: string) => RecordCapture;
	let attempts = 0, missingSource = false, failRecordOpen = false;
	const disposable = () => ({ dispose() { } });
	const sourcePath = lanqiao ? 'C:/practice/lanqiao/254.cpp' : 'C:/practice/luogu/P1001.cpp';
	const source = { uri: { scheme: 'file', fsPath: sourcePath, toString: () => 'file:///' + sourcePath }, languageId: 'cpp', version: 1, getText: () => 'int main() {}' };
	const record = (id: string): Extract<SubmissionOutcome, { kind: 'record' }> => {
		const ref = { problem, id, url: lanqiao ? 'https://www.lanqiao.cn/problems/254/submissions/' + id + '/' : 'https://www.luogu.com.cn/record/' + id };
		return { kind: 'record', record: ref, ...(lanqiao ? { observed: { attemptId: 'attempt-1', snapshot: { ref, phase: 'finished' as const, rawStatus: 'AC', sourceVerification: 'matched' as const } } } : {}) };
	};
	const vscode = {
		ConfigurationTarget: { Global: 1 },
		EventEmitter: class { event = disposable; fire() { } dispose() { } },
		l10n: { t: (value: string, ...args: string[]) => value.replace('{0}', args[0]) },
		Uri: { parse: (value: string) => value }, ViewColumn: { One: 1 },
		commands: {
			registerCommand: (id: string, action: () => Promise<void>) => { commands.set(id, action); return disposable(); }, executeCommand: async (id: string, ...args: unknown[]) => {
				if (id === '_becoder.beacon.context') {
					if (args[0] === 'captureCollectionScope') { return options.scope; }
					if (args[0] === 'captureVerdict') { if (options.failCapture) { throw new Error('disk unavailable'); } captures.push(structuredClone(args[1]) as typeof captures[number]); }
					return undefined;
				}
				if (id.endsWith('.prepare')) { return { handle: 'prepared', languages: [{ id: lanqiao ? 'cpp' : '27', family: 'cpp', label: lanqiao ? 'C++（g++17）' : 'C++' }], hasDraft: false }; }
				if (id.endsWith('.send')) { attempts++; if (options.confirmedSend) { previews.at(-1)!.closed = true; return record('a'.repeat(24)); } return { kind: 'unconfirmed', problem, attemptId: 'attempt-' + attempts, message: 'Connection lost' }; }
				if (id.endsWith('.reconcile')) { const result = deferred<SubmissionOutcome>(); queries.push({ attemptId: String(args[0]), result }); return result.promise; }
				if (id.endsWith('.readProblem')) { const result = deferred<ProblemDocument>(); reads.push(result); return result.promise; }
				if (id.endsWith('.loginSummary')) { return { site: id.includes('.luogu.') ? 'luogu' : 'atcoder', state: 'unknown' }; }
				return undefined;
			}
		},
		workspace: { isTrusted: true, getConfiguration: () => ({ get: () => undefined, update: async () => { } }), onDidChangeConfiguration: () => ({ dispose() { } }), onDidGrantWorkspaceTrust: () => ({ dispose() { } }), openTextDocument: async () => { if (missingSource) { throw new Error('source-removed'); } return source; } },
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
			constructor(_context: unknown, _adapters: unknown, _link: unknown, _release: unknown, private queryPending: (outcome: Extract<SubmissionOutcome, { kind: 'unconfirmed' }>, sourceUri: string, adopt: (record: RecordRef) => void, isOpen: () => boolean, scope?: IBeaconCollectionScope) => () => Promise<void>, capture: typeof captureRecord) { captureRecord = capture; }
			async open(record: RecordRef, sourceUri: string) { if (failRecordOpen) { failRecordOpen = false; throw new Error('panel-open-failed'); } opened.push({ record, sourceUri }); }
			dispose() { }
			beginEvaluation(_value: unknown, sourceUri: string, scope?: IBeaconCollectionScope) {
				const preview = { closed: false, adopted: [] as RecordRef[] }; previews.push(preview);
				return { update() { }, finish: (outcome?: SubmissionOutcome) => {
					if (outcome?.kind === 'unconfirmed') { this.queryPending(outcome, sourceUri, record => { if (!preview.closed) { preview.adopted.push(record); } }, () => !preview.closed, scope); }
					return false;
				} };
			}
		} }; }
		if (id === './views/problemPanel') { return { ProblemPanel: class { async open(document: ProblemDocument) { shown.push(document); } updateLanguages() { } updateLanguage() { } refreshLanguages() { } refreshPreferences() { } dispose() { } } }; }
		return original.call(this, id, ...args);
	};
	const subscriptions: { dispose(): void }[] = [];
	const extension = require('../src/extension'); await extension.activate({ subscriptions, globalState: { get: () => undefined, update: async () => { } } });
	t.after(async () => { await extension.deactivate(); subscriptions.forEach(value => value.dispose()); Module._load = original; delete require.cache[extensionPath]; });
	return {
		queries, opened, notices, previews, captures,
		captureRecord: (snapshot: RecordSnapshot) => captureRecord(snapshot.ref, source.uri.toString(), options.scope),
		removeSource: () => { missingSource = true; },
		failRecordOpen: () => { failRecordOpen = true; },
		reads, shown, showProblem: () => commands.get('becoder.ojConnect.showProblem')!(),
		dispose: () => subscriptions.forEach(value => value.dispose()),
		problemDocument: (title: string): ProblemDocument => ({ ref: problem, title, interactive: false, bodies: [{ locale: 'zh-CN', sections: [{ format: 'markdown', content: title }] }], samples: [], limits: [], languages: [] }),
		submit: () => commands.get('becoder.ojConnect.submit')!(),
		query: () => commands.get('becoder.ojConnect.continueQuery')!(),
		settle: () => new Promise<void>(resolve => setImmediate(resolve)),
		record
	};
}

test('a new verdict observation is published after the previous record has left the recent queue', async t => {
	const f = await fixture(t, true, { scope: { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 } });
	const first = f.record('1'.repeat(24)).observed!.snapshot;
	const original = f.captureRecord(first);
	original.accept(first); original.accept(structuredClone(first)); await original.finish();
	assert.strictEqual(f.captures.length, 1, 'one observation delivers its terminal result once');
	for (let index = 2; index <= 21; index++) {
		const snapshot = f.record(index.toString().padStart(24, '0')).observed!.snapshot;
		const capture = f.captureRecord(snapshot); capture.accept(snapshot); await capture.finish();
	}
	const revisited = f.captureRecord(first); revisited.accept(structuredClone(first)); await revisited.finish();
	assert.strictEqual(f.captures.length, 22, 'a later independent observation must enter the queue again');
	assert.strictEqual(f.captures.at(-1)!.record.submission.id, first.ref.id);
});

test('a closed preview still publishes the native receipt with its original collection scope', async t => {
	const scope = { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'original-root', rootSelectionEpoch: 1 };
	const f = await fixture(t, true, { scope, confirmedSend: true });
	await f.submit();
	assert.strictEqual(f.captures.length, 1);
	assert.deepStrictEqual(f.captures[0], { record: toBeaconVerdictRecord(f.record('a'.repeat(24)).observed!.snapshot, 'file:///C:/practice/lanqiao/254.cpp', Date.parse(f.captures[0].record.observedAt)), collectionScope: scope });
	assert.deepStrictEqual(f.opened, []);
	assert.deepStrictEqual(f.queries, []);
});

test('failed native receipt storage cannot reopen a closed preview or query again', async t => {
	const f = await fixture(t, true, { scope: { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 }, confirmedSend: true, failCapture: true });
	await f.submit();
	assert.deepStrictEqual(f.captures, []);
	assert.deepStrictEqual(f.opened, []);
	assert.deepStrictEqual(f.queries, []);
});

test('a query closed during reconciliation publishes its already acquired snapshot under the original scope', async t => {
	const scope = { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'original-root', rootSelectionEpoch: 1 };
	const options = { scope };
	const f = await fixture(t, true, options);
	const submitting = f.submit(); await f.settle(); f.notices[0].resolve(undefined); await submitting;
	const query = f.query(); await f.settle(); f.previews[0].closed = true;
	options.scope = { ...scope, workspaceIdentity: 'new-root', rootSelectionEpoch: 2 };
	f.queries[0].result.resolve(f.record('b'.repeat(24))); await query;
	assert.strictEqual(f.captures.length, 1);
	assert.deepStrictEqual(f.captures[0].collectionScope, scope);
	assert.deepStrictEqual(f.opened, []);
	assert.strictEqual(f.queries.length, 1);
});

test('a confirmed receipt still opens after its source is removed without another query or send', async t => {
	const f = await fixture(t);
	const submitting = f.submit(); await f.settle(); f.notices[0].resolve(undefined); await submitting;
	f.removeSource();
	const query = f.query(); await f.settle(); f.queries[0].result.resolve(f.record('33')); await query;
	assert.deepStrictEqual(f.opened.map(value => value.record.id), ['33']);
	await f.query();
	assert.deepStrictEqual(f.queries.map(value => value.attemptId), ['attempt-1']);
});

test('a failed record panel can retry the confirmed receipt without reconciling or resending', async t => {
	const f = await fixture(t);
	const submitting = f.submit(); await f.settle(); f.notices[0].resolve(undefined); await submitting;
	f.failRecordOpen();
	const query = f.query(); await f.settle(); f.queries[0].result.resolve(f.record('44')); await query;
	await f.query();
	assert.deepStrictEqual(f.opened.map(value => value.record.id), ['44']);
	assert.deepStrictEqual(f.queries.map(value => value.attemptId), ['attempt-1']);
});

test('a later problem read owns the panel when responses complete in reverse order', async t => {
	const f = await fixture(t);
	const first = f.showProblem(); await f.settle();
	const second = f.showProblem(); await f.settle();
	f.reads[1].resolve(f.problemDocument('new')); await second;
	f.reads[0].resolve(f.problemDocument('old')); await first;
	assert.deepStrictEqual(f.shown.map(value => value.title), ['new']);
});

test('disposing the extension drops a late problem read', async t => {
	const f = await fixture(t);
	const read = f.showProblem(); await f.settle(); f.dispose();
	f.reads[0].resolve(f.problemDocument('late')); await read;
	assert.deepStrictEqual(f.shown, []);
});

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

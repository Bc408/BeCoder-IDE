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
import type { ProblemActions } from '../src/views/problemPanel';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

function deferred<T>() {
	let resolve!: (value: T) => void, reject!: (error: Error) => void;
	const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
	return { promise, resolve, reject };
}

async function fixture(t: TestContext, lanqiao = false, options: { scope?: IBeaconCollectionScope; scopeError?: boolean; importRoot?: string; confirmedSend?: boolean; failCapture?: boolean; captureError?: string; endError?: string; sourceUri?: string; outside?: boolean; statementPublication?: ReturnType<typeof deferred<void>>; publication?: ReturnType<typeof deferred<void>>; verification?: RecordSnapshot['sourceVerification'] } = {}) {
	const Module = require('module'), original = Module._load;
	const commands = new Map<string, (...args: any[]) => Promise<any>>();
	let problemActions!: ProblemActions;
	const imports: unknown[] = [];
	const notices: ReturnType<typeof deferred<string | undefined>>[] = [];
	const warnings: string[] = [];
	const queries: { attemptId: string; result: ReturnType<typeof deferred<SubmissionOutcome>> }[] = [];
	const opened: { record: RecordRef; sourceUri: string }[] = [];
	const reads: ReturnType<typeof deferred<ProblemDocument>>[] = [], shown: ProblemDocument[] = [], problemDisplayCollections: number[] = [];
	const problem = lanqiao ? { site: 'lanqiao' as const, nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' } : { site: 'luogu' as const, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
	const previews: { closed: boolean; adopted: RecordRef[] }[] = [];
	const captures: { record: IBeaconRecordWrite<'verdict'>; collectionScope: IBeaconCollectionScope }[] = [];
	const problemCaptures: { record: IBeaconRecordWrite<'problem'>; collectionScope: IBeaconCollectionScope }[] = [];
	const statements: ProblemDocument[] = [];
	const collections = new Set<string>(), collectionEvents: { operation: string; input: unknown }[] = [];
	let collectionId = 0;
	let captureRecord!: (ref: RecordRef, sourceUri: string, scope?: IBeaconCollectionScope, attemptId?: string) => RecordCapture;
	let attempts = 0, missingSource = false, failRecordOpen = false;
	const disposable = () => ({ dispose() { } });
	const sourcePath = lanqiao ? 'C:/practice/lanqiao/254.cpp' : 'C:/practice/luogu/P1001.cpp';
	const source = { uri: { scheme: 'file', fsPath: sourcePath, toString: () => options.sourceUri ?? 'file:///' + sourcePath }, languageId: 'cpp', version: 1, getText: () => 'int main() {}' };
	const record = (id: string): Extract<SubmissionOutcome, { kind: 'record' }> => {
		const ref = { problem, id, url: lanqiao ? 'https://www.lanqiao.cn/problems/254/submissions/' + id + '/' : 'https://www.luogu.com.cn/record/' + id };
		return { kind: 'record', record: ref, ...(lanqiao ? { observed: { attemptId: 'attempt-1', snapshot: { ref, phase: 'finished' as const, rawStatus: 'AC', sourceVerification: options.verification ?? 'matched' } } } : {}) };
	};
	const vscode = {
		ConfigurationTarget: { Global: 1 },
		EventEmitter: class { event = disposable; fire() { } dispose() { } },
		l10n: { t: (value: string, ...args: string[]) => value.replace('{0}', args[0]) },
		Uri: { parse: (value: string) => value }, ViewColumn: { One: 1 },
		commands: {
			registerCommand: (id: string, action: (...args: any[]) => Promise<any>) => { commands.set(id, action); return disposable(); }, executeCommand: async (id: string, ...args: unknown[]) => {
				if (id === '_becoder.ojConnect.statementCache') {
					if (args[0] === 'publishAcquired') { statements.push(structuredClone((args[1] as { document: ProblemDocument }).document)); await options.statementPublication?.promise; }
					return undefined;
				}
				if (id === '_becoder.beacon.context') {
					if (args[0] === 'captureCollectionScope') { if (options.scopeError) { throw new Error('scope capture unavailable'); } return options.scope; }
					if (args[0] === 'beginCollection') {
						collectionEvents.push({ operation: 'begin', input: structuredClone(args[1]) });
						if (!options.scope || options.outside) { return undefined; }
						const handle = 'collection-' + ++collectionId; collections.add(handle); return handle;
					}
					if (args[0] === 'endCollection') { const input = args[1] as { handle: string }; collectionEvents.push({ operation: 'end', input }); assert.ok(collections.delete(input.handle), 'release the owned collection exactly once'); if (options.endError) { throw new Error(options.endError); } return; }
					if (args[0] === 'captureVerdict' || args[0] === 'captureProblemRecord') {
						await options.publication?.promise;
						if (options.failCapture || options.captureError) { throw new Error(options.captureError ?? 'disk unavailable'); }
						if (args[0] === 'captureVerdict') { captures.push(structuredClone(args[1]) as typeof captures[number]); }
						else { problemCaptures.push(structuredClone(args[1]) as typeof problemCaptures[number]); }
					}
					return undefined;
				}
				if (id === '_becoder.cph.importSamplesForSource') { imports.push(args[0]); return true; }
				if (id.endsWith('.prepare')) { return { handle: 'prepared', languages: [{ id: lanqiao ? 'cpp' : '27', family: 'cpp', label: lanqiao ? 'C++（g++17）' : 'C++' }], hasDraft: false }; }
				if (id.endsWith('.send')) { attempts++; if (options.confirmedSend) { previews.at(-1)!.closed = true; return record('a'.repeat(24)); } return { kind: 'unconfirmed', problem, attemptId: 'attempt-' + attempts, message: 'Connection lost' }; }
				if (id.endsWith('.reconcile')) { const result = deferred<SubmissionOutcome>(); queries.push({ attemptId: String(args[0]), result }); return result.promise; }
				if (id.endsWith('.readProblem')) { const result = deferred<ProblemDocument>(); reads.push(result); return result.promise; }
				if (id.endsWith('.loginSummary')) { return { site: id.includes('.luogu.') ? 'luogu' : 'atcoder', state: 'unknown' }; }
				return undefined;
			}
		},
		workspace: { isTrusted: true, workspaceFolders: options.importRoot ? [{ uri: { scheme: 'file', fsPath: options.importRoot } }] : [], getConfiguration: () => ({ get: () => undefined, update: async () => { } }), onDidChangeConfiguration: () => ({ dispose() { } }), onDidGrantWorkspaceTrust: () => ({ dispose() { } }), openTextDocument: async () => { if (missingSource) { throw new Error('source-removed'); } return source; } },
		window: {
			activeTextEditor: { document: source, viewColumn: 1 },
			registerWebviewViewProvider: disposable,
			createStatusBarItem: () => ({ show() { }, dispose() { } }),
			showQuickPick: async (options: unknown[]) => options[0], showTextDocument: async () => undefined,
			showWarningMessage: (message: string, ...actions: string[]) => { if (!actions.length) { warnings.push(message); return Promise.resolve(undefined); } const notice = deferred<string | undefined>(); notices.push(notice); return notice.promise; },
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
		if (id === './views/problemPanel') { return { ProblemPanel: class { constructor(_context: unknown, actions: ProblemActions) { problemActions = actions; } async open(document: ProblemDocument) { problemDisplayCollections.push(collections.size); shown.push(document); } updateLanguages() { } updateLanguage() { } refreshLanguages() { } refreshPreferences() { } dispose() { } } }; }
		return original.call(this, id, ...args);
	};
	const subscriptions: { dispose(): void }[] = [];
	const extension = require('../src/extension'); const api = await extension.activate({ subscriptions, globalState: { get: () => undefined, update: async () => { } } });
	t.after(async () => { await extension.deactivate(); subscriptions.forEach(value => value.dispose()); Module._load = original; delete require.cache[extensionPath]; });
	return {
		queries, opened, notices, warnings, previews, captures, problemCaptures, collections, collectionEvents, imports, statements, api,
		captureRecord: (snapshot: RecordSnapshot, attemptId?: string, sourceUri = source.uri.toString()) => captureRecord(snapshot.ref, sourceUri, options.scopeError ? undefined : options.scope, attemptId),
		importCph: (document: ProblemDocument) => problemActions.importCph(source.uri.toString(), document),
		importBrowser: (document: ProblemDocument) => commands.get('_becoder.ojConnect.importFromBrowser')!(document),
		removeSource: () => { missingSource = true; },
		failRecordOpen: () => { failRecordOpen = true; },
		reads, shown, problemDisplayCollections, showProblem: () => commands.get('becoder.ojConnect.showProblem')!(),
		dispose: () => subscriptions.forEach(value => value.dispose()),
		problemDocument: (title: string): ProblemDocument => ({ ref: problem, title, interactive: false, bodies: [{ locale: 'zh-CN', sections: [{ format: 'markdown', content: title }] }], samples: [], limits: [], languages: [] }),
		submit: () => commands.get('becoder.ojConnect.submit')!(),
		query: () => commands.get('becoder.ojConnect.continueQuery')!(),
		settle: () => new Promise<void>(resolve => setImmediate(resolve)),
		record
	};
}

test('Get publishes the application statement without a Beacon root while model reads and sample import stay read only', async t => {
	const f = await fixture(t), document = f.problemDocument('A+B');
	const getting = f.showProblem(); await f.settle(); f.reads[0].resolve(document); await getting;
	assert.deepStrictEqual(f.statements, [document]); assert.deepStrictEqual(f.problemCaptures, []);
	await f.importCph(document);
	const fetching = f.api.readBeaconProblem(document.ref, new AbortController().signal); await f.settle(); f.reads[1].resolve(document); await fetching;
	assert.strictEqual(f.statements.length, 1);
});

test('Get registers behavior collection before a slow application cache write', async t => {
	const statementPublication = deferred<void>(), publication = deferred<void>();
	const f = await fixture(t, false, { scope: { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 }, statementPublication, publication });
	const getting = f.showProblem(); await f.settle(); f.reads[0].resolve(f.problemDocument('A+B')); await f.settle();
	const active = f.collections.size;
	statementPublication.resolve(); publication.resolve(); await getting;
	assert.strictEqual(active, 1, 'behavior collection must cover the entire pending publication');
	assert.strictEqual(f.collections.size, 0);
});

for (const scopeError of [false, true]) {
	for (const action of ['get', 'import-cph', 'import-browser', 'submit-final']) {
		test(`OJ scope capture ${scopeError ? 'failure' : 'undefined'} preserves ${action} with one action notification`, async t => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-scope-'));
			t.after(() => fs.rmSync(root, { recursive: true, force: true }));
			const f = await fixture(t, true, { scopeError, importRoot: root, confirmedSend: true });
			for (const count of [1, 2]) {
				const document = f.problemDocument('A+B');
				if (action === 'get') {
					const reading = f.showProblem(); await f.settle();
					if (scopeError) { assert.equal(f.warnings[count - 1], 'Beacon could not prepare this activity context. The requested OJ action will continue.'); }
					f.reads[count - 1].resolve(document); await reading; assert.equal(f.shown.length, count);
				}
				if (action === 'import-cph') { await f.importCph(document); assert.equal(f.imports.length, count); }
				if (action === 'import-browser') { const imported = await f.importBrowser(document); assert.equal(fs.existsSync(fileURLToPath(imported.sourceUri)), true); assert.equal(f.shown.length, count); }
				if (action === 'submit-final') {
					await f.submit();
					const snapshot = f.record('a'.repeat(24)).observed!.snapshot, capture = f.captureRecord(snapshot, 'attempt-1');
					capture.accept({ ...snapshot, phase: 'judging' }); capture.accept(snapshot); capture.accept(snapshot); await capture.finish();
					assert.equal(f.previews.length, count); assert.equal(f.notices.length, 0); assert.equal(f.queries.length, 0);
				}
				assert.equal(f.warnings.length, scopeError ? count : 0);
			}
			if (scopeError) { assert.equal(f.warnings[0], 'Beacon could not prepare this activity context. The requested OJ action will continue.'); }
			assert.deepStrictEqual(f.captures, []); assert.deepStrictEqual(f.problemCaptures, []); assert.equal(f.collections.size, 0);
		});
	}
}

test('a completed verdict begins collection synchronously and releases only after publication', async t => {
	const scope = { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 };
	const publication = deferred<void>(), f = await fixture(t, true, { scope, publication });
	const snapshot = f.record('a'.repeat(24)).observed!.snapshot, capture = f.captureRecord(snapshot);
	capture.accept({ ...snapshot, phase: 'queued' }); capture.accept({ ...snapshot, phase: 'judging' });
	assert.strictEqual(f.collections.size, 0, 'remote judging has no record ready to publish');
	capture.accept(snapshot);
	assert.strictEqual(f.collections.size, 1, 'accept registers before its asynchronous publication tail');
	assert.deepStrictEqual(f.collectionEvents[0], { operation: 'begin', input: { collectionScope: scope, source: 'C:\\practice\\lanqiao\\254.cpp' } });
	await f.settle(); assert.strictEqual(f.captures.length, 0); assert.strictEqual(f.collections.size, 1);
	publication.resolve(); await capture.finish();
	assert.strictEqual(f.captures.length, 1); assert.strictEqual(f.collections.size, 0);
	assert.deepStrictEqual(f.collectionEvents.map(event => event.operation), ['begin', 'end']);
});

test('verdict adaptation failure is covered and reported once without escaping accept', async t => {
	const f = await fixture(t, true, { scope: { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 } });
	const snapshot = f.record('a'.repeat(24)).observed!.snapshot;
	const capture = f.captureRecord(snapshot, 'bad-uri', 'file:///C:/practice/%invalid.cpp');
	assert.doesNotThrow(() => capture.accept(snapshot));
	assert.strictEqual(f.collections.size, 1);
	assert.doesNotThrow(() => capture.accept(structuredClone(snapshot)));
	assert.strictEqual(f.collections.size, 2, 'every registered duplicate must release even after the first adaptation fails');
	await capture.finish();
	assert.strictEqual(f.collections.size, 0); assert.deepStrictEqual(f.captures, []);
	assert.deepStrictEqual(f.collectionEvents.map(event => event.operation), ['begin', 'begin', 'end', 'end']);
	assert.strictEqual(f.warnings.length, 1); assert.match(f.warnings[0], /submission.*Beacon.*context/i);
});

for (const [captureError, expected] of [['beacon-record-publication-uncertain', /could not confirm.*saved/i], ['beacon-run-record-too-large', /capacity limit/i], ['disk unavailable', /could not save/i]] as const) {
	test('verdict publication reports ' + captureError + ' once and releases collection', async t => {
		const f = await fixture(t, true, { scope: { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 }, captureError });
		const snapshot = f.record('a'.repeat(24)).observed!.snapshot, capture = f.captureRecord(snapshot);
		capture.accept(snapshot); capture.accept(structuredClone(snapshot)); await capture.finish();
		assert.strictEqual(f.collections.size, 0); assert.deepStrictEqual(f.captures, []);
		assert.deepStrictEqual(f.collectionEvents.map(event => event.operation), ['begin', 'begin', 'end', 'end']);
		assert.strictEqual(f.warnings.length, 1); assert.match(f.warnings[0], expected);
		if (captureError === 'beacon-record-publication-uncertain') { assert.doesNotMatch(f.warnings[0], /could not save|not saved/i); }
	});
}

for (const outside of [false, true]) {
	test('verdict skips intentionally ineligible collection ' + (outside ? 'outside root' : 'without root'), async t => {
		const scope = outside ? { slot: 'chosen', root: 'C:/elsewhere', workspaceIdentity: 'root', rootSelectionEpoch: 1 } : undefined;
		const f = await fixture(t, true, { scope, outside, failCapture: true });
		const snapshot = f.record('a'.repeat(24)).observed!.snapshot, capture = f.captureRecord(snapshot);
		capture.accept(snapshot); await capture.finish();
		assert.deepStrictEqual(f.captures, []); assert.deepStrictEqual(f.warnings, []); assert.strictEqual(f.collections.size, 0);
		assert.deepStrictEqual(f.collectionEvents, outside ? [{ operation: 'begin', input: { collectionScope: scope, source: 'C:\\practice\\lanqiao\\254.cpp' } }] : []);
	});
}

test('a final verdict without a local source preserves null path under the original scope', async t => {
	const scope = { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 };
	const f = await fixture(t, true, { scope });
	const snapshot = f.record('a'.repeat(24)).observed!.snapshot, capture = f.captureRecord(snapshot, 'source-unavailable', '');
	capture.accept(snapshot); await capture.finish();
	assert.deepStrictEqual(f.collectionEvents[0], { operation: 'begin', input: { collectionScope: scope } });
	assert.strictEqual(f.captures.length, 1); assert.strictEqual(f.captures[0].record.filePath, null);
	assert.strictEqual(f.collections.size, 0); assert.deepStrictEqual(f.warnings, []);
});

test('duplicate final observations release all collection handles and publish once', async t => {
	const publication = deferred<void>(), f = await fixture(t, true, { scope: { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 }, publication });
	const snapshot = f.record('a'.repeat(24)).observed!.snapshot, capture = f.captureRecord(snapshot);
	capture.accept(snapshot); capture.accept(structuredClone(snapshot));
	assert.strictEqual(f.collections.size, 2);
	await f.settle(); assert.strictEqual(f.captures.length, 0); assert.strictEqual(f.collections.size, 2);
	publication.resolve(); await capture.finish();
	assert.strictEqual(f.captures.length, 1); assert.strictEqual(f.collections.size, 0); assert.deepStrictEqual(f.warnings, []);
	assert.deepStrictEqual(f.collectionEvents.map(event => event.operation), ['begin', 'begin', 'end', 'end']);
	assert.notStrictEqual((f.collectionEvents[2].input as { handle: string }).handle, (f.collectionEvents[3].input as { handle: string }).handle);
});

test('completed problem publication holds collection through the save and preserves opened content', async t => {
	const scope = { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 };
	const publication = deferred<void>(), f = await fixture(t, false, { scope, publication });
	const reading = f.showProblem(); await f.settle(); assert.strictEqual(f.collections.size, 0);
	f.reads[0].resolve(f.problemDocument('A+B')); await f.settle();
	assert.strictEqual(f.collections.size, 1); assert.deepStrictEqual(f.shown.map(document => document.title), ['A+B']);
	assert.deepStrictEqual(f.problemDisplayCollections, [1], 'collection starts before displaying the acquired problem');
	publication.resolve(); await reading;
	assert.strictEqual(f.collections.size, 0); assert.strictEqual(f.problemCaptures.length, 1); assert.deepStrictEqual(f.warnings, []);
});

test('a successful publication with an unconfirmed lifecycle end reports uncertainty without appending again', async t => {
	const f = await fixture(t, true, { scope: { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 }, endError: 'connection closed' });
	const snapshot = f.record('a'.repeat(24)).observed!.snapshot, capture = f.captureRecord(snapshot);
	capture.accept(snapshot); capture.accept(structuredClone(snapshot)); await capture.finish();
	assert.strictEqual(f.captures.length, 1); assert.strictEqual(f.collections.size, 0);
	assert.strictEqual(f.warnings.length, 1); assert.match(f.warnings[0], /could not confirm.*saved/i);
	assert.doesNotMatch(f.warnings[0], /could not save|not saved/i);
});

test('problem adaptation failures finish their collection and preserve the displayed problem', async t => {
	const f = await fixture(t, false, { scope: { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 }, sourceUri: 'file:///C:/practice/%invalid.cpp' });
	const reading = f.showProblem(); await f.settle(); f.reads[0].resolve(f.problemDocument('A+B')); await reading;
	assert.deepStrictEqual(f.collectionEvents.map(event => event.operation), ['begin', 'end']);
	assert.strictEqual(f.collections.size, 0); assert.deepStrictEqual(f.problemCaptures, []);
	assert.deepStrictEqual(f.shown.map(document => document.title), ['A+B']);
	assert.strictEqual(f.warnings.length, 1); assert.match(f.warnings[0], /problem.*Beacon.*context/i);
});

for (const hasScope of [false, true]) {
	test('mismatch warns once across native observations and panel polls ' + (hasScope ? 'with collection scope' : 'without a Beacon root'), async t => {
		const scope = hasScope ? { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 } : undefined;
		const f = await fixture(t, true, { scope, confirmedSend: true, verification: 'mismatch' });
		await f.submit();
		assert.strictEqual(f.warnings.length, 1, 'the native receipt reports mismatch even if its preview closed');
		assert.match(f.warnings[0], /source mismatch/i);
		const snapshot = f.record('a'.repeat(24)).observed!.snapshot;
		const panel = f.captureRecord(snapshot, 'attempt-1');
		panel.accept({ ...snapshot, phase: 'judging' }); panel.accept(snapshot); panel.accept(structuredClone(snapshot));
		await panel.finish();
		assert.strictEqual(f.warnings.length, 1, 'polls and the panel share the original attempt notification');
		assert.deepStrictEqual(f.captures, [], 'rejected observations never reach Store, so cannot replace an old record');
		const next = f.captureRecord(snapshot, 'attempt-2'); next.accept(snapshot); await next.finish();
		assert.strictEqual(f.warnings.length, 2, 'an independent observation may report its own mismatch');
		const other = f.record('b'.repeat(24)).observed!.snapshot;
		const otherPanel = f.captureRecord(other, 'attempt-2'); otherPanel.accept(other); await otherPanel.finish();
		assert.strictEqual(f.warnings.length, 3, 'a distinct record is not hidden by the same attempt key');
	});
}

test('all other final verification states publish normally after a rejected mismatch', async t => {
	const scope = { slot: 'chosen', root: 'C:/practice', workspaceIdentity: 'root', rootSelectionEpoch: 1 };
	const f = await fixture(t, true, { scope });
	const snapshot = { ...f.record('a'.repeat(24)).observed!.snapshot, sourceVerification: 'mismatch' as const };
	const capture = f.captureRecord(snapshot, 'attempt-1'); capture.accept(snapshot); await capture.finish();
	assert.strictEqual(f.captures.length, 0);
	for (const sourceVerification of ['matched', 'not-checked', 'unavailable'] as const) {
		capture.accept({ ...snapshot, phase: 'judging', sourceVerification });
		capture.accept({ ...snapshot, sourceVerification }); await capture.finish();
	}
	assert.deepStrictEqual(f.captures.map(value => value.record.submission.sourceVerification), ['matched', 'not-checked', 'unavailable']);
	assert.strictEqual(f.warnings.length, 1, 'mismatch is a normal skip and never turns into a storage failure');
});

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

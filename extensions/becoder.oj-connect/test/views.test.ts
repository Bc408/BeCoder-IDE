/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { safeState, panelMessage, type PanelState, type PanelAction } from '../src/views/model';
import { OjPreferences } from '../src/preferences';
import type { RecordRef, RecordSnapshot } from '../src/domain';
import { RecordController } from '../src/recordController';

test('the AtCoder record panel respects the official polling interval', async () => {
	const Module = require('module'), original = Module._load;
	const modulePath = require.resolve('../src/views/recordPanel'); delete require.cache[modulePath];
	const delays: number[] = [];
	let done!: () => void;
	const finished = new Promise<void>(resolve => { done = resolve; });
	Module._load = function (id: string, ...args: unknown[]) {
		if (id === 'vscode') { return { l10n: { t: (value: string) => value } }; }
		if (id === '../recordController') {
			return {
				RecordController: class extends RecordController {
					constructor(read: ConstructorParameters<typeof RecordController>[0], options: ConstructorParameters<typeof RecordController>[1]) { super(read, { ...options, sleep: async ms => { delays.push(ms); } }); }
				}
			};
		}
		if (id === './webview') { return { labels: () => ({}), Panel: class { update(state: Partial<PanelState>) { if (state.tracking === false) { done(); } } dispose() { } } }; }
		return original.call(this, id, ...args);
	};
	try {
		const { RecordPanel } = require('../src/views/recordPanel');
		const ref: RecordRef = { problem: { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' }, id: '55', url: 'https://atcoder.jp/contests/abc086/submissions/55' };
		let reads = 0;
		const panels = new RecordPanel({}, [{ site: 'atcoder', readRecord: async () => ({ ref, phase: ++reads === 1 ? 'judging' : 'finished', rawStatus: reads === 1 ? 'Judging' : 'AC', pollAfterMs: 750, sourceVerification: 'not-checked' }) }], async () => undefined, async () => undefined);
		await panels.open(ref); await finished;
		assert.deepStrictEqual(delays, [750]);
		assert.strictEqual(reads, 2); panels.dispose();
	} finally { Module._load = original; delete require.cache[modulePath]; }
});

test('Luogu stopped results retain their snapshot, offer a manual query, and ignore late closed reads', async () => {
	const Module = require('module'), original = Module._load;
	const captures: { state: PanelState; action: (value: PanelAction) => Promise<void>; close: () => void }[] = [];
	const modulePath = require.resolve('../src/views/recordPanel'); delete require.cache[modulePath];
	Module._load = function (id: string, ...args: unknown[]) {
		if (id === 'vscode') { return { l10n: { t: (value: string) => value } }; }
		if (id === './webview') {
			return {
				labels: () => ({}), Panel: class {
					constructor(readonly _context: unknown, readonly state: PanelState, action: (value: PanelAction) => Promise<void>, private close: () => void) { captures.push({ state, action, close }); }
					update(value: Partial<PanelState>) { Object.assign(this.state, value); } reveal() { } dispose() { this.close(); }
				}
			};
		}
		return original.call(this, id, ...args);
	};
	try {
		const { RecordPanel } = require('../src/views/recordPanel');
		const ref: RecordRef = { problem: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, id: '11', url: 'https://www.luogu.com.cn/record/11' };
		for (const rawStatus of ['N/A', 'NEW']) {
			let reads = 0, resolve!: (snapshot: RecordSnapshot) => void;
			const snapshot: RecordSnapshot = { ref, phase: 'unknown', rawStatus, sourceVerification: 'unavailable' };
			const panels = new RecordPanel({}, [{ site: 'luogu', readRecord: async () => ++reads === 1 ? snapshot : new Promise<RecordSnapshot>(done => { resolve = done; }) }], async () => undefined, async () => undefined);
			await panels.open(ref);
			await new Promise(done => setImmediate(done));
			const capture = captures.at(-1)!;
			assert.strictEqual(reads, 1);
			assert.deepStrictEqual(capture.state.snapshot, snapshot);
			assert.strictEqual(capture.state.tracking, false);
			assert.strictEqual(capture.state.canRetry, true);
			assert.match(capture.state.message!, rawStatus === 'N/A' ? /hidden/ : /unrecognized/);
			const continuing = capture.action({ action: 'continueQuery' });
			assert.strictEqual(capture.state.tracking, true);
			assert.strictEqual(capture.state.canRetry, false);
			resolve({ ...snapshot, phase: 'finished', rawStatus: 'AC' }); await continuing;
			assert.strictEqual(capture.state.snapshot!.rawStatus, 'AC');
			assert.strictEqual(reads, 2);
			const closing = capture.action({ action: 'continueQuery' }); capture.close(); await closing;
			resolve({ ...snapshot, phase: 'finished', rawStatus: 'WA' }); await Promise.resolve();
			assert.strictEqual(capture.state.snapshot!.rawStatus, 'AC');
			panels.dispose();
		}
	} finally { Module._load = original; delete require.cache[modulePath]; }
});

test('webview state cannot terminate its script and actions cannot inject a source or command', () => {
	assert.ok(!safeState({ text: '</script><script>alert(1)</script>\u2028' }).includes('<'));
	assert.deepStrictEqual(JSON.parse(safeState({ text: '<>&' })), { text: '<>&' });
	assert.strictEqual(panelMessage({ action: 'submit', sourceUri: 'file:///other.cpp' }), undefined);
	assert.deepStrictEqual(panelMessage({ action: 'submit' }), { action: 'submit' });
	assert.strictEqual(panelMessage({ action: 'executeCommand' }), undefined);
	assert.strictEqual(panelMessage({ action: 'viewRecord' }), undefined);
	assert.strictEqual(panelMessage({ action: 'stopTracking' }), undefined);
	assert.strictEqual(panelMessage({ action: 'selectLocale', locale: 1 }), undefined);
	assert.strictEqual(panelMessage({ action: 'selectLocale', locale: 'ja' }), undefined);
	assert.deepStrictEqual(panelMessage({ action: 'cancelTranslation' }), { action: 'cancelTranslation' });
	assert.deepStrictEqual(panelMessage({ action: 'ready' }), { action: 'ready' });
	assert.deepStrictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 'text' }), { action: 'renderContent', format: 'markdown', content: 'text' });
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 1 }), undefined);
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 'text', command: 'evil' }), undefined);
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'invalid', content: 'text' }), undefined);
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 'x'.repeat(8 * 1024 * 1024 + 1) }), undefined);
});

test('pending Lanqiao views upgrade in place, keep retries GET-only, and ignore closed or settled updates', async () => {
	const Module = require('module'), original = Module._load;
	const captures: { state: PanelState; action: (value: PanelAction) => Promise<void>; close(): void }[] = [];
	const modulePath = require.resolve('../src/views/recordPanel'); delete require.cache[modulePath];
	Module._load = function (id: string, ...args: unknown[]) {
		if (id === 'vscode') { return { l10n: { t: (value: string) => value } }; }
		if (id === './webview') { return { labels: () => ({}), Panel: class {
			constructor(_context: unknown, readonly state: PanelState, action: (value: PanelAction) => Promise<void>, private close: () => void) { captures.push({ state, action, close }); }
			update(value: Partial<PanelState>) { Object.assign(this.state, value); } reveal() { } dispose() { this.close(); }
		} }; }
		return original.call(this, id, ...args);
	};
	try {
		const { RecordPanel } = require('../src/views/recordPanel');
		const problem = { site: 'lanqiao' as const, nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' };
		const record = { problem, id: '6aff1ff717e87398a15a4abf', url: 'https://www.lanqiao.cn/problems/254/submissions/6aff1ff717e87398a15a4abf/' };
		let reads = 0, queries = 0, releases = 0, resolveFirst!: (snapshot: RecordSnapshot) => void;
		const facts: RecordSnapshot[] = [], captureAttempts: (string | undefined)[] = []; let captureFinishes = 0;
		const result: RecordSnapshot = { ref: record, phase: 'finished', rawStatus: 'AC', sourceVerification: 'matched' };
		const panels = new RecordPanel({}, [{ site: 'lanqiao', readRecord: async () => ++reads === 1 ? new Promise<RecordSnapshot>(resolve => { resolveFirst = resolve; }) : result }], async () => { }, async () => { releases++; }, (outcome: { attemptId: string }, _source: string, adopt: (record: RecordRef) => void) => async () => {
			assert.strictEqual(outcome.attemptId, 'attempt'); queries++; adopt(record);
		}, (_ref: RecordRef, _source: string, _scope: unknown, attemptId?: string) => { captureAttempts.push(attemptId); return { accept: (snapshot: RecordSnapshot) => facts.push(snapshot), finish: async () => { captureFinishes++; } }; });
		const initial = { problem, phase: 'preparing' as const, codeLength: '12 B' };
		const first = panels.beginEvaluation(initial, '');
		assert.strictEqual(captures.length, 1); assert.strictEqual(reads, 0);
		assert.strictEqual(captures[0].state.record, undefined); assert.strictEqual(captures[0].state.snapshot, undefined);
		assert.strictEqual(captures[0].state.message, undefined, 'normal verification stays in the verdict row');
		const report = { ...initial, phase: 'confirming' as const, language: 'C++（g++17）', groups: [{ name: 'Test Cases', rows: [['1', 'AC', '0 ms', '0 kb']] }] };
		first.update(report);
		assert.strictEqual(first.finish({ kind: 'record', record, observed: { attemptId: 'confirmed-attempt', snapshot: result } }), false, 'the preview owns presentation and suppresses later generic reopening'); await panels.open(record);
		const adoptedSubmission = captures[0].state.submission;
		resolveFirst(result);
		assert.deepStrictEqual(adoptedSubmission, report, 'formal identity adoption cannot clear known report data while the result read is pending');
		assert.strictEqual((captures[0].state as PanelState).record?.id, record.id);
		assert.strictEqual(captures[0].state.snapshot, undefined);
		await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(captureAttempts[0], 'confirmed-attempt', 'the adopted page shares the native observation identity for mismatch notifications');
		assert.strictEqual(captures.length, 1, 'formal confirmation reuses the same page');
		assert.deepStrictEqual(captures[0].state.submission, report, 'local submitted metadata remains available when the official record omits it');
		assert.strictEqual((captures[0].state as PanelState).snapshot?.rawStatus, 'AC');
		assert.deepStrictEqual(facts, [result]); assert.equal(captureFinishes, 1);
		first.update({ ...initial, phase: 'sending' }); assert.deepStrictEqual(captures[0].state.submission, report, 'settled progress cannot overwrite the retained submission context');
		captures[0].close(); assert.strictEqual(releases, 1);
		const second = panels.beginEvaluation(initial, ''), closed = captures.at(-1)!;
		closed.close(); second.update({ ...initial, phase: 'judging' }); second.finish({ kind: 'record', record });
		assert.strictEqual(closed.state.record, undefined); assert.strictEqual(closed.state.submission?.phase, 'preparing');
		const third = panels.beginEvaluation(initial, ''), pending = captures.at(-1)!;
		third.finish({ kind: 'unconfirmed', problem, attemptId: 'attempt', message: 'pending' });
		assert.strictEqual(pending.state.tracking, false); assert.strictEqual(pending.state.canRetry, true);
		await pending.action({ action: 'continueQuery' }); await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(queries, 1); assert.strictEqual(pending.state.snapshot?.rawStatus, 'AC');
		assert.strictEqual(captureAttempts.at(-1), 'attempt', 'continued receipt queries retain the unconfirmed attempt even without a progress milestone');
		assert.strictEqual(captures.length, 3); panels.dispose();
		const unavailable = new RecordPanel({}, [{ site: 'lanqiao', readRecord: async () => { throw new Error('lanqiao-session-changed'); } }], async () => { }, async () => { });
		const fourth = unavailable.beginEvaluation(report, ''), stopped = captures.at(-1)!;
		fourth.finish({ kind: 'record', record }); await new Promise(resolve => setImmediate(resolve));
		assert.deepStrictEqual(stopped.state.submission, report, 'a failed first result read cannot remove an already visible report');
		assert.strictEqual(stopped.state.snapshot, undefined);
		assert.strictEqual(stopped.state.tracking, false); assert.strictEqual(stopped.state.canRetry, true);
		assert.match(stopped.state.message!, /Continue querying this record; no code will be resent/);
		unavailable.dispose();
	} finally { Module._load = original; delete require.cache[modulePath]; }
});

test('AtCoder statement displays a default compiler without storing it and restores explicit locale', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-locale-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const file = path.join(root, 'abc086_a.cpp'); fs.writeFileSync(file, 'int main() {}');
	const uri = pathToFileURL(file).href;
	const source = { uri: { fsPath: file, toString: () => uri }, languageId: 'cpp', isClosed: false };
	const Module = require('module'), original = Module._load;
	const captures: { state: PanelState; action: (value: PanelAction) => Promise<void> }[] = [];
	let selected = 0;
	const values = new Map<string, unknown>();
	const preferences = new OjPreferences({ get: <T>(key: string) => values.get(key) as T | undefined, update: async (key, value) => { values.set(key, value); } });
	const event = () => ({ dispose() { } });
	const modulePath = require.resolve('../src/views/problemPanel'); delete require.cache[modulePath];
	Module._load = function (id: string, ...args: unknown[]) {
		if (id === 'vscode') { return { env: { language: 'zh-cn' }, Uri: { parse: (value: string) => ({ fsPath: fileURLToPath(value) }) }, workspace: { onDidCloseTextDocument: event, onDidSaveTextDocument: event, onDidRenameFiles: event, onDidDeleteFiles: event } }; }
		if (id === './webview') {
			return {
				labels: () => ({}), Panel: class {
					state: PanelState;
					constructor(_context: unknown, state: PanelState, action: (value: PanelAction) => Promise<void>, private close: () => void) { this.state = state; captures.push({ state, action }); }
					update(value: unknown) { Object.assign(this.state, value); } reveal() { } dispose() { this.close(); }
				}
			};
		}
		return original.call(this, id, ...args);
	};
	try {
		const { ProblemPanel } = require('../src/views/problemPanel');
		const actions = { preferredLanguage: () => undefined, selectLanguage: () => { selected++; } };
		const ref = { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
		const document = { ref, title: 'Product', languages: [{ id: '6017', label: 'C++23', family: 'cpp' }], bodies: ['zh-CN', 'en'].map(locale => ({ locale, sections: [] })), samples: [], limits: [], interactive: false };
		let panels = new ProblemPanel({}, actions, preferences);
		await panels.open(document, uri, source);
		assert.strictEqual(captures[0].state.locale, 'en'); assert.strictEqual(captures[0].state.languageId, '6017'); assert.strictEqual(selected, 0);
		await captures[0].action({ action: 'selectLocale', locale: 'zh-CN' }); panels.dispose();
		panels = new ProblemPanel({}, actions, preferences);
		await panels.open({ ...document, bodies: [document.bodies[1]] }, uri, source);
		assert.strictEqual(captures[1].state.locale, 'en'); panels.dispose();
		panels = new ProblemPanel({}, actions, preferences);
		await panels.open(document, uri, source);
		assert.strictEqual(captures[2].state.locale, 'zh-CN'); assert.strictEqual(selected, 0); panels.dispose();
		panels = new ProblemPanel({}, { ...actions, preferredLanguage: () => '999' }, preferences);
		await panels.open({ ...document, ref: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' } }, uri, source);
		assert.strictEqual(captures[3].state.languageId, undefined, 'an expired preference must remain unselected');
		assert.strictEqual(selected, 0, 'opening a statement cannot overwrite an expired preference'); panels.dispose();
		values.set('luogu.cppCompiler', 'oops');
		panels = new ProblemPanel({}, { ...actions, preferredLanguage: () => preferences.language('luogu', 'cpp') }, preferences);
		await panels.open({ ...document, ref: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' } }, uri, source);
		assert.strictEqual(captures[4].state.languageId, undefined, 'a malformed explicit preference must remain unselected');
		assert.strictEqual(selected, 0, 'opening a statement cannot overwrite a malformed explicit preference'); panels.dispose();
		values.clear();
		for (const ref of [
			{ site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' },
			{ site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' },
			{ site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' },
			{ site: 'nowcoder', nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' }
		]) {
			for (const family of ['c', 'cpp']) {
				const filePath = path.join(root, ref.site + '.' + family); fs.writeFileSync(filePath, 'int main() {}');
				const sourceUri = pathToFileURL(filePath).href;
				const sourceDocument = { uri: { fsPath: filePath, toString: () => sourceUri }, languageId: family, isClosed: false };
				const languages = [{ id: '23', label: 'C++23 (GCC 15.2)', family: 'cpp' }, { id: '17', label: 'C17 (GCC 12)', family: 'c' }];
				const input = { ...document, ref, languages };
				panels = new ProblemPanel({}, actions, preferences);
				await panels.open(input, sourceUri, sourceDocument);
				const capture = captures.at(-1)!;
				assert.strictEqual(capture.state.languageId, family === 'cpp' ? '23' : '17');
				assert.deepStrictEqual(capture.state.languages?.map(option => option.family), [family]);
				panels.refreshPreferences();
				assert.strictEqual(capture.state.languageId, family === 'cpp' ? '23' : '17', 'cleared preferences still display the current default');
				await panels.open({ ...input, languages: [{ id: '26', label: family === 'cpp' ? 'C++26 (GCC 16)' : 'C23 (GCC 14)', family }] }, sourceUri, sourceDocument);
				assert.strictEqual(capture.state.languageId, '26', 'explicitly reopening refreshes a previously stale catalogue');
				panels.updateLanguages(ref, []);
				assert.strictEqual(capture.state.languageId, undefined);
				panels.updateLanguages(ref, languages);
				assert.strictEqual(capture.state.languageId, family === 'cpp' ? '23' : '17', 'fresh preparation repairs an anonymous or unavailable catalogue');
				assert.deepStrictEqual(capture.state.languages?.map(option => option.family), [family]);
				panels.updateLanguages({ ...ref, url: ref.url + '?other' }, []);
				assert.strictEqual(capture.state.languages?.length, 1, 'a different problem cannot replace this catalogue');
				assert.strictEqual(selected, 0, 'viewing or reopening never stores an implicit compiler preference');
				panels.dispose();
			}
		}
	} finally { Module._load = original; delete require.cache[modulePath]; }
});

test('statement compiler reads are asynchronous, cancellable, and cannot replace a newer prepared catalogue', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-catalogue-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const file = path.join(root, 'a.cpp'); fs.writeFileSync(file, 'int main() {}');
	const uri = pathToFileURL(file).href;
	const source = { uri: { fsPath: file, toString: () => uri }, languageId: 'cpp', isClosed: false };
	const Module = require('module'), original = Module._load;
	const modulePath = require.resolve('../src/views/problemPanel'); delete require.cache[modulePath];
	const captures: { state: PanelState; action: (value: PanelAction) => Promise<void>; close: () => void }[] = [];
	const reads: { signal: AbortSignal; resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
	const event = () => ({ dispose() { } });
	let selected = 0, saved: string | undefined;
	Module._load = function (id: string, ...args: unknown[]) {
		if (id === 'vscode') { return { env: { language: 'zh-cn' }, Uri: { parse: (value: string) => ({ fsPath: fileURLToPath(value) }) }, workspace: { onDidCloseTextDocument: event, onDidSaveTextDocument: event, onDidRenameFiles: event, onDidDeleteFiles: event } }; }
		if (id === './webview') {
			return {
				labels: () => ({}), Panel: class {
					constructor(_context: unknown, readonly state: PanelState, action: (value: PanelAction) => Promise<void>, private close: () => void) { captures.push({ state, action, close }); }
					update(value: Partial<PanelState>) { Object.assign(this.state, value); } reveal() { } dispose() { this.close(); }
				}
			};
		}
		return original.call(this, id, ...args);
	};
	try {
		const { ProblemPanel } = require('../src/views/problemPanel');
		const panels = new ProblemPanel({}, {
			preferredLanguage: () => saved, selectLanguage: (_site: string, _family: string, id: string) => { selected++; saved = id; },
			loadLanguages: (_problem: unknown, signal: AbortSignal) => new Promise((resolve, reject) => { reads.push({ signal, resolve, reject }); })
		});
		const document = { ref: { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' }, title: 'Product', bodies: [{ locale: 'en', sections: [] }], samples: [], limits: [], interactive: false };
		const options = [{ id: '23', label: 'C++23 (GCC 15)', family: 'cpp' }, { id: '17', label: 'C17 (GCC 12)', family: 'c' }];
		await panels.open(document, uri, source);
		const first = captures[0];
		assert.strictEqual(first.state.problem?.title, 'Product', 'opening does not wait for the pending compiler request');
		assert.strictEqual(first.state.languagesLoading, true);
		assert.strictEqual(first.state.languages?.[0]?.id, '6017', 'the verified AtCoder catalogue is selectable before sign-in');
		assert.strictEqual(reads.length, 1);
		saved = '23'; reads[0].resolve({ languages: options }); await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(first.state.languagesLoading, false);
		assert.deepStrictEqual(first.state.languages, [options[0]]);
		assert.strictEqual(first.state.languageId, '23', 'completion uses the latest saved compiler choice');
		assert.strictEqual(selected, 0, 'background reads never write compiler preferences');
		await panels.open(document, uri, source);
		assert.strictEqual(reads.length, 2, 'explicit reopening starts a fresh read');
		panels.updateLanguages({ ...document.ref, url: document.ref.url + '?other' }, options);
		assert.strictEqual(reads[1].signal.aborted, false, 'other problems cannot cancel this read');
		panels.updateLanguages(document.ref, [{ id: '26', label: 'C++26 (GCC 16)', family: 'cpp' }]);
		assert.strictEqual(reads[1].signal.aborted, true);
		reads[1].resolve({ languages: options }); await new Promise(resolve => setImmediate(resolve));
		assert.deepStrictEqual(first.state.languages?.map(option => option.id), ['26'], 'a late background read cannot replace the official preparation catalogue');
		assert.strictEqual(first.state.languagesLoading, false);
		await panels.open(document, uri, source);
		await panels.open(document, uri, source);
		assert.strictEqual(reads[2].signal.aborted, true, 'reopening cancels the old request');
		reads[2].resolve({ languages: options });
		reads[3].resolve({ languages: [], languageError: 'login-required' }); await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(first.state.problem?.languageError, 'login-required');
		assert.strictEqual(first.state.problem?.title, 'Product');
		assert.strictEqual(first.state.locale, 'en');
		await panels.open(document, uri, source);
		reads[4].reject(new Error('unavailable')); await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(first.state.problem?.languageError, 'unavailable', 'read failures stay in the compiler control');
		await panels.open(document, uri, source);
		first.close();
		assert.strictEqual(reads[5].signal.aborted, true, 'closing releases the request');
		reads[5].resolve({ languages: options }); await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(first.state.languagesLoading, true, 'closed state is not touched by late results');
		await panels.open({ ...document, languages: options }, uri, source);
		assert.strictEqual(reads.length, 6, 'an existing catalogue needs no background read');
		panels.dispose();
		await panels.open({ ...document, ref: { site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' } }, uri, source);
		assert.strictEqual(reads.length, 7, 'Codeforces also loads asynchronously');
		panels.dispose();
		await panels.open({ ...document, ref: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' } }, uri, source);
		assert.strictEqual(reads.length, 7, 'other sites retain their existing catalogue path');
		panels.dispose();
		source.languageId = 'c'; saved = undefined;
		await panels.open(document, uri, source);
		const c = captures.at(-1)!;
		assert.strictEqual(c.state.languageId, 'catalogue:atcoder-c23-gcc');
		assert.strictEqual(c.state.usingCompilerCatalogue, true);
		await c.action({ action: 'selectLanguage', languageId: 'catalogue:atcoder-c23-gcc' });
		assert.strictEqual(saved, 'catalogue:atcoder-c23-gcc', 'an explicit offline selection is persisted');
		reads[7].resolve({ languages: [], languageError: 'login-required' }); await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(c.state.languages?.[0]?.label, 'C23 (GCC 14.2.0)', 'sign-in failure retains selectable captured options');
		assert.strictEqual(c.state.usingCompilerCatalogue, true);
		panels.refreshLanguages('codeforces'); assert.strictEqual(reads.length, 8);
		panels.refreshLanguages('atcoder'); assert.strictEqual(reads.length, 9, 'sign-in refreshes only matching site panels');
		reads[8].resolve({ languages: [{ id: '6123', label: 'C23 (GCC 14.2.0)', family: 'c' }] }); await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(c.state.languageId, '6123');
		assert.strictEqual(saved, '6123', 'fresh current options replace symbolic preselection with a verified numeric ID');
		assert.strictEqual(c.state.usingCompilerCatalogue, false);
		assert.strictEqual(c.state.problem?.languageError, undefined);
		panels.dispose();
	} finally { Module._load = original; delete require.cache[modulePath]; }
});

test('a reconstructed webview receives the latest host state after ready', async () => {
	const Module = require('module'), original = Module._load;
	let receive!: (value: unknown) => void;
	const posted: unknown[] = []; let calls = 0;
	let location = 'auto';
	const columns: number[] = [];
	const nativePanels: { title: string }[] = [];
	const mock = {
		l10n: { t: (value: string) => value }, ViewColumn: { Beside: -2, Active: -1, One: 1, Two: 2, Three: 3 }, Uri: { joinPath: (...parts: unknown[]) => parts.join('/') },
		workspace: { getConfiguration: () => ({ get: (key: string) => key === 'panelLocation' ? location : undefined }), onDidChangeConfiguration: () => ({ dispose() { } }) }, window: {
			activeTextEditor: { viewColumn: 1 }, tabGroups: { all: [{ viewColumn: 1 }, { viewColumn: 3 }] },
			createWebviewPanel: (_type: string, title: string, options: { viewColumn: number }) => {
				const panel = { title,
					webview: { cspSource: 'self', asWebviewUri: (value: string) => value, postMessage: (value: unknown) => { posted.push(structuredClone(value)); }, onDidReceiveMessage: (listener: typeof receive) => { receive = listener; return { dispose() { } }; } }, onDidDispose: () => ({ dispose() { } }), dispose() { }
				}; columns.push(options.viewColumn); nativePanels.push(panel); return panel;
			}
		}
	};
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? mock : original.call(this, id, ...args); };
	try {
		const { Panel } = require('../src/views/webview');
		const panel = new Panel({ extensionUri: 'extension' }, { kind: 'record', labels: {}, sourceName: 'a.cpp', record: { id: '22' } }, async () => { calls++; }, () => undefined);
		panel.update({ message: 'AC latest', tracking: false }); posted.length = 0;
		receive({ action: 'ready' });
		assert.strictEqual((posted[0] as { state: { message: string } })?.state.message, 'AC latest');
		const uuid = '12345678-1234-1234-1234-123456789abc';
		receive({ type: 'ojAction', uuid, data: { action: 'submit', sourceUri: 'file:///wrong.cpp' } });
		assert.strictEqual(calls, 0);
		receive({ type: 'ojAction', uuid, data: { action: 'submit' } });
		await Promise.resolve();
		assert.strictEqual(calls, 1); assert.deepStrictEqual(posted.at(-1), { uuid, data: undefined, error: undefined });
		panel.dispose();
		for (location of ['active', 'beside', 'one', 'two', 'three', 'invalid']) {
			new Panel({ extensionUri: 'extension' }, { kind: 'record', labels: {}, record: { id: '22' } }, async () => undefined, () => undefined).dispose();
		}
		assert.deepStrictEqual(columns, [3, -1, -2, 1, 2, 3, 3], 'only new panels follow the configured location; auto reuses the nearest right group');
		assert.strictEqual(nativePanels[0].title, '#22', 'record updates keep the official record tab identity');
		const statement = new Panel({ extensionUri: 'extension' }, { kind: 'problem', labels: {}, sourceName: 'a.cpp', problem: { title: 'Old' } }, async () => undefined, () => undefined);
		statement.update({ problem: { title: 'New' } });
		assert.strictEqual(nativePanels.at(-1)!.title, 'New', 'a refreshed statement updates its editor tab title');
		statement.dispose();
	} finally { Module._load = original; }
});

test('panel navigation only accepts a bounded HTTPS link without credentials or extra actions', () => {
	const url = 'https://example.org/reference?language=cpp#details';
	assert.deepStrictEqual(panelMessage({ action: 'openLink', url }), { action: 'openLink', url });
	for (const url of ['http://example.org/', 'file:///C:/private.cpp', 'command:workbench.action.openSettings', 'javascript:alert(1)', '//example.org/', '#details', 'https://user:secret@example.org/', 'https://example.org/\nother', 'https://example.org/' + 'x'.repeat(8192)]) {
		assert.strictEqual(panelMessage({ action: 'openLink', url }), undefined, url);
	}
	assert.strictEqual(panelMessage({ action: 'openLink', url, external: true }), undefined);
	assert.strictEqual(panelMessage({ action: 'openLink', url: 1 }), undefined);
	assert.strictEqual(panelMessage({ action: 'openOriginal' }), undefined, 'the replaced navigation action must not remain as a second route');
});

test('reopening a statement replaces content and action data while retaining source and compiler boundaries', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-refresh-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const file = path.join(root, 'a.cpp'); fs.writeFileSync(file, 'int main() {}');
	const uri = pathToFileURL(file).href;
	const source = { uri: { fsPath: file, toString: () => uri }, languageId: 'cpp', isClosed: false };
	const Module = require('module'), original = Module._load;
	const modulePath = require.resolve('../src/views/problemPanel'); delete require.cache[modulePath];
	const captures: { state: PanelState; action: (value: PanelAction) => Promise<void> }[] = [];
	const reads: { signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
	const actions: { source: unknown; problem: unknown }[] = [];
	const values = new Map<string, unknown>([['atcoder.statementLanguage', 'zh-CN']]);
	let finishSetting: (() => void) | undefined, deferSetting = false;
	const preferences = new OjPreferences({ get: <T>(key: string) => values.get(key) as T | undefined, update: async (key, value) => { if (deferSetting) { await new Promise<void>(resolve => { finishSetting = resolve; }); } values.set(key, value); } });
	const event = () => ({ dispose() { } });
	Module._load = function (id: string, ...args: unknown[]) {
		if (id === 'vscode') { return { env: { language: 'zh-cn' }, Uri: { parse: (value: string) => ({ fsPath: fileURLToPath(value) }) }, workspace: { onDidCloseTextDocument: event, onDidSaveTextDocument: event, onDidRenameFiles: event, onDidDeleteFiles: event } }; }
		if (id === './webview') {
			return { labels: () => ({}), Panel: class {
				constructor(_context: unknown, readonly state: PanelState, action: (value: PanelAction) => Promise<void>, private close: () => void) { captures.push({ state, action }); }
				update(value: Partial<PanelState>) { Object.assign(this.state, value); } reveal() { } dispose() { this.close(); }
			} };
		}
		return original.call(this, id, ...args);
	};
	try {
		const { ProblemPanel } = require('../src/views/problemPanel');
		const panels = new ProblemPanel({}, {
			preferredLanguage: () => undefined, selectLanguage: async () => { if (deferSetting) { await new Promise<void>(resolve => { finishSetting = resolve; }); } },
			loadLanguages: (_problem: unknown, signal: AbortSignal) => new Promise(resolve => reads.push({ signal, resolve })),
			submit: async (source: unknown, problem: unknown) => { actions.push({ source, problem }); },
			importCph: async (source: unknown, problem: unknown) => { actions.push({ source, problem }); }
		}, preferences);
		const ref = { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
		const old = { ref, title: 'Old', bodies: [{ locale: 'en', sections: [{ format: 'html', content: '<p>Old statement</p>' }] }], samples: [{ input: 'old\n', output: 'old\n' }], limits: [], interactive: true, difficulty: { label: 'Old difficulty' }, tags: [{ label: 'Old tag' }] };
		await panels.open(old, uri, source);
		const capture = captures[0];
		assert.strictEqual(capture.state.locale, 'en');
		const fresh = { ref, title: 'New', bodies: ['en', 'zh-CN'].map(locale => ({ locale, sections: [{ format: 'html', content: '<p>New ' + locale + '</p>' }] })), samples: [{ input: '  new\n\n', output: 'answer\n' }], limits: [{ label: 'Time Limit', value: '2.00s' }], interactive: false };
		await panels.open(fresh, uri, source);
		assert.strictEqual(captures.length, 1);
		assert.deepStrictEqual(capture.state.problem, fresh, 'all fields are replaced, including removal of old optional metadata');
		assert.strictEqual(capture.state.locale, 'zh-CN', 'a previously missing saved locale returns when available');
		assert.strictEqual(reads[0].signal.aborted, true);
		reads[0].resolve({ languages: [{ id: '17', label: 'C++17', family: 'cpp' }] }); await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(capture.state.problem!.title, 'New');
		assert.notStrictEqual(capture.state.languages?.[0]?.id, '17');
		reads[1].resolve({ languages: [{ id: '23', label: 'C++23', family: 'cpp' }] }); await new Promise(resolve => setImmediate(resolve));
		assert.strictEqual(capture.state.problem!.title, 'New');
		assert.deepStrictEqual(capture.state.problem!.samples, fresh.samples);
		await capture.action({ action: 'submit' }); await capture.action({ action: 'importCph' });
		assert.strictEqual(actions[0].source, source);
		assert.strictEqual(actions[1].source, uri);
		for (const action of actions) { assert.strictEqual(action.problem, capture.state.problem, 'actions use the same current document as the view'); }
		deferSetting = true;
		const selecting = capture.action({ action: 'selectLocale', locale: 'zh-CN' });
		await panels.open({ ...fresh, title: 'English only', bodies: [fresh.bodies[0]], languages: [{ id: '26', label: 'C++26', family: 'cpp' }] }, uri, source);
		finishSetting!(); await selecting;
		assert.strictEqual(capture.state.locale, 'en', 'late preference completion cannot restore a removed locale');
		deferSetting = false;
		await panels.open({ ...fresh, title: 'Empty', bodies: [], languages: [{ id: '26', label: 'C++26', family: 'cpp' }] }, uri, source);
		assert.strictEqual(capture.state.locale, undefined);
		await panels.open({ ...fresh, languages: [{ id: '23', label: 'C++23', family: 'cpp' }] }, uri, source);
		deferSetting = true;
		const language = capture.action({ action: 'selectLanguage', languageId: '23' });
		await panels.open({ ...fresh, languages: [{ id: '26', label: 'C++26', family: 'cpp' }] }, uri, source);
		finishSetting!(); await language;
		assert.deepStrictEqual(capture.state.languages?.map(option => option.id), ['26'], 'late language selection cannot restore the prior catalogue');
		assert.strictEqual(capture.state.languageId, '26');
		panels.dispose();
		deferSetting = false;
		const local = { ...fresh, ref: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, languages: [{ id: '26', label: 'C++26', family: 'cpp' }], bodies: ['en', 'zh-CN'].map(locale => ({ locale, sections: [] })) };
		await panels.open(local, uri, source);
		const other = captures.at(-1)!;
		assert.strictEqual(other.state.locale, 'zh-CN');
		await other.action({ action: 'selectLocale', locale: 'en' });
		await panels.open({ ...local, title: 'Changed' }, uri, source);
		assert.strictEqual(other.state.locale, 'en', 'other sites preserve a still-available explicit selection');
		await panels.open({ ...local, bodies: [local.bodies[1]] }, uri, source);
		assert.strictEqual(other.state.locale, 'zh-CN', 'removed locale falls back to an available interface language');
		await panels.open(local, uri, source);
		await other.action({ action: 'selectLocale', locale: 'en' });
		assert.strictEqual(other.state.locale, 'en', 'newly returned locales are accepted by the current action context');
		panels.dispose();
	} finally { Module._load = original; delete require.cache[modulePath]; }
});

test('record read failures keep the original ID and direct recovery to querying rather than submitting', async () => {
	const Module = require('module'), original = Module._load;
	const modulePath = require.resolve('../src/views/recordPanel'); delete require.cache[modulePath];
	const captures: { state: PanelState; action: (value: PanelAction) => Promise<void> }[] = [];
	let stoppedReading: (() => void) | undefined;
	Module._load = function (id: string, ...args: unknown[]) {
		if (id === 'vscode') { return { l10n: { t: (value: string, ...args: string[]) => value.replace('{0}', args[0]) } }; }
		if (id === './webview') { return { labels: () => ({}), Panel: class {
			constructor(_context: unknown, readonly state: PanelState, action: (value: PanelAction) => Promise<void>, private close: () => void) { captures.push({ state, action }); }
			update(value: Partial<PanelState>) { Object.assign(this.state, value); if (value.tracking === false) { stoppedReading?.(); } } dispose() { this.close(); }
		} }; }
		return original.call(this, id, ...args);
	};
	try {
		const { RecordPanel } = require('../src/views/recordPanel');
		const ref: RecordRef = { problem: { site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' }, id: '55', url: 'https://codeforces.com/contest/4/submission/55' };
		let reads = 0;
		const panels = new RecordPanel({}, [{ site: 'codeforces', readRecord: async (record: RecordRef) => { assert.deepStrictEqual(record, ref); if (++reads === 1) { throw new Error('codeforces-login-required'); } return { ref, phase: 'finished', rawStatus: 'Accepted', sourceVerification: 'matched' }; } }], async () => undefined, async () => undefined);
		await panels.open(ref); await new Promise(resolve => setImmediate(resolve));
		const capture = captures[0];
		assert.strictEqual(capture.state.tracking, false);
		assert.strictEqual(capture.state.canRetry, true);
		assert.strictEqual(capture.state.snapshot, undefined);
		assert.match(capture.state.message!, /Sign in to Codeforces/);
		assert.match(capture.state.message!, /Continue querying this record/);
		assert.doesNotMatch(capture.state.message!, /submit again|resubmit/i);
		await capture.action({ action: 'continueQuery' });
		assert.strictEqual(reads, 2); assert.strictEqual(capture.state.snapshot!.rawStatus, 'Accepted');
		panels.dispose();
		let attempts = 0;
		const finished = new Promise<void>(resolve => { stoppedReading = resolve; });
		const stopped = new RecordPanel({}, [{ site: 'codeforces', readRecord: async () => { if (++attempts > 1) { throw new Error('codeforces-session-changed'); } return { ref, phase: 'judging', rawStatus: 'Running on test 2', sourceVerification: 'matched' }; } }], async () => undefined, async () => undefined);
		await stopped.open(ref);
		await finished;
		const last = captures.at(-1)!;
		assert.strictEqual(last.state.snapshot!.rawStatus, 'Running on test 2');
		assert.strictEqual(last.state.tracking, false);
		assert.match(last.state.message!, /session changed/);
		assert.doesNotMatch(last.state.message!, /Sign in|submit again/);
		stopped.dispose();
	} finally { Module._load = original; delete require.cache[modulePath]; }
});


test('open statement panels and the first submission picker keep the language display synchronized', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-language-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const Module = require('module'), original = Module._load;
	const receives: ((value: unknown) => void)[] = [], posted: { state: { languageId: string; languages: unknown[] } }[][] = [];
	const event = () => ({ dispose() { } });
	let preferred: string | undefined;
	const mock = {
		l10n: { t: (value: string) => value }, env: { language: 'zh-cn' }, ViewColumn: { Beside: 2 },
		Uri: { parse: (value: string) => ({ fsPath: fileURLToPath(value) }), joinPath: (...parts: unknown[]) => parts.join('/') },
		workspace: { getConfiguration: () => ({ get: () => undefined }), onDidChangeConfiguration: event, onDidCloseTextDocument: event, onDidSaveTextDocument: event, onDidRenameFiles: event, onDidDeleteFiles: event },
		window: {
			createWebviewPanel: () => {
				const messages: typeof posted[number] = []; posted.push(messages);
				let close = () => undefined;
				return { webview: { cspSource: 'self', asWebviewUri: (value: string) => value, postMessage: (value: typeof messages[number]) => messages.push(structuredClone(value)), onDidReceiveMessage: (listener: typeof receives[number]) => { receives.push(listener); return event(); } }, onDidDispose: (listener: () => undefined) => { close = listener; return event(); }, reveal() { }, dispose: () => close() };
			}
		}
	};
	const webview = require.resolve('../src/views/webview'); delete require.cache[webview];
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? mock : original.call(this, id, ...args); };
	try {
		const { ProblemPanel } = require('../src/views/problemPanel');
		const panels = new ProblemPanel({ extensionUri: 'extension' }, { preferredLanguage: () => preferred, selectLanguage: (_site: string, _family: string, id: string) => { preferred = id; } });
		try {
			const options = [{ id: '20', label: 'C++20', family: 'cpp' }, { id: '23', label: 'C++23', family: 'cpp' }];
			const ref = { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
			for (const name of ['a', 'b']) {
				const file = path.join(root, name + '.cpp'); fs.writeFileSync(file, 'int main() {}');
				const uri = pathToFileURL(file).href, source = { uri: { fsPath: file, toString: () => uri }, languageId: 'cpp', isClosed: false };
				await panels.open({ ref, title: 'A+B', languages: options, bodies: [], samples: [], limits: [], interactive: false }, uri, source);
			}
			receives[0]({ action: 'selectLanguage', languageId: '23' }); await new Promise(resolve => setImmediate(resolve));
			assert.strictEqual(preferred, '23'); assert.strictEqual(posted[1].at(-1)!.state.languageId, '23');
			// Live options supplied after login replace an initially anonymous statement's options.
			await panels.updateLanguage(ref, [{ id: '26', label: 'C++26', family: 'cpp' }], '26');
			assert.strictEqual(posted[0].at(-1)!.state.languages.length, 1);
			receives[1]({ action: 'selectLanguage', languageId: '26' }); assert.strictEqual(preferred, '26');
			receives[0]({ action: 'selectLanguage', languageId: '20' }); assert.strictEqual(preferred, '26');
		} finally { panels.dispose(); }
	} finally { Module._load = original; delete require.cache[webview]; }
});

test('ACM mode updates every open panel from current settings without invoking an action', () => {
	const Module = require('module'), original = Module._load;
	const modulePath = require.resolve('../src/views/webview'); delete require.cache[modulePath];
	const changes = new Set<(event: { affectsConfiguration: (key: string) => boolean }) => void>();
	const messages: any[][] = [], receives: ((value: unknown) => void)[] = [];
	const disposable = () => ({ dispose() { } });
	let mode: unknown, actions = 0;
	const mock = {
		l10n: { t: (value: string) => value }, ViewColumn: { Beside: 2 }, Uri: { joinPath: (...parts: unknown[]) => parts.join('/') },
		workspace: {
			getConfiguration: () => ({ get: (key: string) => key === 'acmMode' ? mode : undefined }),
			onDidChangeConfiguration: (listener: (event: { affectsConfiguration: (key: string) => boolean }) => void) => { changes.add(listener); return { dispose: () => changes.delete(listener) }; }
		},
		window: { createWebviewPanel: () => {
			const posted: unknown[] = []; messages.push(posted);
			let close = () => undefined;
			return { webview: { cspSource: 'self', asWebviewUri: (value: string) => value, postMessage: (value: unknown) => posted.push(structuredClone(value)), onDidReceiveMessage: (listener: typeof receives[number]) => { receives.push(listener); return disposable(); } }, onDidDispose: (listener: () => undefined) => { close = listener; return disposable(); }, dispose: () => close() };
		} }
	};
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? mock : original.call(this, id, ...args); };
	try {
		const { Panel } = require('../src/views/webview');
		const first = new Panel({ extensionUri: 'extension' }, { kind: 'problem', labels: {}, sourceName: 'a.cpp', problem: { title: 'Problem' } }, async () => { actions++; }, () => undefined);
		const snapshot = { rawStatus: 'AC', groups: [{ name: 'Tests', rows: [['1', 'AC']] }] };
		const second = new Panel({ extensionUri: 'extension' }, { kind: 'record', labels: {}, sourceName: 'a.cpp', record: { id: '55' }, snapshot }, async () => { actions++; }, () => undefined);
		assert.strictEqual(first.state.acmMode, false, 'a fresh install preserves the complete ordinary view');
		assert.strictEqual(second.state.acmMode, false);
		for (const change of changes) { change({ affectsConfiguration: key => key === 'editor.fontSize' }); }
		assert.deepStrictEqual(messages.map(value => value.length), [0, 0], 'unrelated settings do not refresh panels');
		mode = true;
		for (const change of changes) { change({ affectsConfiguration: key => key === 'becoder.ojConnect.acmMode' }); }
		assert.deepStrictEqual(messages.map(value => value.at(-1).state.acmMode), [true, true]);
		assert.strictEqual(second.state.snapshot, snapshot, 'mode changes preserve the real report');
		receives[1]({ action: 'ready' });
		assert.strictEqual(messages[1].at(-1).state.acmMode, true, 'recreated views receive the current mode');
		first.dispose(); assert.strictEqual(changes.size, 1, 'closed views remove their configuration subscription');
		mode = false;
		for (const change of changes) { change({ affectsConfiguration: () => true }); }
		assert.strictEqual(messages[0].length, 1, 'closed views stay untouched');
		assert.strictEqual(messages[1].at(-1).state.acmMode, false);
		assert.strictEqual(actions, 0, 'switching presentation never invokes submission or record-query actions');
		second.dispose(); assert.strictEqual(changes.size, 0);
	} finally { Module._load = original; delete require.cache[modulePath]; }
});

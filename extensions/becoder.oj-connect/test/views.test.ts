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
	assert.deepStrictEqual(panelMessage({ action: 'selectLocale', locale: 'ja' }), { action: 'selectLocale', locale: 'ja' });
	assert.deepStrictEqual(panelMessage({ action: 'ready' }), { action: 'ready' });
	assert.deepStrictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 'text' }), { action: 'renderContent', format: 'markdown', content: 'text' });
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 1 }), undefined);
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 'text', command: 'evil' }), undefined);
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'invalid', content: 'text' }), undefined);
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 'x'.repeat(8 * 1024 * 1024 + 1) }), undefined);
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
		const document = { ref, title: 'Product', languages: [{ id: '6017', label: 'C++23', family: 'cpp' }], bodies: ['ja', 'en'].map(locale => ({ locale, sections: [] })), samples: [], limits: [], interactive: false };
		let panels = new ProblemPanel({}, actions, preferences);
		await panels.open(document, uri, source);
		assert.strictEqual(captures[0].state.locale, 'en'); assert.strictEqual(captures[0].state.languageId, '6017'); assert.strictEqual(selected, 0);
		await captures[0].action({ action: 'selectLocale', locale: 'ja' }); panels.dispose();
		panels = new ProblemPanel({}, actions, preferences);
		await panels.open({ ...document, bodies: [document.bodies[1]] }, uri, source);
		assert.strictEqual(captures[1].state.locale, 'en'); panels.dispose();
		panels = new ProblemPanel({}, actions, preferences);
		await panels.open(document, uri, source);
		assert.strictEqual(captures[2].state.locale, 'ja'); assert.strictEqual(selected, 0); panels.dispose();
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
	const mock = {
		l10n: { t: (value: string) => value }, ViewColumn: { Beside: -2, Active: -1, One: 1, Two: 2, Three: 3 }, Uri: { joinPath: (...parts: unknown[]) => parts.join('/') },
		workspace: { getConfiguration: () => ({ get: () => location }) }, window: {
			activeTextEditor: { viewColumn: 1 }, tabGroups: { all: [{ viewColumn: 1 }, { viewColumn: 3 }] },
			createWebviewPanel: (_type: string, _title: string, options: { viewColumn: number }) => {
				columns.push(options.viewColumn); return {
					webview: { cspSource: 'self', asWebviewUri: (value: string) => value, postMessage: (value: unknown) => { posted.push(structuredClone(value)); }, onDidReceiveMessage: (listener: typeof receive) => { receive = listener; return { dispose() { } }; } }, onDidDispose: () => ({ dispose() { } }), dispose() { }
				};
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
	} finally { Module._load = original; }
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
		workspace: { getConfiguration: () => ({ get: () => undefined }), onDidCloseTextDocument: event, onDidSaveTextDocument: event, onDidRenameFiles: event, onDidDeleteFiles: event },
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

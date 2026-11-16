/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { safeState, panelMessage } from '../src/views/model';

test('webview state cannot terminate its script and actions cannot inject a source or command', () => {
	assert.ok(!safeState({ text: '</script><script>alert(1)</script>\u2028' }).includes('<'));
	assert.deepStrictEqual(JSON.parse(safeState({ text: '<>&' })), { text: '<>&' });
	assert.strictEqual(panelMessage({ action: 'submit', sourceUri: 'file:///other.cpp' }), undefined);
	assert.deepStrictEqual(panelMessage({ action: 'submit' }), { action: 'submit' });
	assert.strictEqual(panelMessage({ action: 'executeCommand' }), undefined);
	assert.strictEqual(panelMessage({ action: 'selectLocale', locale: 1 }), undefined);
	assert.deepStrictEqual(panelMessage({ action: 'selectLocale', locale: 'ja' }), { action: 'selectLocale', locale: 'ja' });
	assert.deepStrictEqual(panelMessage({ action: 'ready' }), { action: 'ready' });
	assert.deepStrictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 'text' }), { action: 'renderContent', format: 'markdown', content: 'text' });
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 1 }), undefined);
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 'text', command: 'evil' }), undefined);
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'invalid', content: 'text' }), undefined);
	assert.strictEqual(panelMessage({ action: 'renderContent', format: 'markdown', content: 'x'.repeat(8 * 1024 * 1024 + 1) }), undefined);
});

test('a reconstructed webview receives the latest host state after ready', async () => {
	const Module = require('module'), original = Module._load;
	let receive!: (value: unknown) => void;
	const posted: unknown[] = []; let calls = 0;
	const mock = { l10n: { t: (value: string) => value }, ViewColumn: { Beside: 2 }, Uri: { joinPath: (...parts: unknown[]) => parts.join('/') }, window: { createWebviewPanel: () => ({
		webview: { cspSource: 'self', asWebviewUri: (value: string) => value, postMessage: (value: unknown) => { posted.push(structuredClone(value)); }, onDidReceiveMessage: (listener: typeof receive) => { receive = listener; return { dispose() {} }; } }, onDidDispose: () => ({ dispose() {} }), dispose() {}
	}) } };
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
	} finally { Module._load = original; }
});


test('open statement panels and the first submission picker keep the language display synchronized', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-language-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const Module = require('module'), original = Module._load;
	const receives: ((value: unknown) => void)[] = [], posted: { state: { languageId: string; languages: unknown[] } }[][] = [];
	const event = () => ({ dispose() {} });
	let preferred: string | undefined;
	const mock = {
		l10n: { t: (value: string) => value }, env: { language: 'zh-cn' }, ViewColumn: { Beside: 2 },
		Uri: { parse: (value: string) => ({ fsPath: fileURLToPath(value) }), joinPath: (...parts: unknown[]) => parts.join('/') },
		workspace: { onDidCloseTextDocument: event, onDidSaveTextDocument: event, onDidRenameFiles: event, onDidDeleteFiles: event },
		window: { createWebviewPanel: () => {
			const messages: typeof posted[number] = []; posted.push(messages);
			let close = () => undefined;
			return { webview: { cspSource: 'self', asWebviewUri: (value: string) => value, postMessage: (value: typeof messages[number]) => messages.push(structuredClone(value)), onDidReceiveMessage: (listener: typeof receives[number]) => { receives.push(listener); return event(); } }, onDidDispose: (listener: () => undefined) => { close = listener; return event(); }, reveal() {}, dispose: () => close() };
		} }
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
			receives[0]({ action: 'selectLanguage', languageId: '23' });
			assert.strictEqual(preferred, '23'); assert.strictEqual(posted[1].at(-1)!.state.languageId, '23');
			// Live options supplied after login replace an initially anonymous statement's options.
			panels.updateLanguage(ref, [{ id: '26', label: 'C++26', family: 'cpp' }], '26');
			assert.strictEqual(posted[0].at(-1)!.state.languages.length, 1);
			receives[1]({ action: 'selectLanguage', languageId: '26' }); assert.strictEqual(preferred, '26');
			receives[0]({ action: 'selectLanguage', languageId: '20' }); assert.strictEqual(preferred, '26');
		} finally { panels.dispose(); }
	} finally { Module._load = original; delete require.cache[webview]; }
});

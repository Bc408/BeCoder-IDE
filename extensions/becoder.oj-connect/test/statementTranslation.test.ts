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
import type { PanelState, PanelAction } from '../src/views/model';
import type { StatementContent } from 'becoder-oj-connect';

test('problem panel keeps original until publication and suppresses cancelled closed or replaced translations', async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'statement-panel-')), file = path.join(root, 'a.cpp'); fs.writeFileSync(file, 'int main(){}');
	const uri = pathToFileURL(file).href, source = { uri: { fsPath: file, toString: () => uri }, languageId: 'cpp', isClosed: false };
	const Module = require('module'), original = Module._load;
	const captures: { state: PanelState; action: (value: PanelAction) => Promise<void>; close(): void }[] = [];
	const notices: string[] = [];
	const modulePath = require.resolve('../src/views/problemPanel'); delete require.cache[modulePath];
	const event = () => ({ dispose() {} });
	Module._load = function (id: string, ...args: unknown[]) {
		if (id === 'vscode') { return { l10n: { t: (value: string) => value }, window: { showInformationMessage: async (value: string) => notices.push(value) }, env: { language: 'zh-cn' }, Uri: { parse: (value: string) => ({ fsPath: fileURLToPath(value) }) }, workspace: { onDidCloseTextDocument: event, onDidSaveTextDocument: event, onDidRenameFiles: event, onDidDeleteFiles: event } }; }
		if (id === './webview') { return { labels: () => ({}), Panel: class {
			constructor(_context: unknown, readonly state: PanelState, action: (value: PanelAction) => Promise<void>, readonly close: () => void) { captures.push({ state, action, close }); }
			update(value: Partial<PanelState>) { Object.assign(this.state, value); } reveal() {} dispose() { this.close(); }
		} }; }
		return original.call(this, id, ...args);
	};
	try {
		const { ProblemPanel } = require('../src/views/problemPanel');
		let calls = 0, finish!: (value: StatementContent) => void, pendingSignal!: AbortSignal;
		const panels = new ProblemPanel({}, { preferredLanguage: () => undefined, selectLanguage: () => {},
			translateStatement: (_source: unknown, _target: unknown, signal: AbortSignal) => { calls++; pendingSignal = signal; return new Promise<StatementContent>(resolve => { finish = resolve; }); } });
		const document = { ref: { site: 'luogu' as const, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, title: 'Original', bodies: [{ locale: 'en', sections: [{ format: 'markdown' as const, content: 'Original text' }] }], samples: [], limits: [], interactive: false };
		for (const outcome of ['compiler-refresh', 'success', 'cancel', 'close', 'replace']) {
			await panels.open(document, uri, source); const capture = captures.at(-1)!;
			const before = calls;
			await capture.action({ action: 'selectLocale', locale: 'en' }); assert.strictEqual(calls, before);
			const pending = capture.action({ action: 'selectLocale', locale: 'zh-CN' });
			assert.strictEqual(capture.state.locale, 'en'); assert.ok(capture.state.translation);
			await assert.rejects(capture.action({ action: 'selectLocale', locale: 'zh-CN' }), /statement-translation-busy/);
			if (outcome === 'cancel') { await capture.action({ action: 'cancelTranslation' }); }
			if (outcome === 'close') { capture.close(); }
			if (outcome === 'replace') { await panels.open({ ...document, title: 'New original' }, uri, source); }
			const catalogue = [{ id: '27', family: 'cpp' as const, label: 'C++17' }];
			if (outcome === 'compiler-refresh') { panels.updateLanguages(document.ref, catalogue); }
			finish({ ...document, bodies: [...document.bodies, { locale: 'zh-CN', origin: 'translation', title: 'Translated', sections: [{ format: 'markdown', content: 'Translated' }] }] }); await pending;
			if (outcome === 'success' || outcome === 'compiler-refresh') {
				assert.strictEqual(capture.state.locale, 'zh-CN');
				if (outcome === 'compiler-refresh') { assert.deepStrictEqual(capture.state.problem?.languages, catalogue); }
				await panels.open(document, uri, source);
				assert.match(notices.at(-1) ?? '', /changed.*translate again/i);
			} else { assert.strictEqual(pendingSignal.aborted, true); assert.strictEqual(capture.state.locale, 'en'); }
			panels.dispose();
		}
		const { userError } = require('../src/messages');
		assert.match(userError(new Error('translation-incomplete')), /incomplete.*try again/i);
		assert.match(userError(new Error('translation-capacity')), /capacity.*larger/i);
		assert.match(userError(new Error('statement-cache-save-failed')), /could not be saved/i);
		assert.doesNotMatch(userError(new Error('statement-cache-unreadable')), /statement-cache-unreadable/);
	} finally { Module._load = original; delete require.cache[modulePath]; fs.rmSync(root, { recursive: true, force: true }); }
});

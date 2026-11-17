/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';

test('shortcut sends with noncancelable status and preserves the manual verification fallback', async () => {
	const Module = require('module'), original = Module._load;
	const commands = new Map<string, () => Promise<void>>(), locations: number[] = [];
	let shown = false, disposed = false, migrationWrite = true;
	let entered!: () => void, finish!: (value: unknown) => void;
	const sending = new Promise<void>(resolve => { entered = resolve; });
	const cancelled: unknown[][] = [];
	const warnings: string[] = [];
	const status = { text: '', tooltip: '', command: '', show: () => { shown = true; }, dispose: () => { disposed = true; } };
	const disposable = () => ({ dispose() { } });
	const source = { uri: { scheme: 'file', fsPath: 'C:/practice/luogu/P1001.cpp', toString: () => 'file:///C:/practice/luogu/P1001.cpp' }, languageId: 'cpp', version: 1, getText: () => 'int main() {}' };
	const mock = {
		ConfigurationTarget: { Global: 1 },
		EventEmitter: class { event = disposable; fire() { } dispose() { } },
		l10n: { t: (value: string, ...args: string[]) => value.replace('{0}', args[0]) }, ProgressLocation: { Window: 10, Notification: 15 },
		commands: {
			registerCommand: (id: string, fn: () => Promise<void>) => { commands.set(id, fn); return disposable(); }, executeCommand: async (id: string, ...args: unknown[]) => {
				if (id.endsWith('.prepare')) { return { handle: 'prepared', languages: [{ id: '27', family: 'cpp', label: 'C++' }], ownerKey: '123', hasDraft: false }; }
				if (id.endsWith('.send')) { entered(); return new Promise(resolve => { finish = resolve; }); }
				if (id.endsWith('.cancel')) { cancelled.push(args); finish({ kind: 'not-sent', reason: 'Verification cancelled.' }); }
				return undefined;
			}
		},
		workspace: { isTrusted: true, getConfiguration: () => ({ get: () => undefined, inspect: () => undefined, update: async () => { if (migrationWrite) { migrationWrite = false; throw new Error('settings write failed'); } } }), onDidChangeConfiguration: () => ({ dispose() { } }) },
		window: {
			createStatusBarItem: () => status,
			showWarningMessage: async (message: string) => { warnings.push(message); },
			showInformationMessage: async () => undefined,
			showErrorMessage: async (message: string) => { throw new Error(message); },
			activeTextEditor: { document: source, viewColumn: 1 }, registerWebviewViewProvider: disposable,
			showQuickPick: async (options: unknown[]) => options[0],
			withProgress: async (options: { location: number }, operation: (progress: unknown, token: unknown) => Promise<void>) => {
				locations.push(options.location); return operation({ report() { } }, { onCancellationRequested: disposable });
			}
		}
	};
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? mock : original.call(this, id, ...args); };
	try {
		const extension = require('../src/extension');
		const legacy = new Map([['atcoder.language.cpp', '6017']]);
		await extension.activate({ subscriptions: [], globalState: { get: (key: string) => legacy.get(key), update: async (key: string) => { legacy.delete(key); } } });
		assert.strictEqual(legacy.get('atcoder.language.cpp'), '6017', 'failed migration preserves the old preference');
		assert.strictEqual(warnings.length, 1, 'migration failure warns once without disabling commands');
		warnings.length = 0;
		assert.ok(commands.has('_becoder.ojConnect.luogu.askCaptcha'), 'native verification must use the extension prompt');
		const submitting = commands.get('becoder.ojConnect.submit')!();
		await sending;
		assert.deepStrictEqual(locations, [], 'even Window progress creates a silent notification that can obscure the captcha');
		assert.strictEqual(shown, true);
		assert.strictEqual(disposed, false);
		assert.strictEqual(status.command, '', 'a sent submission cannot be withdrawn');
		assert.strictEqual(commands.has('becoder.ojConnect.stopSubmission'), false);
		finish({ kind: 'not-sent', reason: 'Verification cancelled.' });
		await submitting;
		assert.deepStrictEqual(cancelled, []);
		assert.strictEqual(disposed, true);
		disposed = false;
		const sendingAgain = new Promise<void>(resolve => { entered = resolve; });
		const limited = commands.get('becoder.ojConnect.submit')!();
		await sendingAgain;
		finish({ kind: 'not-sent', reason: 'luogu-browser-verification-required' });
		await limited;
		assert.deepStrictEqual(warnings, ['Please submit in the built-in browser and complete verification manually.']);
		assert.strictEqual(disposed, true, 'bounded verification releases the shortcut status');
		await extension.deactivate();
	} finally { Module._load = original; }
});

test('native failures retain the specific cause for submission diagnosis', () => {
	const Module = require('module'), original = Module._load;
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? { l10n: { t: (value: string, ...args: string[]) => value.replace('{0}', args[0]) } } : original.call(this, id, ...args); };
	try {
		delete require.cache[require.resolve('../src/messages')];
		const { userError } = require('../src/messages');
		assert.match(userError('oj-connect-operation-timeout'), /oj-connect-operation-timeout/);
		assert.match(userError('oj-connect-page-changed'), /oj-connect-page-changed/);
		assert.strictEqual(userError('atcoder-login-required'), 'Sign in to AtCoder from the OJ Connect sidebar, then submit again.');
		assert.strictEqual(userError('atcoder-browser-verification-required'), 'AtCoder requires manual verification. Submit in the built-in browser and complete verification manually.');
	} finally { Module._load = original; }
});

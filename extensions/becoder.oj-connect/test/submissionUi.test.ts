/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';

test('background compiler commands cancel promptly and ignore a late catalogue response', async () => {
	const Module = require('module'), original = Module._load;
	const loaded = new Set(Object.keys(require.cache));
	const modulePath = require.resolve('../src/extension'); delete require.cache[modulePath];
	const calls: { command: string; args: unknown[]; resolve: (value: unknown) => void }[] = [];
	const mock = {
		commands: {
			executeCommand: (command: string, ...args: unknown[]) => {
				if (command.endsWith('.cancelLanguageRead')) { calls.push({ command, args, resolve() { } }); return Promise.resolve(); }
				return new Promise(resolve => { calls.push({ command, args, resolve }); });
			}
		}
	};
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? mock : original.call(this, id, ...args); };
	try {
		const { readProblemLanguages } = require('../src/extension');
		for (const site of ['atcoder', 'codeforces']) {
			const problem = { site, nativeId: 'fixture', url: 'https://example.org/fixture' };
			const abort = new AbortController();
			const reading = readProblemLanguages(problem, abort.signal);
			const request = calls.at(-1)!;
			assert.strictEqual(request.command, '_becoder.ojConnect.' + site + '.readLanguages');
			assert.strictEqual(request.args[0], problem);
			assert.match(String(request.args[1]), /^[a-f0-9-]{36}$/i);
			const rejected = assert.rejects(reading, /cancelled/);
			abort.abort(); await rejected;
			assert.strictEqual(calls.at(-1)!.command, '_becoder.ojConnect.' + site + '.cancelLanguageRead');
			assert.deepStrictEqual(calls.at(-1)!.args, [request.args[1]]);
			request.resolve({ languages: [{ id: '23', label: 'C++23', family: 'cpp' }] }); await Promise.resolve();
			const count = calls.length;
			await assert.rejects(readProblemLanguages(problem, abort.signal), /cancelled/);
			assert.strictEqual(calls.length, count, 'an already cancelled read cannot start a host request');
			const ready = new AbortController(), completed = readProblemLanguages(problem, ready.signal);
			const catalogue = { languages: [{ id: '23', label: 'C++23', family: 'cpp' }] };
			calls.at(-1)!.resolve(catalogue); assert.deepStrictEqual(await completed, catalogue);
			const after = calls.length; ready.abort();
			assert.strictEqual(calls.length, after, 'completed reads remove their cancellation listener');
			const invalid = readProblemLanguages(problem, new AbortController().signal);
			calls.at(-1)!.resolve({ languages: [{ id: 'bad', label: 'Python', family: 'python' }] });
			await assert.rejects(invalid, /invalid/);
		}
	} finally {
		Module._load = original;
		for (const key of Object.keys(require.cache)) { if (!loaded.has(key)) { delete require.cache[key]; } }
		delete require.cache[modulePath];
	}
});

test('shortcut sends with noncancelable status and preserves the manual verification fallback', async () => {
	const Module = require('module'), original = Module._load;
	const commands = new Map<string, () => Promise<void>>(), locations: number[] = [];
	let shown = false, disposed = false, migrationWrite = true;
	let entered!: () => void, finish!: (value: unknown) => void;
	const sending = new Promise<void>(resolve => { entered = resolve; });
	const cancelled: unknown[][] = [];
	const warnings: string[] = [];
	const errors: string[] = [];
	const status = { text: '', tooltip: '', command: '', show: () => { shown = true; }, dispose: () => { disposed = true; } };
	const disposable = () => ({ dispose() { } });
	let configurationChanged!: (event: { affectsConfiguration: (section: string) => boolean }) => void;
	let trustGranted!: () => void;
	let login!: { refresh: (reset?: boolean) => Promise<void> };
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
		workspace: { isTrusted: true, getConfiguration: () => ({ get: () => undefined, inspect: () => undefined, update: async () => { if (migrationWrite) { migrationWrite = false; throw new Error('settings write failed'); } } }), onDidChangeConfiguration: (listener: typeof configurationChanged) => { configurationChanged = listener; return disposable(); }, onDidGrantWorkspaceTrust: (listener: typeof trustGranted) => { trustGranted = listener; return disposable(); } },
		window: {
			createStatusBarItem: () => status,
			showWarningMessage: async (message: string) => { warnings.push(message); },
			showInformationMessage: async () => undefined,
			showErrorMessage: async (message: string) => { errors.push(message); },
			activeTextEditor: { document: source, viewColumn: 1 }, registerWebviewViewProvider: (_id: string, provider: typeof login) => { login = provider; return disposable(); },
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
		const refresh = login.refresh.bind(login), resets: (boolean | undefined)[] = [];
		login.refresh = async reset => { resets.push(reset); };
		configurationChanged({ affectsConfiguration: section => section === 'editor.fontSize' });
		assert.deepStrictEqual(resets, []);
		configurationChanged({ affectsConfiguration: section => section === 'workbench.browser.dataStorage' });
		assert.deepStrictEqual(resets, [true], 'storage scope changes must immediately invalidate account rows');
		trustGranted();
		assert.deepStrictEqual(resets, [true, true], 'granting trust changes temporary scope to persistent scope');
		login.refresh = refresh;
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
		warnings.length = 0;
		disposed = false;
		source.uri.fsPath = 'C:/practice/codeforces/4_a.cpp';
		source.uri.toString = () => 'file:///C:/practice/codeforces/4_a.cpp';
		const duplicateStarted = new Promise<void>(resolve => { entered = resolve; });
		const duplicate = commands.get('becoder.ojConnect.submit')!();
		await duplicateStarted;
		finish({ kind: 'rejected', reason: 'codeforces-duplicate-source' });
		await duplicate;
		assert.strictEqual(warnings.length, 1);
		assert.match(warnings[0], /Codeforces.*same code.*no new submission/i);
		assert.doesNotMatch(warnings[0], /unconfirmed|continue querying|operation stopped/i);
		assert.strictEqual(disposed, true);
		await commands.get('becoder.ojConnect.continueQuery')!();
		assert.strictEqual(warnings.length, 1, 'a rejected attempt must not install a pending receipt');
		assert.deepStrictEqual(errors, []);
		const active = mock.window.activeTextEditor;
		Object.assign(mock.window, { activeTextEditor: undefined });
		await commands.get('becoder.ojConnect.showProblem')!();
		assert.deepStrictEqual(errors.splice(0), ['OJ Connect: Focus the C/C++ source editor.']);
		Object.assign(mock.window, { activeTextEditor: active });
		source.uri.fsPath = 'C:/practice/lanqiao/1.cpp';
		source.uri.toString = () => 'file:///C:/practice/lanqiao/1.cpp';
		await commands.get('becoder.ojConnect.showProblem')!();
		assert.deepStrictEqual(errors, ['OJ Connect: The lanqiao adapter is not available yet.']);
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
		assert.match(userError('oj-statement-timeout'), /website operation stopped.*oj-statement-timeout/);
		assert.strictEqual(userError('atcoder-login-required'), 'Sign in to AtCoder from the OJ Connect sidebar.');
		assert.strictEqual(userError('codeforces-login-required'), 'Sign in to Codeforces from the OJ Connect sidebar.');
		assert.strictEqual(userError('nowcoder-login-required'), 'Sign in to Nowcoder from the OJ Connect sidebar.');
		assert.strictEqual(userError('atcoder-browser-verification-required'), 'AtCoder requires manual verification. Submit in the built-in browser and complete verification manually.');
		assert.match(userError('codeforces-login-required'), /Sign in to Codeforces/);
		assert.match(userError('codeforces-browser-verification-required'), /browser.*verification/);
		assert.match(userError('codeforces-practice-unavailable'), /ended public Codeforces/);
		assert.match(userError('codeforces-request-timeout'), /timed out.*connection/);
		assert.match(userError('codeforces-session-changed'), /session changed.*account status/);
		assert.match(userError('codeforces-session-stopped'), /connection stopped/);
		assert.match(userError('codeforces-operation-cancelled'), /was cancelled/);
	} finally { Module._load = original; }
});

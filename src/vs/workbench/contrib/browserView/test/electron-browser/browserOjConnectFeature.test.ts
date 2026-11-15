/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FileAccess } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingResolver, ResultKind } from '../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { BrowserViewStorageScope } from '../../../../../platform/browserView/common/browserView.js';
import { BrowserOjConnectContribution } from '../../electron-browser/features/browserOjConnectFeature.js';
import { DeferredPromise } from '../../../../../base/common/async.js';

function atCoderFixture() {
	const problem = { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
	const record = { problem, id: '55', url: 'https://atcoder.jp/contests/abc086/submissions/55' };
	const snapshot = (rawStatus = 'Judging') => ({ ref: record, phase: rawStatus === 'Judging' ? 'judging' : 'finished', rawStatus, sourceVerification: 'not-checked' });
	const stop = new Emitter<void>();
	let scope = BrowserViewStorageScope.Global, creations = 0, recordReads = 0;
	let readRecord = async () => snapshot();
	let send: () => Promise<unknown> = async () => ({ kind: 'record', record });
	let watch = async () => { };
	const create = (id: string, url: string, storageScope = scope) => {
		let disposed = false;
		const model = { id, url, loading: false, storageScope, onDidNavigate: Event.None, onDidClose: Event.None, loadURL: async (value: string) => { model.url = value; } };
		return { get url() { return model.url; }, model, isDisposed: () => disposed, resolve: async () => model, dispose: () => { disposed = true; } };
	};
	const known = new Map<string, ReturnType<typeof create>>();
	const editors = { editors: [] as ReturnType<typeof create>[], openEditor: async () => { } };
	const browsers = { getKnownBrowserViews: () => known, resolveStorageScope: async () => scope, getOrCreateLazy: (id: string, options: { url: string }) => {
		creations++; const input = create(id, options.url); known.set(id, input); return input;
	} };
	const main = { getChannel: () => ({ listen: () => Event.None, call: async (name: string) => {
		if (name === 'sendAndConfirmAtCoderTask') { return send(); }
		if (name === 'reconcileAtCoderAttempt') { return { kind: 'record', record }; }
		if (name === 'readAtCoderRecord') { recordReads++; return readRecord(); }
		if (name === 'watchOjSession') { return watch(); }
		return undefined;
	} }) };
	const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: stop.event, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
	const contribution = new BrowserOjConnectContribution(editors as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], { executeCommand: async () => undefined } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
	const execute = (suffix: string, ...args: unknown[]): unknown => CommandsRegistry.getCommand('_becoder.ojConnect.atcoder.' + suffix)!.handler(undefined!, ...args);
	return {
		record, snapshot, known, editors, execute,
		get creations() { return creations; }, get recordReads() { return recordReads; },
		setScope: (value: BrowserViewStorageScope) => { scope = value; },
		setRead: (value: typeof readRecord) => { readRecord = value; },
		setSend: (value: typeof send) => { send = value; },
		setWatch: (value: typeof watch) => { watch = value; },
		addCarrier: (id: string, storageScope: BrowserViewStorageScope) => { const input = create(id, problem.url, storageScope); known.set(id, input); return input; },
		accept: async () => {
			const page = await execute('openTask', problem.url, 'file:///C:/abc086_a.cpp');
			const outcome = await execute('sendAndConfirm', page, { source: 'int main() {}', fileName: 'abc086_a.cpp', languageId: '5001', replaceDraft: false });
			await execute('release', page); return outcome;
		},
		read: async () => await execute('readRecord', record) as ReturnType<typeof snapshot>,
		reset: () => stop.fire(),
		dispose: () => { contribution.dispose(); stop.dispose(); }
	};
}

suite('OJ Connect source shortcut', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('production manifest resolves only in focused C/C++ source editors', async () => {
		const resource = URI.joinPath(FileAccess.asFileUri('vs'), '..', '..', 'extensions', 'becoder.oj-connect', 'package.json');
		const content = await ipcRenderer.invoke('vscode:readFile', resource.fsPath);
		const manifest = JSON.parse(new TextDecoder().decode(content as Uint8Array));
		const binding = manifest.contributes.keybindings[0];
		const key = new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, true, false, KeyCode.KeyS)], OperatingSystem.Windows);
		const fallback = new ResolvedKeybindingItem(key, 'existing.share', undefined, undefined, true, null, false);
		const submit = new ResolvedKeybindingItem(key, binding.command, undefined, ContextKeyExpr.deserialize(binding.when), true, 'becoder.oj-connect', true);
		const resolver = new KeybindingResolver([fallback, submit], [], () => { });
		const chord = key.getDispatchChords()[0]!;
		for (const [focus, language, expected] of [[true, 'cpp', 'becoder.ojConnect.submit'], [true, 'c', 'becoder.ojConnect.submit'], [false, 'cpp', 'existing.share'], [true, 'plaintext', 'existing.share']] as const) {
			const context: Record<string, unknown> = { editorTextFocus: focus, editorLangId: language };
			const result = resolver.resolve({ getValue: <T>(key: string) => context[key] as T | undefined }, [], chord);
			assert.strictEqual(result.kind, ResultKind.KbFound);
			if (result.kind === ResultKind.KbFound) { assert.strictEqual(result.commandId, expected); }
		}
	});
	test('Luogu submits and reopens results without creating any browser tab', async () => {
		const problem = { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
		const record = { problem, id: '55', url: 'https://www.luogu.com.cn/record/55' };
		let visible = 0, recordReads = 0;
		let finishRelease!: () => void;
		const releasing = new Promise<void>(resolve => { finishRelease = resolve; });
		const calls: [string, unknown[]][] = [];
		const browsers = { getKnownBrowserViews: () => new Map(), resolveStorageScope: async () => BrowserViewStorageScope.Global, getOrCreateLazy: () => { throw new Error('Luogu must not create a tab'); } };
		const main = { getChannel: () => ({ listen: () => Event.None, call: async (name: string, args: unknown[]) => {
			calls.push([name, args]);
			if (name === 'openLuoguSession') { return 'global'; }
			if (name === 'prepareLuoguTask') { return { languages: [{ id: '27', label: 'C++20', family: 'cpp' }], hasDraft: false, ownerKey: '1' }; }
			if (name === 'submitLuoguTask') { return { kind: 'record', record }; }
			if (name === 'updateLuoguSession') { await releasing; }
			if (name === 'readLuoguRecord') { recordReads++; return { ref: record, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' }; }
			if (name === 'readOjProblem') { return { ref: args[2], title: 'A+B', bodies: [], samples: [], limits: [], interactive: false }; }
			return undefined;
		} }) };
		const editors = { editors: [], openEditor: async () => { visible++; } };
		const commands = { executeCommand: async () => { throw new Error('No browser interaction is needed'); } };
		const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
		const contribution = new BrowserOjConnectContribution(editors as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], commands as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
		try {
			const execute = (suffix: string, ...args: unknown[]): unknown => CommandsRegistry.getCommand('_becoder.ojConnect.luogu.' + suffix)!.handler(undefined!, ...args);
			await execute('readProblem', problem);
			const prepared = await execute('prepare', problem, 'file:///C:/P1001.cpp') as { handle: string };
			await execute('send', prepared.handle, { source: 'int main() {}', fileName: 'P1001.cpp', languageId: '27' });
			await execute('release', prepared.handle);
			const cancelled = execute('cancelRecord', record);
			const reopened = execute('readRecord', record);
			await new Promise(resolve => setTimeout(resolve, 0));
			assert.strictEqual(recordReads, 0, 'immediate reopen waits for the old native subscription release');
			finishRelease(); await cancelled; await reopened;
			await CommandsRegistry.getCommand('_becoder.ojConnect.releaseRecord')!.handler(undefined!, record);
			await execute('readRecord', record);
			assert.strictEqual(recordReads, 1, 'closed result can reopen its confirmed snapshot');
			assert.strictEqual(visible, 0);
			assert.deepStrictEqual(calls.find(([name]) => name === 'readOjProblem')?.[1], ['global', mainWindow.vscodeWindowId, problem]);
			assert.deepStrictEqual(calls.find(([name]) => name === 'openLuoguSession')?.[1], [mainWindow.vscodeWindowId, BrowserViewStorageScope.Global]);
		} finally { contribution.dispose(); }
	});
	test('released unfinished AtCoder records reopen without accepting unknown record identities', async () => {
		const problem = { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
		const record = { problem, id: '55', url: 'https://atcoder.jp/contests/abc086/submissions/55' };
		const known = new Map();
		let creations = 0, recordReads = 0, reveals = 0;
		const browsers = { getKnownBrowserViews: () => known, resolveStorageScope: async () => BrowserViewStorageScope.Global, getOrCreateLazy: (id: string, options: { url: string }) => {
			creations++;
			let disposed = false;
			const model = { id, url: options.url, loading: false, storageScope: BrowserViewStorageScope.Global, onDidNavigate: Event.None, onDidClose: Event.None, loadURL: async (url: string) => { model.url = url; } };
			const input = { get url() { return model.url; }, model, isDisposed: () => disposed, resolve: async () => model, dispose: () => { disposed = true; } };
			known.set(id, input); return input;
		} };
		const main = { getChannel: () => ({ listen: () => Event.None, call: async (name: string, args: unknown[]) => {
			if (name === 'sendAndConfirmAtCoderTask') { return { kind: 'record', record }; }
			if (name === 'readAtCoderRecord') {
				recordReads++;
				assert.strictEqual(known.get(args[0]).model.url, record.url);
				return { ref: record, phase: 'judging', rawStatus: 'Judging', sourceVerification: 'not-checked' };
			}
			return undefined;
		} }) };
		const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
		const contribution = new BrowserOjConnectContribution({ editors: [], openEditor: async () => { reveals++; } } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], { executeCommand: async () => undefined } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
		try {
			const execute = (suffix: string, ...args: unknown[]): unknown => CommandsRegistry.getCommand('_becoder.ojConnect.atcoder.' + suffix)!.handler(undefined!, ...args);
			const read = async (value = record) => await execute('readRecord', value) as { phase: string };
			await assert.rejects(() => read(), /atcoder-invalid-record/);
			assert.strictEqual(creations, 0, 'a record without a confirmed receipt cannot open a browser');
			const page = await execute('openTask', problem.url, 'file:///C:/abc086_a.cpp');
			await execute('sendAndConfirm', page, { source: 'int main() {}', fileName: 'abc086_a.cpp', languageId: '5001', replaceDraft: false });
			await execute('release', page);
			assert.strictEqual((await read()).phase, 'judging');
			await CommandsRegistry.getCommand('_becoder.ojConnect.releaseRecord')!.handler(undefined!, record);
			assert.strictEqual((await read()).phase, 'judging', 'closing an unfinished result preserves its authority to reopen');
			assert.strictEqual(creations, 1, 'an available carrier is reused');
			await CommandsRegistry.getCommand('_becoder.ojConnect.releaseRecord')!.handler(undefined!, record);
			for (const input of known.values()) { input.dispose(); }
			assert.strictEqual((await read()).phase, 'judging', 'closing the old browser permits a new carrier for the known receipt');
			assert.strictEqual(creations, 2);
			await assert.rejects(() => read({ ...record, id: '56' }), /atcoder-invalid-record/);
			assert.strictEqual(recordReads, 3);
			assert.strictEqual(reveals, 0, 'reopening results does not reveal hidden carriers');
		} finally { contribution.dispose(); }
		assert.ok([...known.values()].every(input => input.isDisposed()));
	});
	test('AtCoder reopen rejects a different default session and reuses an available original-scope carrier', async () => {
		const fixture = atCoderFixture();
		try {
			await fixture.accept();
			for (const input of fixture.known.values()) { input.dispose(); }
			fixture.setScope(BrowserViewStorageScope.Workspace);
			await assert.rejects(() => fixture.read(), /oj-connect-session-scope-changed/);
			assert.strictEqual(fixture.creations, 1, 'a changed default cannot create a carrier in another account scope');
			assert.strictEqual(fixture.recordReads, 0);
			const carrier = fixture.addCarrier('original-scope', BrowserViewStorageScope.Global);
			assert.strictEqual((await fixture.read()).phase, 'judging');
			assert.strictEqual(carrier.model.url, fixture.record.url);
			assert.strictEqual(fixture.creations, 1);
		} finally { fixture.dispose(); }
	});
	test('AtCoder reconciliation retains the send scope after its original browser closes', async () => {
		const fixture = atCoderFixture();
		try {
			fixture.setSend(async () => ({ kind: 'unconfirmed', problem: fixture.record.problem, attemptId: 'attempt-55', message: 'pending' }));
			await fixture.accept();
			for (const input of fixture.known.values()) { input.dispose(); }
			fixture.setScope(BrowserViewStorageScope.Workspace);
			await fixture.execute('reconcile', 'attempt-55');
			await assert.rejects(() => fixture.read(), /oj-connect-session-scope-changed/);
			assert.strictEqual(fixture.recordReads, 0);
		} finally { fixture.dispose(); }
	});
	test('AtCoder results completing after reset cannot refill the finished cache', async () => {
		const fixture = atCoderFixture();
		const started = new DeferredPromise<void>(), result = new DeferredPromise<ReturnType<typeof fixture.snapshot>>();
		try {
			await fixture.accept();
			fixture.editors.editors.push(...fixture.known.values());
			fixture.setRead(async () => { started.complete(); return result.p; });
			const reading = fixture.read();
			const rejected = assert.rejects(() => reading, /oj-connect-stopped|atcoder-invalid-record/);
			await started.p; fixture.reset(); await result.complete(fixture.snapshot('AC')); await rejected;
			fixture.setRead(async () => fixture.snapshot('WA'));
			await fixture.accept();
			assert.strictEqual((await fixture.read()).rawStatus, 'WA', 'the new lifecycle must read its own result');
			assert.strictEqual(fixture.recordReads, 2);
		} finally { fixture.dispose(); }
	});
	for (const lifecycle of ['reset', 'dispose'] as const) {
		test(`AtCoder pending carrier watch stops before native record read on ${lifecycle}`, async () => {
			const fixture = atCoderFixture();
			const started = new DeferredPromise<void>(), watched = new DeferredPromise<void>();
			try {
				await fixture.accept();
				for (const input of fixture.known.values()) { input.dispose(); }
				fixture.setWatch(async () => { started.complete(); await watched.p; });
				const reading = fixture.read();
				const rejected = assert.rejects(() => reading, /oj-connect-stopped|atcoder-invalid-record/);
				await started.p; fixture[lifecycle](); await watched.complete(); await rejected;
				assert.strictEqual(fixture.recordReads, 0, 'a stopped carrier cannot start the result request');
			} finally { fixture.dispose(); }
		});
	}
	test('native account commands open fixed official login pages and logout only the selected site', async () => {
		const known = new Map();
		const opened: string[] = [], logoutRequests: unknown[][] = [];
		let logoutFailure: Error | undefined;
		const editors = { editors: [], openEditor: async (input: { url: string }) => { opened.push(input.url); } };
		const browsers = { resolveStorageScope: async () => BrowserViewStorageScope.Global, getKnownBrowserViews: () => known, getOrCreateLazy: (id: string, options: { url: string }) => {
			let disposed = false;
			const model = { id, url: options.url, loading: false, storageScope: BrowserViewStorageScope.Global, onDidNavigate: Event.None, onDidClose: Event.None };
			const input = { get url() { return model.url; }, model: undefined as typeof model | undefined, isDisposed: () => disposed, resolve: async () => { input.model = model; return model; }, dispose: () => { disposed = true; } };
			known.set(id, input); return input;
		} };
		const main = { getChannel: () => ({ listen: () => Event.None, call: async (name: string, args: unknown[]) => {
			if (name === 'openLuoguSession') { return 'global'; }
			if (name === 'logoutOjSite') { logoutRequests.push(args); if (logoutFailure) { throw logoutFailure; } }
			return undefined;
		} }) };
		const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
		const commands = { executeCommand: async () => undefined };
		const contribution = new BrowserOjConnectContribution(editors as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], commands as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
		try {
			await CommandsRegistry.getCommand('_becoder.ojConnect.luogu.login')!.handler(undefined!);
			await CommandsRegistry.getCommand('_becoder.ojConnect.atcoder.login')!.handler(undefined!);
			assert.deepStrictEqual(opened, ['https://www.luogu.com.cn/auth/login', 'https://atcoder.jp/login']);
			known.set('blank-user-tab', { model: { url: '', loading: false, storageScope: BrowserViewStorageScope.Global }, isDisposed: () => false });
			await CommandsRegistry.getCommand('_becoder.ojConnect.luogu.logout')!.handler(undefined!);
			assert.strictEqual(logoutRequests.length, 1);
			assert.deepStrictEqual(logoutRequests[0], ['global', mainWindow.vscodeWindowId, 'luogu']);
			logoutFailure = new Error('server refused logout');
			await assert.rejects(async () => await CommandsRegistry.getCommand('_becoder.ojConnect.atcoder.logout')!.handler(undefined!), /server refused logout/);
			const atcoder = [...known.values()].find(input => input.url === 'https://atcoder.jp/');
			assert.deepStrictEqual(logoutRequests[1], [atcoder.model.id, mainWindow.vscodeWindowId, 'atcoder']);
			assert.strictEqual(opened.length, 2, 'logout never reveals an unrelated webpage');
		} finally { contribution.dispose(); }
		assert.ok([...known.entries()].filter(([id]) => id !== 'blank-user-tab').every(([, input]) => input.isDisposed()), 'all hidden account carriers are released');
		assert.strictEqual(known.get('blank-user-tab').isDisposed(), false, 'ordinary blank tabs remain untouched');
	});
	test('normal browser tabs opened after initialization refresh accounts while ephemeral tabs cannot supply login status', async () => {
		const changes = new Emitter<void>(), navigation = new Emitter<void>(), loading = new Emitter<void>();
		const ephemeral = { model: { id: 'isolated', url: 'https://www.luogu.com.cn/auth/login', loading: false, storageScope: BrowserViewStorageScope.Ephemeral, onDidNavigate: Event.None, onDidClose: Event.None }, isDisposed: () => false };
		const persistent = { model: { id: 'normal', url: 'https://www.luogu.com.cn/auth/login', loading: true, storageScope: BrowserViewStorageScope.Global, onDidNavigate: navigation.event, onDidChangeLoadingState: loading.event, onDidClose: Event.None }, isDisposed: () => false };
		const second = { model: { ...persistent.model, id: 'normal-second', loading: false, onDidNavigate: Event.None, onDidChangeLoadingState: Event.None }, isDisposed: () => false };
		const known = new Map<string, { model: typeof ephemeral.model; isDisposed: () => boolean }>([['isolated', ephemeral]]);
		const watches: unknown[][] = [], summaries: unknown[][] = [];
		let refresh!: () => void;
		const refreshed = new Promise<void>(resolve => { refresh = resolve; });
		const commands = { executeCommand: async (command: string) => { assert.strictEqual(command, 'becoder.ojConnect.refreshAccounts'); refresh(); } };
		let scope = BrowserViewStorageScope.Ephemeral;
		const browsers = { resolveStorageScope: async () => scope, getKnownBrowserViews: () => known, onDidChangeBrowserViews: changes.event };
		const main = { getChannel: () => ({ listen: () => Event.None, call: async (name: string, args: unknown[]) => {
			if (name === 'openLuoguSession') { if (scope === BrowserViewStorageScope.Ephemeral) { throw new Error('persistent browser session required'); } return 'global'; }
			if (name === 'watchOjSession') { watches.push(args); }
			if (name === 'readOjLogin') { summaries.push(args); return { site: 'luogu', state: 'signed-in', label: 'Normal account' }; }
			return undefined;
		} }) };
		const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
		const contribution = new BrowserOjConnectContribution({ editors: [] } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], commands as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			const summary = CommandsRegistry.getCommand('_becoder.ojConnect.luogu.loginSummary')!;
			await assert.rejects(async () => await summary.handler(undefined!), /persistent browser session/);
			assert.deepStrictEqual(summaries, [], 'the only ephemeral tab cannot become the shared authentication authority');
			assert.deepStrictEqual(watches, [], 'isolated sessions are not watched as shared sessions');
			scope = BrowserViewStorageScope.Global; known.set('normal', persistent); known.set('normal-second', second); changes.fire();
			assert.deepStrictEqual(watches, [['normal', mainWindow.vscodeWindowId], ['normal-second', mainWindow.vscodeWindowId]]);
			navigation.fire(); persistent.model.loading = false; loading.fire();
			await Promise.race([refreshed, new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('The new browser tab did not refresh account status.')), 1500); })]);
			assert.deepStrictEqual(await summary.handler(undefined!), { site: 'luogu', state: 'signed-in', label: 'Normal account' });
			assert.deepStrictEqual(summaries, [['global', mainWindow.vscodeWindowId, 'luogu']], 'account summary uses the persistent Session rather than a tab');
		} finally { if (timeout) { clearTimeout(timeout); } contribution.dispose(); changes.dispose(); navigation.dispose(); loading.dispose(); }
	});
});

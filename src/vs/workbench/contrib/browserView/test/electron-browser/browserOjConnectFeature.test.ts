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

function atCoderFixture(loading = false) {
	const problem = { site: 'atcoder', nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' };
	const record = { problem, id: '55', url: 'https://atcoder.jp/contests/abc086/submissions/55' };
	const snapshot = (rawStatus = 'Judging') => ({ ref: record, phase: rawStatus === 'Judging' ? 'judging' : 'finished', rawStatus, sourceVerification: 'not-checked' });
	const stop = new Emitter<void>();
	const interaction = new Emitter<{ windowId: number; id: string }>();
	let scope = BrowserViewStorageScope.Global, creations = 0, recordReads = 0;
	let readRecord = async () => snapshot();
	let send: () => Promise<unknown> = async () => ({ kind: 'record', record });
	let watch = async () => { };
	let reveal = async () => { };
	let prepare = async (): Promise<unknown> => undefined;
	let login = async () => ({ site: 'atcoder', state: 'signed-in', label: 'fixture_user' });
	let wait = async () => { };
	let problemRead = async () => { };
	const create = (id: string, url: string, storageScope = scope) => {
		let disposed = false;
		const model = { id, url, loading, visible: false, storageScope, onDidNavigate: Event.None, onDidClose: Event.None, loadURL: async (value: string) => { model.url = value; } };
		return { resource: { path: id }, get url() { return model.url; }, model, isDisposed: () => disposed, resolve: async () => model, dispose: () => { disposed = true; } };
	};
	const known = new Map<string, ReturnType<typeof create>>();
	const statementReads: unknown[][] = [];
	const problemReads: unknown[][] = [];
	const problemWaits: unknown[][] = [];
	const editors = {
		editors: [] as ReturnType<typeof create>[],
		openEditor: async (input: ReturnType<typeof create>) => { await reveal(); editors.editors.push(input); },
		findEditors: (resource: { path: string }) => editors.editors.filter(input => input.resource === resource).map(editor => ({ editor, groupId: 1 })),
		closeEditors: async (values: { editor: ReturnType<typeof create> }[]) => { for (const { editor } of values) { editors.editors.splice(editors.editors.indexOf(editor), 1); editor.dispose(); } }
	};
	const browsers = {
		getKnownBrowserViews: () => known, resolveStorageScope: async () => scope, getOrCreateLazy: (id: string, options: { url: string }) => {
			creations++; const input = create(id, options.url); known.set(id, input); return input;
		}
	};
	const main = {
		getChannel: () => ({
			listen: (name: string) => name === 'onDidRequireOjInteraction' ? interaction.event : Event.None, call: async (name: string, args: unknown[]) => {
				if (name === 'sendAndConfirmAtCoderTask') { return send(); }
				if (name === 'reconcileAtCoderAttempt') { return { kind: 'record', record }; }
				if (name === 'readAtCoderRecord') { assert.strictEqual(args[0], scope); recordReads++; return readRecord(); }
				if (name === 'watchOjSession') { return watch(); }
				if (name === 'prepareAtCoderTask') { return prepare(); }
				if (name === 'readAtCoderLogin') { assert.strictEqual(args[1], scope); return login(); }
				if (name === 'readOjStatement') { statementReads.push(args); await problemRead(); return { ref: args[2], title: 'A+B', bodies: [], samples: [], limits: [], interactive: false }; }
				if (name === 'readOjProblem') { problemReads.push(args); await problemRead(); return { ref: args[2], title: 'A+B', bodies: [], samples: [], limits: [], interactive: false }; }
				if (name === 'waitForOjProblemDocument') { problemWaits.push(args); await wait(); const input = known.get(String(args[0])); if (input) { input.model.loading = false; } }
				return undefined;
			}
		})
	};
	const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: stop.event, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
	const contribution = new BrowserOjConnectContribution(editors as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], { executeCommand: async () => undefined } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
	const execute = (suffix: string, ...args: unknown[]): unknown => CommandsRegistry.getCommand('_becoder.ojConnect.atcoder.' + suffix)!.handler(undefined!, ...args);
	return {
		record, snapshot, known, editors, execute, problemReads, problemWaits, statementReads,
		get creations() { return creations; }, get recordReads() { return recordReads; },
		setScope: (value: BrowserViewStorageScope) => { scope = value; },
		setRead: (value: typeof readRecord) => { readRecord = value; },
		setSend: (value: typeof send) => { send = value; },
		setWatch: (value: typeof watch) => { watch = value; },
		setReveal: (value: typeof reveal) => { reveal = value; },
		setPrepare: (value: typeof prepare) => { prepare = value; },
		setLogin: (value: typeof login) => { login = value; },
		setWait: (value: typeof wait) => { wait = value; },
		setProblemRead: (value: typeof problemRead) => { problemRead = value; },
		interact: (id: string) => interaction.fire({ windowId: mainWindow.vscodeWindowId, id }),
		addCarrier: (id: string, storageScope: BrowserViewStorageScope, url = problem.url) => { const input = create(id, url, storageScope); known.set(id, input); return input; },
		accept: async () => {
			const page = await execute('openTask', problem.url, 'file:///C:/abc086_a.cpp');
			await execute('inspectTask', page);
			const outcome = await execute('sendAndConfirm', page, { source: 'int main() {}', fileName: 'abc086_a.cpp', languageId: '5001', replaceDraft: false });
			await execute('release', page); return outcome;
		},
		read: async () => await execute('readRecord', record) as ReturnType<typeof snapshot>,
		reset: () => stop.fire(),
		dispose: () => { contribution.dispose(); stop.dispose(); interaction.dispose(); }
	};
}

function lanqiaoFixture() {
	const problem = { site: 'lanqiao', nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' };
	const id = '6aff1ff717e87398a15a4abf', record = { problem, id, url: 'https://www.lanqiao.cn/problems/254/submissions/' + id + '/' };
	const scopeChanged = new Emitter<void>(), stopped = new Emitter<void>();
	let scope = BrowserViewStorageScope.Global, sends = 0, cancelled = 0;
	let finish!: (value: unknown) => void;
	let holdRead: (() => Promise<void>) | undefined;
	const main = {
		getChannel: () => ({
			listen: () => Event.None, call: async (name: string, args: unknown[]) => {
				if (name === 'openLanqiaoSession') { return String(args[1]); }
				if (name === 'prepareLanqiaoTask') { return { ownerKey: 'owner-key', hasDraft: false, languages: [{ id: 'cpp', family: 'cpp', label: 'C++（g++17）' }] }; }
				if (name === 'submitLanqiaoTask') { sends++; return new Promise(resolve => { finish = resolve; }); }
				if (name === 'cancelLanqiaoOperations') { cancelled++; finish?.({ kind: 'unconfirmed', problem, attemptId: 'invalidated', message: 'stopped' }); }
				if (name === 'readLanqiaoRecord') { await holdRead?.(); return { ref: record, rawStatus: 'AC', phase: 'finished', sourceVerification: 'matched' }; }
				return undefined;
			}
		})
	};
	const browsers = { getKnownBrowserViews: () => new Map(), resolveStorageScope: async () => scope, onDidChangeStorageScope: scopeChanged.event };
	const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: stopped.event, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
	const contribution = new BrowserOjConnectContribution({ editors: [] } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], { executeCommand: async () => undefined } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
	const execute = async (suffix: string, ...args: unknown[]): Promise<any> => CommandsRegistry.getCommand('_becoder.ojConnect.lanqiao.' + suffix)!.handler(undefined!, ...args);
	return { problem, record, execute, get sends() { return sends; }, get cancelled() { return cancelled; }, finish: (value: unknown) => finish(value), setScope: (value: BrowserViewStorageScope) => { scope = value; scopeChanged.fire(); }, holdRead: (value: () => Promise<void>) => { holdRead = value; }, dispose: () => { contribution.dispose(); scopeChanged.dispose(); stopped.dispose(); } };
}

suite('Lanqiao storage-scope lifecycle', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('changing storage scope cancels an active native transaction and suppresses its late receipt', async () => {
		const f = lanqiaoFixture();
		try {
			const form = await f.execute('prepare', f.problem, 'file:///lanqiao/254.cpp');
			const sending = f.execute('send', form.handle, { source: 'int main(){}', fileName: '254.cpp', languageId: 'cpp' });
			for (let i = 0; i < 10; i++) { await Promise.resolve(); }
			assert.strictEqual(f.sends, 1);
			const rejected = assert.rejects(sending);
			f.setScope(BrowserViewStorageScope.Workspace);
			assert.strictEqual(f.cancelled, 1);
			f.finish({ kind: 'record', record: f.record }); await rejected;
		} finally { f.dispose(); }
	});
	test('scope changes while reading cannot deliver a previous-session record', async () => {
		const f = lanqiaoFixture();
		try {
			const form = await f.execute('prepare', f.problem, 'file:///lanqiao/254.cpp');
			const sending = f.execute('send', form.handle, { source: 'int main(){}', fileName: '254.cpp', languageId: 'cpp' });
			for (let i = 0; i < 10; i++) { await Promise.resolve(); }
			f.finish({ kind: 'record', record: f.record }); await sending;
			const read = new DeferredPromise<void>(); f.holdRead(() => read.p);
			const pending = f.execute('readRecord', f.record), rejected = assert.rejects(pending);
			for (let i = 0; i < 10; i++) { await Promise.resolve(); }
			f.setScope(BrowserViewStorageScope.Workspace); read.complete(); await rejected;
		} finally { f.dispose(); }
	});
});

function codeforcesFixture() {
	const problem = { site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
	const record = { problem, id: '55', url: 'https://codeforces.com/contest/4/submission/55' };
	const sessionChanged = new Emitter<{ windowId: number; site: 'codeforces' }>();
	const stopped = new Emitter<void>();
	let scope = BrowserViewStorageScope.Global, sends = 0, reads = 0;
	let resolveScope = async () => scope;
	let send = async (): Promise<unknown> => ({ kind: 'record', record });
	let read = async (): Promise<unknown> => ({ ref: record, phase: 'finished', rawStatus: 'Accepted', sourceVerification: 'matched' });
	let prepare = async (): Promise<unknown> => ({ languages: [{ id: '54', label: 'GNU G++17 7.3.0', family: 'cpp' }], hasDraft: false, ownerKey: 'fixture_user' });
	const released: string[] = [];
	const browsers = { getKnownBrowserViews: () => new Map(), resolveStorageScope: () => resolveScope(), getOrCreateLazy: () => { throw new Error('CF submission must not create a browser'); } };
	const main = {
		getChannel: () => ({
			listen: (name: string) => name === 'onDidChangeOjSession' ? sessionChanged.event : Event.None,
			call: async (name: string, args: unknown[]) => {
				if (name === 'openCodeforcesSession') { return String(args[1]); }
				if (name === 'prepareCodeforcesTask') { return prepare(); }
				if (name === 'submitCodeforcesTask') { sends++; const value = await send() as { kind: string }; return value.kind === 'unconfirmed' ? { ...value, attemptId: args[5] } : value; }
				if (name === 'readCodeforcesRecord') { reads++; return read(); }
				if (name === 'releaseCodeforcesRecord') { released.push(String(args[0])); }
				if (name === 'reconcileCodeforcesAttempt') { return { kind: 'record', record }; }
				if (name === 'readOjLogin') { return { site: 'codeforces', state: 'signed-in', label: 'fixture_user', profileUrl: 'https://codeforces.com/profile/fixture_user' }; }
				return undefined;
			}
		})
	};
	const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: stopped.event, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
	const contribution = new BrowserOjConnectContribution({ editors: [], openEditor: () => { throw new Error('CF submission must not reveal a browser'); } } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], { executeCommand: async () => undefined } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
	const execute = async (suffix: string, ...args: unknown[]): Promise<unknown> => {
		const command = CommandsRegistry.getCommand('_becoder.ojConnect.codeforces.' + suffix);
		assert.ok(command, 'CF fixed command is registered: ' + suffix);
		return command.handler(undefined!, ...args);
	};
	return {
		problem, record, execute, released, get sends() { return sends; }, get reads() { return reads; },
		setResolveScope(value: typeof resolveScope) { resolveScope = value; },
		setScope(value: BrowserViewStorageScope) { scope = value; }, setPrepare(value: typeof prepare) { prepare = value; }, setRead(value: typeof read) { read = value; }, setSend(value: typeof send) { send = value; },
		accept: async () => { const form = await execute('prepare', problem, 'file:///C:/codeforces/4_a.cpp') as { handle: string }; const value = await execute('send', form.handle, { source: 'int main(){}', fileName: '4_a.cpp', languageId: '54' }); await execute('release', form.handle); return value; },
		invalidate: () => sessionChanged.fire({ windowId: mainWindow.vscodeWindowId, site: 'codeforces' }),
		reset: () => stopped.fire(), dispose: () => { contribution.dispose(); sessionChanged.dispose(); stopped.dispose(); }
	};
}

suite('OJ Connect source shortcut', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	for (const site of ['atcoder', 'codeforces'] as const) {
		test(site + ' reads one statement without creating navigating or stopping any browser', async () => {
			const f = atCoderFixture(true), problem = site === 'atcoder' ? f.record.problem : { site, nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
			const command = CommandsRegistry.getCommand('_becoder.ojConnect.' + site + '.readProblem')!;
			try {
				const user = f.addCarrier('ordinary-task', BrowserViewStorageScope.Global, problem.url); f.editors.editors.push(user);
				await command.handler(undefined!, problem); assert.strictEqual(f.creations, 0); assert.strictEqual(f.statementReads.length, 1);
				assert.deepStrictEqual(f.statementReads[0].slice(0, 3), [mainWindow.vscodeWindowId, BrowserViewStorageScope.Global, problem]);
				assert.strictEqual(f.problemReads.length, 0); assert.strictEqual(f.problemWaits.length, 0); assert.strictEqual(user.isDisposed(), false); assert.strictEqual(user.model.loading, true);
				f.setScope(BrowserViewStorageScope.Workspace); await command.handler(undefined!, problem); assert.strictEqual(f.statementReads[1][1], BrowserViewStorageScope.Workspace); assert.strictEqual(f.creations, 0);
			} finally { f.dispose(); }
		});
		test(site + ' rejects a late statement when scope changes or the extension stops', async () => {
			for (const cause of ['scope', 'reset']) {
				const f = atCoderFixture(), pending = new DeferredPromise<void>(), started = new DeferredPromise<void>();
				try {
					f.setProblemRead(async () => { await started.complete(); await pending.p; });
					const command = CommandsRegistry.getCommand('_becoder.ojConnect.' + site + '.readProblem')!;
					const reading = command.handler(undefined!, f.record.problem.site === site ? f.record.problem : { site, nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' }) as unknown as Promise<unknown>;
					const rejected = assert.rejects(reading, cause === 'scope' ? /scope-changed/ : /stopped/);
					await started.p; if (cause === 'scope') { f.setScope(BrowserViewStorageScope.Workspace); } else { f.reset(); }
					await pending.complete(); await rejected; assert.strictEqual(f.creations, 0);
				} finally { f.dispose(); }
			}
		});
	}
	test('CF account, submit, result and reconciliation use fixed Session commands without a browser', async () => {
		const f = codeforcesFixture();
		try {
			assert.strictEqual((await f.execute('loginSummary') as { label: string }).label, 'fixture_user');
			await f.accept();
			assert.strictEqual((await f.execute('readRecord', f.record) as { rawStatus: string }).rawStatus, 'Accepted');
			f.setSend(async () => ({ kind: 'unconfirmed', problem: f.problem, attemptId: 'attempt', message: 'receipt unknown' }));
			const attempt = await f.accept() as { attemptId: string };
			assert.strictEqual((await f.execute('reconcile', attempt.attemptId) as { kind: string }).kind, 'record');
			assert.strictEqual(f.sends, 2, 'reconciliation cannot resend code');
		} finally { f.dispose(); }
	});
	test('CF send refuses a changed storage scope and canceled late preparation', async () => {
		const f = codeforcesFixture();
		try {
			const form = await f.execute('prepare', f.problem, 'file:///C:/codeforces/4_a.cpp') as { handle: string };
			f.setScope(BrowserViewStorageScope.Workspace);
			await assert.rejects(f.execute('send', form.handle, { source: 'int main(){}', fileName: '4_a.cpp', languageId: '54' }), /scope-changed/);
			assert.strictEqual(f.sends, 0);
			const pending = new DeferredPromise<unknown>();
			const started = new DeferredPromise<void>();
			f.setPrepare(async () => { await started.complete(); return pending.p; });
			const preparing = f.execute('prepare', f.problem, 'file:///C:/codeforces/4_a.cpp');
			const rejected = assert.rejects(preparing, /stopped/);
			await started.p; await f.execute('cancelPreparation');
			await pending.complete({ languages: [{ id: '54', family: 'cpp', label: 'GNU G++17' }], ownerKey: 'fixture_user' });
			await rejected;
			assert.strictEqual(f.sends, 0);
		} finally { f.dispose(); }
	});
	test('CF cancellation while resolving scope prevents native dispatch', async () => {
		const f = codeforcesFixture(), pending = new DeferredPromise<BrowserViewStorageScope>(), started = new DeferredPromise<void>();
		try {
			const form = await f.execute('prepare', f.problem, 'file:///C:/codeforces/4_a.cpp') as { handle: string };
			f.setResolveScope(async () => { await started.complete(); return pending.p; });
			const sending = f.execute('send', form.handle, { source: 'int main(){}', fileName: '4_a.cpp', languageId: '54' });
			const rejected = assert.rejects(sending, /cancelled/);
			await started.p; await f.execute('cancel', form.handle);
			await pending.complete(BrowserViewStorageScope.Global); await rejected;
			assert.strictEqual(f.sends, 0);
		} finally { f.dispose(); }
	});
	test('CF cached result is invalidated by verified account changes and releases its original Session', async () => {
		const f = codeforcesFixture();
		try {
			await f.accept(); await f.execute('readRecord', f.record); await f.execute('readRecord', f.record);
			assert.strictEqual(f.reads, 1);
			f.invalidate(); f.setRead(async () => { throw new Error('codeforces-session-changed'); });
			await assert.rejects(f.execute('readRecord', f.record), /session-changed/);
			f.setScope(BrowserViewStorageScope.Workspace);
			await f.execute('cancelRecord', f.record);
			assert.deepStrictEqual(f.released, [String(BrowserViewStorageScope.Global)]);
		} finally { f.dispose(); }
	});
	test('CF late record response cannot outlive closed tracking', async () => {
		const f = codeforcesFixture(), pending = new DeferredPromise<unknown>(), started = new DeferredPromise<void>();
		try {
			await f.accept(); f.setRead(async () => { await started.complete(); return pending.p; });
			const reading = f.execute('readRecord', f.record), rejected = assert.rejects(reading, /stopped/);
			await started.p; await f.execute('cancelRecord', f.record);
			await pending.complete({ ref: f.record, phase: 'finished', rawStatus: 'Accepted', sourceVerification: 'matched' });
			await rejected;
		} finally { f.dispose(); }
	});
	test('AtCoder signed-out preparation reports login without revealing or navigating a browser', async () => {
		const fixture = atCoderFixture();
		let attempts = 0, reveals = 0;
		fixture.setPrepare(async () => { if (!attempts++) { throw new Error('atcoder-login-required'); } });
		fixture.setReveal(async () => { reveals++; await [...fixture.known.values()][0].model.loadURL(fixture.record.problem.url); });
		try {
			await assert.rejects(fixture.accept(), /atcoder-login-required/);
			assert.strictEqual(reveals, 0);
			assert.strictEqual(attempts, 1);
		} finally { fixture.dispose(); }
	});
	test('AtCoder account refresh reads the persistent session without an existing browser tab', async () => {
		const fixture = atCoderFixture();
		try {
			assert.deepStrictEqual(await fixture.execute('loginSummary'), { site: 'atcoder', state: 'signed-in', label: 'fixture_user' });
			assert.strictEqual(fixture.editors.editors.length, 0);
			assert.strictEqual(fixture.creations, 0);
		} finally { fixture.dispose(); }
	});
	test('AtCoder account refresh uses the selected storage scope rather than a different workspace account', async () => {
		const fixture = atCoderFixture();
		const unrelated = fixture.addCarrier('different-scope', BrowserViewStorageScope.Global);
		fixture.setScope(BrowserViewStorageScope.Workspace);
		fixture.setLogin(async () => {
			assert.strictEqual(fixture.creations, 0);
			return { site: 'atcoder', state: 'signed-in', label: 'workspace_user' };
		});
		try {
			assert.strictEqual((await fixture.execute('loginSummary') as { label: string }).label, 'workspace_user');
			assert.strictEqual(unrelated.isDisposed(), false);
		} finally { fixture.dispose(); }
	});
	test('AtCoder missing form is reported without revealing a signed-in problem page', async () => {
		const fixture = atCoderFixture();
		fixture.setPrepare(async () => { throw new Error('atcoder-form-missing'); });
		fixture.setReveal(async () => { assert.fail('malformed forms are not login challenges'); });
		try { await assert.rejects(fixture.accept(), /atcoder-form-missing/); }
		finally { fixture.dispose(); }
	});
	test('AtCoder submission and result tracking never reveal a browser even when verification is pending', async () => {
		const fixture = atCoderFixture();
		const userTab = fixture.addCarrier('user-original-tab', BrowserViewStorageScope.Global);
		fixture.editors.editors.push(userTab);
		let reveals = 0;
		fixture.setReveal(async () => { reveals++; });
		fixture.setSend(async () => {
			fixture.interact([...fixture.known.values()].find(input => input !== userTab)!.model.id);
			return { kind: 'record', record: fixture.record };
		});
		try {
			await fixture.accept();
			assert.strictEqual((await fixture.read()).phase, 'judging');
			assert.strictEqual(reveals, 0);
			assert.deepStrictEqual(fixture.editors.editors, [userTab]);
		} finally { fixture.dispose(); }
	});
	test('AtCoder shortcut releases its direct submit form before tracking without changing a user tab', async () => {
		const fixture = atCoderFixture();
		const userTab = fixture.addCarrier('user-task-with-draft', BrowserViewStorageScope.Global);
		try {
			await fixture.accept();
			assert.strictEqual(fixture.creations, 1, 'a user task tab must not become the shortcut form');
			const taskPage = [...fixture.known.values()].find(input => input !== userTab)!;
			assert.strictEqual(taskPage.url, 'https://atcoder.jp/contests/abc086/submit?taskScreenName=abc086_a');
			assert.strictEqual(taskPage.isDisposed(), true, 'receipt does not retain a submission page');
			assert.strictEqual(userTab.isDisposed(), false);
			const originalURL = userTab.model.url;
			await fixture.read();
			assert.strictEqual(userTab.model.url, originalURL, 'reading the receipt must not navigate the original task away from its draft');
			assert.strictEqual(userTab.isDisposed(), false);
			assert.ok([...fixture.known.values()].filter(input => input !== userTab).every(input => input.model.storageScope === BrowserViewStorageScope.Global), 'task-owned views use the same persistent session');
		} finally { fixture.dispose(); }
		assert.strictEqual(userTab.isDisposed(), false, 'teardown only releases task-owned pages');
	});
	test('AtCoder reconciliation stays hidden without sending again', async () => {
		const fixture = atCoderFixture();
		let sends = 0;
		fixture.setSend(async () => {
			sends++; fixture.interact([...fixture.known.values()][0].model.id);
			return { kind: 'unconfirmed', attemptId: 'pending-one', problem: fixture.record.problem };
		});
		try {
			await fixture.accept();
			assert.strictEqual(fixture.editors.editors.length, 0);
			await fixture.execute('reconcile', 'pending-one');
			assert.strictEqual(fixture.editors.editors.length, 0);
			assert.strictEqual(sends, 1);
		} finally { fixture.dispose(); }
	});
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
		const main = {
			getChannel: () => ({
				listen: () => Event.None, call: async (name: string, args: unknown[]) => {
					calls.push([name, args]);
					if (name === 'openLuoguSession') { return 'global'; }
					if (name === 'prepareLuoguTask') { return { languages: [{ id: '27', label: 'C++20', family: 'cpp' }], hasDraft: false, ownerKey: '1' }; }
					if (name === 'submitLuoguTask') { return { kind: 'record', record }; }
					if (name === 'updateLuoguSession') { await releasing; }
					if (name === 'readLuoguRecord') { recordReads++; return { ref: record, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' }; }
					if (name === 'readOjProblem') { return { ref: args[2], title: 'A+B', bodies: [], samples: [], limits: [], interactive: false }; }
					return undefined;
				}
			})
		};
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
			assert.strictEqual(recordReads, 2, 'closing a result releases its source snapshot; reopening reads the confirmed record again');
			assert.strictEqual(visible, 0);
			assert.deepStrictEqual(calls.find(([name]) => name === 'readOjProblem')?.[1], ['global', mainWindow.vscodeWindowId, problem]);
			assert.deepStrictEqual(calls.find(([name]) => name === 'openLuoguSession')?.[1], [mainWindow.vscodeWindowId, BrowserViewStorageScope.Global]);
		} finally { contribution.dispose(); }
	});
	test('Luogu releases the original subscription after its browser storage scope changes', async () => {
		const problem = { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
		const record = { problem, id: '56', url: 'https://www.luogu.com.cn/record/56' };
		let scope = BrowserViewStorageScope.Global;
		const pending = new DeferredPromise<unknown>();
		const started = new DeferredPromise<void>();
		const subscriptions = new Set<string>();
		const released: string[] = [];
		const browsers = { getKnownBrowserViews: () => new Map(), resolveStorageScope: async () => scope };
		const main = {
			getChannel: () => ({
				listen: () => Event.None, call: async (name: string, args: unknown[]) => {
					if (name === 'openLuoguSession') { return String(args[1]); }
					if (name === 'prepareLuoguTask') { return { languages: [{ id: '27', label: 'C++20', family: 'cpp' }], ownerKey: '1' }; }
					if (name === 'submitLuoguTask') { return { kind: 'record', record }; }
					if (name === 'readLuoguRecord') { subscriptions.add(String(args[0])); await started.complete(); return pending.p; }
					if (name === 'updateLuoguSession') { released.push(String(args[0])); subscriptions.delete(String(args[0])); }
					return undefined;
				}
			})
		};
		const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
		const contribution = new BrowserOjConnectContribution({ editors: [] } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], {} as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
		const execute = (suffix: string, ...args: unknown[]): unknown => CommandsRegistry.getCommand('_becoder.ojConnect.luogu.' + suffix)!.handler(undefined!, ...args);
		try {
			const prepared = await execute('prepare', problem, 'file:///C:/P1001.cpp') as { handle: string };
			await execute('send', prepared.handle, { source: 'int main() {}', fileName: 'P1001.cpp', languageId: '27' });
			await execute('release', prepared.handle);
			const reading = execute('readRecord', record) as Promise<unknown>;
			const stopped = assert.rejects(reading, /stopped/);
			await started.p;
			scope = BrowserViewStorageScope.Workspace;
			await execute('cancelRecord', record);
			await pending.complete({ ref: record, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' });
			await stopped;
			assert.deepStrictEqual(released, [BrowserViewStorageScope.Global]);
			assert.strictEqual(subscriptions.size, 0, 'closing must release the original session, not a newly selected one');
		} finally { contribution.dispose(); }
	});

	test('Nowcoder submits and reopens results without creating any browser tab', async () => {
		const problem = { site: 'nowcoder', nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' };
		const record = { problem, id: '55', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=55' };
		let visible = 0, recordReads = 0;
		let finishRelease!: () => void;
		const releasing = new Promise<void>(resolve => { finishRelease = resolve; });
		const calls: [string, unknown[]][] = [];
		const browsers = { getKnownBrowserViews: () => new Map(), resolveStorageScope: async () => BrowserViewStorageScope.Global, getOrCreateLazy: () => { throw new Error('Nowcoder must not create a tab'); } };
		const main = {
			getChannel: () => ({
				listen: () => Event.None, call: async (name: string, args: unknown[]) => {
					calls.push([name, args]);
					if (name === 'openNowcoderSession') { return 'global'; }
					if (name === 'prepareNowcoderTask') { return { languages: [{ id: '2', label: 'C++20', family: 'cpp' }], hasDraft: false, ownerKey: '1' }; }
					if (name === 'submitNowcoderTask') { return { kind: 'record', record }; }
					if (name === 'releaseNowcoderRecord') { await releasing; }
					if (name === 'readNowcoderRecord') { recordReads++; return { ref: record, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' }; }
					if (name === 'readOjProblem') { return { ref: args[2], title: 'A+B', bodies: [], samples: [], limits: [], interactive: false }; }
					return undefined;
				}
			})
		};
		const editors = { editors: [], openEditor: async () => { visible++; } };
		const commands = { executeCommand: async () => { throw new Error('No browser interaction is needed'); } };
		const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
		const contribution = new BrowserOjConnectContribution(editors as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], commands as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
		try {
			const execute = (suffix: string, ...args: unknown[]): unknown => CommandsRegistry.getCommand('_becoder.ojConnect.nowcoder.' + suffix)!.handler(undefined!, ...args);
			await execute('readProblem', problem);
			const prepared = await execute('prepare', problem, 'file:///C:/18204.cpp') as { handle: string };
			await execute('send', prepared.handle, { source: 'int main() {}', fileName: '18204.cpp', languageId: '2' });
			await execute('release', prepared.handle);
			const cancelled = execute('cancelRecord', record);
			const reopened = execute('readRecord', record);
			await new Promise(resolve => setTimeout(resolve, 0));
			assert.strictEqual(recordReads, 0, 'immediate reopen waits for the old native subscription release');
			finishRelease(); await cancelled; await reopened;
			await CommandsRegistry.getCommand('_becoder.ojConnect.releaseRecord')!.handler(undefined!, record);
			await execute('readRecord', record);
			assert.strictEqual(recordReads, 2, 'closing a result releases its source snapshot; reopening reads the confirmed record again');
			assert.strictEqual(visible, 0);
			assert.deepStrictEqual(calls.find(([name]) => name === 'readOjProblem')?.[1], ['global', mainWindow.vscodeWindowId, problem]);
			assert.deepStrictEqual(calls.find(([name]) => name === 'openNowcoderSession')?.[1], [mainWindow.vscodeWindowId, BrowserViewStorageScope.Global]);
		} finally { contribution.dispose(); }
	});
	test('Nowcoder refuses a prepared send after browser storage scope changes', async () => {
		const problem = { site: 'nowcoder', nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' };
		let scope = BrowserViewStorageScope.Global, sends = 0;
		const browsers = { getKnownBrowserViews: () => new Map(), resolveStorageScope: async () => scope };
		const main = {
			getChannel: () => ({
				listen: () => Event.None, call: async (name: string, args: unknown[]) => {
					if (name === 'openNowcoderSession') { return args[1] === BrowserViewStorageScope.Global ? 'global' : 'workspace'; }
					if (name === 'prepareNowcoderTask') { return { ownerKey: '123', languages: [{ id: '2', label: 'C++', family: 'cpp' }] }; }
					if (name === 'submitNowcoderTask') { sends++; return { kind: 'not-sent', reason: 'fixture' }; }
					return undefined;
				}
			})
		};
		const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
		const contribution = new BrowserOjConnectContribution({ editors: [] } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], { executeCommand: async () => undefined } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
		const execute = (suffix: string, ...args: unknown[]): unknown => CommandsRegistry.getCommand('_becoder.ojConnect.nowcoder.' + suffix)!.handler(undefined!, ...args);
		try {
			const prepared = await execute('prepare', problem, 'file:///C:/nowcoder/18204.cpp') as { handle: string };
			scope = BrowserViewStorageScope.Workspace;
			await assert.rejects(async () => execute('send', prepared.handle, { source: 'int main(){}', fileName: '18204.cpp', languageId: '2' }), /oj-connect-session-scope-changed/);
			assert.strictEqual(sends, 0, 'changing the selected Session cannot send using the old account');
		} finally { contribution.dispose(); }
	});

	test('Nowcoder releases the original subscription after its browser storage scope changes', async () => {
		const problem = { site: 'nowcoder', nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' };
		const record = { problem, id: '56', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=56' };
		let scope = BrowserViewStorageScope.Global;
		const pending = new DeferredPromise<unknown>();
		const started = new DeferredPromise<void>();
		const subscriptions = new Set<string>();
		const released: string[] = [];
		const browsers = { getKnownBrowserViews: () => new Map(), resolveStorageScope: async () => scope };
		const main = {
			getChannel: () => ({
				listen: () => Event.None, call: async (name: string, args: unknown[]) => {
					if (name === 'openNowcoderSession') { return String(args[1]); }
					if (name === 'prepareNowcoderTask') { return { languages: [{ id: '2', label: 'C++20', family: 'cpp' }], ownerKey: '1' }; }
					if (name === 'submitNowcoderTask') { return { kind: 'record', record }; }
					if (name === 'readNowcoderRecord') { subscriptions.add(String(args[0])); await started.complete(); return pending.p; }
					if (name === 'releaseNowcoderRecord') { released.push(String(args[0])); subscriptions.delete(String(args[0])); }
					return undefined;
				}
			})
		};
		const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
		const contribution = new BrowserOjConnectContribution({ editors: [] } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], {} as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
		const execute = (suffix: string, ...args: unknown[]): unknown => CommandsRegistry.getCommand('_becoder.ojConnect.nowcoder.' + suffix)!.handler(undefined!, ...args);
		try {
			const prepared = await execute('prepare', problem, 'file:///C:/18204.cpp') as { handle: string };
			await execute('send', prepared.handle, { source: 'int main() {}', fileName: '18204.cpp', languageId: '2' });
			await execute('release', prepared.handle);
			const reading = execute('readRecord', record) as Promise<unknown>;
			const stopped = assert.rejects(reading, /stopped/);
			await started.p;
			scope = BrowserViewStorageScope.Workspace;
			await execute('cancelRecord', record);
			await pending.complete({ ref: record, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' });
			await stopped;
			assert.deepStrictEqual(released, [BrowserViewStorageScope.Global]);
			assert.strictEqual(subscriptions.size, 0, 'closing must release the original session, not a newly selected one');
		} finally { contribution.dispose(); }
	});

	test('AtCoder finished source snapshots are evicted when the result closes while confirmed receipts remain readable', async () => {
		const fixture = atCoderFixture();
		try {
			await fixture.accept();
			fixture.setRead(async () => fixture.snapshot('AC'));
			assert.strictEqual((await fixture.read()).rawStatus, 'AC');
			assert.strictEqual((await fixture.read()).rawStatus, 'AC');
			assert.strictEqual(fixture.recordReads, 1, 'an open result can reuse its finished snapshot');
			await CommandsRegistry.getCommand('_becoder.ojConnect.releaseRecord')!.handler(undefined!, fixture.record);
			fixture.setRead(async () => fixture.snapshot('WA'));
			assert.strictEqual((await fixture.read()).rawStatus, 'WA', 'closing the result must release the old source snapshot');
			assert.strictEqual(fixture.recordReads, 2, 'a confirmed receipt can reopen after its cached content is evicted');
		} finally { fixture.dispose(); }
	});
	test('released unfinished AtCoder records reopen through their session without any carrier', async () => {
		const fixture = atCoderFixture();
		try {
			await assert.rejects(() => fixture.read(), /atcoder-invalid-record/);
			await fixture.accept();
			assert.ok([...fixture.known.values()].every(input => input.isDisposed()));
			assert.strictEqual((await fixture.read()).phase, 'judging');
			await CommandsRegistry.getCommand('_becoder.ojConnect.releaseRecord')!.handler(undefined!, fixture.record);
			assert.strictEqual((await fixture.read()).phase, 'judging');
			assert.strictEqual(fixture.creations, 1, 'reading/reopening creates no record browser');
			assert.strictEqual(fixture.recordReads, 2);
		} finally { fixture.dispose(); }
	});
	test('AtCoder reopen rejects a different default session without taking over a user original-scope tab', async () => {
		const fixture = atCoderFixture();
		try {
			await fixture.accept();
			for (const input of fixture.known.values()) { input.dispose(); }
			fixture.setScope(BrowserViewStorageScope.Workspace);
			await assert.rejects(() => fixture.read(), /oj-connect-session-scope-changed/);
			assert.strictEqual(fixture.creations, 1, 'a changed default cannot create a carrier in another account scope');
			assert.strictEqual(fixture.recordReads, 0);
			const carrier = fixture.addCarrier('original-scope', BrowserViewStorageScope.Global);
			await assert.rejects(() => fixture.read(), /oj-connect-session-scope-changed/);
			assert.strictEqual(carrier.model.url, fixture.record.problem.url, 'a user tab cannot be navigated to recover another session scope');
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
			await assert.rejects(async () => fixture.execute('reconcile', 'attempt-55'), /oj-connect-session-scope-changed/);
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
	test('releasing an AtCoder record during a native read cannot refill its finished cache', async () => {
		const fixture = atCoderFixture();
		const started = new DeferredPromise<void>(), result = new DeferredPromise<ReturnType<typeof fixture.snapshot>>();
		try {
			await fixture.accept();
			fixture.setRead(async () => { started.complete(); return result.p; });
			const reading = fixture.read();
			const rejected = assert.rejects(() => reading, /oj-connect-stopped/);
			await started.p;
			await CommandsRegistry.getCommand('_becoder.ojConnect.releaseRecord')!.handler(undefined!, fixture.record);
			await result.complete(fixture.snapshot('AC')); await rejected;
			fixture.setRead(async () => fixture.snapshot('WA'));
			assert.strictEqual((await fixture.read()).rawStatus, 'WA', 'a late response from the released lifetime cannot become the reopened result');
			assert.strictEqual(fixture.recordReads, 2);
		} finally { fixture.dispose(); }
	});
	for (const [site, loginURL] of [
		['luogu', 'https://www.luogu.com.cn/auth/login'],
		['atcoder', 'https://atcoder.jp/login'],
		['nowcoder', 'https://www.nowcoder.com/login?callBack=' + encodeURIComponent('https://ac.nowcoder.com/')],
		['codeforces', 'https://codeforces.com/enter']
	]) {
		for (const count of [1, 2]) {
			test(site + ' login preserves ' + count + ' ordinary same-origin pages and reuses its exact login page', async () => {
				const fixture = atCoderFixture();
				const normalURL = new URL('/ordinary-page', loginURL).href;
				const ordinary = Array.from({ length: count }, (_, index) => fixture.addCarrier('ordinary-' + index, BrowserViewStorageScope.Global, normalURL));
				const login = CommandsRegistry.getCommand('_becoder.ojConnect.' + site + '.login')!;
				try {
					await login.handler(undefined!);
					assert.strictEqual(fixture.creations, 1, 'a normal site page is not a login destination');
					assert.strictEqual(fixture.editors.editors[0].url, loginURL);
					assert.ok(ordinary.every(input => input.url === normalURL && !input.isDisposed()), 'ordinary pages and their drafts remain intact');
					await login.handler(undefined!);
					assert.strictEqual(fixture.creations, 1, 'repeat clicks reuse the exact login destination');
					assert.strictEqual(fixture.editors.editors[0], fixture.editors.editors[1]);
				} finally { fixture.dispose(); }
			});
		}
	}
	for (const site of ['luogu', 'atcoder', 'nowcoder', 'codeforces']) {
		test(site + ' login does not reuse an identical page from another storage scope', async () => {
			const loginURL = site === 'luogu' ? 'https://www.luogu.com.cn/auth/login' : site === 'atcoder' ? 'https://atcoder.jp/login' : site === 'codeforces' ? 'https://codeforces.com/enter' : 'https://www.nowcoder.com/login?callBack=' + encodeURIComponent('https://ac.nowcoder.com/');
			const known = new Map(), opened: BrowserViewStorageScope[] = [];
			const create = (id: string, storageScope: BrowserViewStorageScope) => {
				const model = { id, url: loginURL, loading: false, storageScope, onDidNavigate: Event.None, onDidClose: Event.None };
				return { url: loginURL, model, isDisposed: () => false, resolve: async () => model, dispose() { } };
			};
			known.set('old-global', create('old-global', BrowserViewStorageScope.Global));
			const editors = { editors: [], openEditor: async (input: ReturnType<typeof create>) => { opened.push(input.model.storageScope); } };
			const browsers = { resolveStorageScope: async () => BrowserViewStorageScope.Workspace, getKnownBrowserViews: () => known, getOrCreateLazy: (id: string) => { const input = create(id, BrowserViewStorageScope.Workspace); known.set(id, input); return input; } };
			const main = { getChannel: () => ({ listen: () => Event.None, call: async () => undefined }) };
			const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
			const contribution = new BrowserOjConnectContribution(editors as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], { executeCommand: async () => undefined } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
			try {
				await CommandsRegistry.getCommand('_becoder.ojConnect.' + site + '.login')!.handler(undefined!);
				assert.deepStrictEqual(opened, [BrowserViewStorageScope.Workspace]);
				assert.strictEqual(known.size, 2);
			} finally { contribution.dispose(); }
		});
	}

	test('native account commands open fixed login pages without exposing programmatic logout', async () => {
		const known = new Map();
		const opened: string[] = [];
		const editors = { editors: [], openEditor: async (input: { url: string }) => { opened.push(input.url); } };
		const browsers = {
			resolveStorageScope: async () => BrowserViewStorageScope.Global, getKnownBrowserViews: () => known, getOrCreateLazy: (id: string, options: { url: string }) => {
				let disposed = false;
				const model = { id, url: options.url, loading: false, storageScope: BrowserViewStorageScope.Global, onDidNavigate: Event.None, onDidClose: Event.None };
				const input = { get url() { return model.url; }, model: undefined as typeof model | undefined, isDisposed: () => disposed, resolve: async () => { input.model = model; return model; }, dispose: () => { disposed = true; } };
				known.set(id, input); return input;
			}
		};
		const main = {
			getChannel: () => ({
				listen: () => Event.None, call: async (name: string) => {
					if (name === 'openLuoguSession') { return 'global'; }
					return undefined;
				}
			})
		};
		const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
		const commands = { executeCommand: async () => undefined };
		const contribution = new BrowserOjConnectContribution(editors as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], commands as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
		try {
			await CommandsRegistry.getCommand('_becoder.ojConnect.luogu.login')!.handler(undefined!);
			await CommandsRegistry.getCommand('_becoder.ojConnect.atcoder.login')!.handler(undefined!);
			assert.deepStrictEqual(opened, ['https://www.luogu.com.cn/auth/login', 'https://atcoder.jp/login']);
			known.set('blank-user-tab', { model: { url: '', loading: false, storageScope: BrowserViewStorageScope.Global }, isDisposed: () => false });
			for (const site of ['luogu', 'atcoder', 'nowcoder']) { assert.strictEqual(CommandsRegistry.getCommand('_becoder.ojConnect.' + site + '.logout'), undefined); }
			assert.strictEqual(opened.length, 2, 'no account action opens an unrelated webpage');
		} finally { contribution.dispose(); }
		assert.ok([...known.entries()].filter(([id]) => id !== 'blank-user-tab').every(([, input]) => input.isDisposed()), 'all hidden account carriers are released');
		assert.strictEqual(known.get('blank-user-tab').isDisposed(), false, 'ordinary blank tabs remain untouched');
	});
	test('native account commands reveal loading login pages without waiting for website resources', async () => {
		for (const site of ['luogu', 'atcoder']) {
			const fixture = atCoderFixture(true);
			let revealed = false;
			fixture.setReveal(async () => { revealed = true; });
			const opening = CommandsRegistry.getCommand('_becoder.ojConnect.' + site + '.login')!.handler(undefined!);
			try {
				await new Promise(resolve => setTimeout(resolve, 0));
				assert.strictEqual(revealed, true, 'the browser should show its loading page before all resources finish');
				assert.strictEqual([...fixture.known.values()][0].model.loading, true);
				await opening;
			} finally {
				for (const input of fixture.known.values()) { input.model.loading = false; }
				await opening;
				fixture.dispose();
			}
		}
	});
	test('native account commands keep temporary sessions hidden and release failed login creation', async () => {
		const fixture = atCoderFixture();
		fixture.setScope(BrowserViewStorageScope.Ephemeral);
		fixture.setReveal(async () => { assert.fail('temporary sessions must never become the shared login'); });
		try {
			await assert.rejects(async () => await fixture.execute('login'), /persistent browser session/);
			assert.ok([...fixture.known.values()].every(input => input.isDisposed()));
		} finally { fixture.dispose(); }
	});
	for (const site of ['luogu', 'atcoder', 'nowcoder']) {
		test(site + ' login reuses its pending lazy input before its model resolves', async () => {
			const resolving = new DeferredPromise<void>(), known = new Map(), opened: string[] = [];
			let creations = 0;
			const browsers = {
				resolveStorageScope: async () => BrowserViewStorageScope.Workspace, getKnownBrowserViews: () => known,
				getOrCreateLazy: (id: string, options: { url: string }) => {
					creations++;
					const model = { id, url: options.url, loading: true, storageScope: BrowserViewStorageScope.Workspace, onDidNavigate: Event.None, onDidClose: Event.None };
					let disposed = false;
					const input = { url: options.url, model: undefined as typeof model | undefined, isDisposed: () => disposed, resolve: async () => { await resolving.p; input.model = model; return model; }, dispose: () => { disposed = true; } };
					known.set(id, input); return input;
				}
			};
			const editors = { editors: [], openEditor: async (input: { model: { id: string } }) => { opened.push(input.model.id); } };
			const main = { getChannel: () => ({ listen: () => Event.None, call: async () => undefined }) };
			const extensions = { getExtensionsStatus: () => ({ 'becoder.oj-connect': { activationStarted: true } }), onWillStop: Event.None, onDidChangeExtensions: Event.None, onDidChangeExtensionsStatus: Event.None };
			const contribution = new BrowserOjConnectContribution(editors as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[0], browsers as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[1], { executeCommand: async () => undefined } as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[2], main as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[3], extensions as unknown as ConstructorParameters<typeof BrowserOjConnectContribution>[4]);
			const login = CommandsRegistry.getCommand('_becoder.ojConnect.' + site + '.login')!;
			const first = login.handler(undefined!), second = login.handler(undefined!);
			try {
				await new Promise(resolve => setTimeout(resolve, 0));
				assert.ok([...known.values()].every(input => !input.model), 'the model stays unresolved during the repeated click');
				assert.strictEqual(creations, 1);
				await resolving.complete();
				await Promise.all([first, second]);
				assert.strictEqual(opened.length, 2);
				assert.strictEqual(opened[0], opened[1], 'both clicks reveal the same login input');
			} finally { await resolving.complete(); await Promise.allSettled([first, second]); contribution.dispose(); }
		});
		test(site + ' login coalesces repeated clicks while session observation is pending', async () => {
			const fixture = atCoderFixture(true), observed = new DeferredPromise<void>();
			fixture.setWatch(() => observed.p);
			const login = CommandsRegistry.getCommand('_becoder.ojConnect.' + site + '.login')!;
			const first = login.handler(undefined!), second = login.handler(undefined!);
			try {
				await new Promise(resolve => setTimeout(resolve, 0));
				assert.strictEqual(fixture.creations, 1);
				await observed.complete();
				for (const input of fixture.known.values()) { input.model.loading = false; }
				await Promise.all([first, second]);
				assert.strictEqual(fixture.creations, 1);
			} finally { await observed.complete(); await Promise.allSettled([first, second]); fixture.dispose(); }
		});
	}

	test('native account commands do not reveal a login whose extension stopped during observation', async () => {
		const fixture = atCoderFixture(), observed = new DeferredPromise<void>();
		fixture.setWatch(() => observed.p);
		fixture.setReveal(async () => { assert.fail('stopped login must never reveal a browser'); });
		const opening = fixture.execute('login');
		const rejected = assert.rejects(async () => await opening, /oj-connect-stopped/);
		try {
			await new Promise(resolve => setTimeout(resolve, 0));
			fixture.reset();
			await observed.complete();
			await rejected;
			assert.ok([...fixture.known.values()].every(input => input.isDisposed()));
		} finally { await observed.complete(); fixture.dispose(); }
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
		const main = {
			getChannel: () => ({
				listen: () => Event.None, call: async (name: string, args: unknown[]) => {
					if (name === 'openLuoguSession') { if (scope === BrowserViewStorageScope.Ephemeral) { throw new Error('persistent browser session required'); } return 'global'; }
					if (name === 'watchOjSession') { watches.push(args); }
					if (name === 'readOjLogin') { summaries.push(args); return { site: 'luogu', state: 'signed-in', label: 'Normal account' }; }
					return undefined;
				}
			})
		};
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

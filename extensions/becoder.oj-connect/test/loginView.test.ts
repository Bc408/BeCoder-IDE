/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { openAccount, loginRows, sites } from '../src/views/loginModel';
import type { OjAdapter } from '../src/adapters/adapter';
import { loginContent } from '../src/views/loginContent';

const defaultWorkspace = { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }), onDidChangeConfiguration: () => ({ dispose() { } }) };

test('ACM checkbox follows all accounts, sends a boolean action and updates without replacing focused controls', () => {
	const { JSDOM } = require('jsdom');
	const names = { luogu: 'Luogu', atcoder: 'AtCoder', codeforces: 'Codeforces', nowcoder: 'Nowcoder', lanqiao: 'Lanqiao' };
	const icons = Object.fromEntries(sites.map(site => [site, 'https://local.test/' + site + '.png'])) as typeof names;
	for (const enabled of [false, true]) {
		const messages: unknown[] = [];
		const dom = new JSDOM(loginContent(sites.map(site => ({ site, state: 'signed-out' })), names, { 'signed-in': 'Signed in', 'signed-out': 'Signed out', unknown: 'Unknown', unavailable: 'Unavailable' }, icons, 'https://local.test', 'test-nonce', { enabled, label: 'ACM <Mode>' }), { runScripts: 'dangerously', beforeParse(window: any) { window.acquireVsCodeApi = () => ({ postMessage: (value: unknown) => messages.push(value) }); } });
		try {
			const document = dom.window.document;
			const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
			assert.ok(checkbox, 'the sidebar exposes the native ACM checkbox');
			assert.strictEqual(checkbox.checked, enabled);
			assert.strictEqual(checkbox.closest('label')?.textContent, 'ACM <Mode>', 'the accessible label is escaped');
			const gap = document.querySelector('[data-site="lanqiao"]')!.nextElementSibling as HTMLElement;
			assert.strictEqual(gap.getAttribute('aria-hidden'), 'true');
			assert.strictEqual(gap.nextElementSibling, checkbox.closest('label'), 'a blank account row separates Lanqiao from the mode');
			assert.strictEqual(dom.window.getComputedStyle(gap).height, '30px');
			messages.length = 0;
			checkbox.focus(); checkbox.click();
			assert.strictEqual(JSON.stringify(messages), JSON.stringify([{ action: 'setAcmMode', enabled: !enabled }]));
			dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { acmMode: enabled } }));
			assert.strictEqual(checkbox.checked, enabled, 'host state restores or synchronizes the native checkbox');
			assert.strictEqual(document.activeElement, checkbox);
			assert.strictEqual(messages.length, 1, 'host updates do not emit another setting write');
			const account = document.querySelector('[data-site="atcoder"] button') as HTMLButtonElement;
			account.focus();
			dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { acmMode: !enabled, rows: [{ site: 'atcoder', state: 'signed-in', text: 'Signed in · user' }] } }));
			assert.strictEqual(document.activeElement, account);
			account.click();
			assert.strictEqual(JSON.stringify(messages.at(-1)), '{"site":"atcoder"}');
		} finally { dom.window.close(); }
	}
});

async function withAcmSettings(initial: unknown, run: (fixture: {
	resolve: (newWindow?: boolean) => { document: Document; send: (message: unknown) => void; posts: any[]; dispose: () => void };
	change: (value: unknown, key?: string) => void;
	writes: { section: string; key: string; value: unknown; target: unknown }[];
	errors: string[];
	commands: string[];
	fail: (error: Error) => void;
}) => Promise<void>): Promise<void> {
	const Module = require('module'), original = Module._load, { JSDOM } = require('jsdom');
	const listeners = new Set<(event: { affectsConfiguration: (key: string) => boolean }) => void>();
	const writes: { section: string; key: string; value: unknown; target: unknown }[] = [], errors: string[] = [], commands: string[] = [], doms: any[] = [];
	let value = initial, failure: Error | undefined;
	const change = (next: unknown, key = 'becoder.ojConnect.acmMode') => { value = next; for (const listener of listeners) { listener({ affectsConfiguration: candidate => candidate === key }); } };
	const mock = {
		l10n: { t: (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_match: string, index: string) => String(args[Number(index)])) },
		Uri: { joinPath: () => ({ toString: () => 'https://local.test/icon.png' }) },
		ConfigurationTarget: { Global: 1 },
		workspace: {
			getConfiguration: (section: string) => ({ get: (key: string, fallback: unknown) => section === 'becoder.ojConnect' && key === 'acmMode' ? value ?? fallback : fallback, update: async (key: string, next: unknown, target: unknown) => { writes.push({ section, key, value: next, target }); if (failure) { throw failure; } change(next); } }),
			onDidChangeConfiguration: (listener: (event: { affectsConfiguration: (key: string) => boolean }) => void) => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; }
		},
		window: { showErrorMessage: async (text: string) => { errors.push(text); } }
	};
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? mock : original.call(this, id, ...args); };
	delete require.cache[require.resolve('../src/views/loginView')];
	let login: import('../src/views/loginView').LoginView | undefined;
	const peers: import('../src/views/loginView').LoginView[] = [];
	try {
		const { LoginView } = require('../src/views/loginView');
		login = new LoginView({ extensionUri: {} }, [], async (command: string) => { commands.push(command); }, async () => undefined);
		await run({
			resolve: (newWindow = false) => {
				const owner = newWindow ? new LoginView({ extensionUri: {} }, [], async () => undefined, async () => undefined) : login!;
				if (newWindow) { peers.push(owner); }
				let receive!: (message: unknown) => void, dispose!: () => void;
				let dom: any = null;
				const posts: any[] = [], disposable = () => ({ dispose() { } });
				const view = { visible: true, webview: { options: {}, html: '', cspSource: 'https://local.test', asWebviewUri: (uri: unknown) => uri, postMessage: async (message: unknown) => { posts.push(message); dom?.window.dispatchEvent(new dom.window.MessageEvent('message', { data: message })); return true; }, onDidReceiveMessage: (listener: typeof receive) => { receive = listener; return disposable(); } }, onDidChangeVisibility: disposable, onDidDispose: (listener: () => void) => { dispose = listener; return disposable(); } };
				owner.resolveWebviewView(view as unknown as import('vscode').WebviewView);
				dom = new JSDOM(view.webview.html, { runScripts: 'dangerously', beforeParse(window: any) { window.acquireVsCodeApi = () => ({ postMessage: receive }); } });
				doms.push(dom);
				return { document: dom.window.document, send: receive, posts, dispose };
			}, change, writes, errors, commands, fail: error => { failure = error; }
		});
	} finally { login?.dispose(); for (const peer of peers) { peer.dispose(); } for (const dom of doms) { dom.window.close(); } Module._load = original; delete require.cache[require.resolve('../src/views/loginView')]; }
}

test('ACM selection saves globally, synchronizes live settings and reconstructs from the current preference', async () => {
	await withAcmSettings(undefined, async fixture => {
		const first = fixture.resolve(), checkbox = first.document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
		assert.ok(checkbox, 'ACM defaults to a visible unchecked native control');
		assert.strictEqual(checkbox.checked, false);
		const otherWindow = fixture.resolve(true), otherCheckbox = otherWindow.document.querySelector('input[type="checkbox"]') as HTMLInputElement;
		checkbox.focus(); checkbox.click();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual(fixture.writes, [{ section: 'becoder.ojConnect', key: 'acmMode', value: true, target: 1 }]);
		assert.strictEqual(checkbox.checked, true);
		assert.strictEqual(otherCheckbox.checked, true, 'the setting event synchronizes a separate window controller');
		assert.strictEqual(first.document.activeElement, checkbox);
		assert.strictEqual(first.posts.at(-1).acmMode, true);
		const count = first.posts.length;
		fixture.change(true, 'editor.fontSize');
		assert.strictEqual(first.posts.length, count, 'unrelated configuration does not refresh the accounts');
		fixture.change(false);
		assert.strictEqual(checkbox.checked, false, 'an external settings or other-window event updates the open sidebar');
		assert.strictEqual(otherCheckbox.checked, false);
		fixture.change(true);
		first.dispose();
		const recreated = fixture.resolve();
		assert.strictEqual((recreated.document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked, true);
		recreated.send({ ready: true });
		assert.strictEqual(recreated.posts.at(-1).acmMode, true);
		const disposedPosts = first.posts.length;
		fixture.change(false);
		assert.strictEqual((recreated.document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked, false);
		assert.strictEqual(first.posts.length, disposedPosts, 'the old view no longer receives configuration changes');
		assert.deepStrictEqual(fixture.errors, []);
	});
});

test('failed ACM persistence restores the actual setting and reports the existing user-facing error', async () => {
	await withAcmSettings(true, async fixture => {
		const view = fixture.resolve(), checkbox = view.document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
		assert.ok(checkbox);
		assert.strictEqual(checkbox.checked, true);
		fixture.fail(new Error('atcoder-login-required'));
		checkbox.focus(); checkbox.click();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(checkbox.checked, true, 'the UI cannot claim an unsaved preference');
		assert.strictEqual(view.document.activeElement, checkbox);
		assert.deepStrictEqual(fixture.errors, ['OJ Connect: Sign in to AtCoder from the OJ Connect sidebar.']);
	});
});

test('ACM host messages accept only the exact action and boolean payload', async () => {
	await withAcmSettings(false, async fixture => {
		const view = fixture.resolve();
		for (const message of [null, [], { action: 'setAcmMode' }, { enabled: true }, { action: 'setAcmMode', enabled: 'true' }, { action: 'setAcmMode', enabled: 1 }, { action: 'other', enabled: true }, { action: 'setAcmMode', enabled: true, site: 'luogu' }, { action: 'setAcmMode', enabled: true, ready: true }, { action: 'setAcmMode', enabled: true, extra: false }]) { view.send(message); }
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual(fixture.writes, []);
		assert.deepStrictEqual(fixture.commands, []);
		view.send({ action: 'setAcmMode', enabled: true });
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual(fixture.writes, [{ section: 'becoder.ojConnect', key: 'acmMode', value: true, target: 1 }]);
	});
});

test('account HTML has isolated name buttons, inert states, local icons and live updates', () => {
	const { JSDOM } = require('jsdom');
	const rows = sites.map(site => ({ site, state: site === 'luogu' ? 'signed-in' as const : site === 'codeforces' ? 'unavailable' as const : 'signed-out' as const, label: site === 'luogu' ? '<script>unsafe</script>' : undefined }));
	const names = { luogu: 'Luogu', atcoder: 'AtCoder', codeforces: 'Codeforces', nowcoder: 'Nowcoder', lanqiao: 'Lanqiao' };
	const icons = Object.fromEntries(sites.map(site => [site, 'https://local.test/' + site + '.png'])) as typeof names;
	const html = loginContent(rows, names, { 'signed-in': 'Signed in', 'signed-out': 'Signed out', unknown: 'Unknown', unavailable: 'Unavailable' }, icons, 'https://local.test', 'test-nonce');
	const messages: unknown[] = [];
	const dom = new JSDOM(html, { runScripts: 'dangerously', beforeParse(window: any) { window.acquireVsCodeApi = () => ({ postMessage: (value: unknown) => messages.push(value) }); } });
	try {
		const document = dom.window.document;
		assert.strictEqual(document.querySelectorAll('button').length, 5);
		assert.strictEqual(document.querySelectorAll('script').length, 1, 'account labels cannot inject markup');
		assert.strictEqual(JSON.stringify(messages.shift()), '{"ready":true}', 'each recreated webview requests the current summary');
		for (const element of document.querySelectorAll('.status, img, .account')) { (element as HTMLElement).click(); }
		assert.deepStrictEqual(messages, [], 'only a site name can navigate');
		(document.querySelector('[data-site="codeforces"] button') as HTMLButtonElement).click();
		assert.deepStrictEqual(messages, [], 'unconnected sites stay inert');
		const button = document.querySelector('[data-site="atcoder"] button') as HTMLButtonElement;
		button.focus(); button.click();
		assert.strictEqual(JSON.stringify(messages), '[{"site":"atcoder"}]');
		dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { rows: [{ site: 'atcoder', state: 'signed-in', text: 'Signed in · user' }] } }));
		assert.strictEqual(document.querySelector('[data-site="atcoder"]')?.getAttribute('data-state'), 'signed-in');
		assert.strictEqual(document.querySelector('[data-site="atcoder"] .status')?.textContent, 'Signed in · user');
		assert.strictEqual(document.activeElement, button, 'summary refresh does not rebuild the focused button');
	} finally { dom.window.close(); }
});
test('login summaries keep failures unknown and unsupported sites unavailable', async () => {
	const rows = await loginRows([{ site: 'luogu', loginSummary: async () => ({ site: 'luogu', state: 'signed-in', label: 'User' }) }, { site: 'atcoder', loginSummary: async () => { throw new Error('offline'); } }] as unknown as OjAdapter[], new AbortController().signal);
	assert.deepStrictEqual(rows.map(row => [row.site, row.state]), [['luogu', 'signed-in'], ['atcoder', 'unknown'], ['codeforces', 'unavailable'], ['nowcoder', 'unavailable'], ['lanqiao', 'unavailable']]);
});

test('account actions route supported states to their fixed native site commands before refreshing', async () => {
	for (const [site, state, command] of [
		['luogu', 'signed-out', '_becoder.ojConnect.luogu.login'],
		['luogu', 'unknown', '_becoder.ojConnect.luogu.login'],
		['luogu', 'signed-in', 'https://www.luogu.com.cn/user/123'],
		['atcoder', 'signed-out', '_becoder.ojConnect.atcoder.login'],
		['atcoder', 'unknown', '_becoder.ojConnect.atcoder.login'],
		['atcoder', 'signed-in', 'https://atcoder.jp/users/test_user'],
		['nowcoder', 'signed-out', '_becoder.ojConnect.nowcoder.login'],
		['nowcoder', 'unknown', '_becoder.ojConnect.nowcoder.login'],
		['nowcoder', 'signed-in', 'https://ac.nowcoder.com/acm/contest/profile/123'],
		['lanqiao', 'signed-out', '_becoder.ojConnect.lanqiao.login'],
		['lanqiao', 'unknown', '_becoder.ojConnect.lanqiao.login'],
		['lanqiao', 'signed-in', '_becoder.ojConnect.lanqiao.login']
	] as const) {
		const events: string[] = [];
		assert.strictEqual(await openAccount({ site, state, profileUrl: command.startsWith('https:') ? command : undefined }, async command => { events.push(command); }, async () => { events.push('refresh'); }, async url => { events.push(url); }), true);
		assert.deepStrictEqual(events, [command, 'refresh']);
	}
});

test('unavailable rows have no account action', async () => {
	for (const site of ['luogu', 'atcoder', 'codeforces', 'nowcoder', 'lanqiao'] as const) {
		for (const state of ['unavailable'] as const) {
			const events: string[] = [];
			assert.strictEqual(await openAccount({ site, state }, async command => { events.push(command); }, async () => { events.push('refresh'); }, async url => { events.push(url); }), false);
			assert.deepStrictEqual(events, []);
		}
	}
});

test('missing or unsafe profile uses the official login route and preserves its redirect behavior', async () => {
	for (const profileUrl of [undefined, 'https://evil.example/user/123', 'https://www.luogu.com.cn/user/name', 'https://www.luogu.com.cn/user/123?redirect=evil']) {
		const events: string[] = [];
		await openAccount({ site: 'luogu', state: 'signed-in', profileUrl }, async command => { events.push(command); }, async () => { events.push('refresh'); }, async url => { events.push(url); });
		assert.deepStrictEqual(events, ['_becoder.ojConnect.luogu.login', 'refresh']);
	}
});

test('failed account navigation refreshes the real summary and preserves the native failure', async () => {
	const failure = new Error('website unavailable'), events: string[] = [];
	await assert.rejects(openAccount({ site: 'luogu', state: 'signed-out' }, async () => { events.push('login'); throw failure; }, async () => { events.push('refresh'); }, async () => undefined), error => error === failure);
	assert.deepStrictEqual(events, ['login', 'refresh']);
});

test('a late account check cannot replace newer state or post after view disposal', async () => {
	const Module = require('module'), original = Module._load;
	const disposable = () => ({ dispose() { } });
	const mock = { l10n: { t: (text: string) => text }, Uri: { joinPath: () => ({ toString: () => 'https://local.test/icon.png' }) }, workspace: defaultWorkspace };
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? mock : original.call(this, id, ...args); };
	let login: import('../src/views/loginView').LoginView | undefined;
	try {
		const { LoginView } = require('../src/views/loginView');
		const reads: ((value: unknown) => void)[] = [], posts: any[] = [];
		const adapters = [{ site: 'luogu', loginSummary: () => new Promise(resolve => reads.push(resolve)) }] as unknown as OjAdapter[];
		let message!: (value: unknown) => void;
		const view = { visible: true, webview: { options: {}, html: '', cspSource: 'https://local.test', asWebviewUri: (uri: unknown) => uri, postMessage: async (value: unknown) => { posts.push(value); return true; }, onDidReceiveMessage: (listener: typeof message) => { message = listener; return disposable(); } }, onDidChangeVisibility: disposable, onDidDispose: disposable };
		login = new LoginView({ extensionUri: {} }, adapters, async () => undefined, async () => undefined);
		login!.resolveWebviewView(view as unknown as import('vscode').WebviewView);
		const current = login!.refresh();
		reads[1]({ site: 'luogu', state: 'signed-in', label: 'new-user' }); await current;
		message({ ready: true });
		assert.strictEqual(posts.at(-1).rows[0].state, 'signed-in', 'a recreated DOM receives the latest summary');
		const count = posts.length;
		login!.dispose();
		reads[0]({ site: 'luogu', state: 'signed-out' }); await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(posts.length, count, 'obsolete completion cannot overwrite or contact a disposed view');
	} finally { login?.dispose(); Module._load = original; }
});

test('changing account scope clears the old identity immediately and rejects the obsolete read', async () => {
	const Module = require('module'), original = Module._load;
	const disposable = () => ({ dispose() { } });
	const mock = { l10n: { t: (text: string) => text }, Uri: { joinPath: () => ({ toString: () => 'https://local.test/icon.png' }) }, workspace: defaultWorkspace };
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? mock : original.call(this, id, ...args); };
	let login: import('../src/views/loginView').LoginView | undefined;
	try {
		const { LoginView } = require('../src/views/loginView');
		const reads: { finish: (value: unknown) => void; signal: AbortSignal }[] = [], posts: any[] = [], commands: string[] = [];
		const adapters = [{ site: 'luogu', loginSummary: (signal: AbortSignal) => new Promise(resolve => reads.push({ finish: resolve, signal })) }] as unknown as OjAdapter[];
		let message!: (value: unknown) => void;
		const view = { visible: true, webview: { options: {}, html: '', cspSource: 'https://local.test', asWebviewUri: (uri: unknown) => uri, postMessage: async (value: unknown) => { posts.push(value); return true; }, onDidReceiveMessage: (listener: typeof message) => { message = listener; return disposable(); } }, onDidChangeVisibility: disposable, onDidDispose: disposable };
		login = new LoginView({ extensionUri: {} }, adapters, async (command: string) => { commands.push(command); }, async (url: string) => { commands.push(url); });
		login!.resolveWebviewView(view as unknown as import('vscode').WebviewView);
		reads[0].finish({ site: 'luogu', state: 'signed-in', label: 'old-user', profileUrl: 'https://www.luogu.com.cn/user/123' });
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.match(posts.at(-1).rows[0].text, /old-user/);
		const obsolete = login!.refresh();
		const current = login!.refresh(true);
		assert.strictEqual(reads[1].signal.aborted, true);
		assert.strictEqual(posts.at(-1).rows[0].state, 'unknown');
		assert.doesNotMatch(posts.at(-1).rows[0].text, /old-user/);
		assert.strictEqual(posts.at(-1).rows.find((row: any) => row.site === 'lanqiao').state, 'unavailable');
		reads[1].finish({ site: 'luogu', state: 'signed-in', label: 'obsolete-user' }); await obsolete;
		assert.strictEqual(posts.at(-1).rows[0].state, 'unknown', 'old scope cannot restore its identity');
		reads[2].finish({ site: 'luogu', state: 'signed-out' }); await current;
		message({ site: 'luogu' });
		assert.deepStrictEqual(commands, ['_becoder.ojConnect.luogu.login'], 'cleared profile cannot open the old account');
	} finally { login?.dispose(); Module._load = original; }
});

test('registered accounts are clickable before their first login check completes', () => {
	const Module = require('module'), original = Module._load;
	const disposable = () => ({ dispose() { } });
	const mock = { l10n: { t: (text: string) => text }, Uri: { joinPath: () => ({ toString: () => 'https://local.test/icon.png' }) }, workspace: defaultWorkspace };
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? mock : original.call(this, id, ...args); };
	let login: import('../src/views/loginView').LoginView | undefined;
	try {
		const { LoginView } = require('../src/views/loginView'), { JSDOM } = require('jsdom');
		const adapters = ['luogu', 'atcoder', 'nowcoder', 'codeforces'].map(site => ({ site, loginSummary: async () => ({ site, state: 'unknown' }) })) as unknown as OjAdapter[];
		const view = { webview: { options: {}, html: '', cspSource: 'https://local.test', asWebviewUri: (uri: unknown) => uri, postMessage: async () => true, onDidReceiveMessage: disposable }, onDidChangeVisibility: disposable, onDidDispose: disposable };
		login = new LoginView({ extensionUri: {} }, adapters, async () => undefined, async () => undefined);
		login!.resolveWebviewView(view as unknown as import('vscode').WebviewView);
		const dom = new JSDOM(view.webview.html);
		try {
			for (const site of ['luogu', 'atcoder', 'nowcoder', 'codeforces']) {
				const row = dom.window.document.querySelector(`[data-site="${site}"]`)!;
				assert.strictEqual(row.dataset.state, 'unknown');
				assert.strictEqual(row.querySelector('button')!.disabled, false);
			}
			assert.strictEqual(dom.window.document.querySelector('[data-site="lanqiao"] button')!.disabled, true);
		} finally { dom.window.close(); }
	} finally { login?.dispose(); Module._load = original; }
});

test('only a current transition to signed-in refreshes the matching compiler panels', async () => {
	const Module = require('module'), original = Module._load;
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? { l10n: { t: (value: string) => value } } : original.call(this, id, ...args); };
	let login: import('../src/views/loginView').LoginView | undefined;
	try {
		const { LoginView } = require('../src/views/loginView');
		const sites: string[] = [];
		let state = 'signed-out';
		const adapters = [{ site: 'atcoder', loginSummary: async () => ({ site: 'atcoder', state }) }] as unknown as OjAdapter[];
		login = new LoginView({}, adapters, async () => undefined, async () => undefined, (site: string) => { sites.push(site); });
		await login!.refresh(); assert.deepStrictEqual(sites, []);
		state = 'signed-in'; await login!.refresh(); assert.deepStrictEqual(sites, ['atcoder']);
		await login!.refresh(); assert.deepStrictEqual(sites, ['atcoder'], 'unchanged account refreshes do not restart catalogue requests');
		state = 'signed-out'; await login!.refresh();
		state = 'signed-in'; await login!.refresh(); assert.deepStrictEqual(sites, ['atcoder', 'atcoder']);
	} finally { login?.dispose(); Module._load = original; }
});

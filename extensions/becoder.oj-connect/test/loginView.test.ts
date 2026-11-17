/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { openAccount, loginRows, sites } from '../src/views/loginModel';
import type { OjAdapter } from '../src/adapters/adapter';
import { loginContent } from '../src/views/loginContent';

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
		['nowcoder', 'signed-in', 'https://ac.nowcoder.com/acm/contest/profile/123']
	] as const) {
		const events: string[] = [];
		assert.strictEqual(await openAccount({ site, state, profileUrl: command.startsWith('https:') ? command : undefined }, async command => { events.push(command); }, async () => { events.push('refresh'); }, async url => { events.push(url); }), true);
		assert.deepStrictEqual(events, [command, 'refresh']);
	}
});

test('unsupported sites and unavailable rows have no account action', async () => {
	for (const site of ['luogu', 'atcoder', 'codeforces', 'nowcoder', 'lanqiao'] as const) {
		for (const state of ['signed-in', 'signed-out', 'unknown', 'unavailable'] as const) {
			if ((site === 'luogu' || site === 'atcoder' || site === 'nowcoder') && state !== 'unavailable') { continue; }
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
	const mock = { l10n: { t: (text: string) => text }, Uri: { joinPath: () => ({ toString: () => 'https://local.test/icon.png' }) } };
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

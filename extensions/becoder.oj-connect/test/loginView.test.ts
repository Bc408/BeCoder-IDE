/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { changeAccount, loginRows } from '../src/views/loginModel';
import type { OjAdapter } from '../src/adapters/adapter';
test('login summaries keep failures unknown and unsupported sites unavailable', async () => {
	const rows = await loginRows([{ site: 'luogu', loginSummary: async () => ({ site: 'luogu', state: 'signed-in', label: 'User' }) }, { site: 'atcoder', loginSummary: async () => { throw new Error('offline'); } }] as unknown as OjAdapter[], new AbortController().signal);
	assert.deepStrictEqual(rows.map(row => [row.site, row.state]), [['luogu', 'signed-in'], ['atcoder', 'unknown'], ['codeforces', 'unavailable'], ['nowcoder', 'unavailable'], ['lanqiao', 'unavailable']]);
});

test('account actions route supported states to their fixed native site commands before refreshing', async () => {
	for (const [site, state, action, command] of [
		['luogu', 'signed-out', 'login', '_becoder.ojConnect.luogu.login'],
		['luogu', 'unknown', 'login', '_becoder.ojConnect.luogu.login'],
		['luogu', 'signed-in', 'logout', '_becoder.ojConnect.luogu.logout'],
		['atcoder', 'signed-out', 'login', '_becoder.ojConnect.atcoder.login'],
		['atcoder', 'unknown', 'login', '_becoder.ojConnect.atcoder.login'],
		['atcoder', 'signed-in', 'logout', '_becoder.ojConnect.atcoder.logout']
	] as const) {
		const events: string[] = [];
		assert.strictEqual(await changeAccount({ site, state }, action, async command => { events.push(command); }, async () => { events.push('refresh'); }), true);
		assert.deepStrictEqual(events, [command, 'refresh']);
	}
});

test('unsupported sites and incompatible row states never invoke native account operations', async () => {
	for (const site of ['luogu', 'atcoder', 'codeforces', 'nowcoder', 'lanqiao'] as const) {
		for (const state of ['signed-in', 'signed-out', 'unknown', 'unavailable'] as const) {
			for (const action of ['login', 'logout'] as const) {
				if ((site === 'luogu' || site === 'atcoder') && (action === 'logout' ? state === 'signed-in' : state === 'signed-out' || state === 'unknown')) { continue; }
				const events: string[] = [];
				assert.strictEqual(await changeAccount({ site, state }, action, async command => { events.push(command); }, async () => { events.push('refresh'); }), false);
				assert.deepStrictEqual(events, []);
			}
		}
	}
});

test('failed logout refreshes the real summary and preserves the native failure', async () => {
	const failure = new Error('website refused logout'), events: string[] = [];
	await assert.rejects(changeAccount({ site: 'luogu', state: 'signed-in' }, 'logout', async () => { events.push('logout'); throw failure; }, async () => { events.push('refresh'); }), error => error === failure);
	assert.deepStrictEqual(events, ['logout', 'refresh']);
});

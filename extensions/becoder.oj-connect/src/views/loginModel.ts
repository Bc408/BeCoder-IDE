/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import type { OjAdapter } from '../adapters/adapter';
import type { LoginSummary, SiteId } from '../domain';
export const sites: readonly SiteId[] = ['luogu', 'atcoder', 'codeforces', 'nowcoder', 'lanqiao'];
export async function changeAccount(row: LoginSummary, action: 'login' | 'logout', execute: (command: string) => Promise<unknown>, refresh: () => Promise<void>): Promise<boolean> {
	if (row.site !== 'luogu' && row.site !== 'atcoder') { return false; }
	if (action === 'logout' ? row.state !== 'signed-in' : row.state !== 'signed-out' && row.state !== 'unknown') { return false; }
	try { await execute('_becoder.ojConnect.' + row.site + '.' + action); }
	finally { await refresh(); }
	return true;
}
export async function loginRows(adapters: readonly OjAdapter[], signal: AbortSignal): Promise<LoginSummary[]> {
	return Promise.all(sites.map(async site => {
		const adapter = adapters.find(item => item.site === site);
		if (!adapter) { return { site, state: 'unavailable' as const }; }
		try { const value = await adapter.loginSummary(signal); signal.throwIfAborted(); return value.site === site ? value : { site, state: 'unknown' as const }; }
		catch { return { site, state: 'unknown' as const }; }
	}));
}

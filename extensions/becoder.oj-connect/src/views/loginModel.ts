/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { OjAdapter } from '../adapters/adapter';
import type { LoginSummary, SiteId } from '../domain';
export const sites: readonly SiteId[] = ['luogu', 'atcoder', 'codeforces', 'nowcoder', 'lanqiao'];
export async function openAccount(row: LoginSummary, execute: (command: string) => Promise<unknown>, refresh: () => Promise<void>, open: (url: string) => Promise<void>): Promise<boolean> {
	if (row.site !== 'luogu' && row.site !== 'atcoder' && row.site !== 'nowcoder') { return false; }
	if (row.state === 'unavailable') { return false; }
	const profiles = { luogu: /^https:\/\/www\.luogu\.com\.cn\/user\/[1-9]\d*$/, atcoder: /^https:\/\/atcoder\.jp\/users\/[a-zA-Z0-9_]+$/, nowcoder: /^https:\/\/ac\.nowcoder\.com\/acm\/contest\/profile\/[1-9]\d*$/ };
	try {
		if (row.state === 'signed-in' && row.profileUrl && profiles[row.site].test(row.profileUrl)) { await open(row.profileUrl); }
		else { await execute('_becoder.ojConnect.' + row.site + '.login'); }
	}
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

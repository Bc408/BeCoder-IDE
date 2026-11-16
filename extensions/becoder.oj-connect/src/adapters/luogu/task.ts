/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProblemRef } from 'becoder-oj-connect';

const pidPattern = /^(?:P\d{4,5}|B\d{4}|[UT]\d{1,7}|CF\d{1,5}[A-Z]\d?|SP\d{1,7}|UVA\d{1,7}|AT_[a-zA-Z0-9_]+)$/i;

export function luoguProblem(input: string): ProblemRef | undefined {
	let pid = input.replace(/\.(?:cpp|cc|cxx|c)$/i, '');
	let contest: string | undefined;
	const encoded = /^(.+)@([1-9]\d*)$/.exec(pid);
	if (encoded) { pid = encoded[1]; contest = encoded[2]; }
	if (input.startsWith('https:')) {
		try {
			const url = new URL(input);
			if (url.origin !== 'https://www.luogu.com.cn' || url.username || url.password || url.hash) { return undefined; }
			const match = /^\/problem\/([^/]+)\/?$/.exec(url.pathname);
			if (!match || [...url.searchParams.keys()].some(key => key !== 'contestId')) { return undefined; }
			pid = match[1]; contest = url.searchParams.get('contestId') ?? undefined;
			if (contest !== undefined && !/^[1-9]\d*$/.test(contest)) { return undefined; }
		} catch { return undefined; }
	}
	if (!pidPattern.test(pid)) { return undefined; }
	pid = /^AT_/i.test(pid) ? 'AT_' + pid.slice(3) : pid.toUpperCase();
	return { site: 'luogu', nativeId: pid + (contest ? '@' + contest : ''), url: 'https://www.luogu.com.cn/problem/' + pid + (contest ? '?contestId=' + contest : '') };
}

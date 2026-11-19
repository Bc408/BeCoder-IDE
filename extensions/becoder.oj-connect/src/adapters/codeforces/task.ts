/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProblemRef } from 'becoder-oj-connect';

/** Native ordinary-practice identity only; eligibility is checked by the session owner. */
export function codeforcesProblem(input: string): ProblemRef | undefined {
	let value = input.replace(/\.(?:cpp|cc|cxx|c)$/i, '');
	if (input.startsWith('https:')) {
		try {
			const url = new URL(input);
			if (url.origin !== 'https://codeforces.com' || url.username || url.password || url.hash || [...url.searchParams.keys()].some(key => key !== 'locale')) { return undefined; }
			const match = /^\/(?:contest\/([1-9]\d*)\/problem\/([A-Z][A-Z0-9]*)|problemset\/problem\/([1-9]\d*)\/([A-Z][A-Z0-9]*))\/?$/i.exec(url.pathname);
			if (!match) { return undefined; }
			value = (match[1] ?? match[3]) + '/' + (match[2] ?? match[4]);
		} catch { return undefined; }
	}
	const match = /^([1-9]\d*)[_/]([A-Z][A-Z0-9]*)$/i.exec(value);
	if (!match) { return undefined; }
	const index = match[2].toUpperCase();
	return { site: 'codeforces', nativeId: match[1] + '/' + index, url: 'https://codeforces.com/contest/' + match[1] + '/problem/' + index };
}

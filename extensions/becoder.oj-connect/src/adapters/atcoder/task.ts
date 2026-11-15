/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See ThirdPartyNotices.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProblemRef } from 'becoder-oj-connect';

export function atCoderProblem(input: string): ProblemRef | undefined {
	const encoded = /^([a-zA-Z0-9_-]+)@([a-zA-Z0-9_-]+)\.(?:c|cpp|cc|cxx)$/i.exec(input);
	const value = officialTaskURL(input) ?? (encoded ? `https://atcoder.jp/contests/${encoded[1]}/tasks/${encoded[2]}` : taskFromFileName(input));
	if (!value) { return undefined; }
	const url = new URL(value);
	url.search = ''; url.hash = '';
	const match = /^\/contests\/([^/]+)\/tasks\/([^/]+)\/?$/.exec(url.pathname)!;
	return { site: 'atcoder', nativeId: match[1] + '/' + match[2], url: 'https://atcoder.jp/contests/' + match[1] + '/tasks/' + match[2] };
}

/** User input is accepted only as an official native task route. */
export function officialTaskURL(value: string): string | undefined {
	try {
		const url = new URL(value);
		if (url.origin === 'https://atcoder.jp' && !url.username && !url.password && /^\/contests\/[a-zA-Z0-9_-]+\/tasks\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) { return url.href; }
	} catch { /* Not a URL. */ }
	return undefined;
}

export function taskFromFileName(name: string): string | undefined {
	const match = /^(?:AT_)?(abc|arc|agc|ahc)[-_]?(\d{1,4})_([a-z0-9]+)\.(cpp|cc|cxx|c)$/i.exec(name);
	if (!match) { return undefined; }
	const contest = match[1].toLowerCase() + match[2].padStart(3, '0');
	return `https://atcoder.jp/contests/${contest}/tasks/${contest}_${match[3].toLowerCase()}`;
}

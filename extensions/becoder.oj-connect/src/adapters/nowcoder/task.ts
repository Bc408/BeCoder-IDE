/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProblemRef } from 'becoder-oj-connect';

/** Preserve the visible ACM entry; public IDs and contest IDs are different identities. */
export function nowcoderProblem(input: string): ProblemRef | undefined {
	let path = input.replace(/\.(?:cpp|cc|cxx|c)$/i, '');
	if (input.startsWith('https:')) {
		try {
			const url = new URL(input);
			if (url.origin !== 'https://ac.nowcoder.com' || url.username || url.password || url.search || url.hash) { return undefined; }
			const match = /^\/acm\/(problem\/[1-9]\d*|contest\/[1-9]\d*\/[A-Z][A-Z0-9]*)\/?$/.exec(url.pathname);
			if (!match) { return undefined; }
			path = match[1];
		} catch { return undefined; }
	} else if (/^[1-9]\d*$/.test(path)) { path = 'problem/' + path; }
	else if (/^(?:problem\/[1-9]\d*|contest\/[1-9]\d*\/[A-Z][A-Z0-9]*)$/.test(path)) { /* Already canonical. */ }
	else {
		const match = /^([1-9]\d*)[_/]([A-Z][A-Z0-9]*)$/i.exec(path);
		if (!match) { return undefined; }
		path = 'contest/' + match[1] + '/' + match[2].toUpperCase();
	}
	return { site: 'nowcoder', nativeId: path, url: 'https://ac.nowcoder.com/acm/' + path };
}

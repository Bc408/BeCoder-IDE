/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageOption, SiteId } from './domain';

// Captured official labels, not a claim that these compilers are still available for a submission.
// Codeforces: captured submission form; AtCoder C++: verified submission, C23: captured official rules.
const catalogues: Partial<Record<SiteId, readonly LanguageOption[]>> = {
	lanqiao: [
		// allow-any-unicode-next-line
		{ id: 'cpp', label: 'C++（g++17）', family: 'cpp' },
		// allow-any-unicode-next-line
		{ id: 'c', label: 'C（gcc8.3.0）', family: 'c' }
	],
	codeforces: [
		{ id: '43', label: 'GNU GCC C11 5.1.0', family: 'c' },
		{ id: '54', label: 'GNU G++17 7.3.0', family: 'cpp' },
		{ id: '89', label: 'GNU G++20 13.2 (64 bit, winlibs)', family: 'cpp' },
		{ id: '91', label: 'GNU G++23 14.2 (64 bit, msys2)', family: 'cpp' }
	],
	atcoder: [
		{ id: '6017', label: 'C++23 (GCC 15.2.0)', family: 'cpp' },
		{ id: 'catalogue:atcoder-c23-gcc', label: 'C23 (GCC 14.2.0)', family: 'c' }
	]
};

export function compilerCatalogue(site: SiteId): readonly LanguageOption[] { return catalogues[site] ?? []; }

export function symbolicCompiler(site: SiteId, family: 'c' | 'cpp', id: string): LanguageOption | undefined {
	return id.startsWith('catalogue:') ? compilerCatalogue(site).find(option => option.id === id && option.family === family) : undefined;
}

/** Only an unambiguous exact current label may turn an offline symbolic choice into a website ID. */
export function resolveCompiler(site: SiteId, family: 'c' | 'cpp', id: string | undefined, options: readonly LanguageOption[]): string | undefined {
	if (id === undefined) { return undefined; }
	const symbolic = symbolicCompiler(site, family, id);
	if (!symbolic) { return options.find(option => option.family === family && option.id === id && !id.startsWith('catalogue:'))?.id; }
	const matches = options.filter(option => option.family === family && option.label === symbolic.label && /^\d+$/.test(option.id));
	return matches.length === 1 ? matches[0].id : undefined;
}

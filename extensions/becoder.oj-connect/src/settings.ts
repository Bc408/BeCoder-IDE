/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SiteId } from 'becoder-oj-connect';
export type { SiteId } from 'becoder-oj-connect';
export type SiteDirectories = Record<SiteId, string>;
export const defaultDirectories: Readonly<SiteDirectories> = Object.freeze({ luogu: 'luogu', codeforces: 'codeforces', atcoder: 'atcoder', lanqiao: 'lanqiao', nowcoder: 'nowcoder' });

export function validDirectoryName(name: unknown): name is string {
	return typeof name === 'string' && !!name && name.length <= 255 && !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name) && name.trim() === name && name !== '.' && name !== '..' && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}

export function readDirectories(value: unknown): SiteDirectories {
	if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(defaultDirectories, key)))) { throw new Error('oj-connect-invalid-directories'); }
	const directories = { ...defaultDirectories, ...value as Partial<SiteDirectories> };
	const names = Object.values(directories);
	if (names.some(name => !validDirectoryName(name)) || new Set(names.map(name => name.toLowerCase())).size !== names.length) { throw new Error('oj-connect-invalid-directories'); }
	return directories;
}

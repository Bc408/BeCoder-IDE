/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
declare module 'becoder-content' {
	import type { Root } from 'hast';
	export function parseMarkdown(source: string, options: { dialect: 'luogu' | 'beacon'; streaming?: boolean }): Root;
	export function parseHtml(source: string, baseURL: string): Root;
}

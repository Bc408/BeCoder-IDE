/* Copyright (c) BeCoder contributors. Licensed under GPL-3.0-or-later. */
declare module 'becoder-content' {
	import type { Root } from 'hast';
	export function parseMarkdown(source: string, options: { dialect: 'luogu' | 'beacon'; streaming?: boolean }): Root;
	export function parseHtml(source: string, baseURL: string): Root;
}

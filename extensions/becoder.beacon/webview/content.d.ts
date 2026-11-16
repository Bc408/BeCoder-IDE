/* Copyright (c) BeCoder contributors. Licensed under MIT. */
declare module 'becoder-content' {
	import type { Root } from 'hast';
	export function parseBeaconMarkdown(source: string, options?: { streaming?: boolean }): Root;
}

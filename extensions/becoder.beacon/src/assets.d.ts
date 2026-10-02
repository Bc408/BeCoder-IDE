/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

declare module '*.css';
declare module 'beacon-syntax-assets' {
	export const grammars: import('vscode-textmate').IRawGrammar[];
	export const languages: Record<string, { id: string; label: string; scope: string }>;
	export const injections: Record<string, string[]>;
	export const theme: { colors: Record<string, string>; tokenColors: import('vscode-textmate').IRawTheme['settings'] };
}

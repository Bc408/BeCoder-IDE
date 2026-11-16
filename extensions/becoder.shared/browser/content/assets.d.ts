/* Copyright (c) BeCoder contributors. MIT License. See ../../LICENSE. */
declare module 'becoder-syntax-assets' {
	export const grammarFiles: Record<string, string>;
	export const languages: Record<string, { id: string; label: string; scope: string }>;
	export const injections: Record<string, string[]>;
	export const theme: { colors: Record<string, string>; tokenColors: import('vscode-textmate').IRawTheme['settings'] };
}

declare module '*.css';

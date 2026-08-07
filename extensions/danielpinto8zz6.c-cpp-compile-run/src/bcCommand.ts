/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';

export type BcCommand =
	| { readonly kind: 'run'; readonly source: string; readonly withInput: boolean }
	| { readonly kind: 'clear' }
	| { readonly kind: 'help' };

export type BcCommandResult =
	| { readonly kind: 'empty' }
	| { readonly kind: 'command'; readonly command: BcCommand }
	| { readonly kind: 'error'; readonly reason: 'syntax' | 'unsupported' };

export type BcCommandToken = {
	readonly value: string;
	readonly start: number;
	readonly end: number;
};

export type BcCommandTokens = {
	readonly tokens: readonly BcCommandToken[];
	readonly complete: boolean;
};

export function parseBcCommand(text: string): BcCommandResult {
	const tokenized = tokenizeBcCommand(text);
	if (!tokenized.complete) {
		return { kind: 'error', reason: 'syntax' };
	}
	const tokens = tokenized.tokens.map(token => token.value);
	if (tokens.length === 0) {
		return { kind: 'empty' };
	}
	const command = tokens[0].toLowerCase();
	if (command === 'clear' && tokens.length === 1) {
		return { kind: 'command', command: { kind: 'clear' } };
	}
	if (command === 'help' && tokens.length === 1) {
		return { kind: 'command', command: { kind: 'help' } };
	}
	if (command === 'run' && (tokens.length === 2 || tokens.length === 3)) {
		if (tokens.length === 3 && tokens[2].toLowerCase() !== '-withinput') {
			return { kind: 'error', reason: 'unsupported' };
		}
		if (!tokens[1]) {
			return { kind: 'error', reason: 'syntax' };
		}
		return {
			kind: 'command',
			command: {
				kind: 'run',
				source: tokens[1],
				withInput: tokens.length === 3
			}
		};
	}
	return { kind: 'error', reason: 'unsupported' };
}

export function formatRunCommand(sourcePath: string, cwd: string, withInput: boolean): string {
	const relativePath = path.relative(cwd, sourcePath).replaceAll('/', '\\') || path.basename(sourcePath);
	return `run ${quoteBcArgument(relativePath)}${withInput ? ' -WithInput' : ''}`;
}

export function resolveCommandSource(source: string, cwd: string): string {
	return path.resolve(cwd, source);
}

function quoteBcArgument(value: string): string {
	if (!/[\s'"`$&|;<>()[\]{}!#^]/.test(value)) {
		return value;
	}
	return `'${value.replaceAll('\'', '\'\'')}'`;
}

export function tokenizeBcCommand(text: string): BcCommandTokens {
	const tokens: BcCommandToken[] = [];
	let token = '';
	let tokenStarted = false;
	let tokenStart = 0;
	let quote: 'single' | 'double' | undefined;
	for (let index = 0; index < text.length; index++) {
		const character = text[index];
		if (!quote && /\s/.test(character)) {
			if (tokenStarted) {
				tokens.push({ value: token, start: tokenStart, end: index });
				token = '';
				tokenStarted = false;
			}
			continue;
		}
		if (!tokenStarted) {
			tokenStart = index;
		}
		if (character === '\'') {
			if (quote === 'double') {
				token += character;
				tokenStarted = true;
				continue;
			}
			if (quote === 'single' && text[index + 1] === '\'') {
				token += character;
				index++;
				tokenStarted = true;
				continue;
			}
			quote = quote === 'single' ? undefined : 'single';
			tokenStarted = true;
			continue;
		}
		if (character === '"') {
			if (quote === 'single') {
				token += character;
				tokenStarted = true;
				continue;
			}
			quote = quote === 'double' ? undefined : 'double';
			tokenStarted = true;
			continue;
		}
		token += character;
		tokenStarted = true;
	}
	if (tokenStarted) {
		tokens.push({ value: token, start: tokenStart, end: text.length });
	}
	return { tokens, complete: quote === undefined };
}

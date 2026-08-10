/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tokenizeBcCommand } from './bcCommand';

const ansiReset = '\x1b[0m';
const ansiBrightRed = '\x1b[91m';
const ansiBrightGreen = '\x1b[92m';
const ansiBrightYellow = '\x1b[93m';
const ansiBrightWhite = '\x1b[97m';
const ansiDefaultForeground = '\x1b[39m';
const osc633Prefix = '\x1b]633;';
const c1Osc633Prefix = '\u009d633;';

export type BcStatusKind = 'success' | 'error';

export function renderBcPrompt(cwd: string): string {
	return `${ansiReset}BC ${normalizeWindowsDriveLetter(cwd)}> `;
}

export function renderBcCommand(text: string): string {
	if (!text) {
		return '';
	}
	const { tokens } = tokenizeBcCommand(text);
	const colors = classifyTokens(tokens.map(token => token.value));
	let rendered = '';
	let offset = 0;
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		rendered += text.slice(offset, token.start);
		rendered += `${colors[index]}${text.slice(token.start, token.end)}${ansiReset}`;
		offset = token.end;
	}
	return `${rendered}${text.slice(offset)}${ansiReset}`;
}

export function renderBcStatus(message: string, kind: BcStatusKind): string {
	return `${kind === 'success' ? ansiBrightGreen : ansiBrightRed}===== ${message} =====${ansiReset}`;
}

export function renderBcFlowFailure(title: string, description: string): string {
	return `${ansiBrightYellow}===== ${title} =====\r\n${description}${ansiReset}`;
}

export function osc633PromptStart(): string {
	return osc633('A');
}

export function osc633CommandStart(): string {
	return osc633('B');
}

export function osc633CommandExecuted(command: string): string {
	return `${osc633(`E;${encodeOscValue(command)}`)}${osc633('C')}`;
}

export function osc633CommandFinished(exitCode?: number): string {
	return osc633(exitCode === undefined ? 'D' : `D;${exitCode}`);
}

export class Osc633Filter {
	private mode: 'text' | 'prefix' | 'discard' | 'discardEscape' = 'text';
	private prefix = '';

	write(value: string): string {
		let output = '';
		for (const character of value) {
			switch (this.mode) {
				case 'text':
					if (character === '\x1b' || character === '\u009d') {
						this.prefix = character;
						this.mode = 'prefix';
					} else {
						output += character;
					}
					break;
				case 'prefix': {
					this.prefix += character;
					const matchingPrefix = [osc633Prefix, c1Osc633Prefix].find(prefix => prefix.startsWith(this.prefix));
					if (matchingPrefix) {
						if (this.prefix === matchingPrefix) {
							this.prefix = '';
							this.mode = 'discard';
						}
						break;
					}
					if (character === '\x1b' || character === '\u009d') {
						this.prefix = character;
					} else {
						output += this.prefix;
						this.prefix = '';
						this.mode = 'text';
					}
					break;
				}
				case 'discard':
					if (character === '\x07' || character === '\u009c') {
						this.mode = 'text';
					} else if (character === '\x1b') {
						this.mode = 'discardEscape';
					}
					break;
				case 'discardEscape':
					if (character === '\\' || character === '\x07' || character === '\u009c') {
						this.mode = 'text';
					} else if (character !== '\x1b') {
						this.mode = 'discard';
					}
					break;
			}
		}
		return output;
	}

	end(): string {
		this.mode = 'text';
		this.prefix = '';
		return '';
	}
}

function classifyTokens(tokens: readonly string[]): string[] {
	const colors = tokens.map(() => ansiBrightRed);
	if (tokens.length === 0) {
		return colors;
	}
	const command = tokens[0].toLowerCase();
	const commands = ['run', 'clear', 'help'];
	if (commands.some(candidate => candidate.startsWith(command)) && command.length > 0) {
		colors[0] = ansiBrightYellow;
	}
	if (command === 'run') {
		if (tokens.length >= 2) {
			colors[1] = ansiBrightWhite;
		}
		if (tokens.length >= 3 && '-withinput'.startsWith(tokens[2].toLowerCase())) {
			colors[2] = ansiDefaultForeground;
		}
	}
	return colors;
}

function normalizeWindowsDriveLetter(value: string): string {
	return /^[a-z]:[\\/]/.test(value) ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function osc633(value: string): string {
	return `${osc633Prefix}${value}\x07`;
}

function encodeOscValue(value: string): string {
	let encoded = '';
	for (const character of value) {
		const codePoint = character.codePointAt(0)!;
		if (character === '\\') {
			encoded += '\\\\';
		} else if (character === ';' || codePoint <= 0x20 || (codePoint >= 0x7F && codePoint <= 0x9F)) {
			encoded += `\\x${codePoint.toString(16).padStart(2, '0')}`;
		} else {
			encoded += character;
		}
	}
	return encoded;
}

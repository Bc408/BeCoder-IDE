/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { previousGraphemeStart, terminalCellWidth } from './terminalText';

export type TerminalEscapeMatch =
	| { readonly kind: 'none' }
	| { readonly kind: 'incomplete' }
	| { readonly kind: 'complete'; readonly sequence: string };

export function matchTerminalEscape(data: string, index: number): TerminalEscapeMatch {
	if (data[index] !== '\x1b') {
		return { kind: 'none' };
	}
	if (index + 1 === data.length) {
		return { kind: 'incomplete' };
	}
	if (data[index + 1] !== '[' && data[index + 1] !== 'O') {
		return { kind: 'none' };
	}
	for (let cursor = index + 2; cursor < data.length; cursor++) {
		const code = data.charCodeAt(cursor);
		if (code >= 0x40 && code <= 0x7E) {
			return { kind: 'complete', sequence: data.slice(index, cursor + 1) };
		}
	}
	return { kind: 'incomplete' };
}

export class TerminalOpenTracker {
	private opened = false;
	private settled = false;
	private readonly firstOpen: Promise<number | undefined>;
	private resolveFirstOpen!: (openedAt: number | undefined) => void;

	constructor() {
		this.firstOpen = new Promise(resolve => this.resolveFirstOpen = resolve);
	}

	open(openedAt: number): void {
		this.opened = true;
		this.settle(openedAt);
	}

	close(): void {
		this.opened = false;
		this.settle(undefined);
	}

	async wait(startedAt: number): Promise<number | undefined> {
		if (this.opened) {
			return 0;
		}
		const openedAt = await this.firstOpen;
		return openedAt === undefined ? undefined : Math.max(0, openedAt - startedAt);
	}

	private settle(openedAt: number | undefined): void {
		if (!this.settled) {
			this.settled = true;
			this.resolveFirstOpen(openedAt);
		}
	}
}

export type ProgramInputAction =
	| { readonly kind: 'echo'; readonly value: string }
	| { readonly kind: 'erase'; readonly width: number }
	| { readonly kind: 'submit'; readonly value: string }
	| { readonly kind: 'interrupt' };

export class ProgramInputEditor {
	private value = '';
	private pendingEscape = '';
	private suppressLineFeed = false;

	reset(): void {
		this.value = '';
		this.pendingEscape = '';
		this.suppressLineFeed = false;
	}

	get hasPendingEscape(): boolean {
		return this.pendingEscape.length > 0;
	}

	flushPendingEscape(): readonly ProgramInputAction[] {
		if (!this.pendingEscape) {
			return [];
		}
		this.pendingEscape = '';
		const width = terminalCellWidth(this.value);
		this.value = '';
		return width > 0 ? [{ kind: 'erase', width }] : [];
	}

	handleInput(data: string): readonly ProgramInputAction[] {
		if (data.includes('\x03')) {
			this.reset();
			return [{ kind: 'interrupt' }];
		}
		data = this.pendingEscape + data;
		this.pendingEscape = '';
		const actions: ProgramInputAction[] = [];
		for (let index = 0; index < data.length;) {
			const escape = matchTerminalEscape(data, index);
			if (escape.kind === 'incomplete') {
				this.pendingEscape = data.slice(index);
				break;
			}
			if (escape.kind === 'complete') {
				index += escape.sequence.length;
				continue;
			}
			const character = String.fromCodePoint(data.codePointAt(index)!);
			index += character.length;
			if (this.suppressLineFeed) {
				this.suppressLineFeed = false;
				if (character === '\n') {
					continue;
				}
			}
			if (character === '\r' || character === '\n') {
				actions.push({ kind: 'submit', value: `${this.value}\n` });
				this.value = '';
				this.suppressLineFeed = character === '\r';
			} else if (character === '\x7f' || character === '\b') {
				if (this.value) {
					const previous = previousGraphemeStart(this.value, this.value.length);
					const removed = this.value.slice(previous);
					this.value = this.value.slice(0, previous);
					actions.push({ kind: 'erase', width: terminalCellWidth(removed) });
				}
			} else if (character === '\x1b') {
				const width = terminalCellWidth(this.value);
				this.value = '';
				if (width > 0) {
					actions.push({ kind: 'erase', width });
				}
			} else if (character >= ' ') {
				this.value += character;
				actions.push({ kind: 'echo', value: character });
			}
		}
		return actions;
	}
}

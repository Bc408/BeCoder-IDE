/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchTerminalEscape } from './terminalInput';
import { nextGraphemeEnd, previousGraphemeStart } from './terminalText';

export type LineEditorAction =
	| { readonly kind: 'redraw' }
	| { readonly kind: 'submit'; readonly value: string }
	| { readonly kind: 'interrupt' };

export class CommandHistory {
	private readonly entries: string[] = [];

	record(command: string): void {
		if (command.trim()) {
			this.entries.push(command);
		}
	}

	values(): readonly string[] {
		return this.entries;
	}
}

export class BcLineEditor {
	private value = '';
	private cursor = 0;
	private historyIndex: number | undefined;
	private historyDraft = '';
	private pendingEscape = '';

	constructor(private readonly history: CommandHistory) { }

	get text(): string {
		return this.value;
	}

	get cursorColumn(): number {
		return this.cursor;
	}

	get hasPendingEscape(): boolean {
		return this.pendingEscape.length > 0;
	}

	reset(): void {
		this.value = '';
		this.cursor = 0;
		this.resetHistoryNavigation();
		this.pendingEscape = '';
	}

	handleInput(data: string): readonly LineEditorAction[] {
		data = this.pendingEscape + data;
		this.pendingEscape = '';
		const actions: LineEditorAction[] = [];
		for (let index = 0; index < data.length;) {
			const escape = matchTerminalEscape(data, index);
			if (escape.kind === 'incomplete') {
				this.pendingEscape = data.slice(index);
				break;
			}
			if (escape.kind === 'complete') {
				index += escape.sequence.length;
				const action = this.handleSequence(escape.sequence);
				if (action) {
					actions.push(action);
				}
				continue;
			}
			const sequence = matchSequence(data, index);
			if (sequence) {
				index += sequence.length;
				const action = this.handleSequence(sequence);
				if (action) {
					actions.push(action);
					if (action.kind === 'submit' || action.kind === 'interrupt') {
						break;
					}
				}
				continue;
			}
			const codePoint = String.fromCodePoint(data.codePointAt(index)!);
			index += codePoint.length;
			this.insert(codePoint);
			actions.push({ kind: 'redraw' });
		}
		return actions;
	}

	flushPendingEscape(): readonly LineEditorAction[] {
		if (!this.pendingEscape) {
			return [];
		}
		this.pendingEscape = '';
		const action = this.handleSequence('\x1b');
		return action ? [action] : [];
	}

	private handleSequence(sequence: string): LineEditorAction | undefined {
		switch (sequence) {
			case '\r\n':
			case '\r':
			case '\n': {
				const value = this.value;
				this.reset();
				return { kind: 'submit', value };
			}
			case '\x03':
				this.reset();
				return { kind: 'interrupt' };
			case '\x1b':
				this.reset();
				return { kind: 'redraw' };
			case '\x7f':
			case '\b':
				if (this.cursor > 0) {
					const previous = previousGraphemeStart(this.value, this.cursor);
					this.value = this.value.slice(0, previous) + this.value.slice(this.cursor);
					this.cursor = previous;
					this.resetHistoryNavigation();
				}
				return { kind: 'redraw' };
			case '\x1b[3~':
				if (this.cursor < this.value.length) {
					const next = nextGraphemeEnd(this.value, this.cursor);
					this.value = this.value.slice(0, this.cursor) + this.value.slice(next);
					this.resetHistoryNavigation();
				}
				return { kind: 'redraw' };
			case '\x1b[D':
				this.cursor = previousGraphemeStart(this.value, this.cursor);
				return { kind: 'redraw' };
			case '\x1b[C':
				this.cursor = nextGraphemeEnd(this.value, this.cursor);
				return { kind: 'redraw' };
			case '\x1b[H':
			case '\x1b[1~':
				this.cursor = 0;
				return { kind: 'redraw' };
			case '\x1b[F':
			case '\x1b[4~':
				this.cursor = this.value.length;
				return { kind: 'redraw' };
			case '\x1b[A':
				this.previousHistory();
				return { kind: 'redraw' };
			case '\x1b[B':
				this.nextHistory();
				return { kind: 'redraw' };
		}
		return undefined;
	}

	private insert(text: string): void {
		this.value = this.value.slice(0, this.cursor) + text + this.value.slice(this.cursor);
		this.cursor += text.length;
		this.resetHistoryNavigation();
	}

	private previousHistory(): void {
		const entries = this.history.values();
		if (entries.length === 0) {
			return;
		}
		if (this.historyIndex === undefined) {
			this.historyDraft = this.value;
			this.historyIndex = entries.length - 1;
		} else if (this.historyIndex > 0) {
			this.historyIndex--;
		}
		this.value = entries[this.historyIndex];
		this.cursor = this.value.length;
	}

	private nextHistory(): void {
		const entries = this.history.values();
		if (this.historyIndex === undefined) {
			return;
		}
		if (this.historyIndex < entries.length - 1) {
			this.historyIndex++;
			this.value = entries[this.historyIndex];
		} else {
			this.historyIndex = undefined;
			this.value = this.historyDraft;
		}
		this.cursor = this.value.length;
	}

	private resetHistoryNavigation(): void {
		this.historyIndex = undefined;
		this.historyDraft = '';
	}
}

const inputSequences = [
	'\r\n',
	'\x1b[3~', '\x1b[1~', '\x1b[4~',
	'\x1b[A', '\x1b[B', '\x1b[C', '\x1b[D', '\x1b[H', '\x1b[F',
	'\x03', '\x1b', '\x7f', '\b', '\r', '\n'
] as const;

function matchSequence(data: string, index: number): string | undefined {
	return inputSequences.find(sequence => data.startsWith(sequence, index));
}

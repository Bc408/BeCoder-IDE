/*---------------------------------------------------------------------------------------------
 * Copyright (c) 2026 BeCoder contributors.
 * Licensed under GPL-3.0-or-later; see ../LICENSE.
 *--------------------------------------------------------------------------------------------*/

/** Track printable text across chunks without counting zero-width VT controls as text. */
export class TerminalOutputBoundary {
	private mode: 'text' | 'escape' | 'csi' | 'string' | 'stringEscape' = 'text';

	reset(): void {
		this.mode = 'text';
	}

	write(text: string, boundary: boolean): boolean {
		for (const character of text) {
			if (this.mode === 'string') {
				if (character === '\x07' || character === '\u009c') {
					this.mode = 'text';
				} else if (character === '\x1b') {
					this.mode = 'stringEscape';
				}
				continue;
			}
			if (this.mode === 'stringEscape') {
				this.mode = character === '\\' || character === '\x07' || character === '\u009c' ? 'text' : 'string';
				continue;
			}
			if (character === '\x1b') { this.mode = 'escape'; continue; }
			if (this.mode === 'escape') {
				if (character === '[') {
					this.mode = 'csi';
				} else if (']PX^_'.includes(character)) {
					this.mode = 'string';
				} else if (character >= '\x30' && character <= '\x7e') {
					this.mode = 'text';
				}
				continue;
			}
			if (this.mode === 'csi') {
				if (character >= '@' && character <= '~') { this.mode = 'text'; }
				continue;
			}
			if (character === '\u009b') { this.mode = 'csi'; continue; }
			if ('\u009d\u0090\u0098\u009e\u009f'.includes(character)) { this.mode = 'string'; continue; }
			if (character === '\r' || character === '\n') {
				boundary = true;
			} else if (character === '\t' || (character >= ' ' && !(character >= '\u007f' && character <= '\u009f'))) {
				boundary = false;
			}
		}
		return boundary;
	}
}

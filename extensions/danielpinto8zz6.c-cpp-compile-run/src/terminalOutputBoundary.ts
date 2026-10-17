/*---------------------------------------------------------------------------------------------
 * Copyright (c) 2026 BeCoder contributors.
 * Licensed under GPL-3.0-or-later; see ../LICENSE.
 *--------------------------------------------------------------------------------------------*/

/** Track printable text across chunks without counting zero-width VT controls as text. */
export class TerminalOutputBoundary {
	private mode: 'text' | 'escape' | 'csi' | 'string' | 'stringEscape' = 'text';
	private parameters = '';

	reset(): void {
		this.mode = 'text';
		this.parameters = '';
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
					this.parameters = '';
				} else if (']PX^_'.includes(character)) {
					this.mode = 'string';
				} else if (character >= '\x30' && character <= '\x7e') {
					this.mode = 'text';
				}
				continue;
			}
			if (this.mode === 'csi') {
				if (character >= '@' && character <= '~') {
					// A ConPTY screen repaint ends with CUP, after painting blank rows.
					// Its cursor column, not the last printed newline, owns the boundary.
					if (/^[\d;]*$/.test(this.parameters)) {
						if (character === 'H' || character === 'f') {
							boundary = Number(this.parameters.split(';')[1] || 1) <= 1;
						} else if (character === 'G' || character === '`') {
							boundary = Number(this.parameters || 1) <= 1;
						} else if (character === 'E' || character === 'F') {
							boundary = true;
						} else if (character === 'C' || character === 'a' || character === 'D' || character === 'Z') {
							// Relative horizontal movement needs a column model. Conservatively
							// separate Runner's next line instead of appending to program text.
							boundary = false;
						}
					}
					this.mode = 'text';
				} else if (this.parameters.length < 64) {
					this.parameters += character;
				}
				continue;
			}
			if (character === '\u009b') { this.mode = 'csi'; this.parameters = ''; continue; }
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

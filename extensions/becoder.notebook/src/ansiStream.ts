/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Supply the mature ANSI renderer with the active SGR style and complete sequences. */
export class AnsiStream {
	private pending = '';
	private readonly styles = new Map<string, string>();
	append(text: string): string {
		const source = this.pending + text;
		const unfinished = /\u001b(?:\[[0-?]*[ -/]*)?$/.exec(source);
		this.pending = unfinished?.[0] ?? '';
		const complete = unfinished ? source.slice(0, unfinished.index) : source;
		if (!complete) { return ''; }
		const prefix = [...this.styles.values()].join('');
		for (const match of complete.matchAll(/\u001b\[([0-9;]*)m/g)) { this.update(match[1].split(';').map(value => Number(value || 0))); }
		return prefix + complete;
	}
	private update(codes: number[]): void {
		for (let index = 0; index < codes.length; index++) {
			const code = codes[index];
			if (code === 0) { this.styles.clear(); continue; }
			if ([38, 48, 58].includes(code)) {
				const count = codes[index + 1] === 5 ? 3 : codes[index + 1] === 2 ? 5 : 0;
				if (count && index + count <= codes.length) { this.styles.set(code === 38 ? 'fg' : code === 48 ? 'bg' : 'underlineColor', '\u001b[' + codes.slice(index, index + count).join(';') + 'm'); index += count - 1; }
				continue;
			}
			const resets: Record<number, string[]> = { 22: ['bold', 'dim'], 23: ['italic'], 24: ['underline'], 25: ['blink'], 27: ['inverse'], 28: ['hidden'], 29: ['strike'], 39: ['fg'], 49: ['bg'], 55: ['overline'], 59: ['underlineColor'] };
			if (resets[code]) { for (const key of resets[code]) { this.styles.delete(key); } continue; }
			const flags: Record<number, string> = { 1: 'bold', 2: 'dim', 3: 'italic', 4: 'underline', 5: 'blink', 6: 'blink', 7: 'inverse', 8: 'hidden', 9: 'strike', 21: 'underline', 53: 'overline' };
			const key = flags[code] ?? ((code >= 30 && code <= 37) || (code >= 90 && code <= 97) ? 'fg' : (code >= 40 && code <= 47) || (code >= 100 && code <= 107) ? 'bg' : undefined);
			if (key) { this.styles.set(key, `\u001b[${code}m`); }
		}
	}
}

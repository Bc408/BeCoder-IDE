/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the MIT License. See LICENSE in the component root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INITIAL, Registry, type IGrammar, type IRawGrammar, type IRawTheme, type StateStack } from 'vscode-textmate';
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma';
import { injections, theme } from 'becoder-syntax-assets';

export interface SyntaxToken { content: string; color: string; fontStyle: number }
export interface SyntaxResult { text: string; lines: SyntaxToken[][] }
export interface SyntaxPatch { start: number; lineCount: number; lines: SyntaxToken[][] }

/** Same grammar, regex engine and default token theme as BeCoder's first editor pass. */
export async function createSyntaxRegistry(wasm: ArrayBuffer, loadGrammar: (scope: string) => Promise<IRawGrammar | null>): Promise<Registry> {
	await loadWASM(wasm);
	return new Registry({
		onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
		theme: { settings: [{ settings: { foreground: theme.colors['editor.foreground'] ?? '#BBBBBB', background: theme.colors['editor.background'] } }, ...theme.tokenColors.filter(rule => rule.scope)] } satisfies IRawTheme,
		loadGrammar,
		getInjections: scope => scope.split('.').flatMap((_, index, parts) => injections[parts.slice(0, index + 1).join('.')] ?? [])
	});
}

export class IncrementalSyntax {
	private source: string[] = [];
	private states: StateStack[] = [];
	private lines: SyntaxToken[][] = [];
	constructor(private readonly grammar: IGrammar, private readonly colors: string[]) { }
	async update(text: string, yieldTask = () => typeof scheduler !== 'undefined' ? scheduler.yield() : new Promise<void>(resolve => setTimeout(resolve, 0))): Promise<SyntaxResult> {
		await this.patch(text, yieldTask);
		return { text, lines: this.lines.slice() };
	}
	async patch(text: string, yieldTask = () => typeof scheduler !== 'undefined' ? scheduler.yield() : new Promise<void>(resolve => setTimeout(resolve, 0))): Promise<SyntaxPatch> {
		if (text.length > 512000) { throw new Error('syntax-size-budget'); }
		const source = text.split('\n');
		if (source.length - Number(text.endsWith('\n')) > 10000 || source.some(line => line.length > 20000)) { throw new Error('syntax-size-budget'); }
		let sliceStart = performance.now(), computeMs = 0;
		// Cold grammar compilation is independent of painting. Ordinary long blocks
		// continue across slices; only pathological total computation is abandoned.
		const cold = this.source.length === 0;
		let start = 0;
		while (start < source.length && start < this.source.length && source[start] === this.source[start]) { start++; }
		this.states.length = start;
		this.lines.length = start;
		for (let index = start; index < source.length; index++) {
			const elapsed = performance.now() - sliceStart;
			if (computeMs + elapsed > 5000) { throw new Error('syntax-time-budget'); }
			if (elapsed >= 12) {
				computeMs += elapsed;
				await yieldTask();
				sliceStart = performance.now();
			}
			const line = source[index];
			const result = this.grammar.tokenizeLine2(line, index ? this.states[index - 1] : INITIAL, cold ? 200 : 100);
			// A timed-out line has an unreliable continuation state: fail the whole snapshot.
			if (result.stoppedEarly) { throw new Error('syntax-time-budget'); }
			this.states.push(result.ruleStack);
			const tokens: SyntaxToken[] = [];
			for (let token = 0; token < result.tokens.length; token += 2) {
				const begin = result.tokens[token];
				const end = token + 2 < result.tokens.length ? result.tokens[token + 2] : line.length;
				if (begin >= line.length) { continue; }
				const metadata = result.tokens[token + 1];
				const content = line.slice(begin, end), color = this.colors[(metadata >>> 15) & 511], fontStyle = (metadata >>> 11) & 15;
				const previous = tokens[tokens.length - 1];
				if (previous?.color === color && previous.fontStyle === fontStyle) { previous.content += content; }
				else { tokens.push({ content, color, fontStyle }); }
			}
			this.lines.push(tokens);
		}
		this.source = source;
		return { start, lineCount: this.lines.length, lines: this.lines.slice(start) };
	}
}

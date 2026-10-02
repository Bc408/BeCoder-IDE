/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { INITIAL, Registry, type IGrammar, type IRawGrammar, type IRawTheme, type StateStack } from 'vscode-textmate';
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma';
import { grammars, injections, theme } from 'beacon-syntax-assets';

export interface SyntaxToken { content: string; color: string; fontStyle: number }
export interface SyntaxResult { text: string; lines: SyntaxToken[][] }

/** Same grammar, regex engine and default token theme as BeCoder's first editor pass. */
export async function createSyntaxRegistry(wasm: ArrayBuffer): Promise<Registry> {
	await loadWASM(wasm);
	return new Registry({
		onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
		theme: { settings: [{ settings: { foreground: theme.colors['editor.foreground'] ?? '#BBBBBB', background: theme.colors['editor.background'] } }, ...theme.tokenColors.filter(rule => rule.scope)] } as IRawTheme,
		loadGrammar: async scope => (grammars.find(grammar => grammar.scopeName === scope) as IRawGrammar | undefined) ?? null,
		getInjections: scope => scope.split('.').flatMap((_, index, parts) => injections[parts.slice(0, index + 1).join('.')] ?? [])
	});
}

export class IncrementalSyntax {
	private source: string[] = [];
	private states: StateStack[] = [];
	private lines: SyntaxToken[][] = [];
	constructor(private readonly grammar: IGrammar, private readonly colors: string[]) { }
	update(text: string): SyntaxResult {
		const began = performance.now();
		// Oniguruma compiles grammar regexes lazily. Cold compilation needs a separate
		// budget from warm incremental updates; it remains isolated from UI painting.
		const cold = this.source.length === 0;
		const source = text.split('\n');
		let start = 0;
		while (start < source.length && start < this.source.length && source[start] === this.source[start]) { start++; }
		this.states.length = start;
		this.lines.length = start;
		for (let index = start; index < source.length; index++) {
			if (performance.now() - began > (cold ? 1500 : 500)) { throw new Error('syntax-time-budget'); }
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
				tokens.push({ content: line.slice(begin, end), color: this.colors[(metadata >>> 15) & 511], fontStyle: (metadata >>> 11) & 15 });
			}
			this.lines.push(tokens);
		}
		this.source = source;
		return { text, lines: this.lines.slice() };
	}
}

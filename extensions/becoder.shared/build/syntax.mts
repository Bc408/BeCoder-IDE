/* Copyright (c) BeCoder contributors. MIT License. See ../LICENSE. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

interface Grammar {
	scopeName: string;
	name?: string;
	displayName?: string;
	aliases?: string[];
	[key: string]: unknown;
}
interface Language { id: string; label: string; scope: string }
interface ExtensionManifest {
	contributes?: {
		grammars?: { scopeName: string; path: string; language?: string; injectTo?: string[] }[];
		languages?: { id: string; aliases?: string[] }[];
	};
}
// A structural build interface keeps the shared helper independent of either consumer's esbuild installation.
interface SyntaxPlugin {
	name: string;
	setup(builder: {
		onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }): void;
		onLoad(options: { filter: RegExp; namespace: string }, callback: () => { contents: string; loader: 'js' }): void;
	}): void;
}

/** Shared offline language index and independently loadable grammar assets. */
export async function createSyntaxAssets(root: string) {
	const resolve = createRequire(path.join(root, 'package.json')).resolve;
	// Grammar assets only; rendering uses BeCoder's TextMate worker and token theme.
	const grammarByScope = new Map<string, Grammar>();
	const languages: Record<string, Language> = {};
	const injections: Record<string, string[]> = {};
	const { languageNames } = await import(pathToFileURL(resolve('@shikijs/langs')).href) as { languageNames: string[] };
	for (const id of languageNames) {
		const { default: grammars } = await import(pathToFileURL(resolve(`@shikijs/langs/${id}`)).href) as { default: Grammar[] };
		for (const grammar of grammars) { grammarByScope.set(grammar.scopeName, grammar); }
		// The entry grammar is identified by its language name, not dependency order.
		const grammar = grammars.find(grammar => grammar.name === id) ?? grammars.at(-1);
		if (!grammar) { throw new Error(`Missing entry grammar for ${id}`); }
		const entry = { id, label: grammar.displayName ?? id, scope: grammar.scopeName };
		for (const alias of [id, ...(grammar.aliases ?? [])]) { languages[alias.toLowerCase()] = entry; }
	}
	const grammarExtensions: string[] = [];
	for (const name of fs.readdirSync(path.join(root, '..')).sort()) {
		const directory = path.join(root, '..', name);
		const manifest = path.join(directory, 'package.json');
		if (!fs.existsSync(manifest)) { continue; }
		const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) as ExtensionManifest;
		if (!pkg.contributes?.grammars?.length) { continue; }
		grammarExtensions.push(name);
		for (const entry of pkg.contributes.grammars) {
			const grammar = JSON.parse(fs.readFileSync(path.join(directory, entry.path), 'utf8')) as Grammar;
			grammarByScope.set(entry.scopeName, grammar);
			for (const scope of entry.injectTo ?? []) { (injections[scope] ??= []).push(entry.scopeName); }
			if (!entry.language) { continue; }
			const definition = pkg.contributes.languages?.find(language => language.id === entry.language);
			const language = { id: entry.language, label: definition?.aliases?.[0] ?? languages[entry.language]?.label ?? entry.language, scope: entry.scopeName };
			for (const alias of [entry.language, ...(definition?.aliases ?? [])]) { languages[alias.toLowerCase()] = language; }
		}
	}
	const grammarFiles = Object.fromEntries([...grammarByScope.keys()].map(scope => [scope, 'grammars/' + createHash('sha256').update(scope).digest('hex').slice(0, 16) + '.json']));
	const theme = JSON.parse(fs.readFileSync(path.join(root, '../becoder.one-monokai/themes/OneMonokai-color-theme.json'), 'utf8'));
	const plugin = (inline = false): SyntaxPlugin => ({ name: 'becoder-syntax-assets', setup(builder) {
		builder.onResolve({ filter: /^(becoder|beacon)-syntax-assets$/ }, args => ({ path: args.path, namespace: 'becoder-syntax' }));
		builder.onLoad({ filter: /.*/, namespace: 'becoder-syntax' }, () => ({ contents: `export const grammarFiles=${JSON.stringify(grammarFiles)};export const languages=${JSON.stringify(languages)};export const injections=${JSON.stringify(injections)};export const theme=${JSON.stringify(theme)};${inline ? `export const grammars=${JSON.stringify([...grammarByScope.values()])};` : ''}`, loader: 'js' }));
	} });
	return { plugin, grammarExtensions, emit(directory: string) {
		fs.mkdirSync(path.join(directory, 'grammars'), { recursive: true });
		for (const [scope, grammar] of grammarByScope) { fs.writeFileSync(path.join(directory, grammarFiles[scope]), JSON.stringify(grammar)); }
		fs.copyFileSync(path.join(root, '../../node_modules/vscode-oniguruma/release/onig.wasm'), path.join(directory, 'onig.wasm'));
	} };
}

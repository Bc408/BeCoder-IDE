/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { bundledLanguagesInfo } from 'shiki';

const root = import.meta.dirname;
const shared = { absWorkingDir: root, bundle: true, minify: true, metafile: true, logLevel: 'info', legalComments: 'linked' };
// Keep existing fence languages, but prefer the grammars actually shipped in
// BeCoder. Both sets use the same incremental TextMate renderer and token theme.
const grammarByScope = new Map();
const languages = {};
const injections = {};
for (const language of bundledLanguagesInfo) {
	const { default: grammars } = await language.import();
	for (const grammar of grammars) { grammarByScope.set(grammar.scopeName, grammar); }
	// The entry grammar is identified by its language name, not dependency order.
	const entry = { id: language.id, label: language.name, scope: (grammars.find(grammar => grammar.name === language.id) ?? grammars.at(-1)).scopeName };
	for (const alias of [language.id, ...(language.aliases ?? [])]) { languages[alias.toLowerCase()] = entry; }
}
const grammarExtensions = [];
for (const name of fs.readdirSync(path.join(root, '..')).sort()) {
	const directory = path.join(root, '..', name);
	const manifest = path.join(directory, 'package.json');
	if (!fs.existsSync(manifest)) { continue; }
	const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
	if (!pkg.contributes?.grammars?.length) { continue; }
	grammarExtensions.push(name);
	for (const entry of pkg.contributes.grammars) {
		const grammar = JSON.parse(fs.readFileSync(path.join(directory, entry.path), 'utf8'));
		grammarByScope.set(entry.scopeName, grammar);
		for (const scope of entry.injectTo ?? []) { (injections[scope] ??= []).push(entry.scopeName); }
		if (!entry.language) { continue; }
		const definition = pkg.contributes.languages?.find(language => language.id === entry.language);
		const language = { id: entry.language, label: definition?.aliases?.[0] ?? languages[entry.language]?.label ?? entry.language, scope: entry.scopeName };
		for (const alias of [entry.language, ...(definition?.aliases ?? [])]) { languages[alias.toLowerCase()] = language; }
	}
}
const syntaxAssets = { name: 'beacon-syntax-assets', setup(builder) {
	builder.onResolve({ filter: /^beacon-syntax-assets$/ }, () => ({ path: 'beacon-syntax-assets', namespace: 'beacon' }));
	builder.onLoad({ filter: /.*/, namespace: 'beacon' }, () => {
		const grammars = [...grammarByScope.values()];
		const theme = JSON.parse(fs.readFileSync(path.join(root, '../becoder.one-monokai/themes/OneMonokai-color-theme.json'), 'utf8'));
		return { contents: `export const grammars=${JSON.stringify(grammars)};export const languages=${JSON.stringify(languages)};export const injections=${JSON.stringify(injections)};export const theme=${JSON.stringify(theme)};`, loader: 'js' };
	});
} };
const host = await build({ ...shared, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.cjs', platform: 'node', format: 'cjs', target: 'node22', external: ['vscode'] });
const ui = await build({ ...shared, entryPoints: ['webview/App.tsx'], outfile: 'dist/beacon.js', platform: 'browser', format: 'iife', target: 'chrome142', plugins: [syntaxAssets], loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' }, assetNames: 'fonts/[name]-[hash]', define: { 'process.env.NODE_ENV': '"production"' } });
const worker = await build({ ...shared, entryPoints: ['webview/syntax.worker.ts'], outfile: 'dist/syntax-worker.js', platform: 'browser', format: 'iife', target: 'chrome142', plugins: [syntaxAssets] });
fs.copyFileSync(path.join(root, '../../node_modules/vscode-oniguruma/release/onig.wasm'), path.join(root, 'dist/onig.wasm'));
await build({ ...shared, entryPoints: ['test/session.test.ts'], outfile: 'dist-test/session.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false, plugins: [syntaxAssets] });
await build({ ...shared, entryPoints: ['test/files.test.ts'], outfile: 'dist-test/files.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });
await build({ ...shared, entryPoints: ['test/models.test.ts'], outfile: 'dist-test/models.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });
await build({ ...shared, entryPoints: ['test/web.test.ts'], outfile: 'dist-test/web.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });
await build({ ...shared, entryPoints: ['test/attachments.test.ts'], outfile: 'dist-test/attachments.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false, plugins: [{ name: 'test-vscode', setup(builder) { builder.onResolve({ filter: /^vscode$/ }, () => ({ path: path.join(root, 'test/vscodeMock.ts') })); } }] });

// Distribute full dependency licenses alongside the bundled code, including transitive packages.
const packages = new Map();
for (const file of [...Object.keys(host.metafile.inputs), ...Object.keys(ui.metafile.inputs), ...Object.keys(worker.metafile.inputs)]) {
	if (!file.includes('node_modules/')) { continue; }
	let directory = path.dirname(path.join(root, file));
	while (directory.startsWith(path.resolve(root, '../..'))) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest)) {
			const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
			if (pkg.name && pkg.version) { packages.set(directory, pkg); break; }
		}
		directory = path.dirname(directory);
	}
}
const notices = ['Beacon bundled dependency notices. AI Elements attribution is in ../UPSTREAM.md.'];
notices.push(`\nBeCoder built-in grammar sources: ${grammarExtensions.join(', ')}; corresponding upstream notices follow.\n`, fs.readFileSync(path.join(root, '../../ThirdPartyNotices.txt'), 'utf8'));
for (const file of ['markdown-latex-combined-license.txt', 'cpp-bailout-license.txt']) { notices.push(fs.readFileSync(path.join(root, '../latex', file), 'utf8')); }
const shikiLanguages = path.join(root, 'node_modules/@shikijs/langs');
const shikiManifest = JSON.parse(fs.readFileSync(path.join(shikiLanguages, 'package.json'), 'utf8'));
notices.push(`\n@shikijs/langs@${shikiManifest.version} (MIT), TextMate grammar assets.\nhttps://registry.npmjs.org/@shikijs/langs/-/langs-${shikiManifest.version}.tgz\n`, fs.readFileSync(path.join(shikiLanguages, 'LICENSE'), 'utf8'));
notices.push('\nBeCoder C/C++ grammar assets (Better C++ Syntax, MIT).\n', fs.readFileSync(path.join(root, '../cpp/better-cpp-syntax-license.txt'), 'utf8'));
notices.push('\nBeCoder One Monokai (MIT).\n', fs.readFileSync(path.join(root, '../becoder.one-monokai/LICENSE'), 'utf8'));
notices.push('\nCaptain Who (Apache-2.0); adapted motion CSS, see ../UPSTREAM.md.\n', fs.readFileSync(path.join(root, 'licenses/captain-who.txt'), 'utf8'));
for (const [directory, pkg] of [...packages].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
	const files = fs.readdirSync(directory).filter(file => /^(license|licence|copying|notice)([.-]|$)/i.test(file) && fs.statSync(path.join(directory, file)).isFile());
	notices.push(`\n${pkg.name}@${pkg.version} (${pkg.license ?? 'See license'})\nhttps://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/').at(-1)}-${pkg.version}.tgz\n`);
	if (!files.length) {
		const fallback = pkg.name === '@ai-sdk/provider-utils' ? 'licenses/ai-elements.txt' : ['rehype-katex', 'remark-math'].includes(pkg.name) ? 'licenses/remark-math.txt' : undefined;
		if (!fallback) { throw new Error(`Missing bundled license: ${pkg.name}`); }
		notices.push(fs.readFileSync(path.join(root, fallback), 'utf8'));
	}
	for (const file of files) { notices.push(fs.readFileSync(path.join(directory, file), 'utf8')); }
}
fs.writeFileSync(path.join(root, 'dist/ThirdPartyNotices.txt'), notices.join('\n'));

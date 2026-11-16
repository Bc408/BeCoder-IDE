/* Copyright (c) BeCoder contributors. Licensed under GPL-3.0-or-later. */
import { build } from 'esbuild';
import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createSyntaxAssets } from '../becoder.shared/build/syntax.mts';
const syntax = await createSyntaxAssets(import.meta.dirname);
const content = { alias: { 'becoder-content': path.resolve('../becoder.shared/content/parser.ts'), katex: path.resolve('node_modules/katex') }, nodePaths: [path.resolve('node_modules')] };
const renderer = await build({ ...content, entryPoints: ['src/markdown.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', outfile: 'out/markdown.js', minify: true, metafile: true, legalComments: 'linked' });
const host = await build({ entryPoints: ['src/extension.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['vscode', './markdown'], outfile: 'out/extension.js', minify: true, metafile: true, legalComments: 'linked' });
const worker = await build({ entryPoints: ['../becoder.shared/browser/content/syntax.worker.ts'], bundle: true, platform: 'browser', format: 'iife', target: 'es2022', outfile: 'dist/syntax-worker.js', minify: true, metafile: true, plugins: [syntax.plugin()] });
syntax.emit(path.resolve('dist'));
const result = await build({ ...content, plugins: [syntax.plugin()], entryPoints: ['webview/main.tsx'], bundle: true, platform: 'browser', format: 'iife', target: 'es2022', outfile: 'dist/webview.js', minify: true, metafile: true });
// Resolve the nearest package owner; nested node_modules can contain different versions.
const packageRoots = new Set();
for (const file of [...Object.keys(result.metafile.inputs), ...Object.keys(host.metafile.inputs), ...Object.keys(renderer.metafile.inputs), ...Object.keys(worker.metafile.inputs)]) {
	const marker = file.lastIndexOf('node_modules/');
	if (marker < 0) { continue; }
	const tail = file.slice(marker + 'node_modules/'.length), parts = tail.split('/');
	packageRoots.add(file.slice(0, marker) + 'node_modules/' + parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/'));
}
const inventory = await Promise.all([...packageRoots].map(async root => {
	const value = JSON.parse(await readFile(root + '/package.json', 'utf8'));
	return { name: value.name, version: value.version, license: value.license };
}));
const dependencies = [...new Map(inventory.map(value => [value.name + '@' + value.version, value])).values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
await writeFile('dist/dependencies.json', JSON.stringify(dependencies, null, '\t') + '\n');
await mkdir('dist/fonts', { recursive: true });
const css = await readFile('webview/styles.css', 'utf8') + await readFile('../becoder.shared/browser/content/code.css', 'utf8');
await build({ stdin: { contents: css, loader: 'css', resolveDir: path.resolve('webview') }, bundle: true, outfile: 'dist/webview.css', target: 'chrome140', logLevel: 'warning' });
await cp('node_modules/katex/dist/katex.min.css', 'dist/katex.min.css');
await cp('node_modules/katex/dist/fonts', 'dist/fonts', { recursive: true });

/* Copyright (c) BeCoder contributors. Licensed under GPL-3.0-or-later. */
import { build } from 'esbuild';
import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const renderer = await build({ entryPoints: ['src/markdown.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', outfile: 'out/markdown.js', minify: true, metafile: true, legalComments: 'linked' });
const host = await build({ entryPoints: ['src/extension.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['vscode', './markdown'], outfile: 'out/extension.js', minify: true, metafile: true, legalComments: 'linked' });
const result = await build({ entryPoints: ['webview/main.tsx'], bundle: true, platform: 'browser', format: 'iife', target: 'es2022', outfile: 'dist/webview.js', minify: true, metafile: true });
// Resolve the nearest package owner; nested node_modules can contain different versions.
const packageRoots = new Set();
for (const file of [...Object.keys(result.metafile.inputs), ...Object.keys(host.metafile.inputs), ...Object.keys(renderer.metafile.inputs)]) {
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
// Same Highlight.js Base16 themes as Luogu's hljsTheme.ts. CSS selectors follow
// the host's live theme attribute without another script or extra runtime assets.
const theme = async (selector, name) => `${selector} {\n${await readFile(`node_modules/highlight.js/styles/base16/${name}.css`, 'utf8')}\n}`;
const light = 'body[data-vscode-theme-kind="vscode-light"], body[data-vscode-theme-kind="vscode-high-contrast-light"]';
const dark = 'body:not([data-vscode-theme-kind="vscode-light"]):not([data-vscode-theme-kind="vscode-high-contrast-light"])';
const css = await readFile('webview/styles.css', 'utf8') + await theme(light, 'tomorrow') + await theme(dark, 'tomorrow-night');
await build({ stdin: { contents: css, loader: 'css', resolveDir: path.resolve('webview') }, bundle: true, outfile: 'dist/webview.css', target: 'chrome140', logLevel: 'warning' });
await cp('node_modules/katex/dist/katex.min.css', 'dist/katex.min.css');
await cp('node_modules/katex/dist/fonts', 'dist/fonts', { recursive: true });

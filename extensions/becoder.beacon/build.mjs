/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = import.meta.dirname;
const shared = { absWorkingDir: root, bundle: true, minify: true, metafile: true, logLevel: 'info', legalComments: 'linked' };
const host = await build({ ...shared, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.cjs', platform: 'node', format: 'cjs', target: 'node22', external: ['vscode'] });
const ui = await build({ ...shared, entryPoints: ['webview/App.tsx'], outfile: 'dist/beacon.js', platform: 'browser', format: 'iife', target: 'chrome142', loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' }, assetNames: 'fonts/[name]-[hash]', define: { 'process.env.NODE_ENV': '"production"' } });
await build({ ...shared, entryPoints: ['test/session.test.ts'], outfile: 'dist-test/session.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });

// Distribute full dependency licenses alongside the bundled code, including transitive packages.
const packages = new Map();
for (const file of [...Object.keys(host.metafile.inputs), ...Object.keys(ui.metafile.inputs)]) {
	if (!file.includes('node_modules/')) { continue; }
	let directory = path.dirname(path.join(root, file));
	while (directory.startsWith(path.join(root, 'node_modules'))) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest)) {
			const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
			if (pkg.name && pkg.version) { packages.set(directory, pkg); break; }
		}
		directory = path.dirname(directory);
	}
}
const notices = ['Beacon bundled dependency notices. AI Elements attribution is in ../UPSTREAM.md.'];
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

/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createSyntaxAssets } from '../becoder.shared/build/syntax.mts';

const root = import.meta.dirname;
const shared = { absWorkingDir: root, nodePaths: [path.join(root, 'node_modules')], alias: { 'becoder-content': path.join(root, '../becoder.shared/content/parser.ts'), katex: path.join(root, 'node_modules/katex') }, bundle: true, minify: true, metafile: true, logLevel: 'info', legalComments: 'linked' };
const syntax = await createSyntaxAssets(root);
const syntaxAssets = syntax.plugin();
const { grammarExtensions } = syntax;
const host = await build({ ...shared, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.cjs', platform: 'node', format: 'cjs', target: 'node22', external: ['vscode'] });
const ui = await build({ ...shared, entryPoints: ['webview/App.tsx'], outfile: 'dist/beacon.js', platform: 'browser', format: 'iife', target: 'chrome142', plugins: [syntaxAssets], loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'dataurl' }, assetNames: 'fonts/[name]-[hash]', define: { 'process.env.NODE_ENV': '"production"' } });
const worker = await build({ ...shared, entryPoints: ['../becoder.shared/browser/content/syntax.worker.ts'], outfile: 'dist/syntax-worker.js', platform: 'browser', format: 'iife', target: 'chrome142', plugins: [syntaxAssets] });
syntax.emit(path.join(root, 'dist'));
fs.copyFileSync(path.join(root, '../becoder.shared/LICENSE'), path.join(root, 'dist/HoverLicense.txt'));
await build({ ...shared, entryPoints: ['test/session.test.ts'], outfile: 'dist-test/session.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false, plugins: [syntax.plugin(true)] });
await build({ ...shared, entryPoints: ['test/files.test.ts'], outfile: 'dist-test/files.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });
await build({ ...shared, entryPoints: ['test/context.test.ts'], outfile: 'dist-test/context.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });
await build({ ...shared, entryPoints: ['test/drafts.test.ts'], outfile: 'dist-test/drafts.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });
await build({ ...shared, entryPoints: ['test/models.test.ts'], outfile: 'dist-test/models.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });
await build({ ...shared, entryPoints: ['test/requestRecovery.test.ts'], outfile: 'dist-test/requestRecovery.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });
await build({ ...shared, entryPoints: ['test/web.test.ts'], outfile: 'dist-test/web.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });
await build({ ...shared, entryPoints: ['test/attachments.test.ts'], outfile: 'dist-test/attachments.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false, plugins: [{ name: 'test-vscode', setup(builder) { builder.onResolve({ filter: /^vscode$/ }, () => ({ path: path.join(root, 'test/vscodeMock.ts') })); } }] });
await build({ ...shared, entryPoints: ['test/settings.test.ts'], outfile: 'dist-test/settings.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false, plugins: [{ name: 'test-vscode', setup(builder) { builder.onResolve({ filter: /^vscode$/ }, () => ({ path: path.join(root, 'test/vscodeMock.ts') })); } }] });

await build({ ...shared, entryPoints: ['test/providerTests.test.ts'], outfile: 'dist-test/providerTests.test.cjs', platform: 'node', format: 'cjs', target: 'node22', minify: false });

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
const notices = [fs.readFileSync(path.join(root, 'licenses/lobe-icons.txt'), 'utf8'), 'Beacon bundled dependency notices. AI Elements attribution is in ../UPSTREAM.md.'];
notices.push('\nShared Markdown pipeline adapted from @luogu-saver-next/markdown-renderer 1.0.3; BeCoder changes remove HTML round trips, generate native callouts and keep code unhighlighted until display.\n', fs.readFileSync(path.join(root, '../becoder.shared/content/LICENSE.luogu-markdown.txt'), 'utf8'));
notices.push('\nShared content heading icon: Lucide pin (ISC); retained with shared parser provenance.\n', fs.readFileSync(path.join(root, '../becoder.shared/content/LICENSE.lucide.txt'), 'utf8'));
notices.push(`\nBeCoder built-in grammar sources: ${grammarExtensions.join(', ')}; corresponding upstream notices follow.\n`, fs.readFileSync(path.join(root, '../../ThirdPartyNotices.txt'), 'utf8'));
for (const file of ['markdown-latex-combined-license.txt', 'cpp-bailout-license.txt']) { notices.push(fs.readFileSync(path.join(root, '../latex', file), 'utf8')); }
const shikiLanguages = path.join(root, 'node_modules/@shikijs/langs');
const shikiManifest = JSON.parse(fs.readFileSync(path.join(shikiLanguages, 'package.json'), 'utf8'));
notices.push(`\n@shikijs/langs@${shikiManifest.version} (MIT), TextMate grammar assets.\nhttps://registry.npmjs.org/@shikijs/langs/-/langs-${shikiManifest.version}.tgz\n`, fs.readFileSync(path.join(shikiLanguages, 'LICENSE'), 'utf8'));
notices.push('\nBeCoder C/C++ grammar assets (Better C++ Syntax, MIT).\n', fs.readFileSync(path.join(root, '../cpp/better-cpp-syntax-license.txt'), 'utf8'));
notices.push('\nBeCoder One Monokai (MIT).\n', fs.readFileSync(path.join(root, '../becoder.one-monokai/LICENSE'), 'utf8'));
notices.push('\nCaptain Who (Apache-2.0); adapted motion CSS, see ../UPSTREAM.md.\n', fs.readFileSync(path.join(root, 'licenses/captain-who.txt'), 'utf8'));
for (const [directory, pkg] of [...packages].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
	const files = fs.readdirSync(directory).filter(file => /^(license|licence|copying|notices?)([.-]|$)/i.test(file) && fs.statSync(path.join(directory, file)).isFile());
	notices.push(`\n${pkg.name}@${pkg.version} (${pkg.license ?? 'See license'})\nhttps://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/').at(-1)}-${pkg.version}.tgz\n`);
	if (!files.length) {
		// Both math plugins are published by remarkjs/remark-math and share its
		// Junyoung Choi MIT license; their npm file lists omit the license.
		const fallback = {
			'@ai-sdk/provider-utils': 'licenses/ai-elements.txt',
			'remark-math': 'licenses/remark-math.txt',
			'rehype-katex': 'licenses/remark-math.txt',
			'retext': 'licenses/retext.txt',
			'retext-latin': 'licenses/retext.txt',
			'retext-stringify': 'licenses/retext.txt'
		}[pkg.name];
		if (!fallback) { throw new Error(`Missing bundled license: ${pkg.name}`); }
		notices.push(fs.readFileSync(path.join(root, fallback), 'utf8'));
	}
	for (const file of files) { notices.push(fs.readFileSync(path.join(directory, file), 'utf8')); }
}
fs.writeFileSync(path.join(root, 'dist/ThirdPartyNotices.txt'), notices.join('\n'));

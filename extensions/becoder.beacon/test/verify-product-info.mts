/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const extensionRoot = path.resolve(import.meta.dirname, '..');
const topics = ['overview', 'problems', 'runner', 'cph', 'notebook', 'oj-connect', 'beacon'];
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function verifyProductInfo(appRoot: string, sourceRoot = extensionRoot) {
	const app = path.resolve(appRoot, 'resources/app');
	const packaged = path.join(app, 'extensions/becoder.beacon');
	const manifest = JSON.parse(await readFile(path.join(app, 'package.json'), 'utf8'));
	const sourceManifest = JSON.parse(await readFile(path.resolve(sourceRoot, '../../package.json'), 'utf8'));
	if (!manifest.version || manifest.version !== sourceManifest.version) { throw new Error('stage-product-version-mismatch'); }
	const bundle = await readFile(path.join(packaged, 'dist/extension.cjs'));
	if (hash(bundle) !== hash(await readFile(path.join(sourceRoot, 'dist/extension.cjs')))) { throw new Error('stage-product-bundle-mismatch'); }
	const topicHashes: Record<string, string> = {};
	for (const topic of topics) {
		const relative = 'resources/product-info/' + topic + '.md';
		const bytes = await readFile(path.join(packaged, relative));
		if (!bytes.toString('utf8').trim() || hash(bytes) !== hash(await readFile(path.join(sourceRoot, relative)))) { throw new Error('stage-product-topic-mismatch:' + topic); }
		topicHashes[topic] = hash(bytes);
	}
	return { version: manifest.version, bundleSha256: hash(bundle), topicHashes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (process.argv.length !== 4 || process.argv[2] !== '--app') { throw new Error('Expected --app <stage-root>'); }
	verifyProductInfo(process.argv[3]).then(result => console.log(JSON.stringify(result, null, 2)), error => { console.error(error.message); process.exitCode = 1; });
}

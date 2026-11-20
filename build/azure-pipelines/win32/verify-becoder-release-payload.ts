/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { assertCleanBeCoderPackage } from '../../lib/becoderPackage.ts';

assert.ok(process.argv[2], 'A staged package path is required.');
const packagePath = path.resolve(process.argv[2]);
const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
assertCleanBeCoderPackage(packagePath);
const extensionPath = 'extensions/becoder.oj-connect';
function files(root: string, relative = ''): string[] {
	return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
		assert.ok(!entry.isSymbolicLink(), 'Unexpected runtime asset link: ' + entry.name);
		const target = path.join(relative, entry.name);
		return entry.isDirectory() ? files(root, target) : [target];
	}).sort();
}
for (const directory of ['dist/grammars', 'dist/fonts']) {
	const source = path.join(repositoryRoot, extensionPath, directory), target = path.join(packagePath, 'resources/app', extensionPath, directory);
	const expected = files(source);
	assert.ok(expected.length > 0, 'Empty source runtime assets: ' + directory);
	assert.deepStrictEqual(files(target), expected, 'Runtime asset set differs: ' + directory);
	for (const file of expected) { assert.ok(fs.readFileSync(path.join(source, file)).equals(fs.readFileSync(path.join(target, file))), 'Runtime asset differs: ' + directory + '/' + file); }
}
const require = createRequire(import.meta.url);
const asar = require('asar') as { extractFile(archive: string, file: string): Buffer };
const acorn = JSON.parse(asar.extractFile(path.join(packagePath, 'resources/app/node_modules.asar'), 'acorn/package.json').toString('utf8'));
assert.strictEqual(acorn.version, '8.16.0');
assert.strictEqual(acorn.license, 'MIT');
console.log('Release payload is clean; OJ grammar/font assets and packaged Acorn match approved sources.');

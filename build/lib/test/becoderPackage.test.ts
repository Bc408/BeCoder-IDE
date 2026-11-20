/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';

test('release payload accepts only the seeded data and onboarding source', async t => {
	const { assertCleanBeCoderPackage } = await import('../becoderPackage.ts');
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-payload-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	fs.mkdirSync(path.join(root, 'data/toolchains'), { recursive: true });
	fs.mkdirSync(path.join(root, 'coding'));
	fs.writeFileSync(path.join(root, 'coding/helloCoder.cpp'), 'onboarding');
	fs.writeFileSync(path.join(root, 'data/.becoder-data-root'), 'marker');
	fs.writeFileSync(path.join(root, 'data/.becoder-open-hello-coder'), '');
	assert.doesNotThrow(() => assertCleanBeCoderPackage(root));
	for (const relative of ['data/user-data', 'data/shared-data', 'data/extensions', 'tmp']) {
		fs.mkdirSync(path.join(root, relative));
		assert.throws(() => assertCleanBeCoderPackage(root), /Unexpected release payload/);
		fs.rmdirSync(path.join(root, relative));
	}
	fs.writeFileSync(path.join(root, 'data/argv.json'), '{}');
	assert.throws(() => assertCleanBeCoderPackage(root), /Unexpected release payload/);
	fs.unlinkSync(path.join(root, 'data/argv.json'));
	fs.writeFileSync(path.join(root, 'coding/solution.cpp'), 'user source');
	assert.throws(() => assertCleanBeCoderPackage(root), /Unexpected release payload/);
	fs.unlinkSync(path.join(root, 'coding/solution.cpp'));
	fs.writeFileSync(path.join(root, 'debug.log'), 'runtime log');
	assert.throws(() => assertCleanBeCoderPackage(root), /Unexpected release payload/);
});

test('release verification reads Acorn at the actual ASAR root', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-release-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const repository = path.resolve(import.meta.dirname, '../../..'), app = path.join(root, 'resources/app');
	fs.mkdirSync(path.join(root, 'data/toolchains'), { recursive: true });
	fs.mkdirSync(path.join(root, 'coding'));
	for (const directory of ['grammars', 'fonts']) {
		fs.cpSync(path.join(repository, 'extensions/becoder.oj-connect/dist', directory), path.join(app, 'extensions/becoder.oj-connect/dist', directory), { recursive: true });
	}
	const packages = path.join(os.tmpdir(), path.basename(root) + '-modules');
	t.after(() => fs.rmSync(packages, { recursive: true, force: true }));
	fs.mkdirSync(path.join(packages, 'acorn'), { recursive: true });
	fs.writeFileSync(path.join(packages, 'acorn/package.json'), JSON.stringify({ name: 'acorn', version: '8.16.0', license: 'MIT' }));
	const require = createRequire(import.meta.url);
	await require('asar').createPackage(packages, path.join(app, 'node_modules.asar'));
	const result = spawnSync(process.execPath, [path.join(repository, 'build/azure-pipelines/win32/verify-becoder-release-payload.ts'), root], { encoding: 'utf8', windowsHide: true });
	assert.strictEqual(result.status, 0, result.stdout + result.stderr);
});

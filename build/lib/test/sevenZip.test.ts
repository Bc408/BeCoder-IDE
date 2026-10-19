/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import { suite, test } from 'node:test';
import { isSevenZipPlatformFile, verifySevenZipPackage } from '../sevenZip.ts';

const require = createRequire(import.meta.url);
const asar = require('asar') as {
	createPackageWithOptions(source: string, destination: string, options: { unpack?: string }): Promise<void>;
};
const foreignFiles = [
	'linux/arm/7za', 'linux/arm64/7za', 'linux/ia32/7za', 'linux/x64/7za',
	'linux/x64/build.sh', 'linux/x64/do-build.sh', 'mac/arm64/7za', 'mac/x64/7za',
	'win/arm64/7za.exe', 'win/ia32/7za.exe',
];
const retainedFiles = ['7x.sh', 'LICENSE.txt', 'index.js', 'package.json', 'win/x64/7za.exe'];

suite('7zip Windows x64 package', () => {
	test('excludes only the ten reviewed foreign files for the x64 target', () => {
		assert.deepStrictEqual(foreignFiles.map(file => isSevenZipPlatformFile(`node_modules/7zip-bin/${file}`, 'win32', 'x64')), [false, false, false, false, false, false, false, false, false, false]);
		assert.deepStrictEqual(retainedFiles.map(file => isSevenZipPlatformFile(`node_modules/7zip-bin/${file}`, 'win32', 'x64')), [true, true, true, true, true]);
	});

	test('normalizes Windows separators while preserving unrelated and unknown paths', () => {
		assert.strictEqual(isSevenZipPlatformFile('node_modules\\7zip-bin\\win\\arm64\\7za.exe', 'win32', 'x64'), false);
		for (const file of ['node_modules/7zip-bin/linux/new-arch/7za', 'node_modules/7zip-bin/win/x64/new-helper.exe', 'node_modules/other/linux/x64/7za', 'node_modules/other/node_modules/7zip-bin/linux/x64/7za', 'extensions/node_modules/7zip-bin/linux/x64/7za']) {
			assert.strictEqual(isSevenZipPlatformFile(file, 'win32', 'x64'), true, file);
		}
	});

	test('does not use the build host or alter other target distributions', () => {
		for (const [platform, arch] of [['win32', 'arm64'], ['win32', 'ia32'], ['darwin', 'x64'], ['linux', 'x64'], ['future', 'future']]) {
			assert.strictEqual(isSevenZipPlatformFile('node_modules/7zip-bin/linux/x64/7za', platform, arch), true);
			assert.strictEqual(isSevenZipPlatformFile('node_modules/7zip-bin/win/x64/7za.exe', platform, arch), true);
		}
	});

	async function fixture(change: (files: Record<string, Buffer>, source: Record<string, Buffer>) => void, unpack?: string): Promise<void> {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-sevenzip-'));
		try {
			const sourcePackageRoot = path.join(root, 'source');
			const archiveRoot = path.join(root, 'archive');
			const executable = Buffer.alloc(256);
			executable.write('MZ'); executable.writeUInt32LE(128, 60); executable.write('PE\0\0', 128); executable.writeUInt16LE(0x8664, 132);
			const source: Record<string, Buffer> = {
				'7x.sh': Buffer.from('script'), 'LICENSE.txt': Buffer.from('license'), 'index.js': Buffer.from('exports.path7za = "win/x64/7za.exe";'),
				'package.json': Buffer.from(JSON.stringify({ name: '7zip-bin', version: '5.2.0' })), 'win/x64/7za.exe': executable,
			};
			const files = Object.fromEntries(Object.entries(source).map(([name, contents]) => [name, Buffer.from(contents)]));
			change(files, source);
			for (const [directory, entries] of [[sourcePackageRoot, source], [path.join(archiveRoot, '7zip-bin'), files]] as const) {
				for (const [name, contents] of Object.entries(entries)) {
					const target = path.join(directory, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, contents);
				}
			}
			const archive = path.join(root, 'modules.asar');
			await asar.createPackageWithOptions(archiveRoot, archive, unpack ? { unpack } : {});
			verifySevenZipPackage(archive, sourcePackageRoot);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		}
	}

	test('verifies the retained real ASAR contents against the source package', async () => {
		await fixture(() => { });
	});

	test('rejects a foreign file that leaks through packaging', async () => {
		await assert.rejects(fixture(files => { files['linux/x64/7za'] = Buffer.from('foreign'); }), /inventory/i);
	});

	test('rejects missing retained metadata or scripts', async () => {
		await assert.rejects(fixture(files => { delete files['7x.sh']; }), /inventory/i);
	});

	test('rejects new unaudited package files', async () => {
		await assert.rejects(fixture(files => { files['win/x64/new-helper.exe'] = Buffer.from('new'); }), /inventory/i);
	});

	test('rejects an altered target executable', async () => {
		await assert.rejects(fixture(files => { files['win/x64/7za.exe'][200] = 1; }), /content/i);
	});

	test('rejects an unpacking layout change', async () => {
		await assert.rejects(fixture(() => { }, '**/*.exe'), /packed/i);
	});

	test('requires a new audit when the source package version changes', async () => {
		await assert.rejects(fixture((files, source) => { source['package.json'] = files['package.json'] = Buffer.from('{"name":"7zip-bin","version":"6.0.0"}'); }), /version/i);
	});

	test('rejects a non-x64 helper even if its source bytes match', async () => {
		await assert.rejects(fixture((files, source) => { files['win/x64/7za.exe'].writeUInt16LE(0xaa64, 132); source['win/x64/7za.exe'] = files['win/x64/7za.exe']; }), /AMD64/i);
	});
});

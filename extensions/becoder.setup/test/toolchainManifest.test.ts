/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { maximumToolchainManifestFiles, validateToolchainManifest } from '../src/toolchainManifest';

suite('BeCoder toolchain manifest', () => {
	test('rejects malformed entries without dereferencing untrusted properties', () => {
		for (const file of [null, {}, { path: 7 }, { path: '../g++.exe', size: 1, sha256: '0'.repeat(64) }]) {
			const result = validateToolchainManifest({
				schemaVersion: 2,
				toolchainVersion: 'gcc-16.2.0-clangd-22.1.6',
				files: [file]
			});
			assert.strictEqual(result.manifest, undefined);
			assert.match(result.issue ?? '', /invalid file entry/i);
		}
	});

	test('accepts a complete entry shape', () => {
		const manifest = {
			schemaVersion: 2,
			toolchainVersion: 'gcc-16.2.0-clangd-22.1.6',
			files: [{ path: 'ucrt64/bin/g++.exe', size: 1, sha256: '0'.repeat(64) }]
		};
		assert.deepStrictEqual(validateToolchainManifest(manifest).manifest, manifest);
	});

	test('rejects an independently oversized file list', () => {
		const file = { path: 'ucrt64/bin/g++.exe', size: 1, sha256: '0'.repeat(64) };
		const result = validateToolchainManifest({
			schemaVersion: 2,
			toolchainVersion: 'gcc-16.2.0-clangd-22.1.6',
			files: Array.from({ length: maximumToolchainManifestFiles + 1 }, () => file)
		});
		assert.strictEqual(result.manifest, undefined);
		assert.match(result.issue ?? '', /too many files/i);
	});
});

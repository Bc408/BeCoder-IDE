/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { isNodePtyPlatformFile } from '../nodePty.ts';

suite('node-pty package platform', () => {
	test('keeps Windows x64 ConPTY files and excludes foreign native binaries', () => {
		const files = [
			'node_modules/node-pty/prebuilds/win32-x64/conpty.node',
			'node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll',
			'node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe',
			'node_modules\\node-pty\\prebuilds\\win32-x64\\conpty.node',
			'node_modules/node-pty/prebuilds/linux-x64/pty.node',
			'node_modules/node-pty/prebuilds/darwin-arm64/pty.node',
			'node_modules/node-pty/prebuilds/win32-arm64/conpty.node',
			'node_modules/node-pty/prebuilds/future-platform/pty.node',
			'node_modules/node-pty/lib/worker/conoutSocketWorker.js',
			'node_modules/node-pty/package.json',
			'node_modules/@vscode/spdlog/build/Release/spdlog.node',
		];
		assert.deepStrictEqual(files.map(file => isNodePtyPlatformFile(file, 'win32', 'x64')), [
			true, true, true, true, false, false, false, false, true, true, true,
		]);
	});

	test('uses the target platform rather than the build host', () => {
		assert.strictEqual(isNodePtyPlatformFile('node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper', 'darwin', 'arm64'), true);
		assert.strictEqual(isNodePtyPlatformFile('node_modules/node-pty/prebuilds/win32-x64/conpty.node', 'darwin', 'arm64'), false);
		assert.strictEqual(isNodePtyPlatformFile('node_modules/node-pty/prebuilds/linux-arm/pty.node', 'linux', 'armhf'), true);
		assert.strictEqual(isNodePtyPlatformFile('node_modules/node-pty/prebuilds/linux-x64/pty.node', 'linux', 'alpine'), true);
	});
});

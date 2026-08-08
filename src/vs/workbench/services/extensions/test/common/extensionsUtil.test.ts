/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { ExtensionIdentifier, IExtensionDescription, TargetPlatform } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { dedupExtensions } from '../../common/extensionsUtil.js';

function extension(id: string, version: string, isBuiltin: boolean, location: string): IExtensionDescription {
	const [publisher, name] = id.split('.', 2);
	return {
		name,
		publisher,
		version,
		engines: { vscode: '^1.0.0' },
		identifier: new ExtensionIdentifier(id),
		extensionLocation: URI.file(location),
		isBuiltin,
		isUnderDevelopment: false,
		isUserBuiltin: false,
		activationEvents: ['*'],
		main: 'index.js',
		targetPlatform: TargetPlatform.UNDEFINED,
		extensionDependencies: [],
		preRelease: false,
	};
}

suite('dedupExtensions - BeCoder protected builtins', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps bundled clangd over a newer user extension', () => {
		const builtin = extension('llvm-vs-code-extensions.vscode-clangd', '0.6.0', true, '/builtin/clangd');
		const user = extension('llvm-vs-code-extensions.vscode-clangd', '99.0.0', false, '/user/clangd');
		const result = dedupExtensions([builtin], [user], [], [], new NullLogService());
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].extensionLocation.fsPath, builtin.extensionLocation.fsPath);
	});

	test('keeps bundled Runner over a workspace extension', () => {
		const builtin = extension('becoder.runner', '0.2.0', true, '/builtin/runner');
		const workspace = extension('becoder.runner', '99.0.0', false, '/workspace/runner');
		const result = dedupExtensions([builtin], [], [workspace], [], new NullLogService());
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].extensionLocation.fsPath, builtin.extensionLocation.fsPath);
	});

	test('keeps bundled One Monokai over user and workspace extensions', () => {
		const builtin = extension('becoder.one-monokai', '1.0.0', true, '/builtin/one-monokai');
		const user = extension('becoder.one-monokai', '99.0.0', false, '/user/one-monokai');
		const workspace = extension('becoder.one-monokai', '99.0.0', false, '/workspace/one-monokai');
		const result = dedupExtensions([builtin], [user], [workspace], [], new NullLogService());
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].extensionLocation.fsPath, builtin.extensionLocation.fsPath);
	});

	test('keeps bundled GCC diagnostics over user and workspace extensions', () => {
		const builtin = extension('becoder.gcc-diagnostics', '0.1.0', true, '/builtin/gcc-diagnostics');
		const user = extension('becoder.gcc-diagnostics', '99.0.0', false, '/user/gcc-diagnostics');
		const workspace = extension('becoder.gcc-diagnostics', '99.0.0', false, '/workspace/gcc-diagnostics');
		const result = dedupExtensions([builtin], [user], [workspace], [], new NullLogService());
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].extensionLocation.fsPath, builtin.extensionLocation.fsPath);
	});

	test('keeps every remaining protected content extension over user copies', () => {
		for (const id of ['adpyke.codesnap', 'vscode.cpp', 'ms-ceintl.vscode-language-pack-zh-hans']) {
			const builtin = extension(id, '1.0.0', true, `/builtin/${id}`);
			const user = extension(id, '99.0.0', false, `/user/${id}`);
			const workspace = extension(id, '99.0.0', false, `/workspace/${id}`);
			const result = dedupExtensions([builtin], [user], [workspace], [], new NullLogService());
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].extensionLocation.fsPath, builtin.extensionLocation.fsPath);
		}
	});

	test('still allows an extension under development to replace a protected builtin', () => {
		const builtin = extension('becoder.becoder-setup', '0.1.0', true, '/builtin/setup');
		const development = extension('becoder.becoder-setup', '0.1.0', false, '/development/setup');
		const result = dedupExtensions([builtin], [], [], [development], new NullLogService());
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].extensionLocation.fsPath, development.extensionLocation.fsPath);
	});
});

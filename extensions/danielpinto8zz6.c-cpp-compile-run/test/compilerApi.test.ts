/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { createRequire } from 'module';
import { test } from 'node:test';
import { buildCompilerArguments } from '../src/compilation';
import type { RunnerSettings } from '../src/compiler';

test('Runner compiler API reads current shared settings and returns the Run command', () => {
	const entry = path.resolve(__dirname, '../src/extension.js');
	const nativeRequire = createRequire(entry);
	const settings: RunnerSettings = { cStandard: 'c17', cppStandard: 'c++20', cFlags: [], cppFlags: ['-DUSER_FLAG'] };
	const exports: any = {};
	const disposable = { dispose() { } };
	new vm.Script(`(function(require,exports){${fs.readFileSync(entry, 'utf8')}\n})`).runInThisContext()((id: string) => {
		if (id === 'vscode') {
			return { window: { registerTerminalProfileProvider: () => disposable }, commands: { registerCommand: () => disposable } };
		}
		if (id === './compile-run-manager') { return { CompileRunManager: class { dispose() { } } }; }
		if (id === './compiler') { return { bundledCompiler: () => 'C:\\BeCoder\\bin\\g++.exe', runnerSettings: () => settings }; }
		return nativeRequire(id);
	}, exports);
	const api = exports.activate({ subscriptions: [] });
	for (const standard of ['c++20', 'c++17']) {
		Object.assign(settings, { cppStandard: standard });
		const plan = api.prepareCompilation('C:\\src\\a.cpp', 'C:\\private\\a.exe', 'C:\\private');
		assert.deepStrictEqual(plan.args, buildCompilerArguments({ path: 'C:\\src\\a.cpp', language: 'cpp' }, settings, 'C:\\private\\a.exe'));
		assert.ok(plan.environment.PATH.startsWith('C:\\BeCoder\\bin'));
	}
	assert.throws(() => api.prepareCompilation('a.py', 'a.exe', 'private'));
});

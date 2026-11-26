/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *---------------------------------------------------------------------------------------------
 *  Modifications Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as os from 'os';
import { createRequire } from 'module';
import { test } from 'node:test';
import { buildCompilerArguments } from '../src/compilation';
import type { RunnerSettings } from '../src/compiler';

for (const [producer, reason] of [
	['cph', 'beacon-run-record-too-large'], ['cph', 'Error: beacon-record-publication-uncertain'],
	['notebook', 'beacon-run-record-too-large'], ['notebook', 'Error: beacon-record-publication-uncertain']
] as const) {
	test(`${producer} evidence delegates ${reason} to its owner exactly once`, async () => {
		const entry = path.resolve(__dirname, '../src/extension.js');
		const nativeRequire = createRequire(entry), exports: any = {}, notices: string[] = [];
		const failure = new Error(reason), failures: unknown[] = [];
		const disposable = { dispose() { } };
		new vm.Script(`(function(require,exports){${fs.readFileSync(entry, 'utf8')}\n})`).runInThisContext()((id: string) => {
			if (id === 'vscode') { return { l10n: { t: (text: string) => text }, window: { registerTerminalProfileProvider: () => disposable, showWarningMessage: async (text: string) => { notices.push(text); } }, commands: { registerCommand: () => disposable, executeCommand: async () => { throw failure; } } }; }
			if (id === './compile-run-manager') { return { CompileRunManager: class { dispose() { } } }; }
			if (id === './compiler') { return { bundledCompiler: () => 'C:/BeCoder/bin/g++.exe', runnerSettings: () => ({}) }; }
			return nativeRequire(id);
		}, exports);
		const api = exports.activate({ subscriptions: [] });
		const evidence = api.createEvidence('handle', producer, (error: unknown) => { failures.push(error); });
		evidence.start({ originalPath: 'C:/main.cpp', bytesBase64: Buffer.from('int main(){}').toString('base64') }, { inputs: [{ input: '', output: '' }] });
		evidence.event({ type: 'compiled', exitCode: 0 });
		await evidence.finish({ status: 'completed', exitCode: 0 });
		await evidence.finish({ status: 'completed', exitCode: 0 });
		assert.deepStrictEqual(failures, [failure]);
		assert.deepStrictEqual(notices, [], 'the evidence API must not add a second, source-independent notification');
	});
}

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

test('Runner captured compiler API exposes the exact bytes used by its private plan', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-captured-api-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const source = path.join(root, 'main.cpp');
	fs.writeFileSync(source, '// V1\n');
	const entry = path.resolve(__dirname, '../src/extension.js');
	const nativeRequire = createRequire(entry);
	const exports: any = {};
	const disposable = { dispose() { } };
	new vm.Script(`(function(require,exports){${fs.readFileSync(entry, 'utf8')}\n})`).runInThisContext()((id: string) => {
		if (id === 'vscode') { return { window: { registerTerminalProfileProvider: () => disposable }, commands: { registerCommand: () => disposable } }; }
		if (id === './compile-run-manager') { return { CompileRunManager: class { dispose() { } } }; }
		if (id === './compiler') { return { bundledCompiler: () => 'C:\\BeCoder\\bin\\g++.exe', runnerSettings: (): RunnerSettings => ({ cStandard: 'c17', cppStandard: 'c++20', cFlags: [], cppFlags: [] }) }; }
		return nativeRequire(id);
	}, exports);
	const api = exports.activate({ subscriptions: [] });
	assert.strictEqual(typeof api.prepareCapturedCompilation, 'function');
	const plan = await api.prepareCapturedCompilation(source, path.join(root, 'program.exe'), root);
	fs.writeFileSync(source, '// V2\n');
	assert.strictEqual(fs.readFileSync(plan.sourceSnapshot.path, 'utf8'), '// V1\n');
	assert.strictEqual(Buffer.from(plan.sourceSnapshot.bytesBase64, 'base64').toString('utf8'), '// V1\n');
	assert.strictEqual(plan.sourceSnapshot.originalPath, source);
	assert.ok(plan.args.includes(plan.sourceSnapshot.path));
	assert.ok(!plan.args.includes(source));
	await assert.rejects(api.prepareCapturedCompilation('a.py', 'a.exe', root));
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { CompilerRunner } = require('../out-test/src/compilerRunner.js');
const { byteRangeToUtf16 } = require('../out-test/src/diagnosticModel.js');
const { DiagnosticStore } = require('../out-test/src/diagnosticStore.js');

(async () => {
	const packageRoot = path.resolve(process.argv[2]);
	assert.ok(fs.statSync(path.join(packageRoot, 'data/toolchains/ucrt64/bin/g++.exe')).isFile());
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-sarif-'));
	const source = path.join(temporary, '中文 space');
	fs.mkdirSync(source);
	const filePath = path.join(source, 'main.cpp');
	const saved = 'int main() { return 0; }\n';
	fs.writeFileSync(filePath, saved);
	const runner = new CompilerRunner({
		extensionPath: path.join(packageRoot, 'resources/app/extensions/becoder.gcc-diagnostics'),
		globalStorageUri: { fsPath: path.join(temporary, 'storage') }
	});
	let version = 0;
	const originalRun = runner.runCompilerProcess.bind(runner);
	runner.runCompilerProcess = async (...args) => {
		const result = await originalRun(...args);
		if (process.argv.includes('--inspect')) {
			const report = JSON.parse(result.stderr);
			console.log(JSON.stringify({ arguments: args[1], columnKind: report.runs[0].columnKind, results: report.runs[0].results }));
		}
		return result;
	};
	async function run(text) {
		const target = { uri: pathToFileURL(filePath).toString(), version: ++version, filePath, language: 'cpp', text };
		const result = await runner.run(target, new AbortController().signal, 0);
		assert.strictEqual(result.kind, 'success', JSON.stringify(result));
		return result.value.errors;
	}
	try {
		const text = 'int main() { /*你😀*/ return x; }\n';
		const errors = await run(text);
		assert.strictEqual(errors.length, 1);
		assert.strictEqual(errors[0].range.start.filePath, filePath);
		const range = byteRangeToUtf16(text, errors[0].range);
		assert.deepStrictEqual(range, { startLine: 0, startCharacter: text.indexOf('x'), endLine: 0, endCharacter: text.indexOf('x') + 1 });
		assert.strictEqual(fs.readFileSync(filePath, 'utf8'), saved);
		for (const prefix of ['\t', ' /*e\u0301*/ ', ' /*你😀*/\t', ' /*👩\u200d💻*/ ']) {
			const sample = `int main() {${prefix}return x; }\n`;
			const [diagnostic] = await run(sample);
			const position = byteRangeToUtf16(sample, diagnostic.range);
			assert.strictEqual(position.startCharacter, sample.indexOf('x'), JSON.stringify({ sample, position, diagnostic }));
			assert.strictEqual(position.endCharacter, sample.indexOf('x') + 1);
		}
		const store = new DiagnosticStore();
		store.replace(filePath, new Map([[filePath, errors]]));
		const corrected = await run(saved);
		assert.deepStrictEqual(corrected, []);
		store.replace(filePath, new Map());
		assert.deepStrictEqual(store.merged(filePath), []);
		const debugErrors = await run('#include<bits/stdc++.h>\nint main() { int x=1; debug(x); return 0; }\n');
		assert.deepStrictEqual(debugErrors, []);
		const undeclaredDebug = await run('#include<bits/stdc++.h>\nint main() { debug(x); return 0; }\n');
		assert.ok(undeclaredDebug.some(error => error.message.includes('x')));
		const mismatch = await run('int main() { int x="text"; return x; }\n');
		assert.ok(mismatch.some(error => error.message.includes('invalid conversion')));
		console.log('Passed real CompilerRunner: unsaved text, Chinese path, UTF16 x range, clean replacement, debug and type errors.');
	} finally {
		runner.dispose();
		// The unique directory is created by this probe; no user paths are removed.
		fs.rmSync(temporary, { recursive: true, force: true });
	}
})().catch(error => { console.error(error); process.exitCode = 1; });

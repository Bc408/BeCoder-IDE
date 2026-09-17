/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as path from 'path';
import { suite, test } from 'node:test';

import { DiagnosticTarget, diagnosticArguments } from '../src/compilerRunner';
import { privateCompilerEnvironment, resolveToolchainRoot } from '../src/toolchain';

suite('bundled GCC boundary', () => {
	test('uses fixed Stage 4.2 C++ arguments without warning flags', () => {
		const target: DiagnosticTarget = {
			uri: 'file:///D:/contest/main.cpp',
			version: 1,
			filePath: 'D:\\contest\\main.cpp',
			language: 'cpp',
			text: ''
		};
		const arguments_ = diagnosticArguments(target, 'C:\\private\\main.cpp', 'C:\\private');
		assert.ok(arguments_.includes('-fsyntax-only'));
		assert.ok(arguments_.includes('-O2'));
		assert.deepStrictEqual(arguments_.slice(arguments_.indexOf('-x'), arguments_.indexOf('-x') + 2), ['-x', 'c++']);
		assert.ok(arguments_.includes('-std=c++20'));
		assert.ok(arguments_.includes('-DDEBUG'));
		assert.ok(arguments_.includes('-DDEBUGER_H'));
		assert.deepStrictEqual(arguments_.slice(arguments_.indexOf('-I'), arguments_.indexOf('-I') + 2), [
			'-I', path.join('C:\\private', 'diagnostic-include')
		]);
		assert.ok(arguments_.includes('-fdiagnostics-format=json'));
		assert.ok(arguments_.includes('-fdiagnostics-color=never'));
		assert.ok(arguments_.includes('-iquote'));
		assert.ok(arguments_.includes('D:\\contest'));
		assert.ok(arguments_.includes('-fmacro-prefix-map=C:\\private=D:\\contest'));
		assert.ok(!arguments_.some(argument => argument === '-Wall' || argument === '-Werror' || argument === '-pedantic'));
		assert.strictEqual(arguments_.at(-1), 'C:\\private\\main.cpp');
	});

	test('forces the language instead of trusting a mixed-case mirror suffix', () => {
		const cppTarget: DiagnosticTarget = {
			uri: 'file:///D:/contest/main.Cpp',
			version: 1,
			filePath: 'D:\\contest\\main.Cpp',
			language: 'cpp',
			text: ''
		};
		const cTarget: DiagnosticTarget = { ...cppTarget, uri: 'file:///D:/contest/main.C', filePath: 'D:\\contest\\main.C', language: 'c' };
		const cppArguments = diagnosticArguments(cppTarget, 'C:\\private\\main.Cpp', 'C:\\private');
		const cArguments = diagnosticArguments(cTarget, 'C:\\private\\main.C', 'C:\\private');
		assert.deepStrictEqual(cppArguments.slice(cppArguments.indexOf('-x'), cppArguments.indexOf('-x') + 2), ['-x', 'c++']);
		assert.deepStrictEqual(cArguments.slice(cArguments.indexOf('-x'), cArguments.indexOf('-x') + 2), ['-x', 'c']);
	});

	test('selects C17 for C translation units', () => {
		const target: DiagnosticTarget = {
			uri: 'file:///D:/contest/main.c',
			version: 1,
			filePath: 'D:\\contest\\main.c',
			language: 'c',
			text: ''
		};
		const arguments_ = diagnosticArguments(target, 'C:\\private\\main.c', 'C:\\private');
		assert.ok(arguments_.includes('-std=c17'));
		assert.ok(!arguments_.includes('-DDEBUGER_H'));
		assert.ok(!arguments_.includes('-I'));
	});

	test('prefers packaged and portable BeCoder toolchain roots', () => {
		const extensionPath = path.join('C:\\package', 'resources', 'app', 'extensions', 'becoder.gcc-diagnostics');
		const packaged = path.join('C:\\package', 'data', 'toolchains');
		assert.strictEqual(resolveToolchainRoot(extensionPath, 'C:\\user\\globalStorage\\becoder.gcc-diagnostics', undefined,
			candidate => path.normalize(candidate) === path.normalize(packaged)), path.normalize(packaged));
		assert.strictEqual(resolveToolchainRoot(extensionPath, 'C:\\user\\globalStorage\\becoder.gcc-diagnostics', 'D:\\BeCoderData',
			() => false), path.join('D:\\BeCoderData', 'toolchains'));
	});

	test('builds a private allowlisted compiler environment', () => {
		const compiler = 'C:\\BeCoder\\toolchains\\ucrt64\\bin\\g++.exe';
		const environment = privateCompilerEnvironment('C:\\BeCoder\\diagnostics', compiler);
		assert.strictEqual(environment['HOME'], 'C:\\BeCoder\\diagnostics\\user');
		assert.strictEqual(environment['TEMP'], 'C:\\BeCoder\\diagnostics\\tmp');
		assert.ok(environment['PATH'].startsWith(path.dirname(compiler) + path.delimiter));
		assert.strictEqual(environment['CLANGD_FLAGS'], undefined);
		assert.strictEqual(environment['CPLUS_INCLUDE_PATH'], undefined);
	});
});

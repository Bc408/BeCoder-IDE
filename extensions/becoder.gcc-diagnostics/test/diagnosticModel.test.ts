/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as path from 'path';
import { suite, test } from 'node:test';

import { byteRangeToUtf16, parseGccDiagnostics } from '../src/diagnosticModel';

const sourcePath = 'D:\\contest\\main.cpp';
const mirrorPath = 'C:\\BeCoder\\private\\main.cpp';

function point(file: string, line: number, byteColumn: number): object {
	return { file, line, column: byteColumn, 'byte-column': byteColumn };
}

function location(file: string, line: number, start: number, finish = start): object {
	return {
		caret: point(file, line, start),
		start: point(file, line, start),
		finish: point(file, line, finish)
	};
}

suite('GCC diagnostic model', () => {
	test('keeps errors, filters warnings, maps the mirror, and attaches notes', () => {
		const output = JSON.stringify([
			{
				kind: 'error',
				message: 'not declared',
				locations: [location(mirrorPath, 3, 2), location('D:\\contest\\header.h', 1, 1)],
				children: [{ kind: 'note', message: 'declared here', locations: [location('D:\\contest\\types.h', 4, 5)] }]
			},
			{ kind: 'warning', message: 'unused variable', locations: [location(mirrorPath, 7, 3)] },
			{ kind: 'fatal error', message: 'missing.h: No such file', locations: [location(mirrorPath, 1, 10)] }
		]);

		const diagnostics = parseGccDiagnostics(output, mirrorPath, sourcePath);
		assert.strictEqual(diagnostics.length, 2);
		assert.strictEqual(diagnostics[0].range.start.filePath, sourcePath);
		assert.deepStrictEqual(diagnostics[0].related.map(item => item.message), ['not declared', 'declared here']);
		assert.strictEqual(diagnostics[1].message, 'missing.h: No such file');
	});

	test('resolves relative include paths beside the original source', () => {
		const diagnostics = parseGccDiagnostics(JSON.stringify([{
			kind: 'error',
			message: 'header error',
			locations: [location('include\\local.h', 2, 4)]
		}]), mirrorPath, sourcePath);

		assert.strictEqual(diagnostics[0].range.start.filePath, path.resolve('D:\\contest', 'include\\local.h'));
	});

	test('deduplicates identical GCC records', () => {
		const entry = { kind: 'error', message: 'duplicate', locations: [location(mirrorPath, 1, 1)] };
		assert.strictEqual(parseGccDiagnostics(JSON.stringify([entry, entry]), mirrorPath, sourcePath).length, 1);
	});

	test('rejects missing or malformed structured output', () => {
		assert.throws(() => parseGccDiagnostics('', mirrorPath, sourcePath), /no structured/);
		assert.throws(() => parseGccDiagnostics('{', mirrorPath, sourcePath), /malformed/);
		assert.throws(() => parseGccDiagnostics('{}', mirrorPath, sourcePath), /top-level array/);
	});

	test('converts GCC UTF-8 byte columns to VS Code UTF-16 columns', () => {
		const range = byteRangeToUtf16('a你😀z', {
			start: { filePath: sourcePath, line: 1, byteColumn: 5 },
			end: { filePath: sourcePath, line: 1, byteColumn: 5 }
		});
		assert.deepStrictEqual(range, {
			startLine: 0,
			startCharacter: 2,
			endLine: 0,
			endCharacter: 4
		});
	});

	test('clamps malformed cross-file finishes to the diagnostic start', () => {
		const diagnostics = parseGccDiagnostics(JSON.stringify([{
			kind: 'error',
			message: 'macro error',
			locations: [{
				caret: point(mirrorPath, 2, 3),
				start: point(mirrorPath, 2, 3),
				finish: point('D:\\contest\\macro.h', 1, 1)
			}]
		}]), mirrorPath, sourcePath);

		assert.deepStrictEqual(diagnostics[0].range.end, diagnostics[0].range.start);
	});
});

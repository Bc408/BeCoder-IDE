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
function location(uri: string, startLine = 1, startColumn = 1, endColumn = startColumn + 1): object {
	return { physicalLocation: { artifactLocation: { uri }, region: { startLine, startColumn, endColumn } } };
}
function sarif(results: object[]): string {
	return JSON.stringify({ version: '2.1.0', runs: [{ results }] });
}
function error(): object {
	return { level: 'error', message: { text: 'undeclared' }, locations: [location(mirrorPath)] };
}

suite('GCC SARIF diagnostic model', () => {
	test('uses GCC display widths for file snippets, including tabs and combining marks', () => {
		const text = '\t你e\u0301😀x';
		const output = sarif([{ ...error(), locations: [{ physicalLocation: {
			artifactLocation: { uri: mirrorPath }, region: { startLine: 1, startColumn: 14, endColumn: 15 },
			contextRegion: { startLine: 1, snippet: { text } }
		} }] }]);
		const [diagnostic] = parseGccDiagnostics(output, mirrorPath, sourcePath);
		assert.deepStrictEqual(byteRangeToUtf16(text, diagnostic.range), { startLine: 0, startCharacter: 6, endLine: 0, endCharacter: 7 });
	});
	test('maps mirror locations, filters warnings and retains related notes', () => {
		const result = { ...error(), relatedLocations: [{ ...location('include/local.h', 2, 3), message: { text: 'declared here' } }] };
		const diagnostics = parseGccDiagnostics(sarif([result, { ...error(), level: 'warning' }]), mirrorPath, sourcePath);
		assert.strictEqual(diagnostics.length, 1);
		assert.strictEqual(diagnostics[0].range.start.filePath, sourcePath);
		assert.strictEqual(diagnostics[0].related[0].message, 'declared here');
		assert.strictEqual(diagnostics[0].related[0].range.start.filePath, path.resolve(path.dirname(sourcePath), 'include/local.h'));
	});
	test('decodes file URIs and converts exclusive byte ends after Chinese and emoji', () => {
		const result = { ...error(), locations: [location('file:///C:/BeCoder/private/main.cpp', 1, 9, 10)] };
		const [diagnostic] = parseGccDiagnostics(sarif([result]), mirrorPath, sourcePath);
		assert.strictEqual(diagnostic.range.start.filePath, sourcePath);
		assert.deepStrictEqual(byteRangeToUtf16('a你😀x', diagnostic.range), { startLine: 0, startCharacter: 4, endLine: 0, endCharacter: 5 });
	});
	test('maps an exclusive multibyte end to its full UTF16 span', () => {
		const [diagnostic] = parseGccDiagnostics(sarif([{ ...error(), locations: [location(mirrorPath, 1, 5, 9)] }]), mirrorPath, sourcePath);
		assert.deepStrictEqual(byteRangeToUtf16('a你😀z', diagnostic.range), { startLine: 0, startCharacter: 2, endLine: 0, endCharacter: 4 });
	});
	test('accepts clean output and deduplicates repeated errors', () => {
		assert.deepStrictEqual(parseGccDiagnostics(sarif([]), mirrorPath, sourcePath), []);
		assert.strictEqual(parseGccDiagnostics(sarif([error(), error()]), mirrorPath, sourcePath).length, 1);
	});
	test('resolves indexed artifacts and percent-encoded paths', () => {
		const output = JSON.stringify({ version: '2.1.0', runs: [{ artifacts: [{ location: { uri: 'include/a%20b.h' } }], results: [{ ...error(), locations: [{ physicalLocation: { artifactLocation: { index: 0 }, region: { startLine: 2 } } }] }] }] });
		const [diagnostic] = parseGccDiagnostics(output, mirrorPath, sourcePath);
		assert.strictEqual(diagnostic.range.start.filePath, path.resolve(path.dirname(sourcePath), 'include/a b.h'));
	});
	test('rejects invalid documents instead of clearing existing diagnostics', () => {
		assert.throws(() => parseGccDiagnostics('', mirrorPath, sourcePath), /no structured/);
		assert.throws(() => parseGccDiagnostics('{', mirrorPath, sourcePath), /malformed/);
		assert.throws(() => parseGccDiagnostics('[]', mirrorPath, sourcePath), /SARIF/);
		assert.throws(() => parseGccDiagnostics('{"version":"2.1.0","runs":[{}]}', mirrorPath, sourcePath), /missing results/);
	});
});

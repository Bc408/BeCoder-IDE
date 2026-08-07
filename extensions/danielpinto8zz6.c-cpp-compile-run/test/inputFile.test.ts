/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';

import { inspectExactInput } from '../src/inputFile';

suite('exact input validation', () => {
	test('accepts only an exact ordinary file', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-input-'));
		try {
			assert.strictEqual((await inspectExactInput(root)).status, 'missing');
			fs.writeFileSync(path.join(root, 'Input'), 'wrong case');
			assert.strictEqual((await inspectExactInput(root)).status, 'missing');
			fs.rmSync(path.join(root, 'Input'));
			fs.writeFileSync(path.join(root, 'input'), '42\n');
			const inspection = await inspectExactInput(root);
			assert.deepStrictEqual(inspection, { path: path.join(root, 'input'), status: 'valid' });
			fs.rmSync(path.join(root, 'input'));
			fs.mkdirSync(path.join(root, 'input'));
			assert.strictEqual((await inspectExactInput(root)).status, 'not-file');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('rejects a symbolic link named input', async context => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-input-link-'));
		try {
			const target = path.join(root, 'target.txt');
			fs.writeFileSync(target, '42\n');
			try {
				fs.symlinkSync(target, path.join(root, 'input'), 'file');
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'EPERM') {
					context.skip('Creating symbolic links requires Windows Developer Mode or elevation.');
					return;
				}
				throw error;
			}
			assert.strictEqual((await inspectExactInput(root)).status, 'not-file');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

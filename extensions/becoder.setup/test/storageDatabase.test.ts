/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import * as sqlite3 from '@vscode/sqlite3';

import { readStorageEntries, replaceStorageEntries } from '../src/storageDatabase';

function execute(filePath: string, sql: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const database = new sqlite3.Database(filePath, error => {
			if (error) {
				reject(error);
				return;
			}
			database.exec(sql, execError => database.close(closeError => execError || closeError ? reject(execError ?? closeError) : resolve()));
		});
	});
}

suite('BeCoder storage database portability', () => {
	test('replaces only owned entries', async () => {
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'becoder-storage-test-'));
		try {
			const database = path.join(root, 'state.vscdb');
			await replaceStorageEntries(database, { owned: 'old', untouched: 'keep' }, () => false);
			await replaceStorageEntries(database, { owned: 'new' }, key => key === 'owned');
			assert.deepStrictEqual(await readStorageEntries(database, () => true), { owned: 'new', untouched: 'keep' });
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('rolls back every mutation when a statement fails', async () => {
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'becoder-storage-rollback-'));
		try {
			const database = path.join(root, 'state.vscdb');
			await replaceStorageEntries(database, { owned: 'old', untouched: 'keep' }, () => false);
			await execute(database, `CREATE TRIGGER reject_bad BEFORE INSERT ON ItemTable WHEN NEW.key = 'bad' BEGIN SELECT RAISE(ABORT, 'rejected'); END;`);
			await assert.rejects(replaceStorageEntries(database, { owned: 'new', bad: 'value' }, key => key === 'owned'));
			assert.deepStrictEqual(await readStorageEntries(database, () => true), { owned: 'old', untouched: 'keep' });
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as sqlite3 from '@vscode/sqlite3';

export type StorageEntries = Record<string, string>;

function openDatabase(filePath: string, mode: number): Promise<sqlite3.Database> {
	return new Promise((resolve, reject) => {
		const database = new sqlite3.Database(filePath, mode, error => error ? reject(error) : resolve(database));
	});
}

function closeDatabase(database: sqlite3.Database): Promise<void> {
	return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

function run(database: sqlite3.Database, sql: string, ...parameters: unknown[]): Promise<void> {
	return new Promise((resolve, reject) => database.run(sql, ...parameters, (error: Error | null) => error ? reject(error) : resolve()));
}

export async function readStorageEntries(filePath: string, include: (key: string) => boolean): Promise<StorageEntries> {
	if (!fs.existsSync(filePath)) {
		return {};
	}
	const database = await openDatabase(filePath, sqlite3.OPEN_READONLY);
	try {
		const rows = await new Promise<{ key: string; value: string }[]>((resolve, reject) => {
			database.all('SELECT key, value FROM ItemTable ORDER BY key', (error, values: { key: string; value: string }[]) => error ? reject(error) : resolve(values));
		});
		return Object.fromEntries(rows.filter(row => include(row.key)).map(row => [row.key, row.value]));
	} finally {
		await closeDatabase(database);
	}
}

export async function replaceStorageEntries(filePath: string, entries: StorageEntries, owns: (key: string) => boolean): Promise<void> {
	await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
	const database = await openDatabase(filePath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
	try {
		await new Promise<void>((resolve, reject) => database.exec('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)', error => error ? reject(error) : resolve()));
		const existingKeys = await new Promise<string[]>((resolve, reject) => {
			database.all('SELECT key FROM ItemTable', (error, rows: { key: string }[]) => error ? reject(error) : resolve(rows.map(row => row.key)));
		});
		await run(database, 'BEGIN IMMEDIATE TRANSACTION');
		for (const key of existingKeys.filter(owns)) {
			await run(database, 'DELETE FROM ItemTable WHERE key = ?', key);
		}
		for (const [key, value] of Object.entries(entries)) {
			await run(database, 'INSERT OR REPLACE INTO ItemTable(key, value) VALUES(?, ?)', key, value);
		}
		await run(database, 'COMMIT');
	} catch (error) {
		await run(database, 'ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		await closeDatabase(database);
	}
}

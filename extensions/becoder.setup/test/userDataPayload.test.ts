/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse } from 'jsonc-parser';
import { suite, test } from 'node:test';
import { cleanupCommittedImport, IConfiguration, ImportTransactionLockActiveError, importTransactionJournalName, importTransactionMutexName, recoverInterruptedImport, runImportHelper, runImportRecovery, swapUserData } from '../src/userDataImportHelper';
import { cleanupAbandonedUserDataOperations, prepareImportedPayload, validateImportedPayload } from '../src/userDataPayload';

async function temporaryDirectory(): Promise<string> {
	return fs.promises.mkdtemp(path.join(os.tmpdir(), 'becoder-payload-test-'));
}

async function write(filePath: string, value: string): Promise<void> {
	await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
	await fs.promises.writeFile(filePath, value, 'utf8');
}

function configuration(dataRoot: string, operationRoot: string): IConfiguration {
	return {
		schemaVersion: 1,
		dataRoot,
		operationRoot,
		executable: process.execPath,
		waitPids: [process.pid],
		resultPath: path.join(dataRoot, '.becoder-import-result.json')
	};
}

suite('BeCoder user data import transaction', () => {
	test('prepares the live-data snapshot only after validation and updates only argv locale', async () => {
		const root = await temporaryDirectory();
		try {
			const dataRoot = path.join(root, 'data');
			const operationRoot = path.join(dataRoot, '.becoder-import-00000000-0000-4000-8000-000000000000');
			const extractedRoot = path.join(operationRoot, 'extracted');
			const payloadRoot = path.join(extractedRoot, 'payload');
			await write(path.join(payloadRoot, 'user-data', 'User', 'settings.json'), '{"editor.fontSize": 16}\n');
			await write(path.join(payloadRoot, 'state', 'recent.json'), '{}\n');
			await write(path.join(payloadRoot, 'state', 'locale.json'), '{"locale":"en"}\n');
			await write(path.join(dataRoot, 'argv.json'), '{\n\t// retained\n\t"disable-hardware-acceleration": true,\n\t"locale": "zh-cn",\n}\n');
			await write(path.join(dataRoot, 'user-data', 'User', 'globalStorage', 'late.txt'), 'before validation');

			await validateImportedPayload(extractedRoot);
			await write(path.join(dataRoot, 'user-data', 'User', 'globalStorage', 'late.txt'), 'after validation');
			const stagingRoot = path.join(operationRoot, 'staged');
			const stagedArgvPath = path.join(operationRoot, 'staged-argv.json');
			assert.strictEqual(await prepareImportedPayload(dataRoot, extractedRoot, stagingRoot, stagedArgvPath), true);

			assert.strictEqual(await fs.promises.readFile(path.join(stagingRoot, 'user-data', 'User', 'globalStorage', 'late.txt'), 'utf8'), 'after validation');
			assert.strictEqual(await fs.promises.readFile(path.join(stagingRoot, 'user-data', 'User', 'settings.json'), 'utf8'), '{"editor.fontSize": 16}\n');
			const stagedArgv = await fs.promises.readFile(stagedArgvPath, 'utf8');
			assert.match(stagedArgv, /\/\/ retained/);
			assert.deepStrictEqual(parse(stagedArgv), { 'disable-hardware-acceleration': true, locale: 'en' });
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('rolls back earlier moves when a later staged component is missing', async () => {
		const root = await temporaryDirectory();
		try {
			const dataRoot = path.join(root, 'data');
			const operationRoot = path.join(dataRoot, '.becoder-import-00000000-0000-4000-8000-000000000001');
			const stagingRoot = path.join(operationRoot, 'staged');
			for (const name of ['user-data', 'shared-data', 'extensions']) {
				await write(path.join(dataRoot, name, 'value.txt'), `old ${name}`);
			}
			await write(path.join(stagingRoot, 'user-data', 'value.txt'), 'new user-data');
			await write(path.join(stagingRoot, 'shared-data', 'value.txt'), 'new shared-data');

			await assert.rejects(swapUserData(configuration(dataRoot, operationRoot), stagingRoot, path.join(operationRoot, 'staged-argv.json'), false), /invalid: extensions/i);
			for (const name of ['user-data', 'shared-data', 'extensions']) {
				assert.strictEqual(await fs.promises.readFile(path.join(dataRoot, name, 'value.txt'), 'utf8'), `old ${name}`);
			}
			assert.strictEqual(await fs.promises.readFile(path.join(stagingRoot, 'user-data', 'value.txt'), 'utf8'), 'new user-data');
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('does not surface post-commit cleanup failures as transaction failures', async () => {
		let attempts = 0;
		const cleaned = await cleanupCommittedImport([], 'C:\\BeCoder\\data\\.becoder-import-test', (async () => {
			attempts++;
			throw new Error('injected cleanup failure');
		}) as typeof fs.promises.rm);
		assert.strictEqual(attempts, 1);
		assert.strictEqual(cleaned, false);
	});

	test('rolls back an interrupted persisted transaction before startup', async () => {
		const root = await temporaryDirectory();
		try {
			const dataRoot = path.join(root, 'data');
			const operationRoot = path.join(dataRoot, '.becoder-import-00000000-0000-4000-8000-000000000004');
			const stagingRoot = path.join(operationRoot, 'staged');
			await write(path.join(dataRoot, '.becoder-data-root'), 'BeCoder self-contained data v1\n');
			for (const name of ['user-data', 'shared-data', 'extensions']) {
				await write(path.join(dataRoot, name, 'value.txt'), `old ${name}`);
				await write(path.join(stagingRoot, name, 'value.txt'), `new ${name}`);
			}

			await swapUserData(configuration(dataRoot, operationRoot), stagingRoot, path.join(operationRoot, 'staged-argv.json'), false);
			const journalPath = path.join(dataRoot, importTransactionJournalName);
			assert.strictEqual(fs.existsSync(journalPath), true);
			assert.strictEqual(await fs.promises.readFile(path.join(dataRoot, 'user-data', 'value.txt'), 'utf8'), 'new user-data');

			assert.strictEqual(await recoverInterruptedImport(journalPath), 'rolled-back');
			for (const name of ['user-data', 'shared-data', 'extensions']) {
				assert.strictEqual(await fs.promises.readFile(path.join(dataRoot, name, 'value.txt'), 'utf8'), `old ${name}`);
			}
			assert.strictEqual(fs.existsSync(journalPath), false);
			assert.strictEqual(fs.existsSync(operationRoot), false);
			assert.deepStrictEqual(JSON.parse(await fs.promises.readFile(path.join(dataRoot, '.becoder-import-result.json'), 'utf8')), {
				success: false,
				message: 'The previous BeCoder import was interrupted and rolled back.'
			});
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('finishes cleanup for a committed persisted transaction before startup', async () => {
		const root = await temporaryDirectory();
		try {
			const dataRoot = path.join(root, 'data');
			const operationRoot = path.join(dataRoot, '.becoder-import-00000000-0000-4000-8000-000000000005');
			const stagingRoot = path.join(operationRoot, 'staged');
			await write(path.join(dataRoot, '.becoder-data-root'), 'BeCoder self-contained data v1\n');
			for (const name of ['user-data', 'shared-data', 'extensions']) {
				await write(path.join(dataRoot, name, 'value.txt'), `old ${name}`);
				await write(path.join(stagingRoot, name, 'value.txt'), `new ${name}`);
			}

			await swapUserData(configuration(dataRoot, operationRoot), stagingRoot, path.join(operationRoot, 'staged-argv.json'), false);
			const journalPath = path.join(dataRoot, importTransactionJournalName);
			const journal = JSON.parse(await fs.promises.readFile(journalPath, 'utf8')) as { committed: boolean; moves: { previous: string }[] };
			journal.committed = true;
			await fs.promises.writeFile(journalPath, `${JSON.stringify(journal, undefined, '\t')}\n`, 'utf8');

			assert.strictEqual(await recoverInterruptedImport(journalPath), 'committed');
			for (const name of ['user-data', 'shared-data', 'extensions']) {
				assert.strictEqual(await fs.promises.readFile(path.join(dataRoot, name, 'value.txt'), 'utf8'), `new ${name}`);
			}
			assert.strictEqual(journal.moves.some(move => fs.existsSync(move.previous)), false);
			assert.strictEqual(fs.existsSync(journalPath), false);
			assert.strictEqual(fs.existsSync(operationRoot), false);
			assert.deepStrictEqual(JSON.parse(await fs.promises.readFile(path.join(dataRoot, '.becoder-import-result.json'), 'utf8')), { success: true });
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('rejects an oversized transaction journal before parsing', async () => {
		const root = await temporaryDirectory();
		try {
			const dataRoot = path.join(root, 'data');
			const journalPath = path.join(dataRoot, importTransactionJournalName);
			await write(path.join(dataRoot, '.becoder-data-root'), 'BeCoder self-contained data v1\n');
			await write(journalPath, 'x'.repeat(1024 * 1024 + 1));
			await assert.rejects(recoverInterruptedImport(journalPath), /Invalid BeCoder import transaction journal/);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('relaunches with the trusted executable when helper configuration is invalid', async () => {
		const root = await temporaryDirectory();
		try {
			const dataRoot = path.join(root, 'data');
			const operationRoot = path.join(dataRoot, '.becoder-import-00000000-0000-4000-8000-000000000006');
			const configurationPath = path.join(operationRoot, 'import.json');
			await write(path.join(dataRoot, '.becoder-data-root'), 'BeCoder self-contained data v1\n');
			await write(configurationPath, '{}\n');
			let relaunchedExecutable: string | undefined;

			await assert.rejects(runImportHelper(configurationPath, executable => relaunchedExecutable = executable), /Invalid BeCoder import helper configuration/);
			assert.strictEqual(relaunchedExecutable, process.execPath);
			assert.match(await fs.promises.readFile(path.join(dataRoot, 'becoder-import-helper.log'), 'utf8'), /Invalid BeCoder import helper configuration/);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('derives a stable installation-specific transaction mutex name', () => {
		assert.strictEqual(importTransactionMutexName('C:\\BeCoder\\data'), importTransactionMutexName('c:\\becoder\\data\\.'));
		assert.notStrictEqual(importTransactionMutexName('C:\\BeCoder\\data'), importTransactionMutexName('D:\\BeCoder\\data'));
	});

	test('does not relaunch or touch an active import when a second helper loses the mutex race', async () => {
		const root = await temporaryDirectory();
		try {
			const dataRoot = path.join(root, 'data');
			const operationRoot = path.join(dataRoot, '.becoder-import-00000000-0000-4000-8000-000000000007');
			const configurationPath = path.join(operationRoot, 'import.json');
			await write(path.join(dataRoot, '.becoder-data-root'), 'BeCoder self-contained data v1\n');
			await write(configurationPath, `${JSON.stringify(configuration(dataRoot, operationRoot))}\n`);
			await write(path.join(operationRoot, 'active.txt'), 'must remain');
			await write(path.join(dataRoot, importTransactionJournalName), 'active journal must remain');
			let relaunched = false;

			await assert.rejects(runImportHelper(
				configurationPath,
				() => relaunched = true,
				async () => { throw new ImportTransactionLockActiveError('active'); }
			), ImportTransactionLockActiveError);
			assert.strictEqual(relaunched, false);
			assert.strictEqual(await fs.promises.readFile(path.join(operationRoot, 'active.txt'), 'utf8'), 'must remain');
			assert.strictEqual(await fs.promises.readFile(path.join(dataRoot, importTransactionJournalName), 'utf8'), 'active journal must remain');
			assert.strictEqual(fs.existsSync(path.join(dataRoot, '.becoder-import-result.json')), false);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('keeps the recovery mutex owned by the helper for the complete recovery operation', async () => {
		const root = await temporaryDirectory();
		try {
			const dataRoot = path.join(root, 'data');
			const journalPath = path.join(dataRoot, importTransactionJournalName);
			await write(path.join(dataRoot, '.becoder-data-root'), 'BeCoder self-contained data v1\n');
			await write(journalPath, '{}\n');
			let lockReleased = false;
			let recoveryObservedLock = false;

			const result = await runImportRecovery(
				journalPath,
				async () => ({ release: () => lockReleased = true }),
				async receivedJournalPath => {
					recoveryObservedLock = !lockReleased;
					assert.strictEqual(receivedJournalPath, journalPath);
					return 'rolled-back';
				}
			);

			assert.strictEqual(result, 'rolled-back');
			assert.strictEqual(recoveryObservedLock, true);
			assert.strictEqual(lockReleased, true);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('cleans only stale authenticated staging directories', async () => {
		const root = await temporaryDirectory();
		try {
			const dataRoot = path.join(root, 'data');
			const stale = path.join(dataRoot, '.becoder-import-00000000-0000-4000-8000-000000000002');
			const fresh = path.join(dataRoot, '.becoder-export-00000000-0000-4000-8000-000000000003');
			const unrelated = path.join(dataRoot, '.becoder-import-not-a-uuid');
			await write(path.join(dataRoot, '.becoder-data-root'), 'BeCoder self-contained data v1\n');
			for (const directory of [stale, fresh, unrelated]) {
				await write(path.join(directory, 'payload.txt'), 'data');
			}
			const now = Date.now();
			const oldTime = new Date(now - 25 * 60 * 60_000);
			await fs.promises.utimes(stale, oldTime, oldTime);

			await cleanupAbandonedUserDataOperations(dataRoot, now);

			assert.strictEqual(fs.existsSync(stale), false);
			assert.strictEqual(fs.existsSync(fresh), true);
			assert.strictEqual(fs.existsSync(unrelated), true);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});
});

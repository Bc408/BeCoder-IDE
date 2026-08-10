/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { OPTIONS, parseArgs } from '../../../platform/environment/node/argv.js';
import { getUserDataPath } from '../../../platform/environment/node/userDataPath.js';
import { configureBeCoderPackagedDataRoot, readBeCoderInstallationId, resolveBeCoderAppUserModelId, resolveBeCoderImportRecovery } from '../../node/beCoderInstallation.js';

suite('BeCoder installation identity', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses a valid directory-local installation ID for the AppUserModelID', () => {
		const root = fs.mkdtempSync(join(os.tmpdir(), 'becoder-installation-'));
		try {
			const executablePath = join(root, 'BeCoder.exe');
			const installationId = '12345678-1234-4abc-8def-1234567890ab';
			fs.writeFileSync(join(root, '.becoder-installation.json'), JSON.stringify({ schemaVersion: 2, product: 'BeCoder', installationId }));
			assert.strictEqual(readBeCoderInstallationId(executablePath), installationId);
			assert.strictEqual(resolveBeCoderAppUserModelId('com.becoder.ide', executablePath), `com.becoder.ide.${installationId}`);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('rejects malformed, foreign, and legacy markers', () => {
		const root = fs.mkdtempSync(join(os.tmpdir(), 'becoder-installation-invalid-'));
		try {
			const executablePath = join(root, 'BeCoder.exe');
			for (const marker of [
				{ schemaVersion: 1, product: 'BeCoder', installationId: '12345678-1234-4abc-8def-1234567890ab' },
				{ schemaVersion: 2, product: 'Other', installationId: '12345678-1234-4abc-8def-1234567890ab' },
				{ schemaVersion: 2, product: 'BeCoder', installationId: 'not-a-uuid' }
			]) {
				fs.writeFileSync(join(root, '.becoder-installation.json'), JSON.stringify(marker));
				assert.strictEqual(readBeCoderInstallationId(executablePath), undefined);
				assert.strictEqual(resolveBeCoderAppUserModelId('com.becoder.ide', executablePath), 'com.becoder.ide');
			}
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('binds packaged BeCoder data before generic portable configuration', () => {
		const root = fs.mkdtempSync(join(os.tmpdir(), 'becoder-packaged-data-'));
		try {
			const firstApplication = join(root, 'first', 'resources', 'app');
			const secondApplication = join(root, 'second', 'resources', 'app');
			const firstEnvironment: NodeJS.ProcessEnv = {
				VSCODE_PORTABLE: join(root, 'external-portable'),
				VSCODE_APPDATA: join(root, 'external-appdata')
			};
			const secondEnvironment: NodeJS.ProcessEnv = {};
			const firstDataRoot = configureBeCoderPackagedDataRoot({
				isPackaged: true,
				productName: 'BeCoder',
				applicationName: 'becoder',
				applicationPath: firstApplication,
				environment: firstEnvironment
			});
			const secondDataRoot = configureBeCoderPackagedDataRoot({
				isPackaged: true,
				productName: 'BeCoder',
				applicationName: 'becoder',
				applicationPath: secondApplication,
				environment: secondEnvironment
			});

			assert.strictEqual(firstDataRoot, join(root, 'first', 'data'));
			assert.strictEqual(secondDataRoot, join(root, 'second', 'data'));
			assert.notStrictEqual(firstDataRoot, secondDataRoot);
			assert.strictEqual(firstEnvironment['VSCODE_PORTABLE'], firstDataRoot);
			assert.strictEqual(firstEnvironment['VSCODE_APPDATA'], undefined);
			assert.strictEqual(secondEnvironment['VSCODE_PORTABLE'], secondDataRoot);
			assert.strictEqual(fs.statSync(firstDataRoot).isDirectory(), true);
			assert.strictEqual(fs.statSync(secondDataRoot).isDirectory(), true);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('forces distinct installation-local user data despite external data arguments', () => {
		const root = fs.mkdtempSync(join(os.tmpdir(), 'becoder-user-data-isolation-'));
		const originalPortable = process.env['VSCODE_PORTABLE'];
		const originalAppData = process.env['VSCODE_APPDATA'];
		try {
			const args = parseArgs(process.argv, OPTIONS);
			args['user-data-dir'] = join(root, 'external-cli');
			process.env['VSCODE_APPDATA'] = join(root, 'external-appdata');
			configureBeCoderPackagedDataRoot({
				isPackaged: true,
				productName: 'BeCoder',
				applicationName: 'becoder',
				applicationPath: join(root, 'first', 'resources', 'app'),
				environment: process.env
			});
			const firstUserData = getUserDataPath(args, 'BeCoder');

			process.env['VSCODE_APPDATA'] = join(root, 'other-external-appdata');
			configureBeCoderPackagedDataRoot({
				isPackaged: true,
				productName: 'BeCoder',
				applicationName: 'becoder',
				applicationPath: join(root, 'second', 'resources', 'app'),
				environment: process.env
			});
			const secondUserData = getUserDataPath(args, 'BeCoder');

			assert.strictEqual(firstUserData, join(root, 'first', 'data', 'user-data'));
			assert.strictEqual(secondUserData, join(root, 'second', 'data', 'user-data'));
			assert.notStrictEqual(firstUserData, secondUserData);
		} finally {
			if (originalPortable === undefined) {
				delete process.env['VSCODE_PORTABLE'];
			} else {
				process.env['VSCODE_PORTABLE'] = originalPortable;
			}
			if (originalAppData === undefined) {
				delete process.env['VSCODE_APPDATA'];
			} else {
				process.env['VSCODE_APPDATA'] = originalAppData;
			}
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('does not require the recovery helper without a transaction journal', async () => {
		const root = fs.mkdtempSync(join(os.tmpdir(), 'becoder-recovery-none-'));
		try {
			assert.strictEqual(await resolveBeCoderImportRecovery(join(root, 'data'), join(root, 'application')), undefined);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('requires an ordinary helper only after finding an ordinary recovery journal', async () => {
		const root = fs.mkdtempSync(join(os.tmpdir(), 'becoder-recovery-required-'));
		try {
			const dataRoot = join(root, 'data');
			const applicationRoot = join(root, 'application');
			const journalPath = join(dataRoot, '.becoder-import-transaction.json');
			const helperPath = join(applicationRoot, 'extensions', 'becoder.setup', 'out', 'userDataImportHelper.js');
			fs.mkdirSync(dataRoot, { recursive: true });
			fs.writeFileSync(journalPath, '{}');
			await assert.rejects(resolveBeCoderImportRecovery(dataRoot, applicationRoot), /recovery helper is missing/);

			fs.mkdirSync(join(helperPath, '..'), { recursive: true });
			fs.writeFileSync(helperPath, 'helper');
			assert.deepStrictEqual(await resolveBeCoderImportRecovery(dataRoot, applicationRoot), { journalPath, helperPath });
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('rejects a non-ordinary recovery journal before inspecting the helper', async () => {
		const root = fs.mkdtempSync(join(os.tmpdir(), 'becoder-recovery-invalid-'));
		try {
			const dataRoot = join(root, 'data');
			fs.mkdirSync(join(dataRoot, '.becoder-import-transaction.json'), { recursive: true });
			await assert.rejects(resolveBeCoderImportRecovery(dataRoot, join(root, 'application')), /journal is not an ordinary file/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

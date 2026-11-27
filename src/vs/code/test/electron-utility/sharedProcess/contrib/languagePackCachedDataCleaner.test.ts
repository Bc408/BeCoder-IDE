/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *---------------------------------------------------------------------------------------------
 *  Modifications Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { errorHandler } from '../../../../../base/common/errors.js';
import { join } from '../../../../../base/common/path.js';
import { Promises } from '../../../../../base/node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../../base/test/node/testUtils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { LanguagePackCachedDataCleaner } from '../../../../electron-utility/sharedProcess/contrib/languagePackCachedDataCleaner.js';

suite('LanguagePackCachedDataCleaner', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let testDir: string;
	let originalNlsConfiguration: string | undefined;

	setup(async () => {
		originalNlsConfiguration = process.env['VSCODE_NLS_CONFIG'];
		delete process.env['VSCODE_NLS_CONFIG'];
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'languagePackCachedDataCleaner');
		await fs.promises.mkdir(join(testDir, 'clp'), { recursive: true });
	});

	teardown(async () => {
		if (originalNlsConfiguration === undefined) {
			delete process.env['VSCODE_NLS_CONFIG'];
		} else {
			process.env['VSCODE_NLS_CONFIG'] = originalNlsConfiguration;
		}
		await Promises.rm(testDir);
	});

	function createCleaner(): LanguagePackCachedDataCleaner {
		return disposables.add(new LanguagePackCachedDataCleaner(
			{ isBuilt: false, userDataPath: testDir } as INativeEnvironmentService,
			new NullLogService(), { quality: 'insider' } as IProductService,
		));
	}

	async function createCache(directory: string): Promise<{ translationsConfigFile: string; messagesFile: string }> {
		const translationsConfigFile = join(directory, 'tcf.json');
		const messagesFile = join(directory, 'current', 'nls.messages.json');
		await fs.promises.mkdir(join(directory, 'current'), { recursive: true });
		await fs.promises.writeFile(translationsConfigFile, JSON.stringify({ 'vscode.ipynb': 'bundled-ipynb-translation' }));
		await fs.promises.writeFile(messagesFile, JSON.stringify(['当前中文消息']));
		return { translationsConfigFile, messagesFile };
	}

	test('preserves the active runtime cache with a different metadata hash and removes an inactive orphan', async () => {
		await fs.promises.writeFile(join(testDir, 'languagepacks.json'), JSON.stringify({ 'zh-cn': { hash: 'installed-md5-hash', extensions: [] } }));
		const active = await createCache(join(testDir, 'clp', 'builtin-zh-hans-version.zh-cn'));
		const orphan = join(testDir, 'clp', 'builtin-zh-hans-orphan.zh-cn');
		await createCache(orphan);
		process.env['VSCODE_NLS_CONFIG'] = JSON.stringify({ languagePack: active });

		await createCleaner().cleanUpLanguagePackCache();

		assert.deepStrictEqual(JSON.parse(await fs.promises.readFile(active.translationsConfigFile, 'utf8')), { 'vscode.ipynb': 'bundled-ipynb-translation' });
		assert.deepStrictEqual(JSON.parse(await fs.promises.readFile(active.messagesFile, 'utf8')), ['当前中文消息']);
		assert.strictEqual(await Promises.exists(orphan), false);
	});

	test('keeps current runtime messages even when old while expiring another table in the same pack', async () => {
		await fs.promises.writeFile(join(testDir, 'languagepacks.json'), '{}');
		const directory = join(testDir, 'clp', 'active.zh-cn');
		const active = await createCache(directory);
		const old = join(directory, 'old');
		await fs.promises.mkdir(old);
		await fs.promises.writeFile(join(old, 'nls.messages.json'), '["old messages"]');
		const expired = new Date('2000-01-01T00:00:00Z');
		await fs.promises.utimes(old, expired, expired);
		await fs.promises.utimes(join(directory, 'current'), expired, expired);
		process.env['VSCODE_NLS_CONFIG'] = JSON.stringify({ languagePack: active });

		await createCleaner().cleanUpLanguagePackCache();

		assert.strictEqual(await Promises.exists(active.translationsConfigFile), true);
		assert.deepStrictEqual(JSON.parse(await fs.promises.readFile(active.messagesFile, 'utf8')), ['当前中文消息']);
		assert.strictEqual(await Promises.exists(old), false);
	});

	test('an external runtime path cannot protect a same-named local cache', async () => {
		await fs.promises.writeFile(join(testDir, 'languagepacks.json'), '{}');
		const local = join(testDir, 'clp', 'same-name.zh-cn');
		await createCache(local);
		const external = await createCache(join(testDir, 'external', 'same-name.zh-cn'));
		process.env['VSCODE_NLS_CONFIG'] = JSON.stringify({ languagePack: external });

		await createCleaner().cleanUpLanguagePackCache();

		assert.strictEqual(await Promises.exists(local), false);
		assert.deepStrictEqual(JSON.parse(await fs.promises.readFile(external.messagesFile, 'utf8')), ['当前中文消息']);
	});

	test('a nested runtime path does not exempt an arbitrary cache ancestor', async () => {
		await fs.promises.writeFile(join(testDir, 'languagepacks.json'), '{}');
		const directory = join(testDir, 'clp', 'ancestor');
		const nested = await createCache(join(directory, 'nested.zh-cn'));
		process.env['VSCODE_NLS_CONFIG'] = JSON.stringify({ languagePack: nested });

		await createCleaner().cleanUpLanguagePackCache();

		assert.strictEqual(await Promises.exists(directory), false);
	});

	test('a linked runtime cache cannot cause cleanup inside an external directory', async () => {
		await fs.promises.writeFile(join(testDir, 'languagepacks.json'), '{}');
		const external = join(testDir, 'external');
		await createCache(external);
		const old = join(external, 'old');
		await fs.promises.mkdir(old);
		await fs.promises.writeFile(join(old, 'nls.messages.json'), '["external messages"]');
		const expired = new Date('2000-01-01T00:00:00Z');
		await fs.promises.utimes(old, expired, expired);
		const cacheRoot = join(testDir, 'clp', 'linked.zh-cn');
		await fs.promises.symlink(external, cacheRoot, 'junction');
		process.env['VSCODE_NLS_CONFIG'] = JSON.stringify({
			languagePack: {
				translationsConfigFile: join(cacheRoot, 'tcf.json'), messagesFile: join(cacheRoot, 'current', 'nls.messages.json'),
			}
		});

		await createCleaner().cleanUpLanguagePackCache();

		assert.deepStrictEqual(JSON.parse(await fs.promises.readFile(join(old, 'nls.messages.json'), 'utf8')), ['external messages']);
		assert.strictEqual(await Promises.exists(cacheRoot), false);
	});

	for (const [name, configuration] of [
		['missing', undefined], ['malformed', '{'], ['null', 'null'], ['without a language pack', '{}'],
		['with an invalid translation path', JSON.stringify({ languagePack: { translationsConfigFile: 42 } })],
	] as const) {
		test(`${name} runtime NLS configuration retains installed-pack and orphan cleanup`, async () => {
			await fs.promises.writeFile(join(testDir, 'languagepacks.json'), JSON.stringify({ de: { hash: 'installed', extensions: [] } }));
			const installed = await createCache(join(testDir, 'clp', 'installed.de'));
			const orphan = join(testDir, 'clp', 'orphan.de');
			await createCache(orphan);
			if (configuration !== undefined) { process.env['VSCODE_NLS_CONFIG'] = configuration; }

			await createCleaner().cleanUpLanguagePackCache();

			assert.strictEqual(await Promises.exists(installed.translationsConfigFile), true);
			assert.strictEqual(await Promises.exists(installed.messagesFile), true);
			assert.strictEqual(await Promises.exists(orphan), false);
		});
	}

	test('ignores an installed language pack without cached data', async () => {
		await fs.promises.writeFile(join(testDir, 'languagepacks.json'), JSON.stringify({
			de: {
				hash: 'language-pack-hash',
				extensions: []
			}
		}));

		const environmentService = {
			isBuilt: false,
			userDataPath: testDir
		} as INativeEnvironmentService;
		const productService = {
			quality: 'insider'
		} as IProductService;
		const unexpectedErrors: Error[] = [];
		const unexpectedErrorHandler = errorHandler.getUnexpectedErrorHandler();
		errorHandler.setUnexpectedErrorHandler(error => unexpectedErrors.push(error));

		try {
			const cleaner = disposables.add(new LanguagePackCachedDataCleaner(environmentService, new NullLogService(), productService));
			await cleaner.cleanUpLanguagePackCache();

			assert.deepStrictEqual(unexpectedErrors, []);
		} finally {
			errorHandler.setUnexpectedErrorHandler(unexpectedErrorHandler);
		}
	});
});

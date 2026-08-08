/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguagePackItem } from '../../../../../platform/languagePacks/common/languagePacks.js';
import { BeCoderDisplayLanguageController, findBeCoderLanguagePack, isBeCoderDisplayLanguage, toBeCoderDisplayLanguage } from '../../electron-browser/beCoderDisplayLanguage.contribution.js';

suite('BeCoder display language', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes supported display languages', () => {
		assert.strictEqual(toBeCoderDisplayLanguage('zh-CN'), 'zh-cn');
		assert.strictEqual(toBeCoderDisplayLanguage('zh-Hans'), 'zh-cn');
		assert.strictEqual(toBeCoderDisplayLanguage('en-US'), 'en');
		assert.strictEqual(isBeCoderDisplayLanguage('zh-cn'), true);
		assert.strictEqual(isBeCoderDisplayLanguage('en'), true);
		assert.strictEqual(isBeCoderDisplayLanguage('de'), false);
	});

	test('accepts Simplified Chinese only from the protected bundled language pack', () => {
		const languages: ILanguagePackItem[] = [
			{ label: 'Missing ID' },
			{ id: 'zh-cn', label: 'Untrusted Chinese', extensionId: 'example.language-pack-zh-hans' },
			{ id: 'ZH-CN', label: 'Bundled Chinese', extensionId: 'MS-CEINTL.VSCODE-LANGUAGE-PACK-ZH-HANS' },
		];

		assert.strictEqual(findBeCoderLanguagePack(languages, 'zh-cn'), languages[2]);
	});

	test('uses the built-in English messages without an extension', () => {
		const english: ILanguagePackItem = { id: 'en', label: 'English' };
		assert.strictEqual(findBeCoderLanguagePack([english], 'en'), english);
	});

	test('restores the selected language when applying a setting fails', async () => {
		const settingUpdates: string[] = [];
		const controller = new BeCoderDisplayLanguageController(
			'en',
			async () => false,
			async language => { settingUpdates.push(language); },
		);

		await controller.request('zh-cn');

		assert.strictEqual(controller.selected, 'en');
		assert.deepStrictEqual(settingUpdates, ['en']);
	});

	test('keeps one active change and applies only the latest pending language', async () => {
		const firstChange = new DeferredPromise<boolean>();
		const appliedLanguages: string[] = [];
		const controller = new BeCoderDisplayLanguageController(
			'en',
			async language => {
				appliedLanguages.push(language);
				return language === 'zh-cn' ? firstChange.p : true;
			},
			async () => { throw new Error('Unexpected setting rollback'); },
		);

		const processing = controller.request('zh-cn');
		controller.request('en');
		firstChange.complete(true);
		await processing;

		assert.strictEqual(controller.selected, 'en');
		assert.deepStrictEqual(appliedLanguages, ['zh-cn', 'en']);
	});

	test('drops superseded pending language changes', async () => {
		const firstChange = new DeferredPromise<boolean>();
		const appliedLanguages: string[] = [];
		const controller = new BeCoderDisplayLanguageController(
			'en',
			async language => {
				appliedLanguages.push(language);
				return firstChange.p;
			},
			async () => { throw new Error('Unexpected setting rollback'); },
		);

		const processing = controller.request('zh-cn');
		controller.request('en');
		controller.request('zh-cn');
		firstChange.complete(true);
		await processing;

		assert.strictEqual(controller.selected, 'zh-cn');
		assert.deepStrictEqual(appliedLanguages, ['zh-cn']);
	});

	test('does not restart for a superseded active language change', async () => {
		const firstChange = new DeferredPromise<void>();
		const restartDecisions: boolean[] = [];
		const controller = new BeCoderDisplayLanguageController(
			'en',
			async language => {
				if (language === 'zh-cn') {
					await firstChange.p;
				}
				restartDecisions.push(controller.isLatestRequest(language));
				return true;
			},
			async () => { throw new Error('Unexpected setting rollback'); },
		);

		const processing = controller.request('zh-cn');
		controller.request('en');
		firstChange.complete();
		await processing;

		assert.deepStrictEqual(restartDecisions, [false, true]);
		assert.strictEqual(controller.selected, 'en');
	});
});

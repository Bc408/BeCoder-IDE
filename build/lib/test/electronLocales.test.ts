/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { isBeCoderElectronLocale } from '../electronLocales.ts';

suite('Electron locales', () => {
	test('keeps only English and Simplified Chinese locale payloads', () => {
		const cases: Array<[string, string, boolean]> = [
			['locales/en-US.pak', 'win32', true],
			['locales/zh-CN.pak', 'win32', true],
			['locales/de.pak', 'win32', false],
			['BeCoder\\locales\\fr.pak', 'win32', false],
			['BeCoder.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/en.lproj/locale.pak', 'darwin', true],
			['BeCoder.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/zh_CN.lproj/locale.pak', 'darwin', true],
			['BeCoder.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/de.lproj/locale.pak', 'darwin', false],
			['resources/app/product.json', 'win32', true],
			['resources/app/product.json', 'linux', true],
		];

		assert.deepStrictEqual(
			cases.map(([relativePath, platform]) => isBeCoderElectronLocale(relativePath, platform)),
			cases.map(([, , expected]) => expected),
		);
	});
});

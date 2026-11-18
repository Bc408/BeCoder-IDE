/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isBrowserHomeUrl } from '../../common/browserHome.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Browser home URL', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty tabs and navigable blank pages share the homepage', () => {
		assert.deepStrictEqual([undefined, '', 'about:blank'].map(isBrowserHomeUrl), [true, true, true]);
	});

	test('websites and other about pages remain pages', () => {
		assert.deepStrictEqual(['https://atcoder.jp/', 'about:blank#custom', 'about:version', 'file:///x.html'].map(isBrowserHomeUrl), [false, false, false, false]);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { applyExtensionControlManifestPolicy } from '../../common/extensionControlManifestPolicy.js';

const cph = 'divyanshuagrawal.competitive-programming-helper';
const product = { extensionControlManifestExemptions: [cph] };

suite('BeCoder extension control manifest policy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('exempts only the exact CPH report and retains unrelated metadata and publisher bans', () => {
		const other = { extensionOrPublisher: { id: 'other.extension' }, learnMoreLink: 'https://example.com/report' };
		const publisher = { extensionOrPublisher: 'divyanshuagrawal' };
		const sibling = { extensionOrPublisher: { id: `${cph}-other` } };
		const reports = [{ extensionOrPublisher: { id: cph.toUpperCase() } }, other, publisher, sibling];
		assert.deepStrictEqual(applyExtensionControlManifestPolicy(reports, product), [other, publisher, sibling]);
		assert.strictEqual(reports.length, 4);
	});

	test('applies the exception to old identifier-only enablement cache entries offline', () => {
		const cached = [{ id: 'DivyanshuAgrawal.competitive-programming-helper' }, { id: 'other.extension' }];
		const reports = cached.map(extensionOrPublisher => ({ extensionOrPublisher }));
		assert.deepStrictEqual(applyExtensionControlManifestPolicy(reports, product), [reports[1]]);
	});

	test('preserves remote enforcement when the exception is removed or product blacklist wins', () => {
		const reports = [{ extensionOrPublisher: { id: cph } }];
		assert.deepStrictEqual(applyExtensionControlManifestPolicy(reports, {}), reports);
		assert.deepStrictEqual(applyExtensionControlManifestPolicy(reports, { ...product, extensionBlacklist: [cph.toUpperCase()] }), reports);
	});

});

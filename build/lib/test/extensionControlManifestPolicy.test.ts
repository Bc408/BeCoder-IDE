/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { suite, test } from 'node:test';
import { applyExtensionControlManifestPolicy } from '../../../src/vs/platform/extensionManagement/common/extensionControlManifestPolicy.ts';

const cph = 'divyanshuagrawal.competitive-programming-helper';
const product = { extensionControlManifestExemptions: [cph] };

suite('BeCoder extension control manifest policy', () => {
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

	test('ships only the authorized CPH exception and retains existing product bans', () => {
		const current = JSON.parse(readFileSync(new URL('../../../product.json', import.meta.url), 'utf8'));
		assert.deepStrictEqual(current.extensionControlManifestExemptions, [cph]);
		assert.deepStrictEqual(current.extensionBlacklist, ['ms-vscode.cpptools', 'ms-vscode.cpptools-extension-pack']);
	});
});

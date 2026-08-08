/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionType } from '../../../extensions/common/extensions.js';
import { IExtensionIdentifier, ILocalExtension } from '../../common/extensionManagement.js';
import { ExtensionManagementService } from '../../node/extensionManagementService.js';

const FROM_PROFILE = URI.file('/from-profile/extensions.json');
const TO_PROFILE = URI.file('/to-profile/extensions.json');

function aLocalExtension(id: string): ILocalExtension {
	return { identifier: { id } } as ILocalExtension;
}

function createProfileCopyHarness(installed: readonly ILocalExtension[], blockedId?: string): {
	readonly service: ExtensionManagementService;
	readonly metadataScans: string[];
	readonly profileWrites: { entries: readonly unknown[]; profileLocation: URI }[];
} {
	const metadataScans: string[] = [];
	const profileWrites: { entries: readonly unknown[]; profileLocation: URI }[] = [];
	const context = {
		logService: {
			trace: (..._args: unknown[]) => undefined,
			info: (..._args: unknown[]) => undefined,
		},
		getInstalled: async (type: ExtensionType, profileLocation: URI) => {
			assert.strictEqual(type, ExtensionType.User);
			assert.strictEqual(profileLocation, FROM_PROFILE);
			return installed;
		},
		allowedExtensionsService: {
			isAllowed: (extension: ILocalExtension) => extension.identifier.id === blockedId ? new MarkdownString('blocked by BeCoder') : true,
		},
		extensionsScanner: {
			scanMetadata: async (extension: ILocalExtension, profileLocation: URI) => {
				assert.strictEqual(profileLocation, FROM_PROFILE);
				metadataScans.push(extension.identifier.id);
				return { source: 'gallery' as const };
			},
		},
		addExtensionsToProfile: async (entries: readonly unknown[], profileLocation: URI) => {
			profileWrites.push({ entries, profileLocation });
		},
	};
	return { service: context as unknown as ExtensionManagementService, metadataScans, profileWrites };
}

async function installExtensionsFromProfile(service: ExtensionManagementService, extensions: IExtensionIdentifier[]): Promise<ILocalExtension[]> {
	return ExtensionManagementService.prototype.installExtensionsFromProfile.call(service, extensions, FROM_PROFILE, TO_PROFILE);
}

suite('ExtensionManagementService profile copy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('copies allowed extensions', async () => {
		const allowed = aLocalExtension('example.allowed');
		const harness = createProfileCopyHarness([allowed]);

		const result = await installExtensionsFromProfile(harness.service, [allowed.identifier]);

		assert.deepStrictEqual(result, [allowed]);
		assert.deepStrictEqual(harness.metadataScans, ['example.allowed']);
		assert.strictEqual(harness.profileWrites.length, 1);
		assert.strictEqual(harness.profileWrites[0].profileLocation, TO_PROFILE);
		assert.strictEqual(harness.profileWrites[0].entries.length, 1);
	});

	test('rejects a blocked extension without writing the target profile', async () => {
		const blocked = aLocalExtension('example.blocked');
		const harness = createProfileCopyHarness([blocked], blocked.identifier.id);

		await assert.rejects(() => installExtensionsFromProfile(harness.service, [blocked.identifier]), /blocked by BeCoder/);

		assert.deepStrictEqual(harness.metadataScans, []);
		assert.deepStrictEqual(harness.profileWrites, []);
	});

	test('keeps mixed profile copies atomic when one extension is blocked', async () => {
		const allowed = aLocalExtension('example.allowed');
		const blocked = aLocalExtension('example.blocked');
		const harness = createProfileCopyHarness([allowed, blocked], blocked.identifier.id);

		await assert.rejects(() => installExtensionsFromProfile(harness.service, [allowed.identifier, blocked.identifier]), /blocked by BeCoder/);

		assert.deepStrictEqual(harness.metadataScans, []);
		assert.deepStrictEqual(harness.profileWrites, []);
	});
});

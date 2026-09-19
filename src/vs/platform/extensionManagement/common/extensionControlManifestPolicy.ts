/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IProductConfiguration } from '../../../base/common/product.js';
import type { MaliciousExtensionInfo } from './extensionManagement.js';

/** Apply the same product decision to fresh reports and persisted enablement reports. */
export function applyExtensionControlManifestPolicy(
	malicious: ReadonlyArray<MaliciousExtensionInfo>,
	product: Pick<IProductConfiguration, 'extensionControlManifestExemptions' | 'extensionBlacklist'>
): ReadonlyArray<MaliciousExtensionInfo> {
	const blocked = new Set(product.extensionBlacklist?.map(id => id.toLowerCase()));
	const exemptions = new Set(product.extensionControlManifestExemptions?.map(id => id.toLowerCase()).filter(id => !blocked.has(id)));
	if (!exemptions.size) {
		return malicious;
	}
	// Publisher-wide reports are deliberately not exempted by an extension ID.
	return malicious.filter(({ extensionOrPublisher }) => typeof extensionOrPublisher === 'string' || !exemptions.has(extensionOrPublisher.id.toLowerCase()));
}

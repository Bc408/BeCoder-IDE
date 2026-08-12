/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';

function extractLocalHostUriMetaDataForPortMapping(uri: URI): { address: string; port: number } | undefined {
	if (uri.scheme !== 'http' && uri.scheme !== 'https') {
		return undefined;
	}
	const localhostMatch = /^(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)$/.exec(uri.authority);
	return localhostMatch ? { address: localhostMatch[1], port: Number(localhostMatch[2]) } : undefined;
}

export interface IWebviewPortMapping {
	readonly webviewPort: number;
	readonly extensionHostPort: number;
}

/**
 * Manages port mappings for a single webview.
 */
export class WebviewPortMappingManager implements IDisposable {

	constructor(
		private readonly _getMappings: () => readonly IWebviewPortMapping[],
	) { }

	public async getRedirect(url: string): Promise<string | undefined> {
		const uri = URI.parse(url);
		const requestLocalHostInfo = extractLocalHostUriMetaDataForPortMapping(uri);
		if (!requestLocalHostInfo) {
			return undefined;
		}

		for (const mapping of this._getMappings()) {
			if (mapping.webviewPort === requestLocalHostInfo.port) {
				if (mapping.webviewPort !== mapping.extensionHostPort) {
					return encodeURI(uri.with({
						authority: `${requestLocalHostInfo.address}:${mapping.extensionHostPort}`
					}).toString(true));
				}
			}
		}

		return undefined;
	}

	dispose(): void { }
}

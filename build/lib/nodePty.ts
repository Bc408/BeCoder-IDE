/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function isNodePtyPlatformFile(relativePath: string, platform: string, arch: string): boolean {
	const prebuild = /(?:^|\/)node-pty\/prebuilds\/([^/]+)(?:\/|$)/.exec(relativePath.replace(/\\/g, '/'));
	if (!prebuild) {
		return true;
	}

	const nodePlatform = platform === 'alpine' || arch === 'alpine' ? 'linux' : platform;
	const nodeArch = arch === 'armhf' ? 'arm' : arch === 'alpine' ? 'x64' : arch;
	return prebuild[1] === `${nodePlatform}-${nodeArch}`;
}

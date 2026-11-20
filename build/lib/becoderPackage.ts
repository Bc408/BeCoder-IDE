/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

/** Reject runtime state before distributing a stage; never remove it on the caller's behalf. */
export function assertCleanBeCoderPackage(packagePath: string): void {
	const ordinaryEntries = (directory: string) => {
		if (fs.lstatSync(directory).isSymbolicLink()) { throw new Error(`Unexpected release payload link: ${directory}`); }
		return fs.readdirSync(directory, { withFileTypes: true });
	};
	for (const entry of ordinaryEntries(packagePath)) {
		const approved = entry.isDirectory() ? ['bin', 'coding', 'data', 'locales', 'resources', 'tools'] : [
			'BeCoder.exe', 'BeCoder.VisualElementsManifest.xml', 'chrome_100_percent.pak', 'chrome_200_percent.pak',
			'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll',
			'LICENSES.chromium.html', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin',
			'vk_swiftshader_icd.json', 'vk_swiftshader.dll', 'vulkan-1.dll'
		];
		if (entry.isSymbolicLink() || !approved.includes(entry.name)) {
			throw new Error(`Unexpected release payload: ${entry.name}`);
		}
	}
	for (const [directory, allowed] of [
		['data', ['.becoder-data-root', '.becoder-open-hello-coder', 'toolchains']],
		['coding', ['helloCoder.cpp']]
	] as const) {
		for (const entry of ordinaryEntries(path.join(packagePath, directory))) {
			if (entry.isSymbolicLink() || !(allowed as readonly string[]).includes(entry.name) || entry.isDirectory() !== (entry.name === 'toolchains')) {
				throw new Error(`Unexpected release payload: ${directory}/${entry.name}`);
			}
		}
	}
}

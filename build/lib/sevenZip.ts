/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const asar = require('asar') as {
	uncache(archive: string): void;
	listPackage(archive: string): string[];
	statFile(archive: string, file: string, followLinks: boolean): { files?: Record<string, unknown>; unpacked?: boolean; link?: string };
	extractFile(archive: string, file: string): Buffer;
};

// Only these 7zip-bin 5.2.0 files were reviewed for the Windows x64 payload.
// New files and every other distribution target remain untouched.
const foreignWindowsX64Files = new Set([
	'linux/arm/7za', 'linux/arm64/7za', 'linux/ia32/7za', 'linux/x64/7za',
	'linux/x64/build.sh', 'linux/x64/do-build.sh', 'mac/arm64/7za', 'mac/x64/7za',
	'win/arm64/7za.exe', 'win/ia32/7za.exe',
]);
const retainedWindowsX64Files = ['7x.sh', 'LICENSE.txt', 'index.js', 'package.json', 'win/x64/7za.exe'];

export function isSevenZipPlatformFile(relativePath: string, platform: string, arch: string): boolean {
	if (platform !== 'win32' || arch !== 'x64') {
		return true;
	}
	const normalizedPath = relativePath.replace(/\\/g, '/');
	const prefix = 'node_modules/7zip-bin/';
	return !normalizedPath.startsWith(prefix) || !foreignWindowsX64Files.has(normalizedPath.slice(prefix.length));
}

export function verifySevenZipPackage(asarPath: string, sourcePackageRoot: string): void {
	const sourcePackage = JSON.parse(fs.readFileSync(path.join(sourcePackageRoot, 'package.json'), 'utf8'));
	if (sourcePackage.name !== '7zip-bin' || sourcePackage.version !== '5.2.0') {
		throw new Error('The 7zip-bin source version changed; review the Windows x64 package policy.');
	}

	asar.uncache(asarPath);
	const files = asar.listPackage(asarPath)
		.map(file => file.replace(/\\/g, '/').replace(/^\/+/, ''))
		.filter(file => file.startsWith('7zip-bin/'))
		.filter(file => !asar.statFile(asarPath, file.split('/').join(path.sep), false).files)
		.map(file => file.slice('7zip-bin/'.length))
		.sort();
	if (files.join('\n') !== [...retainedWindowsX64Files].sort().join('\n')) {
		throw new Error('The packaged 7zip-bin inventory differs from the reviewed Windows x64 files.');
	}

	for (const file of retainedWindowsX64Files) {
		const archiveFile = path.join('7zip-bin', ...file.split('/'));
		const metadata = asar.statFile(asarPath, archiveFile, false);
		if (metadata.unpacked || metadata.link) {
			throw new Error(`The retained 7zip-bin file must remain packed and unlinked: ${file}`);
		}
		const contents = asar.extractFile(asarPath, archiveFile);
		if (!contents.equals(fs.readFileSync(path.join(sourcePackageRoot, ...file.split('/'))))) {
			throw new Error(`The retained 7zip-bin file content changed: ${file}`);
		}
		if (file === 'win/x64/7za.exe') {
			const peOffset = contents.length >= 64 ? contents.readUInt32LE(60) : -1;
			if (peOffset < 0 || peOffset > contents.length - 6 || contents.toString('ascii', 0, 2) !== 'MZ' || contents.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0' || contents.readUInt16LE(peOffset + 4) !== 0x8664) {
				throw new Error('The retained 7zip-bin executable must be an AMD64 PE file.');
			}
		}
	}
}

if (import.meta.main) {
	const [asarPath, sourcePackageRoot] = process.argv.slice(2);
	if (!asarPath || !sourcePackageRoot) {
		throw new Error('Usage: sevenZip.ts <node_modules.asar> <source-7zip-bin-root>');
	}
	verifySevenZipPackage(asarPath, sourcePackageRoot);
	console.log('Verified the Windows x64 7zip-bin inventory, content and executable.');
}

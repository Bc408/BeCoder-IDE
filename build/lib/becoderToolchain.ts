/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import extract from 'extract-zip';

export const beCoderToolchainManifestName = 'becoder-toolchain-manifest.json';

const compilerBinFiles = [
	'g++.exe',
	'gcc.exe',
	'libgcc_s_seh-1.dll',
	'libstdc++-6.dll',
	'libwinpthread-1.dll',
	'libgmp-10.dll',
	'libisl-23.dll',
	'libmpc-3.dll',
	'libmpfr-6.dll',
	'zlib1.dll',
	'libzstd.dll',
	'libintl-8.dll',
	'libiconv-2.dll'
] as const;

const compilerGccFiles = [
	'cc1.exe',
	'cc1plus.exe',
	'collect2.exe',
	'crtbegin.o',
	'crtend.o',
	'crtfastmath.o',
	'libgcc.a',
	'libgcc_eh.a',
	'libgcov.a',
	'liblto_plugin.dll'
] as const;

const compilerGccDirectories = ['include', 'include-fixed'] as const;

const requiredToolchainFiles = [
	'becoder-ucrt64/bin/g++.exe',
	'becoder-ucrt64/bin/gcc.exe',
	'becoder-ucrt64/bin/libgcc_s_seh-1.dll',
	'becoder-ucrt64/bin/libstdc++-6.dll',
	'becoder-ucrt64/bin/libwinpthread-1.dll',
	'becoder-ucrt64/bin/libgmp-10.dll',
	'becoder-ucrt64/bin/libisl-23.dll',
	'becoder-ucrt64/bin/libmpc-3.dll',
	'becoder-ucrt64/bin/libmpfr-6.dll',
	'becoder-ucrt64/bin/zlib1.dll',
	'becoder-ucrt64/bin/libzstd.dll',
	'becoder-ucrt64/bin/libintl-8.dll',
	'becoder-ucrt64/bin/libiconv-2.dll',
	'becoder-ucrt64/include/c++/14.1.0/x86_64-w64-mingw32/bits/stdc++.h',
	'becoder-ucrt64/include/c++/14.1.0/x86_64-w64-mingw32/bits/stdc++.h.gch',
	'becoder-ucrt64/include/c++/14.1.0/x86_64-w64-mingw32/bits/debugger.h',
	'becoder-ucrt64/lib/gcc/x86_64-w64-mingw32/14.1.0/cc1.exe',
	'becoder-ucrt64/lib/gcc/x86_64-w64-mingw32/14.1.0/cc1plus.exe',
	'becoder-ucrt64/lib/gcc/x86_64-w64-mingw32/14.1.0/collect2.exe',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/as.exe',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/ld.exe',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/libiconv-2.dll',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/libintl-8.dll',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/libwinpthread-1.dll',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/libzstd.dll',
	'becoder-ucrt64/x86_64-w64-mingw32/bin/zlib1.dll',
	'clangd/clangd_22.1.6/bin/clangd.exe',
	'clangd/clangd_22.1.6/LICENSE.TXT'
] as const;

interface IBeCoderToolchainManifestFile {
	readonly path: string;
	readonly size: number;
	readonly sha256: string;
}

interface IBeCoderToolchainManifest {
	readonly schemaVersion: 2;
	readonly toolchainVersion: 'gcc-14.1.0-clangd-22.1.6';
	readonly files: readonly IBeCoderToolchainManifestFile[];
}

async function sha256(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		const stream = fs.createReadStream(filePath);
		stream.on('error', reject);
		stream.on('data', chunk => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

async function collectToolchainFiles(root: string, relativeDirectory = ''): Promise<string[]> {
	const directory = path.join(root, ...relativeDirectory.split('/').filter(Boolean));
	const result: string[] = [];
	for (const entry of (await fs.promises.readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
		const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
		const absolutePath = path.join(root, ...relativePath.split('/'));
		const stat = await fs.promises.lstat(absolutePath);
		if (stat.isSymbolicLink()) {
			throw new Error(`The staged BeCoder toolchain contains an unsupported link: ${relativePath}.`);
		}
		if (stat.isDirectory()) {
			result.push(...await collectToolchainFiles(root, relativePath));
		} else if (stat.isFile() && relativePath !== beCoderToolchainManifestName) {
			result.push(relativePath);
		} else if (!stat.isFile()) {
			throw new Error(`The staged BeCoder toolchain contains an unsupported entry: ${relativePath}.`);
		}
	}
	return result;
}

async function createManifest(toolchainRoot: string): Promise<IBeCoderToolchainManifest> {
	const relativePaths = await collectToolchainFiles(toolchainRoot);
	const availablePaths = new Set(relativePaths);
	for (const relativePath of requiredToolchainFiles) {
		const stat = await fs.promises.stat(path.join(toolchainRoot, ...relativePath.split('/'))).catch(() => undefined);
		if (!availablePaths.has(relativePath) || !stat?.isFile() || stat.size === 0) {
			throw new Error(`The staged BeCoder toolchain is missing ${relativePath}.`);
		}
	}
	const files: IBeCoderToolchainManifestFile[] = [];
	for (const relativePath of relativePaths) {
		const filePath = path.join(toolchainRoot, ...relativePath.split('/'));
		const stat = await fs.promises.stat(filePath);
		files.push({ path: relativePath, size: stat.size, sha256: await sha256(filePath) });
	}
	return { schemaVersion: 2, toolchainVersion: 'gcc-14.1.0-clangd-22.1.6', files };
}

async function copyFile(source: string, destination: string): Promise<void> {
	const stat = await fs.promises.stat(source).catch(() => undefined);
	if (!stat?.isFile() || stat.size === 0) {
		throw new Error(`The BeCoder compiler allowlist entry is missing: ${source}`);
	}
	await fs.promises.mkdir(path.dirname(destination), { recursive: true });
	await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
}

async function copyDirectory(source: string, destination: string): Promise<void> {
	const stat = await fs.promises.stat(source).catch(() => undefined);
	if (!stat?.isDirectory()) {
		throw new Error(`The BeCoder compiler allowlist directory is missing: ${source}`);
	}
	await fs.promises.cp(source, destination, { recursive: true, errorOnExist: true, force: false });
}

async function stageSlimCompiler(compilerArchive: string, toolchainRoot: string): Promise<void> {
	const expandedRoot = path.join(toolchainRoot, '.becoder-ucrt64-expanded');
	const stagedRoot = path.join(toolchainRoot, '.becoder-ucrt64-staged');
	const compilerRoot = path.join(toolchainRoot, 'becoder-ucrt64');
	await fs.promises.mkdir(expandedRoot, { recursive: true });
	try {
		await extract(compilerArchive, { dir: expandedRoot });
		await fs.promises.mkdir(stagedRoot, { recursive: true });

		for (const name of compilerBinFiles) {
			await copyFile(path.join(expandedRoot, 'bin', name), path.join(stagedRoot, 'bin', name));
		}

		await copyDirectory(path.join(expandedRoot, 'include'), path.join(stagedRoot, 'include'));
		await copyDirectory(path.join(expandedRoot, 'x86_64-w64-mingw32'), path.join(stagedRoot, 'x86_64-w64-mingw32'));

		const sourceLibRoot = path.join(expandedRoot, 'lib');
		for (const entry of await fs.promises.readdir(sourceLibRoot, { withFileTypes: true })) {
			if (entry.isFile()) {
				await copyFile(path.join(sourceLibRoot, entry.name), path.join(stagedRoot, 'lib', entry.name));
			}
		}

		const gccRelativeRoot = path.join('lib', 'gcc', 'x86_64-w64-mingw32', '14.1.0');
		for (const name of compilerGccFiles) {
			await copyFile(path.join(expandedRoot, gccRelativeRoot, name), path.join(stagedRoot, gccRelativeRoot, name));
		}
		for (const name of compilerGccDirectories) {
			await copyDirectory(path.join(expandedRoot, gccRelativeRoot, name), path.join(stagedRoot, gccRelativeRoot, name));
		}

		await fs.promises.rename(stagedRoot, compilerRoot);
	} finally {
		await fs.promises.rm(expandedRoot, { recursive: true, force: true });
		await fs.promises.rm(stagedRoot, { recursive: true, force: true });
	}
}

export async function stageBeCoderWindowsToolchain(repositoryRoot: string, packageRoot: string, platform: string, arch: string): Promise<void> {
	if (platform !== 'win32' || arch !== 'x64') {
		throw new Error(`BeCoder toolchain staging supports only win32/x64, received ${platform}/${arch}.`);
	}
	const archiveRoot = path.join(repositoryRoot, 'resources', 'oi-defaults', 'toolchains');
	const compilerArchive = path.join(archiveRoot, 'becoder-ucrt64.zip');
	const clangdArchive = path.join(archiveRoot, 'clangd-windows-22.1.6.zip');
	for (const archivePath of [compilerArchive, clangdArchive]) {
		const stat = await fs.promises.stat(archivePath).catch(() => undefined);
		if (!stat?.isFile() || stat.size < 10 * 1024 * 1024) {
			throw new Error(`The required Git LFS toolchain archive is unavailable: ${archivePath}`);
		}
	}

	const dataRoot = path.join(packageRoot, 'data');
	const toolchainRoot = path.join(dataRoot, 'toolchains');
	await fs.promises.rm(toolchainRoot, { recursive: true, force: true });
	await fs.promises.mkdir(toolchainRoot, { recursive: true });
	await fs.promises.mkdir(path.join(toolchainRoot, 'clangd'), { recursive: true });
	await stageSlimCompiler(compilerArchive, toolchainRoot);
	await extract(clangdArchive, { dir: path.join(toolchainRoot, 'clangd') });

	const manifest = await createManifest(toolchainRoot);
	await fs.promises.writeFile(path.join(toolchainRoot, beCoderToolchainManifestName), `${JSON.stringify(manifest, undefined, '\t')}\n`, 'utf8');
	await fs.promises.writeFile(path.join(dataRoot, '.becoder-data-root'), 'BeCoder self-contained data v1\n', 'utf8');
}

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
const compilerTargetBinFiles = [
	'ar.exe', 'as.exe', 'dlltool.exe', 'ld.bfd.exe', 'ld.exe',
	'libiconv-2.dll', 'libintl-8.dll', 'libwinpthread-1.dll', 'libzstd.dll',
	'nm.exe', 'objcopy.exe', 'ranlib.exe', 'readelf.exe', 'strip.exe', 'zlib1.dll'
] as const;
const compilerRootLibraryFiles = [
	'crt2.o', 'crt2u.o', 'default-manifest.o', 'libadvapi32.a', 'libgcc_s.a',
	'libkernel32.a', 'libmingw32.a', 'libmingwex.a', 'libmsvcrt.a', 'libpthread.a',
	'libshell32.a', 'libstdc++.a', 'libstdc++.dll.a', 'libuser32.a'
] as const;
const compilerIncludeDirectories = [
	'c++', 'ddk', 'gdiplus', 'GL', 'KHR', 'isl', 'libiberty', 'lzma',
	'psdk_inc', 'sys', 'wrl'
] as const;
const gccVersion = '16.2.0' as const;
const compilerVersion = 'gcc-16.2.0-clangd-22.1.6' as const;

const requiredToolchainFiles = [
	'ucrt64/bin/g++.exe',
	'ucrt64/bin/gcc.exe',
	'ucrt64/bin/libgcc_s_seh-1.dll',
	'ucrt64/bin/libstdc++-6.dll',
	'ucrt64/bin/libwinpthread-1.dll',
	'ucrt64/bin/libgmp-10.dll',
	'ucrt64/bin/libisl-23.dll',
	'ucrt64/bin/libmpc-3.dll',
	'ucrt64/bin/libmpfr-6.dll',
	'ucrt64/bin/zlib1.dll',
	'ucrt64/bin/libzstd.dll',
	'ucrt64/bin/libintl-8.dll',
	'ucrt64/bin/libiconv-2.dll',
	'ucrt64/include/c++/16.2.0/x86_64-w64-mingw32/bits/stdc++.h',
	'ucrt64/include/c++/16.2.0/x86_64-w64-mingw32/bits/stdc++.h.gch',
	'ucrt64/include/c++/16.2.0/x86_64-w64-mingw32/bits/debugger.h',
	'ucrt64/lib/gcc/x86_64-w64-mingw32/16.2.0/cc1.exe',
	'ucrt64/lib/gcc/x86_64-w64-mingw32/16.2.0/cc1plus.exe',
	'ucrt64/lib/gcc/x86_64-w64-mingw32/16.2.0/collect2.exe',
	'ucrt64/x86_64-w64-mingw32/bin/as.exe',
	'ucrt64/x86_64-w64-mingw32/bin/ld.exe',
	'ucrt64/x86_64-w64-mingw32/bin/libiconv-2.dll',
	'ucrt64/x86_64-w64-mingw32/bin/libintl-8.dll',
	'ucrt64/x86_64-w64-mingw32/bin/libwinpthread-1.dll',
	'ucrt64/x86_64-w64-mingw32/bin/libzstd.dll',
	'ucrt64/x86_64-w64-mingw32/bin/zlib1.dll',
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
	readonly toolchainVersion: typeof compilerVersion;
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
	return { schemaVersion: 2, toolchainVersion: compilerVersion, files };
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
	const compilerRoot = path.join(toolchainRoot, 'ucrt64');
	const sourceRoot = path.join(expandedRoot, 'ucrt64');
	await fs.promises.mkdir(expandedRoot, { recursive: true });
	try {
		await extract(compilerArchive, { dir: expandedRoot });
		await fs.promises.mkdir(stagedRoot, { recursive: true });

		for (const name of compilerBinFiles) {
			await copyFile(path.join(sourceRoot, 'bin', name), path.join(stagedRoot, 'bin', name));
		}

		for (const name of compilerIncludeDirectories) {
			await copyDirectory(path.join(sourceRoot, 'include', name), path.join(stagedRoot, 'include', name));
		}
		for (const entry of await fs.promises.readdir(path.join(sourceRoot, 'include'), { withFileTypes: true })) {
			if (entry.isFile()) {
				await copyFile(path.join(sourceRoot, 'include', entry.name), path.join(stagedRoot, 'include', entry.name));
			}
		}
		for (const name of compilerTargetBinFiles) {
			await copyFile(path.join(sourceRoot, 'x86_64-w64-mingw32', 'bin', name), path.join(stagedRoot, 'x86_64-w64-mingw32', 'bin', name));
		}
		await copyDirectory(path.join(sourceRoot, 'x86_64-w64-mingw32', 'lib', 'ldscripts'), path.join(stagedRoot, 'x86_64-w64-mingw32', 'lib', 'ldscripts'));

		for (const name of compilerRootLibraryFiles) {
			await copyFile(path.join(sourceRoot, 'lib', name), path.join(stagedRoot, 'lib', name));
		}

		const gccRelativeRoot = path.join('lib', 'gcc', 'x86_64-w64-mingw32', gccVersion);
		for (const name of compilerGccFiles) {
			await copyFile(path.join(sourceRoot, gccRelativeRoot, name), path.join(stagedRoot, gccRelativeRoot, name));
		}
		for (const name of compilerGccDirectories) {
			await copyDirectory(path.join(sourceRoot, gccRelativeRoot, name), path.join(stagedRoot, gccRelativeRoot, name));
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
	await fs.promises.rm(path.join(toolchainRoot, 'clangd', 'clangd_22.1.6', 'lib', 'clang', '22', 'lib', 'windows'), { recursive: true, force: true });

	const manifest = await createManifest(toolchainRoot);
	await fs.promises.writeFile(path.join(toolchainRoot, beCoderToolchainManifestName), `${JSON.stringify(manifest, undefined, '\t')}\n`, 'utf8');
	await fs.promises.writeFile(path.join(dataRoot, '.becoder-data-root'), 'BeCoder self-contained data v1\n', 'utf8');
}

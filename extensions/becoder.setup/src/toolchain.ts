/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { selectDisplayText } from './localize';
import { IToolchainManifest, maximumToolchainManifestBytes, validateToolchainManifest } from './toolchainManifest';

const manifestName = 'becoder-toolchain-manifest.json';
const setupUrl = vscode.Uri.parse('https://github.com/Bc408/BeCoder/releases/latest');
const requiredPaths = new Set([
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
]);

export interface IToolchainValidation {
	readonly root: string;
	readonly issues: readonly string[];
}

export function getBeCoderDataRoot(context: vscode.ExtensionContext): string {
	const packagedRoot = path.resolve(context.extensionPath, '..', '..', '..', '..', 'data');
	if (fs.existsSync(path.join(packagedRoot, '.becoder-data-root'))) {
		return packagedRoot;
	}
	const portableRoot = process.env['VSCODE_PORTABLE'];
	return portableRoot ?? path.resolve(context.globalStorageUri.fsPath, '..', '..', '..');
}

export function getBeCoderToolchainRoot(context: vscode.ExtensionContext): string {
	return path.join(getBeCoderDataRoot(context), 'toolchains');
}

export function getInstalledToolchainPaths(context: vscode.ExtensionContext): { compiler: string; cCompiler: string; clangd: string } {
	const root = getBeCoderToolchainRoot(context);
	return {
		compiler: path.join(root, 'becoder-ucrt64', 'bin', 'g++.exe'),
		cCompiler: path.join(root, 'becoder-ucrt64', 'bin', 'gcc.exe'),
		clangd: path.join(root, 'clangd', 'clangd_22.1.6', 'bin', 'clangd.exe')
	};
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

async function collectInstalledFiles(root: string, relativeDirectory = ''): Promise<string[]> {
	const directory = path.join(root, ...relativeDirectory.split('/').filter(Boolean));
	const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
	const result: string[] = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
		const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
		if (relativePath === manifestName) {
			continue;
		}
		const absolutePath = path.join(root, ...relativePath.split('/'));
		const stat = await fs.promises.lstat(absolutePath).catch(() => undefined);
		if (stat?.isDirectory()) {
			result.push(...await collectInstalledFiles(root, relativePath));
		} else if (stat?.isFile()) {
			result.push(relativePath);
		} else {
			result.push(`${relativePath}/<unsupported>`);
		}
	}
	return result;
}

export async function validateInstalledToolchain(context: vscode.ExtensionContext, verifyHashes = false): Promise<IToolchainValidation> {
	const root = getBeCoderToolchainRoot(context);
	const issues: string[] = [];
	const dataRoot = getBeCoderDataRoot(context);
	if (fs.existsSync(path.join(dataRoot, '.becoder-data-root'))) {
		const installRoot = path.dirname(dataRoot);
		if (path.resolve(installRoot) === path.parse(path.resolve(installRoot)).root
			|| installRoot.length > 70
			|| /[^\x00-\x7f]/.test(installRoot)) {
			issues.push(`Unsupported installation path: ${installRoot}. Reinstall BeCoder to a non-root ASCII path no longer than 70 characters.`);
		}
	}
	const manifestPath = path.join(root, manifestName);
	let manifestValue: unknown;
	try {
		const manifestStat = await fs.promises.stat(manifestPath);
		if (!manifestStat.isFile() || manifestStat.size > maximumToolchainManifestBytes) {
			throw new Error('Toolchain manifest size is invalid.');
		}
		manifestValue = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')) as unknown;
	} catch {
		return { root, issues: [...issues, `Missing or invalid ${manifestName}.`] };
	}
	const manifestValidation = validateToolchainManifest(manifestValue);
	if (!manifestValidation.manifest) {
		return { root, issues: [...issues, manifestValidation.issue ?? 'The toolchain manifest is invalid.'] };
	}
	const manifest: IToolchainManifest = manifestValidation.manifest;
	const manifestPaths = new Set(manifest.files.map(file => file.path));
	const caseInsensitiveManifestPaths = new Set(manifest.files.map(file => file.path.toLowerCase()));
	if (manifestPaths.size !== manifest.files.length || caseInsensitiveManifestPaths.size !== manifest.files.length) {
		issues.push('The toolchain manifest contains duplicate paths.');
	}
	for (const requiredPath of requiredPaths) {
		if (!manifestPaths.has(requiredPath)) {
			issues.push(`Manifest entry missing: ${requiredPath}`);
		}
	}
	const filesToVerify = verifyHashes ? manifest.files : manifest.files.filter(file => requiredPaths.has(file.path));
	for (const file of filesToVerify) {
		const filePath = path.join(root, ...file.path.split('/'));
		const stat = await fs.promises.stat(filePath).catch(() => undefined);
		if (!stat?.isFile() || stat.size !== file.size || (requiredPaths.has(file.path) && stat.size === 0)) {
			issues.push(`Missing or unexpected file: ${file.path}`);
			continue;
		}
		if (verifyHashes && await sha256(filePath) !== file.sha256) {
			issues.push(`Integrity check failed: ${file.path}`);
		}
	}
	if (verifyHashes) {
		const actualFiles = await collectInstalledFiles(root);
		const actualPaths = new Set(actualFiles.map(file => file.toLowerCase()));
		for (const file of actualFiles) {
			if (!caseInsensitiveManifestPaths.has(file.toLowerCase())) {
				issues.push(`Unrecognized toolchain file: ${file}`);
			}
		}
		for (const file of manifest.files) {
			if (!actualPaths.has(file.path.toLowerCase())) {
				issues.push(`Manifest file is absent from the installed tree: ${file.path}`);
			}
		}
	}
	return { root, issues };
}

export function initializeInstalledToolchain(context: vscode.ExtensionContext): void {
	if (process.platform !== 'win32') {
		return;
	}
	void validateInstalledToolchain(context).then(async result => {
		if (result.issues.length === 0) {
			return;
		}
		// allow-any-unicode-next-line
		const getSetup = selectDisplayText('Get BeCoder Setup', '获取 BeCoder Setup');
		// allow-any-unicode-next-line
		const diagnostics = selectDisplayText('Open Diagnostics', '打开诊断');
		const action = await vscode.window.showErrorMessage(
			selectDisplayText(
				'The BeCoder toolchain is incomplete or damaged. Reinstall BeCoder with the latest Setup package.',
				// allow-any-unicode-next-line
				'BeCoder 工具链不完整或已损坏。请使用最新 Setup 安装包重新安装 BeCoder。'
			),
			getSetup,
			diagnostics
		);
		if (action === getSetup) {
			await vscode.env.openExternal(setupUrl);
		} else if (action === diagnostics) {
			await vscode.commands.executeCommand('becoder.openToolchainDiagnostics');
		}
	}, error => console.error('BeCoder toolchain health check failed.', error));
}

export async function openLatestBeCoderSetup(): Promise<void> {
	await vscode.env.openExternal(setupUrl);
}

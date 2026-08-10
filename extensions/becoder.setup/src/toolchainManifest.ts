/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IToolchainManifestFile {
	readonly path: string;
	readonly size: number;
	readonly sha256: string;
}

export interface IToolchainManifest {
	readonly schemaVersion: 2;
	readonly toolchainVersion: 'gcc-14.1.0-clangd-22.1.6';
	readonly files: readonly IToolchainManifestFile[];
}

export const maximumToolchainManifestBytes = 16 * 1024 * 1024;
export const maximumToolchainManifestFiles = 100_000;

function isSafeManifestPath(relativePath: string): boolean {
	return relativePath.length > 0
		&& !/^(?:[a-z]:|[/\\])/i.test(relativePath)
		&& !relativePath.includes('\\')
		&& relativePath.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

function isManifestFile(value: unknown): value is IToolchainManifestFile {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return typeof candidate.path === 'string'
		&& isSafeManifestPath(candidate.path)
		&& Number.isSafeInteger(candidate.size)
		&& (candidate.size as number) >= 0
		&& typeof candidate.sha256 === 'string'
		&& /^[0-9a-f]{64}$/.test(candidate.sha256);
}

export function validateToolchainManifest(value: unknown): { manifest?: IToolchainManifest; issue?: string } {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { issue: 'The toolchain manifest has an unsupported format or version.' };
	}
	const candidate = value as Record<string, unknown>;
	if (candidate.schemaVersion !== 2
		|| candidate.toolchainVersion !== 'gcc-14.1.0-clangd-22.1.6'
		|| !Array.isArray(candidate.files)) {
		return { issue: 'The toolchain manifest has an unsupported format or version.' };
	}
	if (candidate.files.length > maximumToolchainManifestFiles) {
		return { issue: 'The toolchain manifest contains too many files.' };
	}
	if (candidate.files.some(file => !isManifestFile(file))) {
		return { issue: 'The toolchain manifest contains an invalid file entry.' };
	}
	return { manifest: candidate as unknown as IToolchainManifest };
}

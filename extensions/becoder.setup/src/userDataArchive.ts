/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';

export const backupSchemaVersion = 1;
export const maximumBackupBytes = 2 * 1024 * 1024 * 1024;
export const maximumBackupFiles = 100_000;
export const maximumBackupManifestBytes = 16 * 1024 * 1024;

export interface IBackupManifestFile {
	readonly path: string;
	readonly size: number;
	readonly sha256: string;
}

export interface IBackupManifest {
	readonly schemaVersion: 1;
	readonly product: 'BeCoder';
	readonly createdAt: string;
	readonly files: readonly IBackupManifestFile[];
}

function safeRelativePath(value: string): boolean {
	const segments = value.split('/');
	return value.length > 0
		&& !path.isAbsolute(value)
		&& !value.includes('\\')
		&& segments.every(segment => segment !== ''
			&& segment !== '.'
			&& segment !== '..'
			&& !/[\u0000-\u001f<>:"|?*]/.test(segment)
			&& !/[. ]$/.test(segment)
			&& !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment));
}

export async function sha256(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		const input = fs.createReadStream(filePath);
		input.on('error', reject);
		input.on('data', chunk => hash.update(chunk));
		input.on('end', () => resolve(hash.digest('hex')));
	});
}

async function collectFiles(root: string, relativeDirectory = ''): Promise<string[]> {
	const directory = path.join(root, ...relativeDirectory.split('/').filter(Boolean));
	const entries = await fs.promises.readdir(directory, { withFileTypes: true });
	const result: string[] = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
		const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
		const absolutePath = path.join(root, ...relativePath.split('/'));
		const stat = await fs.promises.lstat(absolutePath);
		if (stat.isSymbolicLink()) {
			throw new Error(`Backup data contains an unsupported link: ${relativePath}`);
		}
		if (stat.isDirectory()) {
			result.push(...await collectFiles(root, relativePath));
		} else if (stat.isFile()) {
			result.push(relativePath);
		} else {
			throw new Error(`Backup data contains an unsupported entry: ${relativePath}`);
		}
	}
	return result;
}

export async function resolveCanonicalDestination(candidate: string): Promise<string> {
	let existingAncestor = path.resolve(candidate);
	const missingSegments: string[] = [];
	while (!fs.existsSync(existingAncestor)) {
		const parent = path.dirname(existingAncestor);
		if (parent === existingAncestor) {
			throw new Error(`Unable to resolve backup destination: ${candidate}`);
		}
		missingSegments.unshift(path.basename(existingAncestor));
		existingAncestor = parent;
	}
	return path.join(await fs.promises.realpath(existingAncestor), ...missingSegments);
}

export async function createBackupArchive(stagingRoot: string, destination: string): Promise<void> {
	const payloadRoot = path.join(stagingRoot, 'payload');
	const payloadFiles = await collectFiles(payloadRoot);
	if (payloadFiles.length > maximumBackupFiles) {
		throw new Error('The BeCoder backup contains too many files.');
	}
	const files: IBackupManifestFile[] = [];
	let totalBytes = 0;
	for (const relativePath of payloadFiles) {
		const absolutePath = path.join(payloadRoot, ...relativePath.split('/'));
		const stat = await fs.promises.stat(absolutePath);
		totalBytes += stat.size;
		if (totalBytes > maximumBackupBytes) {
			throw new Error('The BeCoder backup exceeds the 2 GiB safety limit.');
		}
		files.push({ path: relativePath, size: stat.size, sha256: await sha256(absolutePath) });
	}
	const manifest: IBackupManifest = { schemaVersion: 1, product: 'BeCoder', createdAt: new Date().toISOString(), files };
	const manifestBuffer = Buffer.from(`${JSON.stringify(manifest, undefined, '\t')}\n`, 'utf8');
	if (manifestBuffer.byteLength > maximumBackupManifestBytes) {
		throw new Error('The BeCoder backup manifest exceeds its safety limit.');
	}
	const temporaryPath = `${destination}.${process.pid}.${Date.now()}.tmp`;
	const previousPath = `${destination}.${process.pid}.${Date.now()}.previous`;
	await fs.promises.mkdir(path.dirname(destination), { recursive: true });
	try {
		await new Promise<void>((resolve, reject) => {
			const archive = new yazl.ZipFile();
			const output = fs.createWriteStream(temporaryPath, { flags: 'wx' });
			archive.outputStream.on('error', reject);
			output.on('error', reject);
			output.on('close', resolve);
			archive.outputStream.pipe(output);
			archive.addBuffer(manifestBuffer, 'manifest.json');
			for (const file of files) {
				archive.addFile(path.join(payloadRoot, ...file.path.split('/')), `payload/${file.path}`);
			}
			archive.end();
		});
		let previousMoved = false;
		if (fs.existsSync(destination)) {
			await fs.promises.rename(destination, previousPath);
			previousMoved = true;
		}
		try {
			await fs.promises.rename(temporaryPath, destination);
		} catch (error) {
			if (previousMoved && fs.existsSync(previousPath) && !fs.existsSync(destination)) {
				try {
					await fs.promises.rename(previousPath, destination);
					previousMoved = false;
				} catch (restoreError) {
					throw new AggregateError([error, restoreError], `Unable to publish the BeCoder backup. The previous backup remains at ${previousPath}.`);
				}
			}
			throw error;
		}
		if (previousMoved) {
			await fs.promises.rm(previousPath, { force: true }).catch(error => console.error(`Unable to remove replaced BeCoder backup ${previousPath}.`, error));
		}
	} finally {
		await fs.promises.rm(temporaryPath, { force: true });
	}
}

function openArchive(archivePath: string): Promise<yauzl.ZipFile> {
	return new Promise((resolve, reject) => yauzl.open(archivePath, { lazyEntries: true, autoClose: true, decodeStrings: true, validateEntrySizes: true }, (error, archive) => error || !archive ? reject(error ?? new Error('Unable to open backup.')) : resolve(archive)));
}

function isLink(entry: yauzl.Entry): boolean {
	return ((entry.externalFileAttributes >>> 16) & 0xF000) === 0xA000;
}

export async function extractBackupArchive(archivePath: string, destination: string): Promise<IBackupManifest> {
	const archiveStat = await fs.promises.stat(archivePath);
	if (!archiveStat.isFile() || archiveStat.size > maximumBackupBytes) {
		throw new Error('The selected BeCoder backup is invalid or exceeds 2 GiB.');
	}
	await fs.promises.mkdir(destination, { recursive: true });
	const archive = await openArchive(archivePath);
	const seen = new Set<string>();
	let fileCount = 0;
	let expandedBytes = 0;
	await new Promise<void>((resolve, reject) => {
		let settled = false;
		const fail = (error: unknown): void => {
			if (settled) {
				return;
			}
			settled = true;
			archive.close();
			reject(error);
		};
		archive.on('error', fail);
		archive.on('end', resolve);
		archive.on('entry', entry => {
			void (async () => {
				const entryPath = entry.fileName.replace(/\/$/, '');
				if (!entryPath || !safeRelativePath(entryPath) || isLink(entry)) {
					throw new Error(`Unsafe backup entry: ${entry.fileName}`);
				}
				const caseKey = entryPath.toLowerCase();
				if (seen.has(caseKey)) {
					throw new Error(`Duplicate backup entry: ${entryPath}`);
				}
				seen.add(caseKey);
				if (entryPath === 'manifest.json' && entry.uncompressedSize > maximumBackupManifestBytes) {
					throw new Error('The BeCoder backup manifest exceeds its safety limit.');
				}
				fileCount++;
				expandedBytes += entry.uncompressedSize;
				if (fileCount > maximumBackupFiles || expandedBytes > maximumBackupBytes) {
					throw new Error('The expanded BeCoder backup exceeds its safety limit.');
				}
				const target = path.join(destination, ...entryPath.split('/'));
				if (entry.fileName.endsWith('/')) {
					await fs.promises.mkdir(target, { recursive: true });
					archive.readEntry();
					return;
				}
				await fs.promises.mkdir(path.dirname(target), { recursive: true });
				const input = await new Promise<NodeJS.ReadableStream>((streamResolve, streamReject) => archive.openReadStream(entry, (error, stream) => error || !stream ? streamReject(error ?? new Error('Unable to read backup entry.')) : streamResolve(stream)));
				await new Promise<void>((streamResolve, streamReject) => {
					const output = fs.createWriteStream(target, { flags: 'wx' });
					input.on('error', streamReject);
					output.on('error', streamReject);
					output.on('close', streamResolve);
					input.pipe(output);
				});
				archive.readEntry();
			})().catch(fail);
		});
		archive.readEntry();
	});

	const manifestPath = path.join(destination, 'manifest.json');
	const manifestStat = await fs.promises.stat(manifestPath).catch(() => undefined);
	if (!manifestStat?.isFile() || manifestStat.size > maximumBackupManifestBytes) {
		throw new Error('The BeCoder backup manifest is missing, invalid, or exceeds its safety limit.');
	}
	let manifest: IBackupManifest;
	try {
		manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')) as IBackupManifest;
	} catch {
		throw new Error('The BeCoder backup manifest is missing or invalid.');
	}
	if (manifest.schemaVersion !== backupSchemaVersion || manifest.product !== 'BeCoder' || !Array.isArray(manifest.files)) {
		throw new Error('The BeCoder backup format is not supported.');
	}
	if (manifest.files.length > maximumBackupFiles) {
		throw new Error('The BeCoder backup manifest contains too many files.');
	}
	for (const file of manifest.files as readonly unknown[]) {
		if (!file || typeof file !== 'object' || Array.isArray(file)) {
			throw new Error('The BeCoder backup manifest contains an invalid file entry.');
		}
		const candidate = file as Record<string, unknown>;
		if (typeof candidate.path !== 'string'
			|| !safeRelativePath(candidate.path)
			|| !Number.isSafeInteger(candidate.size)
			|| (candidate.size as number) < 0
			|| typeof candidate.sha256 !== 'string'
			|| !/^[0-9a-f]{64}$/.test(candidate.sha256)) {
			throw new Error('The BeCoder backup manifest contains an invalid file entry.');
		}
	}
	const expectedPaths = new Set(manifest.files.map(file => file.path.toLowerCase()));
	const actualFiles = await collectFiles(path.join(destination, 'payload'));
	if (expectedPaths.size !== manifest.files.length || actualFiles.length !== manifest.files.length || actualFiles.some(file => !expectedPaths.has(file.toLowerCase()))) {
		throw new Error('The BeCoder backup file list does not match its manifest.');
	}
	for (const file of manifest.files) {
		const filePath = path.join(destination, 'payload', ...file.path.split('/'));
		const stat = await fs.promises.stat(filePath);
		if (!stat.isFile() || stat.size !== file.size || await sha256(filePath) !== file.sha256) {
			throw new Error(`Backup integrity check failed: ${file.path}`);
		}
	}
	return manifest;
}

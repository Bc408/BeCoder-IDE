/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import * as yazl from 'yazl';

import { createBackupArchive, extractBackupArchive, maximumBackupManifestBytes, resolveCanonicalDestination } from '../src/userDataArchive';

async function temporaryDirectory(): Promise<string> {
	return fs.promises.mkdtemp(path.join(os.tmpdir(), 'becoder-backup-test-'));
}

function writeArchive(filePath: string, entries: readonly { path: string; value: string }[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const archive = new yazl.ZipFile();
		archive.outputStream.pipe(fs.createWriteStream(filePath)).on('error', reject).on('close', resolve);
		for (const entry of entries) {
			archive.addBuffer(Buffer.from(entry.value), entry.path);
		}
		archive.end();
	});
}

suite('BeCoder user data archive', () => {
	test('round trips a versioned backup with integrity metadata', async () => {
		const root = await temporaryDirectory();
		try {
			const staging = path.join(root, 'staging');
			const payloadFile = path.join(staging, 'payload', 'user-data', 'User', 'settings.json');
			await fs.promises.mkdir(path.dirname(payloadFile), { recursive: true });
			await fs.promises.writeFile(payloadFile, '{"editor.fontSize":14}\n');
			const archive = path.join(root, 'state.becoder-backup');
			await createBackupArchive(staging, archive);
			const extracted = path.join(root, 'extracted');
			const manifest = await extractBackupArchive(archive, extracted);
			assert.strictEqual(manifest.schemaVersion, 1);
			assert.deepStrictEqual(manifest.files.map(file => file.path), ['user-data/User/settings.json']);
			assert.strictEqual(await fs.promises.readFile(path.join(extracted, 'payload', 'user-data', 'User', 'settings.json'), 'utf8'), '{"editor.fontSize":14}\n');
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('rejects a payload whose hash differs from the manifest', async () => {
		const root = await temporaryDirectory();
		try {
			const archive = path.join(root, 'invalid.becoder-backup');
			await writeArchive(archive, [
				{ path: 'manifest.json', value: JSON.stringify({ schemaVersion: 1, product: 'BeCoder', createdAt: new Date().toISOString(), files: [{ path: 'settings.json', size: 2, sha256: '0'.repeat(64) }] }) },
				{ path: 'payload/settings.json', value: '{}'}
			]);
			await assert.rejects(extractBackupArchive(archive, path.join(root, 'extracted')), /integrity check failed/i);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('rejects malformed manifest entries without an unclassified type error', async () => {
		const root = await temporaryDirectory();
		try {
			const archive = path.join(root, 'malformed.becoder-backup');
			await writeArchive(archive, [
				{ path: 'manifest.json', value: JSON.stringify({ schemaVersion: 1, product: 'BeCoder', createdAt: new Date().toISOString(), files: [null] }) }
			]);
			await assert.rejects(extractBackupArchive(archive, path.join(root, 'extracted')), /invalid file entry/i);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('rejects an oversized manifest before reading it into memory', async () => {
		const root = await temporaryDirectory();
		try {
			const archive = path.join(root, 'oversized-manifest.becoder-backup');
			await writeArchive(archive, [
				{ path: 'manifest.json', value: ' '.repeat(maximumBackupManifestBytes + 1) }
			]);
			await assert.rejects(extractBackupArchive(archive, path.join(root, 'extracted')), /manifest exceeds its safety limit/i);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('resolves a destination through its nearest existing junction parent', async t => {
		const root = await temporaryDirectory();
		try {
			const actual = path.join(root, 'actual');
			const junction = path.join(root, 'junction');
			await fs.promises.mkdir(actual);
			try {
				await fs.promises.symlink(actual, junction, 'junction');
			} catch (error) {
				t.skip(`Junction creation is unavailable: ${error instanceof Error ? error.message : String(error)}`);
				return;
			}
			assert.strictEqual(
				await resolveCanonicalDestination(path.join(junction, 'nested', 'state.becoder-backup')),
				path.join(await fs.promises.realpath(actual), 'nested', 'state.becoder-backup')
			);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('rejects case-colliding archive paths', async () => {
		const root = await temporaryDirectory();
		try {
			const archive = path.join(root, 'collision.becoder-backup');
			await writeArchive(archive, [
				{ path: 'manifest.json', value: JSON.stringify({ schemaVersion: 1, product: 'BeCoder', createdAt: new Date().toISOString(), files: [] }) },
				{ path: 'payload/A.txt', value: 'a' },
				{ path: 'payload/a.txt', value: 'b' }
			]);
			await assert.rejects(extractBackupArchive(archive, path.join(root, 'extracted')), /duplicate backup entry/i);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('rejects Windows alternate streams and reserved names', async () => {
		const root = await temporaryDirectory();
		try {
			for (const [name, entryPath] of [['stream', 'payload/settings.json:secret'], ['reserved', 'payload/CON']]) {
				const archive = path.join(root, `${name}.becoder-backup`);
				await writeArchive(archive, [{ path: entryPath, value: 'unsafe' }]);
				await assert.rejects(extractBackupArchive(archive, path.join(root, `extracted-${name}`)), /unsafe backup entry/i);
			}
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('atomically replaces an existing backup', async () => {
		const root = await temporaryDirectory();
		try {
			const staging = path.join(root, 'staging');
			const payloadFile = path.join(staging, 'payload', 'user-data', 'User', 'settings.json');
			await fs.promises.mkdir(path.dirname(payloadFile), { recursive: true });
			await fs.promises.writeFile(payloadFile, '{"editor.fontSize":16}\n');
			const archive = path.join(root, 'existing.becoder-backup');
			await fs.promises.writeFile(archive, 'old backup');
			await createBackupArchive(staging, archive);
			const extracted = path.join(root, 'extracted');
			await extractBackupArchive(archive, extracted);
			assert.strictEqual(await fs.promises.readFile(path.join(extracted, 'payload', 'user-data', 'User', 'settings.json'), 'utf8'), '{"editor.fontSize":16}\n');
			assert.deepStrictEqual((await fs.promises.readdir(root)).filter(name => name.includes('.previous')), []);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});
});

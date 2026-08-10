/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { applyEdits, modify, parse, ParseError } from 'jsonc-parser';
import { readStorageEntries, replaceStorageEntries, StorageEntries } from './storageDatabase';

const protectedExtensionIds = new Set([
	'becoder.becoder-setup',
	'becoder.runner',
	'becoder.gcc-diagnostics',
	'becoder.one-monokai',
	'llvm-vs-code-extensions.vscode-clangd',
	'adpyke.codesnap',
	'vscode.cpp',
	'ms-ceintl.vscode-language-pack-zh-hans'
]);
const blacklistedExtensionIds = new Set(['ms-vscode.cpptools', 'ms-vscode.cpptools-extension-pack']);
const importedUserPaths = ['settings.json', 'keybindings.json', 'snippets', 'History'] as const;
const recentStorageKey = 'history.recentlyOpenedPathsList';
const supportedLocales = new Set(['zh-cn', 'en']);

async function copyEntry(source: string, destination: string): Promise<void> {
	const stat = await fs.promises.lstat(source);
	if (stat.isSymbolicLink()) {
		throw new Error(`Unsupported link in BeCoder user data: ${source}`);
	}
	if (stat.isDirectory()) {
		await fs.promises.mkdir(destination, { recursive: true });
		for (const name of await fs.promises.readdir(source)) {
			await copyEntry(path.join(source, name), path.join(destination, name));
		}
	} else if (stat.isFile()) {
		await fs.promises.mkdir(path.dirname(destination), { recursive: true });
		await fs.promises.copyFile(source, destination);
	} else {
		throw new Error(`Unsupported entry in BeCoder user data: ${source}`);
	}
}

async function copyIfPresent(source: string, destination: string): Promise<void> {
	if (fs.existsSync(source)) {
		await copyEntry(source, destination);
	}
}

function ownsWorkspaceState(key: string): boolean {
	return key === 'history.entries'
		|| key.startsWith('memento/workbench.editors.')
		|| key === 'memento/workbench.parts.editor'
		|| key.startsWith('workbench.');
}

async function readJsonObject(filePath: string): Promise<StorageEntries> {
	if (!fs.existsSync(filePath)) {
		return {};
	}
	const value = JSON.parse(await fs.promises.readFile(filePath, 'utf8')) as unknown;
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(entry => typeof entry !== 'string')) {
		throw new Error(`Invalid backup state file: ${filePath}`);
	}
	return value as StorageEntries;
}

function parseJsoncObject(contents: string, source: string): Record<string, unknown> {
	const errors: ParseError[] = [];
	const value = parse(contents, errors, { allowTrailingComma: true, disallowComments: false }) as unknown;
	if (errors.length > 0 || !value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Invalid JSONC object: ${source}`);
	}
	return value as Record<string, unknown>;
}

async function readExportLocale(dataRoot: string): Promise<string | undefined> {
	const argvPath = path.join(dataRoot, 'argv.json');
	if (!fs.existsSync(argvPath)) {
		return undefined;
	}
	const contents = await fs.promises.readFile(argvPath, 'utf8');
	const locale = parseJsoncObject(contents, argvPath)['locale'];
	return typeof locale === 'string' && supportedLocales.has(locale.toLowerCase()) ? locale.toLowerCase() : undefined;
}

async function readImportedLocale(payloadRoot: string): Promise<string | undefined> {
	const localePath = path.join(payloadRoot, 'state', 'locale.json');
	if (!fs.existsSync(localePath)) {
		return undefined;
	}
	const value = JSON.parse(await fs.promises.readFile(localePath, 'utf8')) as unknown;
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Invalid BeCoder display-language backup.');
	}
	const object = value as Record<string, unknown>;
	if (Object.keys(object).length !== 1 || typeof object.locale !== 'string' || !supportedLocales.has(object.locale.toLowerCase())) {
		throw new Error('Invalid BeCoder display-language backup.');
	}
	return object.locale.toLowerCase();
}

async function exportState(dataRoot: string, payloadRoot: string): Promise<void> {
	const stateRoot = path.join(payloadRoot, 'state');
	const recentDatabase = path.join(dataRoot, 'shared-data', 'sharedStorage', 'state.vscdb');
	const recent = await readStorageEntries(recentDatabase, key => key === recentStorageKey);
	await fs.promises.mkdir(stateRoot, { recursive: true });
	await fs.promises.writeFile(path.join(stateRoot, 'recent.json'), `${JSON.stringify(recent, undefined, '\t')}\n`, 'utf8');

	const locale = await readExportLocale(dataRoot);
	if (locale) {
		await fs.promises.writeFile(path.join(stateRoot, 'locale.json'), `${JSON.stringify({ locale }, undefined, '\t')}\n`, 'utf8');
	}

	const workspaceRoot = path.join(dataRoot, 'user-data', 'User', 'workspaceStorage');
	if (!fs.existsSync(workspaceRoot)) {
		return;
	}
	for (const entry of await fs.promises.readdir(workspaceRoot, { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^[0-9a-f]{32}$/i.test(entry.name)) {
			continue;
		}
		const sourceRoot = path.join(workspaceRoot, entry.name);
		const destinationRoot = path.join(stateRoot, 'workspaces', entry.name);
		const values = await readStorageEntries(path.join(sourceRoot, 'state.vscdb'), ownsWorkspaceState);
		if (Object.keys(values).length === 0 && !fs.existsSync(path.join(sourceRoot, 'workspace.json'))) {
			continue;
		}
		await fs.promises.mkdir(destinationRoot, { recursive: true });
		await fs.promises.writeFile(path.join(destinationRoot, 'entries.json'), `${JSON.stringify(values, undefined, '\t')}\n`, 'utf8');
		await copyIfPresent(path.join(sourceRoot, 'workspace.json'), path.join(destinationRoot, 'workspace.json'));
	}
}

async function extensionIdentity(extensionPath: string): Promise<string> {
	const manifestPath = path.join(extensionPath, 'package.json');
	let manifest: { publisher?: unknown; name?: unknown };
	try {
		manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')) as { publisher?: unknown; name?: unknown };
	} catch {
		throw new Error(`User extension has no valid package.json: ${extensionPath}`);
	}
	if (typeof manifest.publisher !== 'string' || typeof manifest.name !== 'string') {
		throw new Error(`User extension has an invalid identity: ${extensionPath}`);
	}
	return `${manifest.publisher}.${manifest.name}`.toLowerCase();
}

async function validateExtensions(sourceRoot: string, destinationRoot?: string, rejectNonDirectories = true): Promise<void> {
	if (!fs.existsSync(sourceRoot)) {
		return;
	}
	const identities = new Set<string>();
	for (const entry of await fs.promises.readdir(sourceRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			if (rejectNonDirectories) {
				throw new Error(`Invalid user extension entry: ${entry.name}`);
			}
			continue;
		}
		const source = path.join(sourceRoot, entry.name);
		const identity = await extensionIdentity(source);
		if (protectedExtensionIds.has(identity) || blacklistedExtensionIds.has(identity)) {
			throw new Error(`The backup contains a protected or blocked extension: ${identity}`);
		}
		if (identities.has(identity)) {
			throw new Error(`The backup contains duplicate extension identities: ${identity}`);
		}
		identities.add(identity);
		if (destinationRoot) {
			await copyEntry(source, path.join(destinationRoot, entry.name));
		}
	}
}

async function validateWorkspaceState(payloadRoot: string): Promise<void> {
	const importedWorkspaceRoot = path.join(payloadRoot, 'state', 'workspaces');
	if (!fs.existsSync(importedWorkspaceRoot)) {
		return;
	}
	for (const entry of await fs.promises.readdir(importedWorkspaceRoot, { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^[0-9a-f]{32}$/i.test(entry.name)) {
			throw new Error(`Invalid workspace state directory: ${entry.name}`);
		}
		const sourceRoot = path.join(importedWorkspaceRoot, entry.name);
		const values = await readJsonObject(path.join(sourceRoot, 'entries.json'));
		if (Object.keys(values).some(key => !ownsWorkspaceState(key))) {
			throw new Error(`The backup contains unsupported workspace state: ${entry.name}`);
		}
	}
}

export async function createExportPayload(dataRoot: string, payloadRoot: string): Promise<void> {
	await fs.promises.mkdir(payloadRoot, { recursive: true });
	const userRoot = path.join(dataRoot, 'user-data', 'User');
	for (const relativePath of importedUserPaths) {
		await copyIfPresent(path.join(userRoot, relativePath), path.join(payloadRoot, 'user-data', 'User', relativePath));
	}
	await validateExtensions(path.join(dataRoot, 'extensions'), path.join(payloadRoot, 'extensions'), false);
	await exportState(dataRoot, payloadRoot);
}

export async function validateImportedPayload(extractedRoot: string): Promise<void> {
	const payloadRoot = path.join(extractedRoot, 'payload');
	await validateExtensions(path.join(payloadRoot, 'extensions'));
	await validateWorkspaceState(payloadRoot);
	const recent = await readJsonObject(path.join(payloadRoot, 'state', 'recent.json'));
	if (Object.keys(recent).some(key => key !== recentStorageKey)) {
		throw new Error('The backup contains unsupported recent-project state.');
	}
	await readImportedLocale(payloadRoot);
}

async function stageImportedArgv(dataRoot: string, payloadRoot: string, stagedArgvPath: string): Promise<boolean> {
	const locale = await readImportedLocale(payloadRoot);
	if (!locale) {
		return false;
	}
	const argvPath = path.join(dataRoot, 'argv.json');
	const contents = fs.existsSync(argvPath) ? await fs.promises.readFile(argvPath, 'utf8') : '{}\n';
	parseJsoncObject(contents, argvPath);
	const updated = applyEdits(contents, modify(contents, ['locale'], locale, {
		formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' }
	}));
	await fs.promises.writeFile(stagedArgvPath, updated, 'utf8');
	return true;
}

export async function prepareImportedPayload(dataRoot: string, extractedRoot: string, stagingRoot: string, stagedArgvPath: string): Promise<boolean> {
	const payloadRoot = path.join(extractedRoot, 'payload');
	for (const name of ['user-data', 'shared-data', 'extensions']) {
		await copyIfPresent(path.join(dataRoot, name), path.join(stagingRoot, name));
		await fs.promises.mkdir(path.join(stagingRoot, name), { recursive: true });
	}

	const stagedUserRoot = path.join(stagingRoot, 'user-data', 'User');
	for (const relativePath of importedUserPaths) {
		await fs.promises.rm(path.join(stagedUserRoot, relativePath), { recursive: true, force: true });
		await copyIfPresent(path.join(payloadRoot, 'user-data', 'User', relativePath), path.join(stagedUserRoot, relativePath));
	}

	const stagedExtensions = path.join(stagingRoot, 'extensions');
	await fs.promises.rm(stagedExtensions, { recursive: true, force: true });
	await fs.promises.mkdir(stagedExtensions, { recursive: true });
	await validateExtensions(path.join(payloadRoot, 'extensions'), stagedExtensions);

	const stagedWorkspaceRoot = path.join(stagedUserRoot, 'workspaceStorage');
	await fs.promises.rm(stagedWorkspaceRoot, { recursive: true, force: true });
	await fs.promises.mkdir(stagedWorkspaceRoot, { recursive: true });
	const importedWorkspaceRoot = path.join(payloadRoot, 'state', 'workspaces');
	if (fs.existsSync(importedWorkspaceRoot)) {
		for (const entry of await fs.promises.readdir(importedWorkspaceRoot, { withFileTypes: true })) {
			const sourceRoot = path.join(importedWorkspaceRoot, entry.name);
			const destinationRoot = path.join(stagedWorkspaceRoot, entry.name);
			const values = await readJsonObject(path.join(sourceRoot, 'entries.json'));
			await fs.promises.mkdir(destinationRoot, { recursive: true });
			await copyIfPresent(path.join(sourceRoot, 'workspace.json'), path.join(destinationRoot, 'workspace.json'));
			await replaceStorageEntries(path.join(destinationRoot, 'state.vscdb'), values, ownsWorkspaceState);
		}
	}

	const recent = await readJsonObject(path.join(payloadRoot, 'state', 'recent.json'));
	await replaceStorageEntries(path.join(stagingRoot, 'shared-data', 'sharedStorage', 'state.vscdb'), recent, key => key === recentStorageKey);
	return stageImportedArgv(dataRoot, payloadRoot, stagedArgvPath);
}

export async function cleanupAbandonedUserDataOperations(dataRoot: string, now = Date.now()): Promise<void> {
	if (!fs.existsSync(path.join(dataRoot, '.becoder-data-root'))) {
		return;
	}
	const staleBefore = now - 24 * 60 * 60_000;
	for (const entry of await fs.promises.readdir(dataRoot, { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\.becoder-(?:export|import)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.name)) {
			continue;
		}
		const candidate = path.join(dataRoot, entry.name);
		const stat = await fs.promises.lstat(candidate);
		if (!stat.isSymbolicLink() && stat.mtimeMs < staleBefore) {
			await fs.promises.rm(candidate, { recursive: true, force: true });
		}
	}
}

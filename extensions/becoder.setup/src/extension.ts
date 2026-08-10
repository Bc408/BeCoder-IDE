/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDeepStrictEqual } from 'util';
import * as vscode from 'vscode';
import { FileVisibilityState, hideBeCoderFiles, isBeCoderHideActiveInAllScopes, migrateLegacyBeCoderExcludes, showBeCoderFiles } from './fileVisibility';
import { registerSimpleSettings } from './simpleSettings';
import { initializeInstalledToolchain } from './toolchain';
import { registerToolchainDiagnostics } from './toolchainDiagnostics';
import { registerUserDataPortability } from './userDataPortability';

const LEGACY_FILE_EXCLUDES_MIGRATION = 'becoder.fileExcludes.v4';
const FILE_EXCLUDES_MIGRATION = 'becoder.fileExcludes.v5';
const FILE_VISIBILITY_STATE = 'becoder.fileVisibility.state.v1';
const CLANGD_SETTINGS_MIGRATION = 'becoder.clangdSettings.v1';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	registerSimpleSettings(context);
	registerToolchainDiagnostics(context);
	registerUserDataPortability(context);
	if (!context.globalState.get<boolean>(FILE_EXCLUDES_MIGRATION)) {
		await migrateLegacyFileExcludes(context.globalState.get<boolean>(LEGACY_FILE_EXCLUDES_MIGRATION) === true);
		await context.globalState.update(FILE_EXCLUDES_MIGRATION, true);
	}
	if (!context.globalState.get<boolean>(CLANGD_SETTINGS_MIGRATION)) {
		await removeLegacyClangdSettings();
		await context.globalState.update(CLANGD_SETTINGS_MIGRATION, true);
	}

	const updateHiddenFilesContext = (): void => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const effectiveExcludes = workspaceFolders?.length
			? workspaceFolders.map(folder => vscode.workspace.getConfiguration('files', folder.uri).get<Record<string, unknown>>('exclude') ?? {})
			: [vscode.workspace.getConfiguration('files').get<Record<string, unknown>>('exclude') ?? {}];
		void vscode.commands.executeCommand(
			'setContext',
			'becoder.filesHiddenByBeCoder',
			isBeCoderHideActiveInAllScopes(
				getGlobalFileExcludes(),
				context.globalState.get<FileVisibilityState>(FILE_VISIBILITY_STATE),
				effectiveExcludes
			)
		);
	};
	let fileVisibilityOperation = Promise.resolve();
	const enqueueFileVisibilityOperation = (operation: () => Promise<void>): Promise<void> => {
		const result = fileVisibilityOperation.then(operation, operation);
		fileVisibilityOperation = result.then(() => undefined, () => undefined);
		return result.finally(updateHiddenFilesContext);
	};
	context.subscriptions.push(vscode.commands.registerCommand('becoder.showAllFiles', () => enqueueFileVisibilityOperation(() => showAllFiles(context))));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.hideSetupFiles', () => enqueueFileVisibilityOperation(() => hideSetupFiles(context))));
	updateHiddenFilesContext();
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('files.exclude')) {
			updateHiddenFilesContext();
		}
	}));
	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(updateHiddenFilesContext));

	initializeInstalledToolchain(context);
}

function getGlobalFileExcludes(): Record<string, unknown> {
	return vscode.workspace.getConfiguration('files', null).inspect<Record<string, unknown>>('exclude')?.globalValue ?? {};
}

async function migrateLegacyFileExcludes(legacyDefaultsWereApplied: boolean): Promise<void> {
	const excludes = getGlobalFileExcludes();
	const updatedExcludes = migrateLegacyBeCoderExcludes(excludes, legacyDefaultsWereApplied);
	if (isDeepStrictEqual(updatedExcludes, excludes)) {
		return;
	}
	await vscode.workspace.getConfiguration('files', null).update('exclude', updatedExcludes, vscode.ConfigurationTarget.Global);
}

async function removeLegacyClangdSettings(): Promise<void> {
	const configuration = vscode.workspace.getConfiguration(undefined, null);
	for (const key of [
		'becoder.toolchain.clangdPath',
		'clangd.arguments',
		'clangd.checkUpdates',
		'clangd.enable',
		'clangd.enableCodeCompletion',
		'clangd.enableHover',
		'clangd.fallbackFlags',
		'clangd.onConfigChanged',
		'clangd.onConfigChangedForceEnable',
		'clangd.path',
		'clangd.restartAfterCrash',
		'clangd.serverCompletionRanking',
		'clangd.trace',
		'clangd.useScriptAsExecutable'
	]) {
		if (configuration.inspect(key)?.globalValue !== undefined) {
			await configuration.update(key, undefined, vscode.ConfigurationTarget.Global);
		}
	}
}

async function hideSetupFiles(context: vscode.ExtensionContext): Promise<void> {
	const previousExcludes = getGlobalFileExcludes();
	const hidden = hideBeCoderFiles(previousExcludes, context.globalState.get<FileVisibilityState>(FILE_VISIBILITY_STATE));
	await vscode.workspace.getConfiguration('files', null).update('exclude', hidden.excludes, vscode.ConfigurationTarget.Global);
	try {
		await context.globalState.update(FILE_VISIBILITY_STATE, hidden.state);
	} catch (error) {
		if (isDeepStrictEqual(getGlobalFileExcludes(), hidden.excludes)) {
			try {
				await vscode.workspace.getConfiguration('files', null).update('exclude', previousExcludes, vscode.ConfigurationTarget.Global);
			} catch {
				// Preserve the original global-state failure when conservative rollback also fails.
			}
		}
		throw error;
	}
}

async function showAllFiles(context: vscode.ExtensionContext): Promise<void> {
	const excludes = showBeCoderFiles(getGlobalFileExcludes(), context.globalState.get<FileVisibilityState>(FILE_VISIBILITY_STATE));
	await vscode.workspace.getConfiguration('files', null).update('exclude', excludes, vscode.ConfigurationTarget.Global);
	await context.globalState.update(FILE_VISIBILITY_STATE, undefined);
}

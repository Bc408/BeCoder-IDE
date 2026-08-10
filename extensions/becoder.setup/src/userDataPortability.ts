/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { selectDisplayText } from './localize';
import { createBackupArchive, extractBackupArchive, resolveCanonicalDestination } from './userDataArchive';
import { cleanupAbandonedUserDataOperations, createExportPayload, validateImportedPayload } from './userDataPayload';
import { getBeCoderDataRoot } from './toolchain';

interface IImportHelperConfiguration {
	readonly schemaVersion: 1;
	readonly dataRoot: string;
	readonly operationRoot: string;
	readonly executable: string;
	readonly waitPids: readonly number[];
	readonly resultPath: string;
}

function isInside(parent: string, candidate: string): boolean {
	const relative = path.relative(path.resolve(parent), path.resolve(candidate));
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function exportUserData(context: vscode.ExtensionContext): Promise<void> {
	const dataRoot = getBeCoderDataRoot(context);
	const installRoot = path.dirname(dataRoot);
	const destination = await vscode.window.showSaveDialog({
		filters: { 'BeCoder User Data': ['becoder-backup'] },
		defaultUri: vscode.Uri.file(path.join(os.homedir(), `BeCoder-${new Date().toISOString().slice(0, 10)}.becoder-backup`)),
		// allow-any-unicode-next-line
		title: selectDisplayText('Export BeCoder User Data', '导出 BeCoder 用户数据')
	});
	if (!destination) {
		return;
	}
	if (destination.scheme !== 'file') {
		throw new Error('BeCoder user data can only be exported to a local file.');
	}
	let destinationPath = destination.fsPath;
	if (!destinationPath.toLowerCase().endsWith('.becoder-backup')) {
		destinationPath += '.becoder-backup';
	}
	destinationPath = await resolveCanonicalDestination(destinationPath);
	const canonicalInstallRoot = await fs.promises.realpath(installRoot);
	if (isInside(canonicalInstallRoot, destinationPath)) {
		void vscode.window.showErrorMessage(selectDisplayText(
			'Choose a backup location outside the BeCoder installation folder.',
			// allow-any-unicode-next-line
			'请选择 BeCoder 安装目录以外的位置保存备份。'
		));
		return;
	}
	const stagingRoot = path.join(dataRoot, `.becoder-export-${crypto.randomUUID()}`);
	await fs.promises.mkdir(stagingRoot);
	try {
		// allow-any-unicode-next-line
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: selectDisplayText('Exporting BeCoder user data...', '正在导出 BeCoder 用户数据...'), cancellable: false }, async () => {
			await createExportPayload(dataRoot, path.join(stagingRoot, 'payload'));
			await createBackupArchive(stagingRoot, destinationPath);
		});
		// allow-any-unicode-next-line
		void vscode.window.showInformationMessage(selectDisplayText('BeCoder user data was exported.', 'BeCoder 用户数据已导出。'));
	} finally {
		await fs.promises.rm(stagingRoot, { recursive: true, force: true });
	}
}

async function startImportHelper(context: vscode.ExtensionContext, dataRoot: string, operationRoot: string): Promise<void> {
	const resultPath = path.join(dataRoot, '.becoder-import-result.json');
	await fs.promises.rm(resultPath, { force: true });
	const configuration: IImportHelperConfiguration = {
		schemaVersion: 1,
		dataRoot,
		operationRoot,
		executable: process.execPath,
		waitPids: [...new Set([process.pid, process.ppid].filter(pid => Number.isSafeInteger(pid) && pid > 0))],
		resultPath
	};
	const configurationPath = path.join(operationRoot, 'import.json');
	await fs.promises.writeFile(configurationPath, `${JSON.stringify(configuration, undefined, '\t')}\n`, 'utf8');
	const environment = createImportHelperEnvironment(context.extensionPath);
	const helper = spawn(process.execPath, [context.asAbsolutePath(path.join('out', 'userDataImportHelper.js')), configurationPath], { detached: true, env: environment, stdio: 'ignore', windowsHide: true });
	await new Promise<void>((resolve, reject) => {
		const onError = (error: Error): void => reject(error);
		helper.once('error', onError);
		helper.once('spawn', () => {
			helper.removeListener('error', onError);
			helper.on('error', error => console.error('BeCoder import helper failed after startup.', error));
			helper.unref();
			resolve();
		});
	});
}

export function createImportHelperEnvironment(extensionPath: string): NodeJS.ProcessEnv {
	const environment = { ...process.env };
	for (const name of Object.keys(environment)) {
		if (name === 'NODE_OPTIONS' || name === 'NODE_PATH' || name.startsWith('VSCODE_') || name.startsWith('ELECTRON_')) {
			delete environment[name];
		}
	}
	const applicationRoot = path.resolve(extensionPath, '..', '..');
	const archivePath = path.join(applicationRoot, 'node_modules.asar');
	const unpackedPath = path.join(applicationRoot, 'node_modules.asar.unpacked');
	const developmentPath = path.join(applicationRoot, 'node_modules');
	environment['ELECTRON_RUN_AS_NODE'] = '1';
	environment['NODE_PATH'] = fs.existsSync(archivePath)
		? [archivePath, unpackedPath].join(path.delimiter)
		: developmentPath;
	return environment;
}

async function importUserData(context: vscode.ExtensionContext): Promise<void> {
	const selection = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: false,
		canSelectMany: false,
		filters: { 'BeCoder User Data': ['becoder-backup'] },
		// allow-any-unicode-next-line
		title: selectDisplayText('Import BeCoder User Data', '导入 BeCoder 用户数据')
	});
	if (!selection?.[0] || selection[0].scheme !== 'file') {
		return;
	}
	const confirm = await vscode.window.showWarningMessage(
		selectDisplayText(
			'Import replaces BeCoder settings, extensions, recent projects, workspace state, and local file history. Save your work, then BeCoder will restart.',
			// allow-any-unicode-next-line
			'导入将替换 BeCoder 设置、扩展、最近项目、工作区状态和本地文件历史。请先保存工作，随后 BeCoder 将重新启动。'
		),
		{ modal: true },
		// allow-any-unicode-next-line
		selectDisplayText('Import and Restart', '导入并重新启动')
	);
	if (!confirm) {
		return;
	}
	if (!await vscode.workspace.saveAll(false) || vscode.workspace.textDocuments.some(document => document.isDirty)) {
		// allow-any-unicode-next-line
		void vscode.window.showErrorMessage(selectDisplayText('Save or close all unsaved files before importing.', '请先保存或关闭所有未保存文件，再执行导入。'));
		return;
	}

	const dataRoot = getBeCoderDataRoot(context);
	const operationRoot = path.join(dataRoot, `.becoder-import-${crypto.randomUUID()}`);
	const extractedRoot = path.join(operationRoot, 'extracted');
	let helperStarted = false;
	try {
		// allow-any-unicode-next-line
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: selectDisplayText('Validating BeCoder user data...', '正在校验 BeCoder 用户数据...'), cancellable: false }, async () => {
			await extractBackupArchive(selection[0].fsPath, extractedRoot);
			await validateImportedPayload(extractedRoot);
		});
		await startImportHelper(context, dataRoot, operationRoot);
		helperStarted = true;
		await vscode.commands.executeCommand('workbench.action.quit');
	} catch (error) {
		if (!helperStarted) {
			await fs.promises.rm(operationRoot, { recursive: true, force: true });
		}
		throw error;
	}
}

async function reportImportResult(context: vscode.ExtensionContext): Promise<void> {
	const resultPath = path.join(getBeCoderDataRoot(context), '.becoder-import-result.json');
	if (!fs.existsSync(resultPath)) {
		return;
	}
	try {
		const result = JSON.parse(await fs.promises.readFile(resultPath, 'utf8')) as { success?: unknown; message?: unknown };
		if (result.success === true) {
			// allow-any-unicode-next-line
			void vscode.window.showInformationMessage(selectDisplayText('BeCoder user data was imported.', 'BeCoder 用户数据已导入。'));
		} else {
			// allow-any-unicode-next-line
			void vscode.window.showErrorMessage(selectDisplayText(`BeCoder user data import failed: ${String(result.message ?? 'Unknown error')}`, `BeCoder 用户数据导入失败：${String(result.message ?? '未知错误')}`));
		}
	} finally {
		await fs.promises.rm(resultPath, { force: true });
	}
}

export function registerUserDataPortability(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.commands.registerCommand('becoder.exportUserData', () => exportUserData(context)));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.importUserData', () => importUserData(context)));
	void reportImportResult(context);
	void cleanupAbandonedUserDataOperations(getBeCoderDataRoot(context)).catch(error => console.error('Unable to clean abandoned BeCoder user-data staging.', error));
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { inspectExactInput } from './inputFile';

export type BeCoderSource = {
	readonly path: string;
	readonly name: string;
	readonly directory: string;
	readonly executablePath: string;
	readonly language: 'c' | 'cpp';
};

export type PreparedSource = {
	readonly source: BeCoderSource;
	readonly saveMs: number;
};

export class RunnerRequestError extends Error {
	constructor(message: string, readonly localizedMessage: string) {
		super(message);
	}
}

export type RunnerSettings = {
	readonly cStandard: string;
	readonly cppStandard: string;
	readonly cFlags: readonly string[];
	readonly cppFlags: readonly string[];
};

export async function prepareActiveSource(): Promise<PreparedSource> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !['c', 'cpp'].includes(editor.document.languageId)) {
		throw new RunnerRequestError(
			'BeCoder Runner supports only C and C++ source files.',
			vscode.l10n.t('BeCoder Runner supports only C and C++ source files.')
		);
	}
	const saveStartedAt = Date.now();
	if ((editor.document.isUntitled || editor.document.isDirty) && !await editor.document.save()) {
		throw new RunnerRequestError(
			'Save the source file before using BeCoder Runner.',
			vscode.l10n.t('Save the source file before using BeCoder Runner.')
		);
	}
	if (editor.document.isUntitled) {
		throw new RunnerRequestError(
			'Save the source file before using BeCoder Runner.',
			vscode.l10n.t('Save the source file before using BeCoder Runner.')
		);
	}
	return {
		source: await sourceFromPath(editor.document.fileName),
		saveMs: Date.now() - saveStartedAt
	};
}

export async function prepareCommandSource(sourcePath: string): Promise<PreparedSource> {
	const absolutePath = path.resolve(sourcePath);
	const document = vscode.workspace.textDocuments.find(candidate => samePath(candidate.fileName, absolutePath));
	const saveStartedAt = Date.now();
	if (document?.isDirty && !await document.save()) {
		throw new RunnerRequestError(
			`Unable to save ${path.basename(absolutePath)} before running.`,
			vscode.l10n.t('Unable to save {0} before running.', path.basename(absolutePath))
		);
	}
	return {
		source: await sourceFromPath(absolutePath),
		saveMs: Date.now() - saveStartedAt
	};
}

export async function exactInputPath(source: BeCoderSource): Promise<string> {
	const inspection = await inspectExactInput(source.directory);
	if (inspection.status === 'missing') {
		throw new RunnerRequestError(
			`Run With Input requires an ordinary file named input beside ${source.name}.`,
			vscode.l10n.t('Run With Input requires an ordinary file named input beside {0}.', source.name)
		);
	}
	if (inspection.status !== 'valid') {
		throw new RunnerRequestError(
			`Run With Input requires input to be an ordinary file beside ${source.name}.`,
			vscode.l10n.t('Run With Input requires input to be an ordinary file beside {0}.', source.name)
		);
	}
	return inspection.path;
}

export function bundledCompiler(context: vscode.ExtensionContext, language: BeCoderSource['language']): string {
	return path.join(toolchainRoot(context), 'ucrt64', 'bin', language === 'c' ? 'gcc.exe' : 'g++.exe');
}

export function toolchainRoot(context: vscode.ExtensionContext): string {
	const packagedRoot = path.resolve(context.extensionPath, '..', '..', '..', '..', 'data', 'toolchains');
	if (fs.existsSync(packagedRoot)) {
		return packagedRoot;
	}
	const portableRoot = process.env['VSCODE_PORTABLE'];
	if (portableRoot) {
		return path.join(portableRoot, 'toolchains');
	}
	return path.resolve(context.globalStorageUri.fsPath, '..', '..', '..', 'toolchains');
}

export function runnerSettings(): RunnerSettings {
	return {
		cStandard: setting('becoder.runner.cStandard', 'c17'),
		cppStandard: setting('becoder.runner.cppStandard', 'c++20'),
		cFlags: setting('becoder.runner.cFlags', []),
		cppFlags: setting('becoder.runner.cppFlags', [])
	};
}

async function sourceFromPath(sourcePath: string): Promise<BeCoderSource> {
	const extension = path.extname(sourcePath).toLowerCase();
	if (extension !== '.c' && !['.cc', '.cpp', '.cxx'].includes(extension)) {
		throw new RunnerRequestError(
			'BeCoder Runner supports .c, .cc, .cpp, and .cxx files.',
			vscode.l10n.t('BeCoder Runner supports .c, .cc, .cpp, and .cxx files.')
		);
	}
	let stat: fs.Stats;
	try {
		stat = await fs.promises.stat(sourcePath);
	} catch {
		throw new RunnerRequestError(
			`Source file was not found: ${sourcePath}`,
			vscode.l10n.t('Source file was not found: {0}', sourcePath)
		);
	}
	if (!stat.isFile()) {
		throw new RunnerRequestError(
			`Source path is not an ordinary file: ${sourcePath}`,
			vscode.l10n.t('Source path is not an ordinary file: {0}', sourcePath)
		);
	}
	const baseName = path.basename(sourcePath, extension);
	return {
		path: sourcePath,
		name: path.basename(sourcePath),
		directory: path.dirname(sourcePath),
		executablePath: path.join(path.dirname(sourcePath), `${baseName}.exe`),
		language: extension === '.c' ? 'c' : 'cpp'
	};
}

function setting<T>(key: string, fallback: T): T {
	const configuration = vscode.workspace.getConfiguration();
	if (process.platform === 'win32') {
		return configuration.inspect<T>(key)?.globalValue ?? fallback;
	}
	return configuration.get<T>(key) ?? fallback;
}

function samePath(first: string, second: string): boolean {
	return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

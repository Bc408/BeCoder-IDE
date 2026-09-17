/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';

export type GccLanguage = 'c' | 'cpp';

export function resolveToolchainRoot(
	extensionPath: string,
	globalStoragePath: string,
	portableRoot: string | undefined,
	exists: (candidate: string) => boolean = fs.existsSync
): string {
	const packagedRoot = path.resolve(extensionPath, '..', '..', '..', '..', 'data', 'toolchains');
	if (exists(packagedRoot)) {
		return packagedRoot;
	}
	if (portableRoot) {
		return path.join(portableRoot, 'toolchains');
	}
	return path.resolve(globalStoragePath, '..', '..', '..', 'toolchains');
}

export function bundledCompiler(
	context: vscode.ExtensionContext,
	language: GccLanguage
): string {
	const root = resolveToolchainRoot(
		context.extensionPath,
		context.globalStorageUri.fsPath,
		process.env['VSCODE_PORTABLE']
	);
	return path.join(root, 'ucrt64', 'bin', language === 'c' ? 'gcc.exe' : 'g++.exe');
}

export function privateCompilerEnvironment(sessionRoot: string, compilerPath: string): Record<string, string> {
	const systemRoot = process.env['SystemRoot'] ?? process.env['windir'];
	if (!systemRoot) {
		throw new Error('Windows SystemRoot is unavailable.');
	}
	const environment: Record<string, string> = {};
	for (const name of [
		'SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'OS', 'PATHEXT',
		'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS'
	]) {
		const value = process.env[name];
		if (value) {
			environment[name] = value;
		}
	}
	const temporaryDirectory = path.join(sessionRoot, 'tmp');
	const userRoot = path.join(sessionRoot, 'user');
	environment['TEMP'] = temporaryDirectory;
	environment['TMP'] = temporaryDirectory;
	environment['USERPROFILE'] = userRoot;
	environment['HOMEDRIVE'] = path.parse(userRoot).root.slice(0, 2);
	environment['HOMEPATH'] = userRoot.slice(2);
	environment['HOME'] = userRoot;
	environment['LOCALAPPDATA'] = path.join(userRoot, 'AppData', 'Local');
	environment['APPDATA'] = path.join(userRoot, 'AppData', 'Roaming');
	environment['LANG'] = 'C';
	environment['LC_ALL'] = 'C';
	environment['PATH'] = [path.dirname(compilerPath), path.join(systemRoot, 'System32')].join(path.delimiter);
	return environment;
}

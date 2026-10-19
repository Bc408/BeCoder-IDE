/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');

export async function buildBeCoderShortcutHelper(compiler: string, output: string, testing = false, name = 'BeCoder'): Promise<string> {
	if (!/^[A-Za-z0-9 -]+$/.test(name)) {
		throw new Error('Invalid BeCoder shortcut name.');
	}
	fs.mkdirSync(path.dirname(output), { recursive: true });
	const environment = { ...process.env };
	const pathKey = Object.keys(environment).find(key => key.toLowerCase() === 'path') ?? 'PATH';
	environment[pathKey] = `${path.dirname(compiler)}${path.delimiter}${environment[pathKey] ?? ''}`;
	await execFileAsync(compiler, [
		'-std=c++17', '-Os', '-s', '-static', '-municode', '-Wl,--subsystem,windows', '-Wall', '-Wextra', '-Werror',
		...(testing ? ['-DBECODER_SHORTCUT_TESTING'] : []),
		`-DBECODER_SHORTCUT_NAME=L"${name}"`,
		path.join(repositoryRoot, 'build', 'win32', 'becoder-shortcuts.cpp'), '-o', output, '-lshell32'
	], { timeout: 120_000, env: environment });
	return createHash('sha256').update(fs.readFileSync(output)).digest('hex');
}

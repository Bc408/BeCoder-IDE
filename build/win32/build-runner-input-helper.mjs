/*---------------------------------------------------------------------------------------------
 * Copyright (c) 2026 BeCoder contributors.
 * Licensed under GPL-3.0-or-later; see LICENSE in the repository root.
 *--------------------------------------------------------------------------------------------*/
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function buildRunnerInputHelper(compiler, destination) {
	const source = fileURLToPath(new URL('../../extensions/danielpinto8zz6.c-cpp-compile-run/native/runnerInput.cpp', import.meta.url));
	for (const file of [compiler, source]) {
		if (!fs.statSync(file).isFile()) { throw new Error(`Missing helper build input: ${file}`); }
	}
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	const result = spawnSync(compiler, ['-O2', '-Wall', '-Wextra', '-Werror', '-std=c++20', '-municode', '-static', '-s', source, '-o', destination], {
		windowsHide: true,
		timeout: 120000,
		encoding: 'utf8',
		env: { ...process.env, PATH: `${path.dirname(compiler)}${path.delimiter}${process.env.PATH ?? ''}` }
	});
	if (result.status !== 0 || result.error) { throw new Error(`Runner helper compilation failed: ${result.error ?? result.stderr}`); }
	console.log(`Built Runner input helper: ${destination}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	buildRunnerInputHelper(path.resolve(process.argv[2]), path.resolve(process.argv[3]));
}

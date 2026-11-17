/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('.', import.meta.url));
const result = await build({ absWorkingDir: root, entryPoints: ['companion/entry.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'BeCoderCompanion', write: false });
const code = result.outputFiles[0].text;
// Evaluate only our bundled local registry; no page, DOM parser or remote code is run.
const patterns: string[] = runInNewContext(`${code}\nBeCoderCompanion.getMatchPatterns()`, {}, { timeout: 5000 });
await mkdir(new URL('dist/', import.meta.url), { recursive: true });
await writeFile(new URL('dist/problem-parser.js', import.meta.url), code);
await writeFile(new URL('dist/problem-parser-patterns.json', import.meta.url), JSON.stringify(patterns));

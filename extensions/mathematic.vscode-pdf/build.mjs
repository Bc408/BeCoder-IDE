/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { build } from 'esbuild';
import fs from 'node:fs';

await build({ absWorkingDir: import.meta.dirname, entryPoints: ['assets/hover.ts'], outfile: 'dist/hover.js', bundle: true, format: 'esm', platform: 'browser', target: 'chrome142', minify: true, legalComments: 'inline' });
fs.copyFileSync(new URL('../becoder.shared/LICENSE', import.meta.url), new URL('./dist/HoverLicense.txt', import.meta.url));

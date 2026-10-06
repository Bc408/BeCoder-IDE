/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { build } from 'esbuild';
import fs from 'node:fs';

await build({ absWorkingDir: import.meta.dirname, entryPoints: ['webview/App.tsx'], outfile: 'dist/judge.js', bundle: true, platform: 'browser', format: 'iife', loader: { '.ttf': 'file' } });
fs.copyFileSync(new URL('../becoder.shared/LICENSE', import.meta.url), new URL('./dist/HoverLicense.txt', import.meta.url));

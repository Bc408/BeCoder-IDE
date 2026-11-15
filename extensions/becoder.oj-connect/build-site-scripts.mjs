/* Copyright (c) BeCoder contributors. Licensed under GPL-3.0-or-later. */
import { build } from 'esbuild';

await build({ absWorkingDir: import.meta.dirname, entryPoints: ['site-scripts/entry.ts'], outfile: 'dist/site-scripts.js', bundle: true, platform: 'browser', format: 'iife', globalName: 'BeCoderOj', footer: { js: 'globalThis.BeCoderOj = BeCoderOj;' }, legalComments: 'linked' });

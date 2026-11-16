/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { build } from 'esbuild';

await build({ absWorkingDir: import.meta.dirname, entryPoints: ['site-scripts/entry.ts'], outfile: 'dist/site-scripts.js', bundle: true, platform: 'browser', format: 'iife', globalName: 'BeCoderOj', footer: { js: 'globalThis.BeCoderOj = BeCoderOj;' }, legalComments: 'linked' });

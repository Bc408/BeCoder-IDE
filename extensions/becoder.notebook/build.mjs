/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.resolve(import.meta.dirname, '../../build/package.json'));
const { build } = require('esbuild');
const options = { absWorkingDir: import.meta.dirname, bundle: true, platform: 'node', format: 'cjs', target: 'node22', legalComments: 'linked', external: ['vscode'] };
await build({ ...options, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.cjs' });
await build({ ...options, entryPoints: ['test/coreOutputFixture.ts'], outfile: 'dist-test/coreOutputFixture.cjs' });
await build({ ...options, external: [...options.external, './coreOutputFixture.cjs'], entryPoints: ['test/model.test.ts'], outfile: 'dist-test/model.test.cjs' });
await build({ absWorkingDir: import.meta.dirname, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', legalComments: 'linked', entryPoints: ['renderer/index.ts'], outfile: 'dist/renderer.js' });
const notice = `Microsoft Notebook renderer ANSI utilities (extensions/notebook-renderers/src)
Copyright (c) Microsoft Corporation. All rights reserved.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`;
await writeFile(path.resolve(import.meta.dirname, 'dist/THIRD_PARTY_NOTICES.txt'), notice, 'utf8');

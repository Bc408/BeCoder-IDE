/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { buildSync } = require('../extensions/becoder.oj-connect/node_modules/esbuild');
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'tmp/oj-connect-audit');
mkdirSync(output, { recursive: true });
for (const [entry, name] of [
	['src/vs/platform/browserView/electron-main/browserViewMainService.ts', 'shortcut-main'],
	['src/vs/platform/browserView/common/atcoderBridge.ts', 'shortcut-bridge'],
	['src/vs/platform/browserView/electron-main/browserViewMainService.ts', 'native-luogu-main'],
	['src/vs/platform/browserView/electron-main/luoguSessionClient.ts', 'native-luogu-client']
]) {
	const input = path.join(root, entry);
	buildSync({ entryPoints: [input], tsconfig: path.join(root, 'src/tsconfig.json'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', define: { 'import.meta.url': JSON.stringify(pathToFileURL(input).href) }, outfile: path.join(output, name + '.cjs') });
}
console.log('AtCoder/Luogu native fixtures built from current sources.');

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { buildSync } = require('../extensions/becoder.oj-connect/node_modules/esbuild');
const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'tmp/oj-connect-audit/lanqiao-native');
mkdirSync(output, { recursive: true });
const main = path.join(root, 'src/vs/platform/browserView/electron-main/browserViewMainService.ts');
buildSync({ entryPoints: [main], tsconfig: path.join(root, 'src/tsconfig.json'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', define: { 'import.meta.url': JSON.stringify(pathToFileURL(main).href) }, outfile: path.join(output, 'main.cjs') });
const tests = ['electron-main/lanqiaoProtocol', 'electron-main/lanqiaoTransport', 'electron-main/lanqiaoSessionClient', 'common/lanqiaoBridge'];
for (const input of tests) {
	buildSync({ entryPoints: [path.join(root, 'src/vs/platform/browserView/test/' + input + '.test.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: path.join(output, path.basename(input) + '.test.cjs') });
}
buildSync({ entryPoints: [path.join(root, 'src/vs/platform/browserView/test/electron-main/lanqiaoFixtures.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(output, 'fixtures.cjs') });
console.log('Lanqiao native fixture built from current sources.');

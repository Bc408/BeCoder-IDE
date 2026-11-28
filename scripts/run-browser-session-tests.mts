/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { buildSync } = require('../extensions/becoder.oj-connect/node_modules/esbuild');
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'tmp/release-2.1.0-audit/native-browser');
mkdirSync(output, { recursive: true });
const names = ['browserViewFavicon.test', 'browserViewEmulator.test', 'browserSessionTrust.test', 'browserSessionPermissions.integrationTest', 'browserAppearance.integrationTest', 'browserPopup.integrationTest', 'ojStatementParser.test', 'ojStatementService.test', 'ojStatementTransport.test', 'ojStatementCacheService.test'];
for (const name of names) {
	buildSync({ entryPoints: [path.join(root, 'src/vs/platform/browserView/test/electron-main/' + name + '.ts')], tsconfig: path.join(root, 'src/tsconfig.json'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(output, name + '.cjs') });
}
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(require('electron'), ['scripts/test-browser-session.cts', ...names.map(name => path.join(output, name + '.cjs'))], { cwd: root, env, stdio: 'inherit', timeout: 60000, windowsHide: true });
if (result.error) { throw result.error; }
process.exitCode = result.status ?? 1;

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { buildSync } = require('../extensions/becoder.oj-connect/node_modules/esbuild');
const output = path.resolve('tmp/oj-connect-audit/codeforces-native');
mkdirSync(output, { recursive: true });
const inputs = ['electron-main/codeforcesProtocol', 'electron-main/codeforcesTransport', 'electron-main/ojLanguageTransport', 'electron-main/codeforcesSessionClient', 'common/codeforcesBridge'];
const tests = inputs.filter(input => (!process.argv.includes('--unit-only') || input.startsWith('electron-main/')) && existsSync('src/vs/platform/browserView/test/' + input + '.test.ts')).map(input => {
	const outfile = path.join(output, path.basename(input) + '.test.cjs');
	buildSync({ entryPoints: ['src/vs/platform/browserView/test/' + input + '.test.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile }); return outfile;
});
const result = spawnSync(process.execPath, ['node_modules/mocha/bin/mocha.js', '--ui', 'tdd', ...tests], { stdio: 'inherit', timeout: 30000, windowsHide: true });
if (result.error) { throw result.error; }
if (result.status !== 0) { process.exit(result.status ?? 1); }
if (!process.argv.includes('--unit-only')) {
	buildSync({ entryPoints: ['src/vs/platform/browserView/electron-main/browserViewMainService.ts'], tsconfig: 'src/tsconfig.json', bundle: true, platform: 'node', format: 'cjs', packages: 'external', define: { 'import.meta.url': JSON.stringify(new URL('../src/vs/platform/browserView/electron-main/browserViewMainService.ts', import.meta.url).href) }, outfile: path.join(output, 'main.cjs') });
	buildSync({ stdin: { contents: `export { CodeforcesSessionClient } from './src/vs/platform/browserView/electron-main/codeforcesSessionClient.ts'; export * from './src/vs/platform/browserView/test/electron-main/codeforcesFixtures.ts';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: path.join(output, 'client-fixtures.cjs') });
	const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
	const native = spawnSync(require('electron'), ['scripts/test-codeforces-host.cts'], { stdio: 'inherit', env, timeout: 30000, windowsHide: true });
	if (native.error) { throw native.error; }
	process.exitCode = native.status ?? 1;
}

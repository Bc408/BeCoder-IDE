/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { buildSync } = require('../extensions/becoder.oj-connect/node_modules/esbuild');
const output = path.resolve('tmp/oj-connect-audit/nowcoder-native');
mkdirSync(output, { recursive: true });
const inputs = ['electron-main/nowcoderProtocol', 'common/nowcoderBridge', 'electron-main/nowcoderSessionClient'];
const tests = inputs.map(input => {
	const outfile = path.join(output, path.basename(input) + '.test.cjs');
	buildSync({ entryPoints: ['src/vs/platform/browserView/test/' + input + '.test.ts'], bundle: true, platform: 'node', format: 'cjs', outfile }); return outfile;
});
const run = (exe: string, args: string[], timeout: number, env = process.env) => {
	const result = spawnSync(exe, args, { stdio: 'inherit', env, timeout, windowsHide: true });
	if (result.error) { throw result.error; } if (result.status !== 0) { process.exit(result.status ?? 1); }
};
run(process.execPath, ['node_modules/mocha/bin/mocha.js', '--ui', 'tdd', ...tests], 30000);
buildSync({ entryPoints: ['src/vs/platform/browserView/electron-main/browserViewMainService.ts'], tsconfig: 'src/tsconfig.json', bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(output, 'main.cjs') });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
run(require('electron'), ['scripts/test-nowcoder-session.cts'], 30000, env);

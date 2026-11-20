/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url), root = fileURLToPath(new URL('..', import.meta.url));
function run(executable: string, args: string[], timeout: number, env = process.env): void {
	const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', env, timeout, windowsHide: true });
	if (result.error) { throw result.error; }
	if (result.status !== 0) { process.exit(result.status ?? 1); }
}
run(process.execPath, ['scripts/build-lanqiao-session-fixture.mts'], 30000);
const output = path.join(root, 'tmp/oj-connect-audit/lanqiao-native');
run(process.execPath, ['node_modules/mocha/bin/mocha.js', '--ui', 'tdd', ...['lanqiaoProtocol', 'lanqiaoTransport', 'lanqiaoSessionClient', 'lanqiaoBridge'].map(name => path.join(output, name + '.test.cjs'))], 30000);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
run(require('electron'), ['scripts/test-lanqiao-session.cts'], 45000, env);

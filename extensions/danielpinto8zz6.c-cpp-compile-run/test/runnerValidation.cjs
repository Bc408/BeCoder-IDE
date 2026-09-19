/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '../../..');
const plans = {
	typecheck: ['typecheck-client', 120000],
	extensions: ['compile-oi-extensions', 120000],
	windows: ['gulp', 300000, 'vscode-win32-x64-min']
};
const key = process.argv[2];
if (!Object.hasOwn(plans, key)) { throw new Error('Unknown validation step'); }
const [script, timeout, ...args] = plans[key];
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!fs.statSync(npm).isFile()) { throw new Error('npm entry point missing'); }
const evidence = path.join(root, '.build/runner-validation');
fs.mkdirSync(evidence, { recursive: true });
const log = fs.createWriteStream(path.join(evidence, `${key}.log`));
const started = Date.now();
const child = spawn(process.execPath, [npm, 'run', script, ...args], { cwd: root, windowsHide: true });
console.log(`npm run ${script} ${args.join(' ')}; timeout=${timeout}ms; pid=${child.pid}`);
child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
let timedOut = false;
const timer = setTimeout(() => {
	timedOut = true;
	const killer = spawn(path.join(process.env.SystemRoot, 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
	killer.on('error', error => console.error(error));
}, timeout);
child.on('error', error => { clearTimeout(timer); console.error(error); process.exitCode = 1; log.end(); });
child.on('close', code => {
	clearTimeout(timer);
	const result = { command: `npm run ${script} ${args.join(' ')}`.trim(), cwd: root, timeout, exitCode: code, timedOut, durationMs: Date.now() - started };
	fs.appendFileSync(path.join(evidence, 'ledger.jsonl'), JSON.stringify(result) + '\n');
	log.end(() => {
		console.log(JSON.stringify(result));
		if (code !== 0 || timedOut) { console.error(fs.readFileSync(path.join(evidence, `${key}.log`), 'utf8').slice(-10000)); }
	});
	process.exitCode = timedOut ? 124 : code ?? 1;
});

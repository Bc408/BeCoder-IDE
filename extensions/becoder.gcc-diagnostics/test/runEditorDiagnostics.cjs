/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const executable = path.resolve(process.argv[2]);
const extension = path.resolve(__dirname, '..');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, ['--new-window', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', `--extensionDevelopmentPath=${extension}`, `--extensionTestsPath=${path.join(__dirname, 'editorDiagnostics.cjs')}`], { env, windowsHide: true });
let output = '';
child.stdout.on('data', data => output += data);
child.stderr.on('data', data => output += data);
let timedOut = false;
const timer = setTimeout(() => {
	timedOut = true;
	spawn(path.join(process.env.SystemRoot, 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
}, 90000);
child.on('error', error => { clearTimeout(timer); console.error(error); process.exitCode = 1; });
child.on('close', code => {
	clearTimeout(timer);
	const evidence = path.resolve(extension, '../../.build/runner-validation');
	fs.mkdirSync(evidence, { recursive: true });
	fs.writeFileSync(path.join(evidence, 'gcc-editor-test.log'), output);
	console.log(output.slice(-7000));
	console.log(JSON.stringify({ code, timedOut }));
	process.exitCode = timedOut ? 124 : code ?? 1;
});

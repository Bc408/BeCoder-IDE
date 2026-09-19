/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Run each probe in a separate host. Success requires natural host termination;
// the watchdog kills only the probe process tree and always reports failure.
if (process.argv[2] === '--host') {
	const { RunnerPtyProcess } = require('../out-test/src/runnerPtyProcess.js');
	const mode = process.argv[3];
	const isGcc = mode.startsWith('gcc');
	const terminal = mode === 'transcript' || isGcc ? new (require('@xterm/headless').Terminal)({ cols: 80, rows: 24, allowProposedApi: true }) : undefined;
	terminal?.write('BC original log\r\n===== Compilation Successful, Running =====\r\n');
	let output = '';
	let cancelTimer;
	const program = mode === 'exit' || mode === 'transcript'
		? 'process.stdout.write("OUT\\n");process.stderr.write("ERR\\n");process.exitCode=7;'
		: mode === 'input' ? 'process.stdin.once("data", () => {process.stdout.write("INPUT_OK");process.exit(0);});'
			: 'setInterval(() => {}, 1000);';
	const session = new RunnerPtyProcess({
		file: isGcc ? process.argv[4] : process.execPath,
		args: isGcc ? (mode === 'gcc-fast' ? ['fast'] : []) : ['-e', program],
		cwd: process.cwd(),
		env: { SystemRoot: process.env.SystemRoot, PATH: [process.argv[5], path.join(process.env.SystemRoot, 'System32')].filter(Boolean).join(path.delimiter) },
		cols: 80,
		rows: 24,
		inheritCursor: !!terminal
	}, {
		onData: data => { output += data; terminal?.write(data); },
		onExit: exit => {
			clearTimeout(cancelTimer);
			session.dispose();
			if (mode === 'exit') {
				assert.strictEqual(exit.exitCode, 7);
				assert.ok(output.includes('OUT') && output.includes('ERR'), output);
				assert.ok(output.indexOf('OUT') < output.indexOf('ERR'), output);
			}
			if (mode === 'input') {
				assert.strictEqual(exit.exitCode, 0);
				assert.ok(output.includes('INPUT_OK'), output);
			}
			console.log(JSON.stringify({ mode, exit, output, resources: process.getActiveResourcesInfo() }));
			if (terminal) {
				terminal.write('===== Run Complete =====\r\nBC prompt> ', () => {
					const buffer = terminal.buffer.active;
					const lines = Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i).translateToString(true));
					const body = isGcc ? Array.from({ length: 5 }, (_, i) => [`OUT${i}`, `i: ${i}`]).flat() : ['OUT', 'ERR'];
					const expected = ['BC original log', '===== Compilation Successful, Running =====', ...body, '===== Run Complete =====', 'BC prompt> '];
					assert.deepStrictEqual(lines.slice(0, expected.length), expected);
					if (isGcc) { assert.strictEqual(exit.exitCode, 0); }
					console.log(JSON.stringify({ transcript: lines.slice(0, expected.length) }));
					terminal.dispose();
				});
			}
		}
	});
	terminal?.onData(data => session.write(data));
	if (mode === 'cancel') {
		cancelTimer = setTimeout(() => session.kill(), 500);
	}
	if (mode === 'input') {
		session.write('test\r');
	}
	if (mode === 'early-cancel') {
		session.kill();
	}
} else {
	async function probe(mode, executable = '', compilerDirectory = '') {
		await new Promise((resolve, reject) => {
			const child = spawn(process.execPath, [__filename, '--host', mode, executable, compilerDirectory], { windowsHide: true });
			let output = '';
			let timedOut = false;
			child.stdout.on('data', data => output += data);
			child.stderr.on('data', data => output += data);
			const watchdog = setTimeout(() => {
				timedOut = true;
				const killer = spawn(path.join(process.env.SystemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
				killer.on('error', reject);
			}, 15000);
			child.on('error', error => { clearTimeout(watchdog); reject(error); });
			child.on('close', code => {
				clearTimeout(watchdog);
				console.log(output.trim());
				if (timedOut || code !== 0 || !output.includes('"exit"')) {
					reject(new Error(`${mode}: natural host exit failed (timeout=${timedOut}, code=${code})`));
				} else {
					console.log(`${mode}: natural host exit passed`);
					resolve();
				}
			});
		});
	}
	(async () => {
		if (process.argv[2] === '--gcc' || process.argv[2] === '--gcc-packaged') {
			const packaged = process.argv[2] === '--gcc-packaged';
			const compiler = path.resolve(process.argv[3]);
			assert.ok(fs.statSync(compiler).isFile());
			const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-stream-probe-'));
			const executable = path.join(directory, 'streams.exe');
			const env = { ...process.env, PATH: `${path.dirname(compiler)}${path.delimiter}${process.env.PATH}` };
			const built = spawnSync(compiler, ['-O2', '-Wall', '-DDEBUG', '-std=c++20', '-finput-charset=UTF-8', '-fexec-charset=UTF-8', ...(packaged ? ['-H'] : ['-DBECODER_SOURCE_DEBUGGER']), path.join(__dirname, 'runnerStreams.cpp'), '-o', executable], { env, windowsHide: true, timeout: 120000, encoding: 'utf8' });
			assert.strictEqual(built.status, 0, String(built.error || built.stderr));
			if (packaged) {
				assert.match(built.stderr, /! .*stdc\+\+\.h\.gch/);
				console.log('Packaged GCC loaded stdc++.h.gch');
			}
			for (const args of [[], ['fast']]) {
				const result = spawnSync(executable, args, { env, windowsHide: true, timeout: 10000, encoding: 'utf8' });
				assert.strictEqual(result.status, 0, result.stderr);
				assert.strictEqual(result.stdout.replace(/\r/g, ''), 'OUT0\nOUT1\nOUT2\nOUT3\nOUT4\n');
				assert.ok(result.stderr.includes('i: '), result.stderr);
			}
			console.log('GCC stdout/stderr separation passed');
			await probe('gcc', executable, path.dirname(compiler));
			await probe('gcc-fast', executable, path.dirname(compiler));
			fs.unlinkSync(executable);
			fs.rmdirSync(directory);
			return;
		}
		await probe('exit');
		await probe('cancel');
		await probe('input');
		await probe('early-cancel');
		await probe('transcript');
	})().catch(error => { console.error(error); process.exitCode = 1; });
}

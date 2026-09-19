/* Copyright (c) 2026 BeCoder contributors. GPL-3.0-or-later. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { Terminal } = require('@xterm/headless');
const { RunnerPtyProcess } = require('../out-test/src/runnerPtyProcess');
const { RunnerInputControl } = require('../out-test/src/runnerInputControl');

async function main() {
	const helper = path.resolve(process.argv[3]);
	const compiler = path.resolve(process.argv[4]);
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-input-probe-'));
	const executable = path.join(root, '程序 with space.exe');
	const env = { SystemRoot: process.env.SystemRoot, PATH: `${path.dirname(compiler)};${process.env.SystemRoot}\\System32` };
	const compilation = spawnSync(compiler, ['-O2', '-std=c++20', path.join(__dirname, 'runnerInputFixture.cpp'), '-o', executable], { windowsHide: true, timeout: 120000, encoding: 'utf8', env });
	assert.strictEqual(compilation.status, 0, compilation.stderr);
	async function run(label, data, expected = 0, cancel = false, target = executable) {
		const snapshot = path.join(root, 'input.snapshot');
		fs.writeFileSync(snapshot, data);
		const terminal = new Terminal({ cols: 100, rows: 30, allowProposedApi: true });
		terminal.write('BC previous log\r\n');
		let session, output = '', childPid, timer;
		const control = new RunnerInputControl(pid => {
			childPid = pid;
			terminal.write('RUNNING\r\n');
			if (cancel) { timer = setTimeout(() => session.kill(), 500); }
		}, () => session?.kill());
		await control.listen();
		try {
			await new Promise(resolve => {
				session = new RunnerPtyProcess({ file: helper, args: [target, snapshot, control.pipe], cwd: root, env, cols: 100, rows: 30, inheritCursor: true }, {
					onData: text => { output += text; terminal.write(text); },
					onExit: () => { session.dispose(); resolve(); }
				});
				terminal.onData(text => session.write(text));
				control.armStartupTimeout();
			});
			if (cancel) {
				await control.result().catch(() => undefined);
			} else if (expected === 'helper-error') {
				await assert.rejects(control.result());
			} else {
				assert.strictEqual(await control.result(), expected);
			}
			await new Promise(resolve => terminal.write('', resolve));
			const buffer = terminal.buffer.active;
			const lines = Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i).translateToString(true).trimEnd());
			if (expected === 0 && !cancel) {
				const sum = data.reduce((a, b) => a + b, 0);
				assert.deepStrictEqual(lines.slice(0, 7), ['BC previous log', 'RUNNING', `COUNT=${data.length},SUM=${sum}`, `DEBUG=${data.length}`, 'PIPE=1', 'CONSOLE=1', 'DONE']);
			}
			if (cancel) {
				const descendant = output.match(/CHILD=(\d+)/)?.[1];
				for (const pid of [childPid, descendant && Number(descendant)].filter(Boolean)) {
					assert.throws(() => process.kill(pid, 0), `Process ${pid} survived cancellation`);
				}
			}
			assert.deepStrictEqual(fs.readFileSync(snapshot), data);
			console.log(`PASS ${label}`);
		} finally {
			clearTimeout(timer);
			session?.dispose();
			await control.dispose();
			terminal.dispose();
		}
	}
	try {
		await run('empty EOF', Buffer.alloc(0));
		await run('no final newline', Buffer.from('123'));
		await run('CRLF and Chinese', Buffer.from('你好\r\n123\r\n'));
		await run('NUL and Ctrl-Z', Buffer.from([0, 26, 255, 13, 10]));
		await run('large input', Buffer.alloc(4 * 1024 * 1024, 49));
		await run('early exit while feeding', Buffer.concat([Buffer.from('E'), Buffer.alloc(4 * 1024 * 1024)]), 7);
		await run('real program exit 125', Buffer.from('R'), 125);
		await run('silent cancellation while feeding', Buffer.concat([Buffer.from('S'), Buffer.alloc(1024 * 1024)]), 0, true);
		await run('descendant cancellation', Buffer.from('D'), 0, true);
		await run('launch failure is not program exit', Buffer.alloc(0), 'helper-error', false, path.join(root, 'missing.exe'));
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

if (process.argv[2] === '--host') {
	main().catch(error => { console.error(error); process.exitCode = 1; });
} else {
	const child = spawn(process.execPath, [__filename, '--host', ...process.argv.slice(2)], { windowsHide: true, stdio: 'inherit' });
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		spawn(path.join(process.env.SystemRoot, 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
	}, 120000);
	child.on('close', code => { clearTimeout(timer); console.log(JSON.stringify({ naturalExit: !timedOut, code })); process.exitCode = timedOut ? 124 : code ?? 1; });
}

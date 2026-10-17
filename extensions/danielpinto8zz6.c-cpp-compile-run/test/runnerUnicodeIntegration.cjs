/* Copyright (c) 2026 BeCoder contributors. GPL-3.0-or-later. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { Terminal } = require('@xterm/headless');
const { RunnerExecutor, finalizePublishedExecutable } = require('../out-test/src/runnerProcess');
const { TerminalOutputBoundary } = require('../out-test/src/terminalOutputBoundary');

if (process.argv[2] !== '--host') {
	const child = spawn(process.execPath, [__filename, '--host', ...process.argv.slice(2)], { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
	let timedOut = false;
	let timer = setTimeout(expire, 45000);
	function expire() {
		timedOut = true;
		console.error('Unicode integration host failed to terminate naturally');
		spawn(path.join(process.env.SystemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
	}
	child.stdout.on('data', data => {
		process.stdout.write(data);
		if (String(data).includes('UNICODE_COMPLETE')) { clearTimeout(timer); timer = setTimeout(expire, 5000); }
	});
	child.on('close', code => { clearTimeout(timer); process.exitCode = timedOut ? 124 : code ?? 1; });
} else {
	(async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-unicode-'));
		const inputPath = path.join(root, 'input');
		fs.writeFileSync(inputPath, '张三\n');
		const executor = new RunnerExecutor(path.join(root, 'storage'));
		const watchdog = setTimeout(() => { console.error('Unicode integration timeout'); void executor.cancel(); process.exitCode = 1; }, 45000);
		try {
			for (const language of ['c', 'cpp']) {
				const file = path.join(root, `中文程序.${language}`);
				fs.copyFileSync(path.join(__dirname, `runnerUnicode.${language}`), file);
				const executable = path.join(root, '中文程序.exe');
				for (const withInput of [false, true]) {
					const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
					await new Promise(resolve => terminal.write('BC previous log\r\n', resolve));
					terminal.onData(text => executor.writeProgramInput(text));
					let output = '', sentName = false, sentKey = false, boundary = true;
					const tracker = new TerminalOutputBoundary();
					const result = await executor.execute({
						source: { path: file, name: path.basename(file), directory: root, executablePath: executable, language },
						compilerPath: path.resolve(language === 'c' ? process.argv[4] : path.join(path.dirname(process.argv[4]), 'g++.exe')), inputHelperPath: path.resolve(process.argv[3]),
						settings: { cStandard: 'c17', cppStandard: 'c++20', cFlags: [], cppFlags: [] },
						inputPath: withInput ? inputPath : undefined, ptyDimensions: { cols: 80, rows: 24 },
						requestStartedAt: Date.now(), panelReadyMs: 0, saveMs: 0
					}, {
						write: text => {
							output += text;
							boundary = tracker.write(text, boundary);
							terminal.write(text);
							if (!withInput && !sentName && output.includes('CP=')) { sentName = true; executor.writeProgramInput('张三\r'); }
							if (!withInput && !sentKey && output.includes('KEY_READY')) { sentKey = true; executor.writeProgramInput('x'); }
						},
						beforeProgramStart: () => terminal.write('===== Compilation Successful, Running =====\r\n'),
						setPhase: () => undefined
					});
					await new Promise(resolve => terminal.write('', resolve));
					try {
						assert.strictEqual(result.status, 'completed', JSON.stringify({ result, output }));
						assert.ok(output.includes('CP=65001,IN=65001'), output);
						assert.ok(output.includes('INPUT_OK=张三'), output);
						assert.strictEqual(boundary, terminal.buffer.active.cursorX === 0, output);
						await new Promise(resolve => terminal.write((boundary ? '' : '\r\n') + '===== Run Complete =====\r\nBC prompt> ', resolve));
						const lines = Array.from({ length: terminal.buffer.active.length }, (_, i) => terminal.buffer.active.getLine(i).translateToString(true));
						assert.ok(lines.includes('学生成绩管理系统 2'), JSON.stringify(lines));
						assert.ok(lines.includes('请选择：'), JSON.stringify(lines));
						assert.ok(lines.includes('===== Run Complete ====='), JSON.stringify(lines));
						assert.strictEqual(finalizePublishedExecutable(result, executable).executableRemoved, true);
						console.log(JSON.stringify({ language, withInput, status: result.status, lines: lines.slice(0, 7) }));
					} finally { terminal.dispose(); }
				}
			}
			// A silent program must echo input below the Runner banner. Printing a
			// prompt first can mask a stale inherited cursor, so test without one.
			for (const cols of [40, 100]) {
				const file = path.join(root, 'silent.cpp');
				const executable = path.join(root, 'silent.exe');
				fs.writeFileSync(file, '#include<bits/stdc++.h>\nusing namespace std;int main(){int a;cin>>a;cerr<<6<<"\\n";debug(88);return 0;}');
				const terminal = new Terminal({ cols, rows: 16, allowProposedApi: true });
				await new Promise(resolve => terminal.write('BC> run silent.cpp\r\n', resolve));
				terminal.onData(text => executor.writeProgramInput(text));
				let inputTimer;
				const banner = '===== Compilation Successful, Running =====';
				try {
					const result = await executor.execute({
						source: { path: file, name: 'silent.cpp', directory: root, executablePath: executable, language: 'cpp' },
						compilerPath: path.resolve(path.dirname(process.argv[4]), 'g++.exe'), inputHelperPath: path.resolve(process.argv[3]),
						settings: { cStandard: 'c17', cppStandard: 'c++20', cFlags: [], cppFlags: [] },
						ptyDimensions: { cols, rows: 16 }, requestStartedAt: Date.now(), panelReadyMs: 0, saveMs: 0
					}, {
						write: text => terminal.write(text),
						beforeProgramStart: () => terminal.write(banner + '\r\n'),
						setPhase: phase => { if (phase === 'running') { inputTimer = setTimeout(() => executor.writeProgramInput('5\r'), 100); } }
					});
					await new Promise(resolve => terminal.write('', resolve));
					const bannerLines = cols === 40 ? ['===== Compilation Successful, Running ==', '==='] : [banner];
					const lines = Array.from({ length: 4 + bannerLines.length }, (_, i) => terminal.buffer.active.getLine(i).translateToString(true));
					assert.strictEqual(result.status, 'completed');
					assert.deepStrictEqual(lines, ['BC> run silent.cpp', ...bannerLines, '5', '6', '88: 88']);
					assert.strictEqual(finalizePublishedExecutable(result, executable).executableRemoved, true);
					console.log(JSON.stringify({ silent: true, cols, lines }));
				} finally { clearTimeout(inputTimer); terminal.dispose(); }
			}
		} finally { clearTimeout(watchdog); await executor.cancel(); fs.rmSync(root, { recursive: true, force: true }); }
		console.log('UNICODE_COMPLETE');
	})().catch(error => { console.error(error); process.exitCode = 1; });
}

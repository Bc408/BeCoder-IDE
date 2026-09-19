/* Copyright (c) 2026 BeCoder contributors. GPL-3.0-or-later. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Terminal } = require('@xterm/headless');
const { RunnerExecutor, finalizePublishedExecutable } = require('../out-test/src/runnerProcess');
const Module = require('module');
const { EventEmitter } = require('events');
const { CommandHistory } = require('../out-test/src/bcLineEditor');
class MockEmitter extends EventEmitter {
	event = listener => { this.on('data', listener); return { dispose: () => this.off('data', listener) }; };
	fire(data) { this.emit('data', data); }
	dispose() { this.removeAllListeners(); }
}
const originalLoad = Module._load;
Module._load = function (name, ...args) { return name === 'vscode' ? { EventEmitter: MockEmitter } : originalLoad.call(this, name, ...args); };
const { BcTerminal } = require('../out-test/src/bcTerminal');
Module._load = originalLoad;

(async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-withinput-integration-'));
	const file = path.join(root, 'main.cpp');
	fs.copyFileSync(path.join(__dirname, 'runnerInputFixture.cpp'), file);
	const inputPath = path.join(root, 'input');
	const executable = path.join(root, 'main.exe');
	const storage = path.join(root, 'storage');
	const executor = new RunnerExecutor(storage);
	const settings = { cStandard: 'c17', cppStandard: 'c++20', cFlags: [], cppFlags: [] };
	const request = {
		source: { path: file, name: 'main.cpp', directory: root, executablePath: executable, language: 'cpp' },
		compilerPath: path.resolve(process.argv[3]), inputHelperPath: path.resolve(process.argv[2]),
		settings, inputPath, ptyDimensions: { cols: 200, rows: 30 }, requestStartedAt: Date.now(), panelReadyMs: 0, saveMs: 0
	};
	const watchdog = setTimeout(() => { void executor.cancel(); process.exitCode = 1; console.error('Integration watchdog fired'); }, 60000);
	async function run(data, cancel = false) {
		fs.writeFileSync(inputPath, data);
		const terminal = new Terminal({ cols: 200, rows: 30, allowProposedApi: true });
		terminal.write('PREVIOUS\r\n');
		let currentPhase = 'preparing';
		const bc = new BcTerminal(root, new CommandHistory(), {
			phase: () => currentPhase, submit: () => undefined, cancel: () => executor.cancel(),
			programInput: () => false, terminalResponse: text => executor.writeProgramInput(text),
			busyAttempt: () => undefined, close: () => undefined
		});
		bc.onDidWrite(text => terminal.write(text));
		bc.setPtyInput(true);
		bc.setProgramInputEnabled(false);
		bc.open({ columns: 200, rows: 30 });
		bc.echoCommand('run main.cpp -WithInput');
		terminal.onData(text => bc.handleInput(text));
		let timer;
		let output = '';
		try {
			const phases = [];
			const result = await executor.execute({ ...request, requestStartedAt: Date.now() }, {
				write: text => { output += text; bc.writeProcessOutput(text); },
				setPhase: phase => {
					currentPhase = phase;
					bc.setPhase(phase);
					phases.push(phase);
					if (phase === 'compiling') {
						// The on-disk file changes only after the precompile snapshot.
						fs.writeFileSync(inputPath, 'CHANGED');
					} else {
						assert.ok(fs.statSync(executable).isFile());
						bc.writeStatus('Compilation Successful, Running', 'success');
						if (cancel) { timer = setTimeout(() => executor.cancel(), 200); }
					}
				}
			});
			assert.deepStrictEqual(phases, ['compiling', 'running'], JSON.stringify({ result, output }));
			assert.strictEqual(result.cleanupFailed, false, JSON.stringify(result));
			assert.strictEqual(result.publishedExecutable, true);
			bc.writeStatus('Run Complete', 'success');
			await new Promise(resolve => terminal.write('', resolve));
			if (!cancel) {
				assert.strictEqual(result.status, 'completed', JSON.stringify(result));
				const buffer = terminal.buffer.active;
				const lines = Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i).translateToString(true).trimEnd());
				assert.deepStrictEqual(lines.slice(0, 9), ['PREVIOUS', `BC ${root}> run main.cpp -WithInput`, '===== Compilation Successful, Running =====', `COUNT=${data.length},SUM=${data.reduce((a,b) => a+b,0)}`, `DEBUG=${data.length}`, 'PIPE=1', 'CONSOLE=1', 'DONE', '===== Run Complete =====']);
				assert.strictEqual(finalizePublishedExecutable(result, executable).executableRemoved, true);
				assert.strictEqual(fs.existsSync(executable), false);
			} else {
				assert.strictEqual(result.status, 'cancelled');
				assert.strictEqual(fs.existsSync(executable), true);
			}
			assert.strictEqual(fs.readFileSync(inputPath, 'utf8'), 'CHANGED');
			assert.deepStrictEqual(fs.readdirSync(path.join(storage, 'runner-sessions')), []);
		} finally { clearTimeout(timer); bc.close(); terminal.dispose(); }
	}
	try {
		await run(Buffer.from('123'));
		await run(Buffer.alloc(0));
		await run(Buffer.from('S'), true);
		await run(Buffer.from('again'));
		console.log('PASS actual Runner: snapshot, EOF, ordered display, publication, cleanup, cancellation and rerun.');
	} finally {
		clearTimeout(watchdog);
		await executor.cancel();
		fs.rmSync(root, { recursive: true, force: true });
	}
})().catch(error => { console.error(error); process.exitCode = 1; });

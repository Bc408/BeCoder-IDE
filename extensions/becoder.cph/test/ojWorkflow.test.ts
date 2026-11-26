/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { test } from 'node:test';
import { ImportController } from '../src/importController';
import { ProblemStore } from '../src/problemStore';
import { CphExecutor } from '../src/execution';

// Compile the owning OJ test project before this cross-extension workflow suite.
const oj = path.resolve('extensions/becoder.oj-connect/out-test/src');
const { ImportController: OjImportController, browserImportTarget } = require(path.join(oj, 'importController.js'));
const { cphSamples } = require(path.join(oj, 'cphHost.js'));
const { LuoguAdapter } = require(path.join(oj, 'adapters/luogu/adapter.js'));
const { AtCoderAdapter } = require(path.join(oj, 'adapters/atcoder/adapter.js'));
const { NowcoderAdapter } = require(path.join(oj, 'adapters/nowcoder/adapter.js'));
const adapters = [new LuoguAdapter({}), new AtCoderAdapter({}), new NowcoderAdapter({})];
const directories = { luogu: 'luogu', atcoder: 'atcoder', nowcoder: 'nowcoder', codeforces: 'codeforces', lanqiao: 'lanqiao' };

test('three OJs: Get Problem → statement send to CPH preserves source, samples and both browser import orders', { timeout: 110000 }, async t => {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-oj-cph-')));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const Module = require('module'), load = Module._load;
	const commands = new Map<string, (...args: any[]) => Promise<any>>();
	const captures: { action: (value: any) => Promise<void>; dispose: () => void }[] = [];
	const displayed: string[] = [];
	const subscriptions: { dispose(): void }[] = [];
	let replace = false, dirty = false, busy = false;
	const event = () => ({ dispose() { } });
	const uri = (filename: string) => ({ scheme: 'file', fsPath: filename, toString: () => pathToFileURL(filename).href });
	const documents = new Map<string, any>();
	const document = (filename: string) => {
		if (!documents.has(filename)) { documents.set(filename, { uri: uri(filename), languageId: 'cpp', isClosed: false, getText: () => fs.readFileSync(filename, 'utf8') }); }
		return documents.get(filename);
	};
	const api = {
		l10n: { t: (text: string) => text }, env: { language: 'zh-cn' }, ViewColumn: { Beside: 2 },
		Uri: { file: uri, parse: (value: string) => uri(fileURLToPath(value)) },
		EventEmitter: class { event = event; fire() { } dispose() { } },
		workspace: {
			isTrusted: true, workspaceFolders: [{ uri: uri(root) }], getWorkspaceFolder: () => ({ uri: uri(root) }),
			getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
			onDidCloseTextDocument: event, onDidSaveTextDocument: event, onDidRenameFiles: event, onDidDeleteFiles: event, onDidChangeTextDocument: event,
			openTextDocument: async (value: { fsPath: string }) => document(value.fsPath)
		},
		commands: { registerCommand: (name: string, action: (...args: any[]) => Promise<any>) => { commands.set(name, action); return event(); }, executeCommand: async (name: string, ...args: unknown[]) => commands.get(name)?.(...args) },
		window: {
			onDidChangeActiveTextEditor: event, registerWebviewViewProvider: event,
			showTextDocument: async () => ({ edit: async () => assert.fail('existing source must not be edited during import') }),
			showWarningMessage: async () => replace ? 'Replace Samples' : undefined,
			showInformationMessage: async () => undefined
		}
	};
	Module._load = function (name: string, parent: any, ...rest: unknown[]) {
		if (name === 'vscode') { return api; }
		if (name === './judgeView' && parent.filename.endsWith(path.join('src', 'extension.js'))) {
			return { JudgeView: class { static id = 'fixture'; get isBusy() { return busy; } get hasUnsavedEdits() { return dirty; }
				async open(value: { srcPath: string }) { displayed.push(value.srcPath); } dispose() { } } };
		}
		if (name === './webview' && parent.filename === path.join(oj, 'views', 'problemPanel.js')) {
			return { labels: () => ({}), Panel: class { constructor(_context: unknown, public state: Record<string, unknown>, action: (value: any) => Promise<void>, close: () => void) { captures.push({ action, dispose: close }); } update(value: Record<string, unknown>) { Object.assign(this.state, value); } reveal() { } dispose() { } } };
		}
		return load.call(this, name, parent, ...rest);
	};
	try {
		delete require.cache[require.resolve('../src/extension')]; require('../src/extension').activate({ subscriptions });
		const panelEntry = path.join(oj, 'views', 'problemPanel.js'); delete require.cache[panelEntry];
		const { ProblemPanel } = require(panelEntry);
		const panels = new ProblemPanel({}, { preferredLanguage: () => undefined, selectLanguage: () => undefined, submit: async () => assert.fail('no online submission'),
			importCph: async (sourceUri: string, value: unknown) => commands.get('_becoder.cph.importSamplesForSource')!({ sourceUri, problem: cphSamples(value) }), openOriginal: async () => assert.fail('no browser navigation') });
		const importer = new OjImportController(adapters, { folders: () => [root], directories: () => directories, selectFolder: async () => assert.fail(),
			open: async (sourceUri: string, value: unknown) => panels.open(value, sourceUri, document(fileURLToPath(sourceUri))) });
		const direct = new ImportController({ workspaceFolders: () => [root], selectFolder: async () => assert.fail(), requestWorkspace: async () => assert.fail(),
			confirmReplacement: async () => replace, showProblem: async value => { displayed.push(value.problem.srcPath); },
			sourcePreferences: async () => ({ language: 'cpp', stem: 'must-not-create', contents: 'template must not overwrite' }) });
		for (const url of ['https://www.luogu.com.cn/problem/P1001', 'https://atcoder.jp/contests/abc086/tasks/abc086_a', 'https://ac.nowcoder.com/acm/problem/18204']) {
			const adapter = adapters.find(value => value.resolve(url)); const ref = adapter.resolve(url);
			const value = { ref, title: 'A+B', bodies: [{ locale: 'en', sections: [] }], interactive: false,
				samples: [{ input: '1 2\n', output: '3\n' }, { input: ' 4 5\n\n', output: '9\n' }], limits: [{ label: 'Time Limit', value: '2.00s' }, { label: 'Memory Limit', value: '256.00MiB' }] };
			const imported = await importer.import(value); assert.ok(imported);
			const source = fileURLToPath(imported.sourceUri), folder = path.dirname(source), store = new ProblemStore(folder);
			assert.strictEqual(fs.existsSync(path.join(folder, '.cph')), false, 'Get alone does not initialize CPH');
			const solution = '// $CURSOR_PLACEHOLDER\n#include <iostream>\nint main(){long long a,b;if(std::cin>>a>>b)std::cout<<a+b<<"\\n";}\n';
			fs.writeFileSync(source, solution);
			const bound = document(source); bound.getText = () => solution + '// unsaved draft';
			const action = captures.at(-1)!.action;
			await action({ action: 'importCph' });
			assert.strictEqual(displayed.at(-1), source);
			let saved = store.load(source)!;
			assert.deepStrictEqual(saved.problem.tests.map(({ input, output }) => ({ input, output })), value.samples);
			assert.strictEqual(saved.problem.timeLimit, 2000); assert.strictEqual(saved.problem.memoryLimit, 256);
			assert.strictEqual(fs.readFileSync(source, 'utf8'), solution); assert.match(bound.getText(), /unsaved draft/);
			const manual = await store.saveSamples(saved, [{ id: 0, input: '6 7', output: '13' }]);
			replace = false; await action({ action: 'importCph' });
			assert.strictEqual(store.load(source)!.revision, manual.revision, 'cancel preserves edited samples');
			dirty = true; await assert.rejects(action({ action: 'importCph' }), /busy/); dirty = false;
			busy = true; await assert.rejects(action({ action: 'importCph' }), /busy/); busy = false;
			replace = true; await action({ action: 'importCph' });
			const payload = { ...cphSamples(value), timeLimit: 2000, memoryLimit: 256, batch: { id: 'one', size: 1 }, input: { type: 'stdin' }, output: { type: 'stdout' }, testType: 'single' };
			const targeted = await direct.import(JSON.stringify(payload), url, browserImportTarget(url, () => directories, adapters));
			assert.strictEqual(targeted!.problem.srcPath, source);
			await commands.get('_becoder.cph.importProblem')!(JSON.stringify(payload), url, browserImportTarget(url, () => directories, adapters));
			await importer.import(value); await action({ action: 'importCph' });
			assert.deepStrictEqual(fs.readdirSync(folder).sort(), ['.cph', path.basename(source)].sort());
			assert.strictEqual(fs.readdirSync(path.join(folder, '.cph')).filter(name => name.endsWith('.prob')).length, 1);
			assert.strictEqual(fs.readFileSync(source, 'utf8'), solution);
			saved = store.load(source)!;
			const application = path.resolve('../VSCode-win32-x64');
			const compiler = path.join(process.env.BECODER_TEST_TOOLCHAIN_ROOT ?? path.join(application, 'data/toolchains/ucrt64'), 'bin/g++.exe');
			const executor = new CphExecutor({ dataRoot: path.join(root, 'sessions'), inputHelper: process.env.BECODER_NOTEBOOK_HELPER ?? path.join(application, 'resources/app/extensions/danielpinto8zz6.c-cpp-compile-run/dist/runner-input.exe'),
				prepareCompilation: async (filename: string, output: string, session: string) => ({ compiler, args: [filename, '-o', output, '-std=c++20', '-O2'],
					environment: require(path.resolve('extensions/danielpinto8zz6.c-cpp-compile-run/out-test/extensions/danielpinto8zz6.c-cpp-compile-run/src/compilation.js')).privateRunnerEnvironment(session, compiler) }) });
			try { const result = await executor.judge(saved.problem, source); assert.strictEqual(result.compile.exitCode, 0, result.compile.stderr); assert.deepStrictEqual(result.samples.map(sample => sample.verdict), ['passed', 'passed']); }
			finally { executor.dispose(); }
			bound.isClosed = true; await assert.rejects(action({ action: 'importCph' }), /source/i); bound.isClosed = false;

			const fresh = path.join(root, 'direct-first-' + ref.site); fs.mkdirSync(fresh);
			const directFirst = new ImportController({ workspaceFolders: () => [fresh], selectFolder: async () => assert.fail(), requestWorkspace: async () => assert.fail(),
				confirmReplacement: async () => true, showProblem: async () => undefined, sourcePreferences: async () => ({ language: 'cpp', stem: 'unused', contents: 'first template' }) });
			const first = await directFirst.import(JSON.stringify(payload), url, browserImportTarget(url, () => directories, adapters));
			const firstSource = first!.problem.srcPath; assert.strictEqual(fs.readFileSync(firstSource, 'utf8'), 'first template');
			fs.writeFileSync(firstSource, solution);
			const getSecond = new OjImportController(adapters, { folders: () => [fresh], directories: () => directories, selectFolder: async () => assert.fail(),
				open: async (sourceUri: string, body: unknown) => panels.open(body, sourceUri, document(fileURLToPath(sourceUri))) });
			assert.strictEqual(fileURLToPath((await getSecond.import(value))!.sourceUri), firstSource);
			await captures.at(-1)!.action({ action: 'importCph' });
			assert.strictEqual(displayed.at(-1), firstSource); assert.strictEqual(fs.readFileSync(firstSource, 'utf8'), solution);
			assert.deepStrictEqual(fs.readdirSync(path.dirname(firstSource)).sort(), ['.cph', path.basename(firstSource)].sort());
			directFirst.dispose(); getSecond.dispose();
		}
		importer.dispose(); panels.dispose(); captures.forEach(capture => capture.dispose());
	} finally { Module._load = load; subscriptions.forEach(value => value.dispose()); }
});

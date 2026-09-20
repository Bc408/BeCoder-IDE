/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';
import { createRequire } from 'module';
import { test } from 'node:test';
import { ProblemStore } from '../src/problemStore';
import { CphExecutionOptions } from '../src/execution';

test('extension command binds imports to trusted local workspace and disposes registrations', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-host-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const commands = new Map<string, (json: unknown, url: unknown) => Promise<unknown>>();
	const opened: string[] = [];
	const delivered: unknown[] = [];
	const settings: Record<string, unknown> = {};
	const errors: string[] = [];
	let editorChange: (editor: unknown) => void = () => undefined;
	let provider: any;
	let cursor = -1;
	const subscriptions: { dispose(): void }[] = [];
	const workspace = {
		onDidCloseTextDocument: () => ({ dispose() { } }),
		getConfiguration: () => ({ get: (key: string, fallback: unknown) => settings[key] ?? fallback }),
		isTrusted: true,
		workspaceFolders: [{ uri: { scheme: 'file', fsPath: root } }],
		openTextDocument: async (uri: { fsPath: string }) => { opened.push(uri.fsPath); return { uri, getText: () => fs.readFileSync(uri.fsPath, 'utf8'), positionAt: (offset: number) => offset }; }
	};
	const api = {
		workspace,
		EventEmitter: class {
			readonly event = () => undefined;
			fire(value: unknown) { delivered.push(value); }
			dispose() { }
		},
		commands: {
			registerCommand: (id: string, handler: (json: unknown, url: unknown) => Promise<unknown>) => {
				commands.set(id, handler);
				return { dispose: () => { commands.delete(id); } };
			},
			executeCommand: async (id: string) => assert.strictEqual(id, 'becoder.cph.judge.focus')
		},
		window: {
			onDidChangeActiveTextEditor: (listener: (editor: unknown) => void) => { editorChange = listener; return { dispose() { } }; },
			registerWebviewViewProvider: (_id: string, value: unknown) => { provider = value; return { dispose() { } }; },
			showTextDocument: async (document: any) => ({ edit: async (callback: any) => {
				callback({ delete: (range: any) => fs.writeFileSync(document.uri.fsPath, document.getText().slice(0, range.start) + document.getText().slice(range.end)) });
				return true;
			}, set selection(value: any) { cursor = value.start; }, revealRange() { } }),
			showErrorMessage: async (message: string) => { errors.push(message); },
			showWarningMessage: async () => undefined,
			showQuickPick: async () => assert.fail('single root must not prompt'),
			showInformationMessage: async () => assert.fail('workspace already open')
		},
		Uri: { file: (fsPath: string) => ({ fsPath }) },
		ViewColumn: { Beside: -2 },
		Range: class { constructor(public start: number, public end: number) { } },
		Selection: class { constructor(public start: number, public end: number) { } },
		TextEditorRevealType: { InCenter: 0 },
		l10n: { t: (text: string) => text }
	};
	const entry = path.resolve(__dirname, '../src/extension.js');
	const nativeRequire = createRequire(entry);
	const exports: { activate?: (context: unknown) => unknown } = {};
	const wrapper = new vm.Script(`(function(require,exports){${fs.readFileSync(entry, 'utf8')}\n})`, { filename: entry }).runInThisContext();
	const mockRequire = (id: string): unknown => {
		if (id === 'vscode') { return api; }
		if (id === './judgeView') {
			const viewExports = {};
			const viewEntry = path.join(path.dirname(entry), 'judgeView.js');
			new vm.Script(`(function(require,exports){${fs.readFileSync(viewEntry, 'utf8')}\n})`, { filename: viewEntry }).runInThisContext()(mockRequire, viewExports);
			return viewExports;
		}
		return nativeRequire(id);
	};
	wrapper(mockRequire, exports);
	exports.activate!({ subscriptions, extensionPath: path.resolve('extensions/becoder.cph'), globalStorageUri: { fsPath: path.join(root, 'storage') } });
	const command = commands.get('_becoder.cph.importProblem')!;
	const url = 'https://codeforces.com/problemset/problem/1/A';
	const json = JSON.stringify({ name: 'A', group: 'CF', url, timeLimit: 1000, memoryLimit: 256, interactive: false,
		tests: [], input: { type: 'stdin' }, output: { type: 'stdout' }, testType: 'single', batch: { id: 'one', size: 1 } });
	workspace.isTrusted = false;
	await assert.rejects(command(json, url), /Trust this workspace/);
	assert.deepStrictEqual(fs.readdirSync(root), []);
	workspace.isTrusted = true;
	await assert.rejects(command({}, url), /Invalid problem/);
	await command(json, url);
	assert.strictEqual(opened.length, 1);
	assert.strictEqual(delivered.length, 1);
	assert.strictEqual(path.dirname(opened[0]), fs.realpathSync(root));
	settings['autoShowJudge'] = false;
	const template = path.join(root, 'template.txt');
	fs.writeFileSync(template, '// $name$ $srcPath$\n$CURSOR_PLACEHOLDER');
	settings['general.defaultLanguageTemplateFileLocation'] = template;
	settings['general.doTemplateFileVariableReplacement'] = true;
	const next = JSON.parse(json);
	next.name = 'B - Template'; next.url = 'https://example.com/template';
	await command(JSON.stringify(next), next.url);
	const source = path.join(fs.realpathSync(root), 'Template.cpp');
	assert.strictEqual(fs.readFileSync(source, 'utf8'), fillExpected(source));
	assert.strictEqual(cursor, fillExpected(source).length);
	fs.unlinkSync(template);
	await command(JSON.stringify(next), next.url);
	assert.strictEqual(errors.length, 0, 'existing source must not load missing template');
	next.name = 'C - Missing'; next.url = 'https://example.com/missing';
	await command(JSON.stringify(next), next.url);
	assert.strictEqual(errors.length, 1);
	assert.strictEqual(fs.readFileSync(path.join(root, 'Missing.cpp'), 'utf8'), '');
	editorChange({ document: { uri: { scheme: 'file', fsPath: source }, languageId: 'cpp' } });
	await new Promise(resolve => setImmediate(resolve));
	assert.strictEqual(provider.source, source, 'disabled auto-show still follows associated files');
	const unrelated = path.join(root, 'unrelated.cpp'); fs.writeFileSync(unrelated, '');
	editorChange({ document: { uri: { scheme: 'file', fsPath: unrelated }, languageId: 'cpp' } });
	await new Promise(resolve => setImmediate(resolve));
	assert.strictEqual(provider.source, undefined);
	for (const disposable of subscriptions) { disposable.dispose(); }
	assert.strictEqual(commands.size, 0);
});

function fillExpected(source: string): string {
	return `// Template ${JSON.stringify(source).slice(1, -1)}\n`;
}

test('judge streams individual results, preserves other results through saves, and forwards shortcut drafts', async t => {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-cph-view-')));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const source = path.join(root, 'a.cpp'); fs.writeFileSync(source, '');
	const store = new ProblemStore(root);
	const local = await store.createLocal(source);
	const snapshot = await store.saveSamples(local, [{ id: 0, input: 'a', output: 'a' }, { id: 1, input: 'b', output: 'b' }]);
	const messages: any[] = [];
	const execution = { stdout: 'a', stderr: '', exitCode: 0, signal: null, timedOut: false, cancelled: false, outputLimitExceeded: false };
	const api = {
		workspace: { isTrusted: true, getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }), openTextDocument: async () => ({ save: async () => true }) },
		extensions: { getExtension: (id: string) => { assert.strictEqual(id, 'becoder.runner'); return { activate: async () => ({ prepareCompilation: (source: string, output: string, session: string) => ({ compiler: 'shared-gcc', args: [source, output], environment: { TEMP: session } }) }) }; } },
		commands: { executeCommand: async () => undefined },
		Uri: { file: (fsPath: string) => ({ fsPath }) },
		l10n: { t: (text: string) => text }
	};
	const entry = path.resolve(__dirname, '../src/judgeView.js');
	const nativeRequire = createRequire(entry);
	const exports: any = {};
	new vm.Script(`(function(require,exports){${fs.readFileSync(entry, 'utf8')}\n})`).runInThisContext()((id: string) => {
		if (id === 'vscode') { return api; }
		if (id === './execution') {
			return { CphExecutor: class {
				constructor(private readonly options: CphExecutionOptions) { }
				async judge(problem: any) {
					const plan = await this.options.prepareCompilation(source, 'private.exe', root);
					assert.strictEqual(plan.compiler, 'shared-gcc');
					assert.deepStrictEqual(plan.args, [source, 'private.exe']);
					this.options.onCompileStarted?.(); this.options.onCompileFinished?.();
					const samples = problem.tests.map((_sample: unknown, index: number) => {
						this.options.onSampleStarted?.(index);
						this.options.onCheckerStarted?.();
						const result = { result: execution, verdict: 'passed' as const };
						this.options.onSampleFinished?.(index, result);
						return result;
					});
					assert.ok(messages.some(message => message.command === 'result'), 'results delivered before judge returns');
					return { compile: execution, samples };
				}
				cancel() { } dispose() { }
			} };
		}
		return nativeRequire(id);
	}, exports);
	const view = new exports.JudgeView({ extensionPath: root, globalStorageUri: { fsPath: root } });
	t.after(() => view.dispose());
	view.view = { webview: { postMessage: async (message: unknown) => { messages.push(message); return true; } } };
	await view.openSource(source, false);
	await view.receive({ command: 'run', revision: snapshot.revision, tests: snapshot.problem.tests });
	const latest = () => messages.filter(message => message.command === 'state').at(-1).state;
	assert.strictEqual(latest().cases.filter((item: any) => item.result?.pass).length, 2);
	const revision = latest().revision;
	await view.receive({ command: 'save', revision, tests: snapshot.problem.tests });
	await view.receive({ command: 'ready' });
	assert.strictEqual(latest().cases.filter((item: any) => item.result?.pass).length, 2);
	await view.receive({ command: 'run', id: 1, revision: latest().revision, tests: snapshot.problem.tests });
	assert.strictEqual(latest().cases.filter((item: any) => item.result?.pass).length, 2);
	assert.ok(messages.some(message => message.command === 'progress' && message.phase === 'checking' && message.id === 1));
	await view.receive({ command: 'dirty' });
	await view.runSource(source);
	assert.strictEqual(messages.at(-1).command, 'requestRun');
});

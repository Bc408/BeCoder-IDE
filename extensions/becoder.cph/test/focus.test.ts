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
import { test, TestContext } from 'node:test';
import { ProblemStore, metadataName } from '../src/problemStore';

async function setup(t: TestContext, language = 'en') {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cph-focus-')));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const sources = ['a.cpp', 'b.cpp', 'c.cpp'].map(name => path.join(root, name));
	const store = new ProblemStore(root);
	for (const source of sources) {
		fs.writeFileSync(source, 'int main() {}');
		await store.saveSamples(await store.createLocal(source), [{ id: 0, input: '1', output: '2' }]);
	}
	const messages: any[] = [];
	const focusCommands: string[] = [];
	const warnings: string[] = [];
	const evidenceFailures: ((error: unknown) => void)[] = [];
	let finish: (() => void) | undefined;
	let waitForRun = false;
	let evidenceFailure: Error | undefined;
	let factoryThrows = false;
	let activity: string | undefined = 'activity';
	let collectionScope: object | undefined = { root: 'captured-root' };
	let activityFailure: Error | undefined;
	let scopeFailure = false;
	let runFailure = false;
	let draftTests: unknown;
	let runStarted!: () => void;
	const started = new Promise<void>(resolve => { runStarted = resolve; });
	const translations = JSON.parse(fs.readFileSync(path.resolve('extensions/becoder.cph/l10n/bundle.l10n.zh-cn.json'), 'utf8')) as Record<string, string>;
	const api = {
		workspace: { isTrusted: true, textDocuments: sources.map(source => ({ uri: { scheme: 'file', fsPath: source }, getText: () => fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '') })), getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
			openTextDocument: async (uri: any) => ({ getText: () => fs.readFileSync(uri.fsPath, 'utf8'), save: async () => true }) },
		extensions: { getExtension: () => ({ activate: async () => ({
			prepareCapturedCompilation: async (source: string) => ({ compiler: 'gcc', args: [], environment: {}, sourceSnapshot: { bytesBase64: fs.readFileSync(source).toString('base64') } }),
			createEvidence: (_handle: string, _producer: string, failed: (error: unknown) => void) => {
				evidenceFailures.push(failed);
				if (evidenceFailure) { failed(evidenceFailure); }
				if (factoryThrows) { throw evidenceFailure; }
			}
		}) }) },
		commands: { executeCommand: async (command: string, operation: string) => {
			if (command.endsWith('.focus')) { focusCommands.push(command); }
			if (operation === 'captureCollectionScope') { if (scopeFailure) { throw new Error('scope capture unavailable'); } return collectionScope; }
			if (operation === 'beginActivity' && activityFailure) { throw activityFailure; }
			return operation === 'beginActivity' ? activity : undefined;
		} },
		window: { showWarningMessage: async (message: string) => { warnings.push(message); } },
		Uri: { file: (fsPath: string) => ({ fsPath }) }, l10n: { t: (text: string) => language === 'zh-cn' ? translations[text] ?? text : text }
	};
	const entry = path.resolve(__dirname, '../src/judgeView.js');
	const nativeRequire = createRequire(entry);
	const exports: any = {};
	new vm.Script(`(function(require,exports){${fs.readFileSync(entry, 'utf8')}\n})`).runInThisContext()((id: string) => {
		if (id === 'vscode') { return api; }
		if (id === './execution') {
			return { CphExecutor: class {
				constructor(private readonly options: any) { }
				async judge(problem: any, source: string) {
					await this.options.prepareCompilation(source, 'private.exe', root);
					runStarted();
					if (waitForRun) { await new Promise<void>(resolve => { finish = resolve; }); }
					if (runFailure) { throw new Error('Compiler preparation failed'); }
					const result = { stdout: '2', stderr: '', exitCode: 0, signal: null, timedOut: false, cancelled: false, outputLimitExceeded: false };
					return { compile: result, samples: problem.tests.map(() => ({ result, verdict: 'passed' })) };
				}
				cancel() { finish?.(); } dispose() { }
			} };
		}
		return nativeRequire(id);
	}, exports);
	const view = new exports.JudgeView({ extensionPath: root, globalStorageUri: { fsPath: root } });
	t.after(() => view.dispose());
	view.view = { webview: { postMessage: async (message: any) => {
		messages.push(message);
		if (message.command === 'requestSave' && !view.dirty) {
			const current = view.session.current;
			await view.receive({ command: 'save', switching: message.switching, revision: current.revision, tests: draftTests ?? current.problem.tests });
		}
		return true;
	} } };
	const latest = () => messages.filter(message => message.command === 'state').at(-1).state;
	const run = async (command = 'run') => view.receive({ command, revision: latest().revision, tests: latest().cases.map((item: any) => item.testcase) });
	return { view, sources, store, messages, focusCommands, latest, run, warnings, evidenceFailures, started, defer: () => { waitForRun = true; }, finish: () => finish!(),
		failEvidence: (error = new Error('disk failed'), throws = false) => { evidenceFailure = error; factoryThrows = throws; },
		withoutCollection: (outsideRoot = false) => { activity = undefined; if (!outsideRoot) { collectionScope = undefined; } },
		failActivity: () => { activityFailure = new Error('activity registration failed'); },
		failScope: () => { scopeFailure = true; activity = undefined; },
		failRun: () => { runFailure = true; }, setDraft: (tests: unknown) => { draftTests = tests; } };
}

test('following an associated source never opens CPH or changes the sidebar', async t => {
	const { view, sources: [a, b], focusCommands } = await setup(t);
	view.view = undefined;
	await view.openAssociated(a);
	await view.openAssociated(b);
	assert.equal(view.source, b);
	assert.deepStrictEqual(focusCommands, []);
});

test('focus restores per-file results and marks edited source results stale', async t => {
	const { view, sources: [a, b], latest, run } = await setup(t);
	await view.openAssociated(a);
	await run();
	assert.equal(latest().cases[0].result.pass, true);
	await view.openAssociated(b);
	await view.openAssociated(a);
	assert.equal(latest().cases[0].result?.pass, true);
	fs.writeFileSync(a, 'int main() { return 1; }');
	await view.openAssociated(b);
	await view.openAssociated(a);
	assert.equal(latest().sourceChanged, true);
	await run();
	assert.equal(latest().sourceChanged, false);
	await view.clear();
	assert.equal(latest().source, '');
	await view.openAssociated(a);
	assert.equal(latest().cases[0].result?.pass, true);
});

test('busy focus changes display only the latest target after completion', async t => {
	const { view, sources: [a, b, c], latest, run, started, defer, finish } = await setup(t);
	await view.openAssociated(a);
	defer();
	const running = run();
	await started;
	await view.openAssociated(b);
	await view.openAssociated(c);
	assert.equal(latest().source, a);
	finish();
	await running;
	assert.equal(latest().source, c);
	assert.equal(latest().cases[0].result, null);
});

test('dirty focus flushes samples before switching and save failure retains the draft', async t => {
	const { view, sources: [a, b, c], latest, messages, store } = await setup(t);
	await view.openAssociated(a);
	await view.receive({ command: 'dirty' });
	await view.openAssociated(b);
	assert.equal(latest().source, a);
	assert.equal(messages.at(-1).command, 'requestSave');
	await view.openAssociated(c);
	await view.receive({ command: 'save', switching: true, revision: latest().revision, tests: [{ id: 0, input: 'edited', output: '2' }] });
	assert.equal(latest().source, c);
	assert.equal(store.load(a)?.problem.tests[0].input, 'edited');
	await view.receive({ command: 'dirty' });
	await view.openAssociated(b);
	await view.receive({ command: 'save', revision: 'invalid', tests: [] });
	assert.equal(view.source, c);
	assert.equal(view.hasUnsavedEdits, true);
	assert.equal(messages.at(-1).command, 'failure');
});

test('failed runs align to the latest source after samples have been saved', async t => {
	const { view, sources: [a, b], latest, run, started, defer, finish, failRun } = await setup(t);
	await view.openAssociated(a);
	await view.receive({ command: 'dirty' });
	defer(); failRun();
	const running = run();
	await started;
	await view.openAssociated(b);
	finish();
	await running;
	assert.equal(latest().source, b);
});

test('UTF-8 BOM source results compare with the editor text representation', async t => {
	const { view, sources: [a], latest, run } = await setup(t);
	fs.writeFileSync(a, '\uFEFFint main() {}');
	await view.openAssociated(a);
	await run();
	assert.equal(latest().sourceChanged, false);
	assert.equal(latest().cases[0].result.pass, true);
});

test('Beacon persistence failures never enter the CPH result message', async t => {
	const { view, sources: [a], latest, run, failEvidence } = await setup(t);
	await view.openAssociated(a);
	failEvidence();
	await run();
	assert.equal(latest().cases[0].result.pass, true);
	assert.doesNotMatch(latest().message, /Beacon|workspace|evidence/i);
});

for (const [error, expected] of [
	['disk failed', 'This CPH run record could not be saved to Beacon context. Sample results are unaffected.'],
	['Error: beacon-run-record-too-large', 'This CPH run record exceeds 32 KB and was not saved to Beacon context. Sample results are unaffected.'],
	['Error: beacon-record-publication-uncertain', 'Beacon could not confirm whether this CPH run record was saved. Sample results are unaffected.']
]) {
	test(`CPH notifies once for ${error} without changing sample results`, async t => {
		const { view, sources: [source], latest, run, warnings, failEvidence, evidenceFailures } = await setup(t);
		await view.openAssociated(source);
		failEvidence(new Error(error));
		await run();
		evidenceFailures[0](new Error(error));
		assert.deepStrictEqual(warnings, [expected]);
		assert.equal(latest().cases[0].result.pass, true);
		assert.doesNotMatch(latest().message, /Beacon/);
	});
}

for (const [error, expected] of [
	['adapter start failed', '本次 CPH 运行记录未能保存至 Beacon 上下文，实际测试结果不受影响。'],
	['Error: beacon-run-record-too-large', '本次 CPH 运行记录超过 32 KB，未保存至 Beacon 上下文，实际测试结果不受影响。'],
	['Error: beacon-record-publication-uncertain', '无法确认本次 CPH 运行记录是否已保存至 Beacon，实际测试结果不受影响。']
]) {
	test(`CPH Chinese warning distinguishes ${error}`, async t => {
		const { view, sources: [source], run, warnings, failEvidence } = await setup(t, 'zh-cn');
		await view.openAssociated(source);
		failEvidence(new Error(error));
		await run();
		assert.deepStrictEqual(warnings, [expected]);
	});
}

test('CPH evidence factory failure preserves execution and a later run has its own notification', async t => {
	const { view, sources: [source], latest, run, warnings, failEvidence, evidenceFailures } = await setup(t);
	await view.openAssociated(source);
	failEvidence(new Error('adapter construction failed'), true);
	await run();
	assert.equal(latest().cases[0].result?.pass, true);
	assert.equal(view.isBusy, false);
	assert.equal(warnings.length, 1, 'callback plus factory throw belongs to one action');
	await run();
	assert.equal(warnings.length, 2, 'failure state must not leak into the next action');
	evidenceFailures[0](new Error('late failure from first run'));
	assert.equal(warnings.length, 2);
	assert.equal(latest().cases[0].result.pass, true);
});

for (const eligible of [true, false]) {
	test(`CPH activity failure ${eligible ? 'with' : 'without'} a collection scope preserves execution and reports only eligible failure`, async t => {
		const { view, sources: [source], run, latest, warnings, evidenceFailures, failActivity, withoutCollection } = await setup(t);
		await view.openAssociated(source);
		if (!eligible) { withoutCollection(); }
		failActivity();
		await run();
		assert.equal(latest().cases[0].result.pass, true);
		assert.equal(view.isBusy, false);
		assert.deepStrictEqual(warnings, eligible ? ['This CPH run record could not be saved to Beacon context. Sample results are unaffected.'] : []);
		assert.equal(evidenceFailures.length, 0, 'a failed registration cannot invent an evidence handle');
		await run();
		assert.equal(warnings.length, eligible ? 2 : 0, 'a later actual failure belongs to a new action');
	});
}

for (const command of ['run', 'compile']) {
	test(`CPH scope capture failure preserves ${command} and reports only sample-run collection`, async t => {
		const { view, sources: [source], run, latest, warnings, failScope, evidenceFailures } = await setup(t);
		await view.openAssociated(source); failScope();
		for (const count of [1, 2]) {
			await run(command);
			assert.equal(view.isBusy, false); assert.equal(latest().cases[0].result.pass, true);
			assert.equal(warnings.length, command === 'run' ? count : 0);
		}
		assert.equal(evidenceFailures.length, 0);
		if (command === 'run') { assert.equal(warnings[0], 'This CPH run record could not be saved to Beacon context. Sample results are unaffected.'); }
	});
}

test('CPH outside-root exclusion with a captured scope does not warn', async t => {
	const { view, sources: [source], run, warnings, withoutCollection, evidenceFailures } = await setup(t);
	await view.openAssociated(source);
	withoutCollection(true);
	await run();
	assert.deepStrictEqual(warnings, []);
	assert.equal(evidenceFailures.length, 0);
});

for (const exclusion of ['no-root-or-outside', 'compile-only']) {
	test(`CPH ${exclusion} does not create evidence or report a saving failure`, async t => {
		const { view, sources: [source], run, warnings, failEvidence, evidenceFailures, withoutCollection } = await setup(t);
		await view.openAssociated(source);
		failEvidence(new Error('must not construct evidence'), true);
		if (exclusion === 'no-root-or-outside') { withoutCollection(); }
		await run(exclusion === 'compile-only' ? 'compile' : 'run');
		assert.deepStrictEqual(warnings, []);
		assert.equal(evidenceFailures.length, 0);
	});
}

test('a recreated hidden view resumes an undelivered clean transition', async t => {
	const { view, sources: [a, b], messages, latest } = await setup(t);
	await view.openAssociated(a);
	let live = false;
	view.view.webview.postMessage = async (message: any) => {
		messages.push(message);
		if (live && message.command === 'requestSave') {
			const current = view.session.current;
			await view.receive({ command: 'save', switching: message.switching, revision: current.revision, tests: current.problem.tests });
		}
		return live;
	};
	await view.openAssociated(b);
	assert.equal(view.source, a);
	live = true;
	await view.receive({ command: 'ready' });
	assert.equal(latest().source, b);
});

test('explicit commands cannot replace a problem while the switch flush is pending', async t => {
	const { view, sources: [a, b, c], messages } = await setup(t);
	await view.openAssociated(a);
	view.view.webview.postMessage = async (message: any) => { messages.push(message); return true; };
	await view.openAssociated(b);
	assert.equal(view.hasUnsavedEdits, true);
	await assert.rejects(view.openSource(c, false), /Save the edited samples/);
	await view.runSource(a);
	assert.equal(messages.some(message => message.command === 'requestRun'), false);
});

test('an invalid focused problem keeps the current problem usable and can be retried without losing a new draft', async t => {
	const { view, sources: [a, b], latest, messages, store, setDraft } = await setup(t);
	await view.openAssociated(a);
	const metadata = path.join(path.dirname(b), '.cph', metadataName(b));
	const validMetadata = fs.readFileSync(metadata);
	fs.writeFileSync(metadata, '{');

	await assert.doesNotReject(view.openAssociated(b));
	assert.equal(view.source, a);
	assert.equal(latest().source, a);
	assert.equal(latest().busy, false);
	assert.notEqual(latest().message, '');

	fs.writeFileSync(metadata, validMetadata);
	const saveCount = messages.filter(message => message.command === 'requestSave').length;
	setDraft([{ id: 0, input: 'edited after failed switch', output: '2' }]);
	await view.openAssociated(b);
	assert.equal(messages.filter(message => message.command === 'requestSave').length, saveCount + 1);
	assert.equal(store.load(a)?.problem.tests[0].input, 'edited after failed switch');
	assert.equal(view.source, b);
});

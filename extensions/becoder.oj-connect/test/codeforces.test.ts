/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { browserProblem } from '../src/browserProblem';
import { validateProblemRef, validateRecordRef } from '../src/domain';
import { resolveProblem } from '../src/problemResolver';
import { defaultDirectories } from '../src/settings';
import { OjPreferences } from '../src/preferences';
import { openAccount } from '../src/views/loginModel';
import { luoguProblem } from '../src/adapters/luogu/task';
import * as browserHosts from '../src/browserHost';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ImportController, browserImportTarget } from '../src/importController';
import { cphSamples } from '../src/cphHost';
import { CodeforcesAdapter } from '../src/adapters/codeforces/adapter';
import { SubmissionController, type SubmissionHost } from '../src/workflowController';

test('Codeforces browser import preserves one source and passes unchanged samples to CPH', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-cf-import-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const adapter = new CodeforcesAdapter({} as ConstructorParameters<typeof CodeforcesAdapter>[0]);
	const problem = { ref: { site: 'codeforces' as const, nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' }, title: 'Watermelon', bodies: [], samples: [{ input: ' 8\n', output: 'YES\n' }], limits: [], interactive: false };
	const opened: string[] = [];
	const importer = new ImportController([adapter], { folders: () => [root], directories: () => defaultDirectories, selectFolder: async () => undefined, open: async source => { opened.push(source); } });
	assert.deepStrictEqual(browserImportTarget('https://codeforces.com/problemset/problem/4/A', () => defaultDirectories, [adapter]), { directory: 'codeforces', fileName: '4_a.cpp' });
	const first = await importer.import(problem); assert.ok(first);
	fs.writeFileSync(fileURLToPath(first.sourceUri), 'existing source');
	assert.deepStrictEqual(await importer.import(problem), first);
	assert.deepStrictEqual(opened, [first.sourceUri, first.sourceUri]);
	assert.strictEqual(fs.readFileSync(fileURLToPath(first.sourceUri), 'utf8'), 'existing source');
	assert.deepStrictEqual(Reflect.get(cphSamples(problem) as object, 'tests'), [{ input: ' 8\n', output: 'YES\n' }]);
});

test('an expired Codeforces compiler preference prompts against the current form without silent fallback', async () => {
	const values = new Map<string, unknown>([['codeforces.cppCompiler', '54']]);
	const preferences = new OjPreferences({ get: <T>(key: string) => values.get(key) as T, update: async (key, value) => { values.set(key, value); } });
	const sent: string[] = [];
	const adapter = new CodeforcesAdapter({ prepare: async () => ({ handle: 'prepared', hasDraft: false, languages: [{ id: '999', label: 'Current C++', family: 'cpp' }] }), send: async (_handle, payload) => { sent.push(payload.languageId); return { kind: 'not-sent', reason: 'test' }; }, release: async () => undefined, cancel: async () => undefined, readProblem: async () => assert.fail('unused'), loginSummary: async () => assert.fail('unused'), readRecord: async () => assert.fail('unused'), reconcile: async () => assert.fail('unused') });
	let choices = 0;
	const host: SubmissionHost = { adapters: [adapter], directories: () => defaultDirectories, requestProblem: async () => assert.fail('configured CF directory identifies the source'), chooseLanguage: async options => { choices++; assert.deepStrictEqual(options.map(option => option.id), ['999']); return options[0].id; }, confirmDraft: async () => true, runWithProgress: async (_name, operation) => operation(() => undefined), openRecord: async () => undefined };
	const input = { uri: 'file:///C:/cpp/codeforces/4_a.cpp', fileName: '4_a.cpp', version: 2, family: 'cpp' as const, source: 'unsaved\n' };
	await new SubmissionController(host, preferences).submit(input);
	await new SubmissionController(host, preferences).submit(input);
	assert.strictEqual(choices, 1); assert.deepStrictEqual(sent, ['999', '999']); assert.strictEqual(values.get('codeforces.cppCompiler'), '999');
});

test('Codeforces command host validates dynamic compilers and keeps all calls in its fixed site namespace', async () => {
	const Host = Reflect.get(browserHosts, 'CommandCodeforcesHost'); assert.strictEqual(typeof Host, 'function');
	const problem = { site: 'codeforces' as const, nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
	const commands: string[] = [];
	const host = new Host(async (command: string) => { commands.push(command); return { handle: 'opaque', languages: [{ id: '999', label: 'GNU C++ future', family: 'cpp' }], hasDraft: false }; });
	assert.strictEqual((await host.prepare(problem, 'file:///4_a.cpp')).languages[0].id, '999');
	assert.deepStrictEqual(commands, ['_becoder.ojConnect.codeforces.prepare']);
	const invalid = new Host(async () => ({ handle: 'x', languages: [{ id: '54:o2', label: 'bad', family: 'cpp' }], hasDraft: false }));
	await assert.rejects(invalid.prepare(problem, 'file:///4_a.cpp'), /response/);
	const other = new Host(async () => ({ kind: 'record', record: { problem: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, id: '11', url: 'https://www.luogu.com.cn/record/11' } }));
	await assert.rejects(other.send('opaque', { source: 'x', fileName: '4_a.cpp', languageId: '999' }));
});

test('Codeforces adapter cancels late preparation and sends only one exact dirty snapshot', async () => {
	assert.ok(browserProblem('https://codeforces.com/contest/4/problem/A'));
	const { CodeforcesAdapter } = require('../src/adapters/codeforces/adapter');
	const problem = { site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
	let release = 0, sends = 0, cancellation = 0;
	const host = { prepare: async () => ({ handle: 'opaque', languages: [{ id: '999', label: 'GNU C++', family: 'cpp' }], hasDraft: false }), release: async () => { release++; }, cancel: async () => { cancellation++; }, send: async (_: string, payload: unknown) => { assert.deepStrictEqual(payload, { source: 'unsaved source\r\n', fileName: '4_a.cpp', languageId: '999' }); sends++; return { kind: 'not-sent', reason: 'test' }; } };
	const adapter = new CodeforcesAdapter(host), signal = new AbortController().signal;
	const session = await adapter.prepare(problem, 'file:///4_a.cpp', () => undefined, signal);
	const input = { snapshot: { uri: 'file:///4_a.cpp', fileName: '4_a.cpp', family: 'cpp', version: 9, source: 'unsaved source\r\n' }, languageId: '999', replaceDraft: false };
	await session.send(input, () => undefined, signal); await assert.rejects(session.send(input, () => undefined, signal), /consumed/);
	await session.dispose(); await session.dispose(); assert.strictEqual(sends, 1); assert.strictEqual(release, 1);
	let finish!: (prepared: Awaited<ReturnType<typeof host.prepare>>) => void;
	host.prepare = () => new Promise(resolve => { finish = resolve; });
	Reflect.set(host, 'cancelPreparation', async () => { cancellation++; });
	const controller = new AbortController(), pending = adapter.prepare(problem, 'file:///4_a.cpp', () => undefined, controller.signal);
	controller.abort(); finish({ handle: 'late', languages: [], hasDraft: false });
	await assert.rejects(pending, error => error === controller.signal.reason); assert.strictEqual(release, 2); assert.strictEqual(cancellation, 1);
});

test('Codeforces native URLs preserve the exact problem index and reject unsupported contexts', () => {
	assert.deepStrictEqual(browserProblem('https://codeforces.com/problemset/problem/4/A'), { site: 'codeforces', nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' });
	const { codeforcesProblem } = require('../src/adapters/codeforces/task');
	for (const input of ['1700_a.cpp', '1700/A', 'https://codeforces.com/contest/1700/problem/A/']) { assert.strictEqual(codeforcesProblem(input)?.nativeId, '1700/A'); }
	for (const input of ['https://codeforces.com/contest/4/problem/A?locale=en', 'https://codeforces.com/problemset/problem/4/A?locale=ru']) { assert.deepStrictEqual(browserProblem(input), codeforcesProblem('4/A')); }
	for (const input of ['4_a1.cxx', '4/A1', 'https://codeforces.com/problemset/problem/4/A1']) { assert.strictEqual(codeforcesProblem(input)?.nativeId, '4/A1'); }
	for (const input of ['https://codeforces.com/gym/4/problem/A', 'https://codeforces.com/group/x/contest/4/problem/A', 'https://mirror.codeforces.com/contest/4/problem/A', 'https://codeforces.com/contest/4/problem/A?virtual=true', 'https://user@codeforces.com/contest/4/problem/A', 'https://codeforces.com/contest/4/problem/A#x', '0_a.cpp', '4_a_1.cpp']) { assert.strictEqual(codeforcesProblem(input), undefined, input); }
});

test('Codeforces directory owns reversible filenames without generic underscore guessing', () => {
	const problem = browserProblem('https://codeforces.com/contest/4/problem/A'); assert.ok(problem);
	const { CodeforcesAdapter } = require('../src/adapters/codeforces/adapter');
	const adapter = new CodeforcesAdapter({});
	assert.strictEqual(adapter.fileName(problem), '4_a.cpp');
	const adapters = [adapter, { site: 'luogu' as const, resolve: luoguProblem }];
	assert.deepStrictEqual(resolveProblem('C:/cpp/codeforces/4_a.cpp', defaultDirectories, adapters), { kind: 'problem', problem });
	assert.deepStrictEqual(resolveProblem('C:/cpp/4_a.cpp', defaultDirectories, adapters), { kind: 'inputRequired' });
	assert.strictEqual((resolveProblem('C:/cpp/luogu/CF4A.cpp', defaultDirectories, adapters) as { problem: { site: string } }).problem.site, 'luogu');
	assert.deepStrictEqual(resolveProblem('C:/cpp/codeforces/CF4A.cpp', defaultDirectories, adapters), { kind: 'inputRequired', site: 'codeforces' });
	assert.deepStrictEqual(validateProblemRef(problem), problem);
	const record = { problem, id: '11', url: 'https://codeforces.com/contest/4/submission/11' };
	assert.deepStrictEqual(validateRecordRef(record), record);
	assert.throws(() => validateRecordRef({ ...record, url: 'https://codeforces.com/contest/5/submission/11' }));
});

test('Codeforces compiler preferences remain independent by site and C family', async () => {
	const values = new Map<string, unknown>();
	const prefs = new OjPreferences({ get: <T>(key: string) => values.get(key) as T, update: async (key, value) => { values.set(key, value); } });
	await prefs.selectLanguage('codeforces', 'cpp', '999'); await prefs.selectLanguage('codeforces', 'c', '123'); await prefs.selectLanguage('nowcoder', 'cpp', '38');
	assert.strictEqual(prefs.language('codeforces', 'cpp'), '999'); assert.strictEqual(prefs.language('codeforces', 'c'), '123'); assert.strictEqual(prefs.language('nowcoder', 'cpp'), '38');
	await assert.rejects(prefs.selectLanguage('codeforces', 'cpp', '54:o2'));
});

test('Codeforces accounts open only trusted profiles and otherwise use explicit native login', async () => {
	for (const profileUrl of ['https://codeforces.com/profile/tourist', 'https://evil.test/profile/tourist', 'https://codeforces.com/profile/tourist?x=1']) {
		const events: string[] = [];
		assert.strictEqual(await openAccount({ site: 'codeforces', state: 'signed-in', profileUrl }, async command => { events.push(command); }, async () => { events.push('refresh'); }, async url => { events.push(url); }), true);
		assert.deepStrictEqual(events, [profileUrl.endsWith('/tourist') && profileUrl.startsWith('https://codeforces.com/') ? profileUrl : '_becoder.ojConnect.codeforces.login', 'refresh']);
	}
});

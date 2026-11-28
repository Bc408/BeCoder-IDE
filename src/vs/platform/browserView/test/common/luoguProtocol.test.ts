/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { parseLuoguProblem, luoguLanguages, parseLuoguRecord, luoguLogin } from '../../common/luoguProtocol.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Pure protocol normalization tests.
suite('Luogu production protocol', () => {
	const problem = { site: 'luogu' as const, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
	const config = { CodeLanguage: { 27: { id: 27, name: 'C++20', fileExt: ['cpp'], canO2: true, disabled: false }, 2: { id: 2, name: 'C', fileExt: ['c'], canO2: true, disabled: false } }, RecordStatus: { 0: { name: 'Waiting', shortName: 'Waiting' }, 12: { name: 'Accepted', shortName: 'AC' } } };
	const context = { user: { uid: 123, name: 'test-user' }, data: { problem: { pid: 'P1001', name: 'A+B', content: { locale: 'zh-CN', description: '$a+b$', hint: 'Sample explanation' }, samples: [[' 20 30\n', '50\n']], limits: { time: [1000], memory: [524288] }, acceptLanguages: [27, 2] }, translations: {} } };
	test('English body uses English generated headings and preserves each language title', () => {
		const raw = structuredClone(context);
		Object.assign(raw.data.problem, { content: { locale: 'en', name: 'English title', description: 'Original statement' } });
		raw.data.translations = { 'zh-CN': { locale: 'zh-CN', name: 'Chinese title', description: 'Translated statement' } };
		const value = parseLuoguProblem(problem, raw);
		assert.strictEqual(value.bodies[0].sections[0].heading, 'Problem Statement');
		assert.strictEqual(value.bodies[0].title, 'English title');
		assert.strictEqual(value.bodies[1].title, 'Chinese title');
	});
	test('Luogu problem and language mappings use current official configuration', () => {
		const data = parseLuoguProblem(problem, context);
		assert.strictEqual(data.bodies[0].sections[0].content, '$a+b$');
		assert.strictEqual(data.samples[0].input, ' 20 30\n');
		assert.strictEqual(data.bodies[0].sections.at(-1)?.kind, 'notes');
		assert.strictEqual(data.limits[0].value, '1.00s');
		assert.strictEqual(data.limits[1].value, '512.00MiB');
		const languages = luoguLanguages(context, config);
		assert.deepStrictEqual(languages.map(value => value.id), ['2:o2', '27', '27:o2', '2']);
		assert.deepStrictEqual(languages.map(value => value.family), ['c', 'cpp', 'cpp', 'c']);
		assert.strictEqual(luoguLogin(context).state, 'signed-in');
		assert.strictEqual(luoguLogin(context).profileUrl, 'https://www.luogu.com.cn/user/' + context.user.uid);
		assert.strictEqual(luoguLogin({ user: null }).state, 'signed-out');
		assert.strictEqual(luoguLogin({}).state, 'unknown');
	});

	test('problem metadata retains upstream difficulty and official tag type colors', () => {
		const raw = structuredClone(context);
		Object.assign(raw.data.problem, { difficulty: 1, tags: [1, 999] });
		const tags = { tags: [{ id: 1, name: '模拟', type: 2 }], types: [{ id: 2, color: 'orange-3' }] };
		const result = Reflect.apply(parseLuoguProblem, undefined, [problem, raw, tags]);
		assert.deepStrictEqual(result.difficulty, { label: '入门', color: '#FE4C61' });
		assert.deepStrictEqual(result.tags, [{ label: '模拟', color: '#f39c11' }, { label: 'Unknown Tag: id 999', color: '#000000' }]);
		const absent = parseLuoguProblem(problem, context);
		assert.strictEqual(Reflect.get(absent, 'difficulty'), undefined);
		assert.strictEqual(Reflect.get(absent, 'tags'), undefined);
	});

	test('judging uses official testcase groups and merges completed points without inventing counts', () => {
		const ref = { problem, id: '22', url: 'https://www.luogu.com.cn/record/22' };
		const record = { id: 22, status: 1, problem: { pid: 'P1001', type: 'P' }, detail: { judgeResult: { subtasks: [{ id: 0, testCases: [{ id: 1, status: 12, time: 4 }] }] } } };
		const cfg = { ...config, RecordStatus: { ...config.RecordStatus, 1: { name: 'Judging', shortName: 'Judging' } } };
		for (const key of ['testcaseGroup', 'testCaseGroup']) {
			const result = parseLuoguRecord(ref, { data: { record, [key]: { 0: [0, 1, 2] } } }, cfg);
			assert.deepStrictEqual(result.groups![0].rows.map(row => row.slice(0, 2)), [['1', 'Judging'], ['2', 'AC'], ['3', 'Judging']]);
		}
		assert.strictEqual(parseLuoguRecord(ref, { data: { record: { ...record, detail: {} } } }, cfg).groups!.length, 0);
		assert.strictEqual(parseLuoguRecord(ref, { data: { record, testcaseGroup: { 0: [0, 1, 2] }, canViewStatus: false } }, cfg).groups!.length, 0);
	});
	test('Luogu actual status12 is AC and private or missing fields are not fabricated', () => {
		const ref = { problem, id: '309516436', url: 'https://www.luogu.com.cn/record/309516436' };
		const record = { id: 309516436, status: 12, score: 100, time: 40, memory: 1064, language: 27, problem: { pid: 'P1001' }, sourceCode: 'int main() {}\n', detail: { compileResult: { message: '' } } };
		const data = parseLuoguRecord(ref, { data: { canViewCode: true, canViewStatus: true, record } }, config, 'int main() {}\n');
		assert.strictEqual(data.phase, 'finished'); assert.strictEqual(data.rawStatus, 'AC');
		assert.strictEqual(data.score, '100'); assert.strictEqual(data.sourceVerification, 'matched');
		assert.strictEqual(data.source, record.sourceCode);
		assert.strictEqual(data.time, '40ms');
		assert.strictEqual(data.memory, '1.04MiB');
		const hidden = parseLuoguRecord(ref, { data: { canViewCode: false, canViewStatus: false, record } }, config);
		assert.strictEqual(hidden.phase, 'unknown'); assert.strictEqual(hidden.score, undefined); assert.strictEqual(hidden.sourceVerification, 'unavailable'); assert.strictEqual(hidden.source, undefined);
		assert.throws(() => parseLuoguRecord(ref, { data: { record: { ...record, id: 309516437 } } }, config));
	});

	test('record problem title and difficulty reuse official problem metadata without additional requests', () => {
		const ref = { problem, id: '22', url: 'https://www.luogu.com.cn/record/22' };
		const record = { id: 22, status: 12, problem: { pid: 'P1001', title: 'A+B', name: 'Legacy title', difficulty: 1 } };
		const result = parseLuoguRecord(ref, { data: { record } }, config);
		assert.strictEqual(Reflect.get(result, 'problemTitle'), 'A+B');
		assert.deepStrictEqual(Reflect.get(result, 'problemDifficulty'), { label: '\u5165\u95e8', color: '#FE4C61' });
		const legacy = parseLuoguRecord(ref, { data: { record: { ...record, problem: { pid: 'P1001', name: 'Legacy title' } } } }, config);
		assert.strictEqual(Reflect.get(legacy, 'problemTitle'), 'Legacy title');
		assert.strictEqual(Reflect.get(legacy, 'problemDifficulty'), undefined);
		const absent = parseLuoguRecord(ref, { data: { record: { ...record, problem: { pid: 'P1001' } } } }, config);
		assert.strictEqual(Reflect.get(absent, 'problemTitle'), undefined);
	});

	test('a Chinese summary is not treated as an English section or complete Chinese body', () => {
		const raw = structuredClone(context);
		Object.assign(raw.data.problem, { content: { locale: 'en', description: 'English statement' }, translation: '中文翻译' });
		const data = parseLuoguProblem(problem, raw);
		assert.deepStrictEqual(data.bodies.map(body => body.locale), ['en']);
		assert.ok(!data.bodies[0].sections.some(section => section.content === '中文翻译'));
		assert.strictEqual(data.bodies[0].sections[0].heading, 'Problem Statement');
	});

	test('testcase diagnostics survive mapping and legacy hidden results stay hidden', () => {
		const ref = { problem, id: '22', url: 'https://www.luogu.com.cn/record/22' };
		const record = { id: 22, status: 12, score: 100, problem: { pid: 'P1001' }, detail: { judgeResult: { subtasks: [{ id: 1, testCases: [{ id: 0, status: 12, score: 2.5, signal: 11, exitCode: 139, description: 'diagnostic' }] }] } } };
		const data = parseLuoguRecord(ref, { data: { record } }, config);
		assert.ok(data.groups![0].rows[0].join(' ').includes('2.5'));
		assert.ok(data.groups![0].rows[0].join(' ').includes('139'));
		assert.ok(data.groups![0].rows[0].join(' ').includes('11'));
		const hidden = parseLuoguRecord(ref, { currentData: { showStatus: false, record } }, config);
		assert.strictEqual(hidden.rawStatus, 'N/A');
		assert.strictEqual(hidden.score, undefined);
		assert.deepStrictEqual(hidden.groups, []);
	});

	test('Luogu uses the canonical title when translated content has no name', () => {
		const raw = structuredClone(context);
		Object.assign(raw.data.problem, { title: 'Canonical title', name: undefined });
		assert.strictEqual(parseLuoguProblem(problem, raw).title, 'P1001 Canonical title');
	});

	test('legacy record source remains available unless explicitly private', () => {
		const ref = { problem, id: '22', url: 'https://www.luogu.com.cn/record/22' };
		const record = { id: 22, status: 12, problem: { pid: 'P1001' }, sourceCode: 'int main() {}\r\n', detail: {} };
		const data = parseLuoguRecord(ref, { currentData: { showStatus: true, record } }, config, 'int main() {}\n');
		assert.strictEqual(data.source, record.sourceCode);
		assert.strictEqual(data.sourceVerification, 'matched');
		const hidden = parseLuoguRecord(ref, { data: { canViewCode: false, record } }, config);
		assert.strictEqual(hidden.source, undefined);
		assert.strictEqual(hidden.sourceVerification, 'unavailable');
		const withheld = parseLuoguRecord(ref, { data: { record: { ...record, sourceCode: null } } }, config);
		assert.strictEqual(withheld.source, undefined);
	});

	test('record subtasks and testcases follow numeric IDs for array responses', () => {
		const ref = { problem, id: '22', url: 'https://www.luogu.com.cn/record/22' };
		const record = {
			id: 22, status: 12, problem: { pid: 'P1001' }, detail: {
				judgeResult: {
					subtasks: [
						{ id: 2, testCases: [{ id: 10, status: 12 }, { id: 2, status: 12 }] },
						{ id: 1, testCases: [{ id: 0, status: 12 }] }
					]
				}
			}
		};
		const data = parseLuoguRecord(ref, { data: { record } }, config);
		assert.deepStrictEqual(data.groups!.map(group => group.name), ['Subtask #1', 'Subtask #2']);
		assert.deepStrictEqual(data.groups![1].rows.map(row => row[0]), ['3', '11']);
	});

	test('queued records do not present stale compile details as a completed compile', () => {
		const ref = { problem, id: '22', url: 'https://www.luogu.com.cn/record/22' };
		const record = { id: 22, status: 0, problem: { pid: 'P1001' }, detail: { compileResult: { success: true, message: 'previous compile' } } };
		const data = parseLuoguRecord(ref, { data: { record } }, config);
		assert.strictEqual(data.compileSucceeded, undefined);
		assert.strictEqual(data.compileMessage, undefined);
	});

	test('Luogu 4.20 defaults prefer the accepted GCC 9 C++14 and C O2 entries by ID', () => {
		const raw = structuredClone(context);
		raw.data.problem.acceptLanguages = [27, 28, 2];
		const currentConfig = { CodeLanguage: { ...config.CodeLanguage, 28: { id: 28, name: 'C++14 (GCC 9)', fileExt: ['cpp'], canO2: true, disabled: false } } };
		const languages = luoguLanguages(raw, currentConfig);
		assert.strictEqual(languages.filter(value => value.family === 'cpp')[0].id, '28:o2');
		assert.strictEqual(languages.filter(value => value.family === 'c')[0].id, '2:o2');
		currentConfig.CodeLanguage[28].disabled = true;
		assert.ok(!luoguLanguages(raw, currentConfig).some(value => value.id.startsWith('28')));
		currentConfig.CodeLanguage[28].disabled = false;
		currentConfig.CodeLanguage[28].canO2 = false;
		assert.ok(!luoguLanguages(raw, currentConfig).some(value => value.id === '28:o2'));
	});
});

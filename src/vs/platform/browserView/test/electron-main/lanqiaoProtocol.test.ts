/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { parseLanqiaoProblem, parseLanqiaoLanguages, parseLanqiaoRecord, projectLanqiaoReport, lanqiaoExecution } from '../../electron-main/lanqiaoProtocol.js';

const problem = { site: 'lanqiao' as const, nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' };
const id = '6aff1ff717e87398a15a4abf';
const ref = { problem, id, url: 'https://www.lanqiao.cn/problems/254/submissions/' + id + '/' };
// Reduced real254 shape; tutorial and sample fence structure retained, prose reduced.
const stem = '### 题目描述\n\nCompute $a+b$.\n```cpp\nint main(){}\n```\n### 输入描述\n\nTwo integers.\n### 输出描述\n\nTheir sum.\n### 输入输出样例\n\n#### 示例\n\n> 输入\n\n```txt\n 1 2\n\n```\n\n> 输出\n\n```txt\n3\n```';
const data = { id: 254, question_id: 43756, name: 'A+B', type: 'contest_oj', in_contest: false, contest_id: null, vm_config: null, question_stem: stem, limit_details: [{ language: 'C++', max_runtime_seconds: 1, max_runtime_memory_mb: 256 }, { language: 'C', max_runtime_seconds: 2, max_runtime_memory_mb: 128 }] };

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Pure protocol projections.
suite('Lanqiao public practice protocol', () => {
	test('tutorial fences are not samples and actual sample whitespace survives', () => {
		const value = parseLanqiaoProblem(problem, data, { family: 'cpp' });
		assert.deepStrictEqual(value.samples, [{ input: ' 1 2\n\n', output: '3\n' }]);
		assert.ok(value.bodies[0].sections.some(section => section.content.includes('int main(){}')));
		assert.ok(!value.bodies[0].sections.some(section => section.content.includes(' 1 2')));
		const incomplete = parseLanqiaoProblem(problem, { ...data, question_stem: stem.replace('> 输出', '> Explanation') }, { family: 'cpp' });
		assert.deepStrictEqual(incomplete.samples, []);
		assert.ok(incomplete.bodies[0].sections.some(section => section.content.includes(' 1 2')));
	});
	test('sample explanations and later code remain readable without duplicating the extracted sample', () => {
		const extra = '\n### 样例说明\nOne plus two is three.\n### 备注\n```cpp\nint answer = 3;\n```\n';
		const value = parseLanqiaoProblem(problem, { ...data, question_stem: stem + extra }, { family: 'cpp' });
		const content = value.bodies[0].sections.map(section => section.content).join('\n');
		assert.ok(content.includes('One plus two is three.')); assert.ok(content.includes('int answer = 3;'));
		assert.ok(!content.includes(' 1 2'));
		assert.strictEqual(value.samples.length, 1);
	});
	test('incomplete numbered sample groups cannot pair across boundaries or overwrite an input', () => {
		for (const suffix of [
			'### 样例 1\n> 输入\n```txt\n1 2\n```\n### 样例 2\n> 输出\n```txt\n3\n```',
			'### 样例\n> 输入\n```txt\n1 2\n```\n> 输入\n```txt\n3 4\n```\n> 输出\n```txt\n7\n```'
		]) {
			const original = '### 输入描述\nInput\n### 输出描述\nOutput\n' + suffix;
			const value = parseLanqiaoProblem(problem, { ...data, question_stem: original }, { family: 'cpp' });
			assert.deepStrictEqual(value.samples, []);
			assert.strictEqual(value.bodies[0].sections[0].content, original);
		}
	});
	test('prose between sample labels and code fences is retained verbatim', () => {
		const value = parseLanqiaoProblem(problem, { ...data, question_stem: stem.replace('> 输入\n', '> 输入\n\nKeep this input explanation.\n').replace('> 输出\n', '> 输出\n\nKeep this output explanation.\n') }, { family: 'cpp' });
		const content = value.bodies[0].sections.map(section => section.content).join('\n');
		assert.ok(content.includes('Keep this input explanation.')); assert.ok(content.includes('Keep this output explanation.'));
	});
	test('language-specific limits use source family and missing values are not invented', () => {
		assert.deepStrictEqual(parseLanqiaoProblem(problem, data, { family: 'c' }).limits, [{ label: 'Time Limit', value: '2 s' }, { label: 'Memory Limit', value: '128 MB' }]);
		assert.deepStrictEqual(parseLanqiaoProblem(problem, { ...data, limit_details: [] }, { family: 'cpp' }).limits, []);
		assert.throws(() => parseLanqiaoProblem(problem, { ...data, type: 'contest_challenge' }, { family: 'cpp' }));
		assert.throws(() => parseLanqiaoProblem(problem, { ...data, in_contest: true }, { family: 'cpp' }));
		assert.throws(() => parseLanqiaoProblem(problem, { ...data, contest_id: 1 }, { family: 'cpp' }));
		assert.throws(() => parseLanqiaoProblem(problem, { ...data, vm_config: {} }, { family: 'cpp' }));
		assert.throws(() => parseLanqiaoProblem(problem, { ...data, question_stem: 'Interactive problem: ask the interactor.' }, { family: 'cpp' }));
	});
	test('current language labels are statically read without evaluating other site expressions', async () => {
		const source = '({computed:{availableLanguages:function(){return [{label:"C++（g++17）",value:"cpp",default:!0},{label:"C（gcc8.3.0）",value:"c"},{label:this.isContest?"Python3":"Python",value:"python"}]}}})';
		assert.deepStrictEqual(await parseLanqiaoLanguages(source), [{ id: 'cpp', family: 'cpp', label: 'C++（g++17）' }, { id: 'c', family: 'c', label: 'C（gcc8.3.0）' }]);
		await assert.rejects(parseLanqiaoLanguages(source.replace('"C++（g++17）"', 'evil()')));
		await assert.rejects(parseLanqiaoLanguages(source.replace('value:"c"', 'value:"cpp"')));
		await assert.rejects(parseLanqiaoLanguages(source.replace('C++（g++17）', 'Python3')));
		await assert.rejects(parseLanqiaoLanguages(source.replace('C++（g++17）', 'C++（g++23）')));
	});
	test('official problem difficulty and tags reach shared metadata without changing the statement', () => {
		const value = parseLanqiaoProblem(problem, { ...data, difficulty: 20, difficulty_level: 8, tags: ['基础', 'C++'] }, { family: 'cpp' });
		assert.deepStrictEqual(value.difficulty, { label: '中 LV.8', color: '#faac2b' });
		assert.deepStrictEqual(value.tags, [{ label: '基础' }, { label: 'C++' }]);
		assert.strictEqual(value.bodies[0].sections[0].content, parseLanqiaoProblem(problem, data, { family: 'cpp' }).bodies[0].sections[0].content);
	});
	test('difficulty uses official levels first and the official coarse fallback without inventing a level', () => {
		for (const [difficulty_level, difficulty, expected] of [
			[1, 10, { label: '易 LV.1', color: '#32b03f' }],
			[5, 20, { label: '易 LV.5', color: '#32b03f' }],
			[6, 30, { label: '中 LV.6', color: '#faac2b' }],
			[10, 30, { label: '中 LV.10', color: '#faac2b' }],
			[15, 30, { label: '难 LV.15', color: '#f64600' }],
			[0, 20, { label: '中', color: '#faac2b' }],
			[undefined, 30, { label: '易', color: '#32b03f' }],
			[undefined, 10, { label: '难', color: '#f64600' }]
		] as const) {
			assert.deepStrictEqual(parseLanqiaoProblem(problem, { ...data, difficulty_level, difficulty }, { family: 'cpp' }).difficulty, expected);
		}
		for (const metadata of [{}, { difficulty_level: null, difficulty: null, tags: null }, { difficulty_level: '8', difficulty: '20', tags: [42] }, { difficulty_level: -1, difficulty: Infinity, tags: ['x'.repeat(201)] }, { difficulty_level: 16, difficulty: 20, tags: Array(257).fill('tag') }, { difficulty: 40 }, { difficulty: 0, difficulty_level: 0 }]) {
			const value = parseLanqiaoProblem(problem, { ...data, ...metadata }, { family: 'cpp' });
			assert.strictEqual(value.difficulty, undefined);
			assert.strictEqual(value.tags, undefined);
			assert.strictEqual(value.title, 'A+B', 'unavailable optional metadata cannot break the problem');
		}
	});
	test('official source length counts returned UTF-8 bytes including CRLF without inventing missing content', () => {
		const raw = { submission_id: id, problem_id: 254, language: 'cpp', status: 'AC' };
		assert.strictEqual(parseLanqiaoRecord(ref, raw).codeLength, undefined);
		assert.strictEqual(parseLanqiaoRecord(ref, { ...raw, content: '' }).codeLength, '0 B');
		assert.strictEqual(parseLanqiaoRecord(ref, { ...raw, content: '// 中\r\n' }).codeLength, '8 B');
		assert.strictEqual(parseLanqiaoRecord(ref, { ...raw, content: '// 😀\n' }).codeLength, '8 B');
	});
	test('summary and point projection retain zero, omit hidden data and do not infer failed verdicts', () => {
		const raw = { submission_id: id, problem_id: 254, language: 'cpp', content: 'int main(){}\r\n', status: 'AC', elapsed_time: 0, memory: 0, pass_sample: '5 / 5', pass_rate: 100, elapsed_minutes: 100 };
		const value = parseLanqiaoRecord(ref, raw);
		assert.strictEqual(value.language, 'C++（g++17）');
		assert.strictEqual(value.source, raw.content);
		assert.strictEqual(value.time, '0 ms'); assert.strictEqual(value.memory, '0 kb'); assert.strictEqual(value.score, undefined);
		assert.deepStrictEqual(value.testCaseSummary, { passed: 5, total: 5 });
		assert.strictEqual(value.sourceVerification, 'not-checked');
		assert.strictEqual(parseLanqiaoRecord(ref, { ...raw, status: 'new-state' }).phase, 'unknown');
		assert.throws(() => parseLanqiaoRecord(ref, { ...raw, problem_id: 255 }));
		assert.throws(() => parseLanqiaoRecord(ref, { ...raw, memory: Infinity }));
		const points = projectLanqiaoReport({ status: 'WA', test_cases: [{ status: true, millisecond: 0, memory: 0, result: 'private answer' }, { status: false, result: 'secret input' }] });
		assert.deepStrictEqual(points.rows, [['1', 'AC', '0 ms', '0 kb'], ['2', 'Unknown', '', '']]);
		assert.ok(!JSON.stringify(points).includes('private')); assert.ok(!JSON.stringify(points).includes('secret'));
		assert.strictEqual(parseLanqiaoRecord(ref, { ...raw, status: 'CE', error_info: { error_msg: 'compiler error' } }).compileMessage, 'compiler error');
		assert.strictEqual(parseLanqiaoRecord(ref, { ...raw, status: 'CE' }).compileMessage, undefined);
	});
	test('execution address binds internal question ID and exact observed query without becoming a receipt', () => {
		const url = 'https://opcenter.lanqiao.cn/api/v1/evaluation/questions/43756/submissions/' + id + '/?is_submit=true&judge_client=2';
		assert.deepStrictEqual(lanqiaoExecution(url, '43756'), { id, url });
		for (const input of [url.replace('43756', '254'), url + '&extra=1', url + '#x', url.replace('.cn/', '.cn:443/'), url.replace('true', 'false'), url.replace('/questions/', '/online_judges/')]) { assert.throws(() => lanqiaoExecution(input, '43756')); }
	});
});

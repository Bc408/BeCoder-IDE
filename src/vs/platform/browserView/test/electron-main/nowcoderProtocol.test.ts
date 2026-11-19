/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { assertNowcoderProblem, nowcoderRecord } from '../../common/nowcoderBridge.js';
import { parseNowcoderStatus, parseNowcoderPage, nowcoderLanguages } from '../../electron-main/nowcoderProtocol.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Pure data normalization.
suite('Nowcoder ACM protocol', () => {
	const problem = { site: 'nowcoder' as const, nativeId: 'contest/5657/A', url: 'https://ac.nowcoder.com/acm/contest/5657/A' };
	const page = (info: string) => `<script>window.pageInfo = {questionId:'235780',problemId:'18204',tagId:'4',codeJudgeType:'0',${info}};</script><script src="//static.nowcoder.com/acm/nowcoder/2.0.120/javascripts-acm/lib/env.js"></script><div class="terminal-topic-title">A+B</div><div class="question-intr"><span>Time: 1s</span></div><div class="subject-describe"><p>Compute $a+b$.</p><div class="question-oi"><div class="question-oi-bd"><pre> 1 2\n</pre><pre>3\n</pre></div></div></div>`;
	test('statement chapter normalization preserves anchors and nested code headings', async () => {
		const code = '<pre><code class="language-html"><h2>Literal heading</h2></code></pre>';
		const html = page(`contestId:'5657',subTagId:'1',doneQuestionId:'5657',isFinished:true,isTeamSignUp:false,settingInfo:{needPassword:false,needCharge:false}`).replace('<p>Compute $a+b$.</p>', '<div class="subject-question"><a href="#input">Input</a></div><h2 id="input">输入描述:</h2><p>Input prose.</p>' + code + '<h2><em>Special</em> rules</h2><p>Keep markup.</p>');
		const sections = (await parseNowcoderPage(problem, html)).document.bodies[0].sections;
		assert.strictEqual(sections.length, 3);
		assert.ok(sections[1].content.includes('<h2 id="input">\u8f93\u5165\u683c\u5f0f</h2>'));
		assert.ok(sections[1].content.includes(code));
		assert.ok(sections[2].content.includes('<h2><em>Special</em> rules</h2>'));
	});
	test('common statement sections preserve prose, literal code and site-specific chapters', async () => {
		const html = page(`contestId:'5657',subTagId:'1',doneQuestionId:'5657',isFinished:true,isTeamSignUp:false,settingInfo:{needPassword:false,needCharge:false}`).replace('<p>Compute $a+b$.</p>', '<div class="subject-question"><p>Compute $a+b$.</p><pre><code class="language-cpp">int x;</code></pre></div><h2>输入描述:</h2><pre>Two integers.\nKeep line breaks.</pre><h2>输出描述：</h2><pre>The answer.</pre><h2>备注:</h2><p>Do not overflow.</p><h2>Special rules</h2><p>Original rules.</p>');
		const value = (await parseNowcoderPage(problem, html)).document;
		const sections = value.bodies[0].sections;
		assert.strictEqual(sections[0].heading, '\u9898\u76ee\u63cf\u8ff0');
		assert.deepStrictEqual(sections.slice(1).map(section => /<h2>(.*?)<\/h2>/.exec(section.content)?.[1]), ['\u8f93\u5165\u683c\u5f0f', '\u8f93\u51fa\u683c\u5f0f', '\u8bf4\u660e/\u63d0\u793a', 'Special rules']);
		assert.ok(sections[0].content.includes('<code class="language-cpp">int x;</code>'));
		assert.ok(!sections[1].content.includes('<pre'), 'input prose must not be presented as source code');
		assert.ok(sections[1].content.includes('Two integers.\nKeep line breaks.'));
		assert.strictEqual(sections[3].kind, 'notes');
		assert.ok(sections[4].content.includes('Original rules.'));
		assert.deepStrictEqual(value.samples, [{ input: ' 1 2\n', output: '3\n' }]);
	});
	test('limit labels distinguish the public problem number from time and memory', async () => {
		const original = page(`contestId:'5657',subTagId:'1',doneQuestionId:'5657',isFinished:true,isTeamSignUp:false,settingInfo:{needPassword:false,needCharge:false}`);
		const limits = `<div class="subject-item-wrap"><span>\u9898\u53f7\uff1aNC322020</span><br><span>\u65f6\u95f4\u9650\u5236\uff1aC/C++/Rust/Pascal 2\u79d2\uff0c\u5176\u4ed6\u8bed\u8a004\u79d2</span><br><span>\u7a7a\u95f4\u9650\u5236\uff1aC/C++/Rust/Pascal 256 M\uff0c\u5176\u4ed6\u8bed\u8a00512 M</span><br><span>64bit IO Format: %lld</span></div>`;
		const document = (await parseNowcoderPage(problem, original.replace('<span>Time: 1s</span>', limits))).document;
		assert.deepStrictEqual(document.limits, [
			{ label: 'Time Limit', value: '2.00s' },
			{ label: 'Memory Limit', value: '256.00MiB' }
		]);
	});
	test('missing or unknown limits stay absent instead of being assigned by position', async () => {
		const original = page(`contestId:'5657',subTagId:'1',doneQuestionId:'5657',isFinished:true,isTeamSignUp:false,settingInfo:{needPassword:false,needCharge:false}`);
		for (const content of ['', '<span>ID: NC322020</span><span>64bit IO Format: %lld</span>', '<span>Time:</span><span>Memory: </span>']) {
			assert.deepStrictEqual((await parseNowcoderPage(problem, original.replace('<span>Time: 1s</span>', content))).document.limits, []);
		}
		assert.deepStrictEqual((await parseNowcoderPage(problem, original.replace('<span>Time: 1s</span>', '<span>Memory Limit: 256 M</span><span>Time Limit: 2s</span>'))).document.limits, [
			{ label: 'Memory Limit', value: '256.00MiB' }, { label: 'Time Limit', value: '2.00s' }
		]);
	});
	test('public and contest limits keep only C and C++ values in upstream display units', async () => {
		const inputs = [
			{ ref: problem, info: `contestId:'5657',subTagId:'1',doneQuestionId:'5657',isFinished:true,isTeamSignUp:false,settingInfo:{needPassword:false,needCharge:false}` },
			{ ref: { site: 'nowcoder' as const, nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' }, info: `subTagId:'0',doneQuestionId:'18204'` }
		];
		for (const { ref, info } of inputs) {
			for (const [time, memory, expectedTime, expectedMemory] of [
				['C/C++/Rust/Pascal 2\u79d2\uff0c\u5176\u4ed6\u8bed\u8a004\u79d2', 'C/C++/Rust/Pascal 256 M\uff0c\u5176\u4ed6\u8bed\u8a00512 M', '2.00s', '256.00MiB'],
				['C++ 500ms, Java 2s', 'C++ 1024 KB, Java 256 MB', '500ms', '1.00MiB'],
				['C 1 min', 'C 1 GiB', '1.00min', '1.00GiB'],
				['0.5 s', '512 KiB', '500ms', '512.00KiB'],
				['C 1s, C++ 2s, Java 4s', 'C 128M, C++ 256M, Java 512M', '1.00s~2.00s', '128.00MiB~256.00MiB']
			]) {
				const html = page(info).replace('<span>Time: 1s</span>', '<span>Time: ' + time + '</span><span>Memory: ' + memory + '</span>');
				assert.deepStrictEqual((await parseNowcoderPage(ref, html)).document.limits, [{ label: 'Time Limit', value: expectedTime }, { label: 'Memory Limit', value: expectedMemory }]);
			}
			for (const content of ['<span>Time: Java 4s</span><span>Memory: Python 512M</span>', '<span>Time: Rust/Pascal 2s, Other 4s</span>', '<span>Time: C++ 0s</span><span>Memory: C++ 256 unknown</span>']) {
				assert.deepStrictEqual((await parseNowcoderPage(ref, page(info).replace('<span>Time: 1s</span>', content))).document.limits, []);
			}
		}
	});
	test('static metadata distinguishes public and ended individual contest context without executing scripts', async () => {
		const contest = await parseNowcoderPage(problem, page(`contestId:'5657',subTagId:'1',doneQuestionId:'5657',isFinished:true,isTeamSignUp:false,teamId:123,isNewJudgeEditor:false,settingInfo:{needPassword:false,needCharge:false}`));
		const publicProblem = { site: 'nowcoder' as const, nativeId: 'problem/18204', url: 'https://ac.nowcoder.com/acm/problem/18204' };
		const library = await parseNowcoderPage(publicProblem, page(`subTagId:'0',doneQuestionId:'18204'`));
		assert.strictEqual(contest.questionId, library.questionId);
		assert.strictEqual(contest.subTagId, '1'); assert.strictEqual(library.subTagId, '0');
		assert.deepStrictEqual(contest.document.samples, [{ input: ' 1 2\n', output: '3\n' }]);
		assert.ok(contest.document.bodies[0].sections[0].content.includes('$a+b$'));
		assert.ok(!contest.document.bodies[0].sections[0].content.includes('question-oi'));
		assert.strictEqual(contest.languageURL, 'https://static.nowcoder.com/acm/nowcoder/2.0.120/javascripts-acm/lib/env.js');
		for (const field of ['isFinished:false', 'isTeamSignUp:true', 'isNewJudgeEditor:true', 'settingInfo:{needPassword:true}']) {
			await assert.rejects(() => parseNowcoderPage(problem, page(`contestId:'5657',subTagId:'1',doneQuestionId:'5657',isFinished:true,isTeamSignUp:false,` + field)));
		}
		await assert.rejects(() => parseNowcoderPage(publicProblem, page(`subTagId:'0',doneQuestionId:'18204',extra:doSomething()`)));
	});
	test('statement parsing preserves content when the language resource entry is missing or ambiguous', async () => {
		const script = '<script src="//static.nowcoder.com/acm/nowcoder/2.0.120/javascripts-acm/lib/env.js"></script>';
		const html = page(`contestId:'5657',subTagId:'1',doneQuestionId:'5657',isFinished:true,isTeamSignUp:false,settingInfo:{needPassword:false,needCharge:false}`);
		for (const content of [html.replace(script, ''), html + script]) {
			const value = await parseNowcoderPage(problem, content);
			assert.strictEqual(value.document.title, 'A+B');
			assert.deepStrictEqual(value.document.samples, [{ input: ' 1 2\n', output: '3\n' }]);
			assert.strictEqual(value.languageURL, undefined);
		}
	});
	test('ACM language catalogue applies only literal host overrides and keeps C and C++ options', async () => {
		const source = `({93058:function(){var g=[{id:'1',lang:'C',version:'clang11',suffix:'c',demoCode:external[0]},{id:'2',lang:'C++',version:'old',suffix:'cpp'},{id:'38',lang:'C++(g++ 13)',version:'g++ 13',suffix:'cpp'},{id:'4',lang:'Java',version:'17'}];var x=[];window.location.host.includes('ac.nowcoder.com')&&(x=['2','38','4','1'],g[1].lang='C++ clang18',g[1].version='clang++18');}})`;
		assert.deepStrictEqual(await nowcoderLanguages(source), [{ id: '2', label: 'C++ clang18', family: 'cpp' }, { id: '38', label: 'C++(g++ 13)', family: 'cpp' }, { id: '1', label: 'C', family: 'c' }]);
		await assert.rejects(() => nowcoderLanguages(source.replace(`g[1].lang='C++ clang18'`, 'g[1].lang=runCode()')));
		await assert.rejects(() => nowcoderLanguages(source + source));
	});
	test('strict identities preserve context and do not require an ID prefix', () => {
		assertNowcoderProblem(problem);
		const ref = nowcoderRecord(problem, '123');
		assert.strictEqual(ref.url, 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=123');
		for (const url of [problem.url + '?x=1', problem.url + '#x', problem.url.replace('https://', 'https://user@'), problem.url.replace('ac.nowcoder.com', 'example.org')]) {
			assert.throws(() => assertNowcoderProblem({ ...problem, url }));
		}
		assert.throws(() => assertNowcoderProblem({ ...problem, nativeId: 'problem/18204' }));
		assert.throws(() => nowcoderRecord(problem, '0'));
	});
	test('top-level status uses official verdicts and units without turning pass rate into score', () => {
		const ref = nowcoderRecord(problem, '123');
		const result = parseNowcoderStatus(ref, { code: 0, id: 123, status: 5, timeConsumption: 3, memoryConsumption: 300, rightHundredRate: 100, isShowTestCase: false });
		assert.strictEqual(result.phase, 'finished'); assert.strictEqual(result.rawStatus, 'AC');
		assert.strictEqual(result.time, '3 ms'); assert.strictEqual(result.memory, '300 KB');
		assert.strictEqual(result.score, undefined); assert.deepStrictEqual(result.groups, []);
		assert.strictEqual(result.sourceVerification, 'not-checked');
	});
	test('pending and CE omit meaningless zero resources and preserve diagnostics', () => {
		const ref = nowcoderRecord(problem, '123');
		for (const status of [0, 1, 2]) {
			const result = parseNowcoderStatus(ref, { code: 0, id: 123, status, timeConsumption: 0, memoryConsumption: 0, score: 0 });
			assert.ok(['queued', 'judging'].includes(result.phase));
			assert.strictEqual(result.score, undefined); assert.strictEqual(result.time, undefined);
		}
		const ce = parseNowcoderStatus(ref, { code: 0, id: 123, status: 12, memo: 'main.cpp: error', timeConsumption: 0, memoryConsumption: 0 });
		assert.strictEqual(ce.compileMessage, 'main.cpp: error'); assert.strictEqual(ce.compileSucceeded, false); assert.strictEqual(ce.memory, undefined);
		assert.strictEqual(parseNowcoderStatus(ref, { code: 0, id: 123, status: 99 }).phase, 'unknown');
	});
	test('errors, absent identity and mismatched IDs never become successful results', () => {
		const ref = nowcoderRecord(problem, '123');
		for (const raw of [{ code: 999, msg: 'need login' }, { status: 5 }, { code: 0, id: 124, status: 5 }, { code: 0 }, { error: 'failed' }]) {
			assert.throws(() => parseNowcoderStatus(ref, raw));
		}
	});
	test('sample explanations retain their HTML and formula images beside the corresponding sample', async () => {
		const html = page(`contestId:'5657',subTagId:'1',doneQuestionId:'5657',isFinished:true,isTeamSignUp:false,settingInfo:{needPassword:false,needCharge:false}`).replace('<pre>3\n</pre>', '<pre>3\n</pre><pre>Because <img src="https://www.nowcoder.com/equation?tex=a%2Bb">.</pre>');
		const document = (await parseNowcoderPage(problem, html)).document;
		assert.ok(document.bodies[0].sections.some(section => section.kind === 'sample-explanation' && section.sampleIndex === 0 && section.content.includes('equation?tex=a%2Bb')));
	});
	test('terminal case totals remain a summary rather than invented score or testcase rows', () => {
		const ref = nowcoderRecord(problem, '123');
		const result = parseNowcoderStatus(ref, { code: 0, id: 123, status: 4, rightCaseNum: 3, allCaseNum: 24 });
		assert.deepStrictEqual(Reflect.get(result, 'testCaseSummary'), { passed: 3, total: 24 });
		for (const [status, passed, total] of [[0, 0, 24], [12, 0, 0], [4, 25, 24], [4, -1, 24]]) {
			assert.strictEqual(Reflect.get(parseNowcoderStatus(ref, { code: 0, id: 123, status, rightCaseNum: passed, allCaseNum: total }), 'testCaseSummary'), undefined);
		}
	});

});

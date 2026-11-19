/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { codeforcesAccount, parseCodeforcesForm, parseCodeforcesLanguages, parseCodeforcesList, parseCodeforcesRecord, sameCodeforcesCompiler } from '../../electron-main/codeforcesProtocol.js';

import { cfProblem, cfForm, cfHeader, cfList, cfRow } from './codeforcesFixtures.js';
// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Pure static parser tests allocate no disposables.
suite('Codeforces static protocol', () => {
	test('reads the real catalogue structure without requiring submit token initialization or task-type scripts', async () => {
		// The saved 2192/A response includes fallback token assignments after its initial literals.
		const fallback = cfForm.replace('</script>', `if (!window._ftaa) { window._ftaa = ''; window._ftaa = fallback; window._ftaa = initialize(); } if (!window._bfaa) { window._bfaa = initialize(); }</script>`);
		const expected = [{ id: '89', label: 'GNU G++20 13.2 (64 bit, winlibs)', family: 'cpp' }, { id: '43', label: 'GNU GCC C11 5.1.0', family: 'c' }];
		assert.deepStrictEqual(parseCodeforcesLanguages(cfProblem, fallback), { ownerKey: 'fixture', languages: expected });
		await assert.rejects(parseCodeforcesForm(cfProblem, fallback), /nonliteral-token/, 'the sending parser must retain its strict token policy');
		const catalogueOnly = fallback.replace(/<script>[\s\S]*?<\/script>/, '').replace(/<input name="csrf_token"[^>]*>/, '').replace('action="/contest/4/submit?csrf_token=fixture-csrf"', 'action="/contest/4/submit"');
		assert.deepStrictEqual(parseCodeforcesLanguages(cfProblem, catalogueOnly).languages, expected);
		await assert.rejects(parseCodeforcesForm(cfProblem, catalogueOnly), /form-action/, 'reading compiler names must not manufacture a send-ready form');
	});
	test('readonly catalogues still reject mismatched targets, incomplete pages, foreign forms and ambiguous language lists', () => {
		for (const html of [
			cfForm.replace('name="contestId" value="4"', 'name="contestId" value="5"'),
			cfForm.replace('<option value="A" selected>', '<option value="B" selected>'),
			cfForm.replace('</html>', ''), cfForm.replace('</form>', ''),
			cfForm.replace('action="/contest/4/submit?', 'action="https://evil.invalid/contest/4/submit?'),
			cfForm.replace('>Practice<', '>Virtual<'),
			cfForm.replace('</select><textarea', '</select><select name="programTypeId"><option value="1">GNU G++20</option></select><textarea')
		]) { assert.throws(() => parseCodeforcesLanguages(cfProblem, html)); }
	});
	test('reads dynamic form fields and literal AST without executing scripts', async () => {
		const form = await parseCodeforcesForm(cfProblem, cfForm);
		assert.strictEqual(form.ownerKey, 'fixture');
		assert.deepStrictEqual(form.languages.map(value => value.id), ['89', '43']);
		assert.strictEqual(form.fields.get('ftaa'), 'fixture-ftaa');
		assert.strictEqual(form.action, 'https://codeforces.com/contest/4/submit?csrf_token=fixture-csrf');
		await assert.rejects(parseCodeforcesForm(cfProblem, cfForm.replace(`window._ftaa='fixture-ftaa'`, 'window._ftaa=stealCookie()')), /literal/);
		await assert.rejects(parseCodeforcesForm(cfProblem, cfForm.replace('>Finished<', '>Coding<')), /practice/);
		await assert.rejects(parseCodeforcesForm(cfProblem, cfForm.replace('action="/contest/4/submit?', 'action="https://evil.invalid/contest/4/submit?')), /action/);
	});
	test('distinguishes authenticated empty table from broken HTML or challenge', () => {
		assert.deepStrictEqual(parseCodeforcesList(cfProblem, cfList()).rows, []);
		assert.throws(() => parseCodeforcesList(cfProblem, '<html><body>' + cfHeader + '</body></html>'), /list/);
		assert.throws(() => parseCodeforcesList(cfProblem, '<title>Just a moment...</title>' + cfList()), /verification/);
		assert.strictEqual(codeforcesAccount('<div id="header"><a href="/enter">Enter</a><a href="/register">Register</a></div>'), undefined);
		assert.throws(() => codeforcesAccount('<div id="header">unrecognized</div>'), /account/);
		assert.throws(() => parseCodeforcesList(cfProblem, cfList(cfRow('20', undefined, 'other'))), /owner/);
		assert.strictEqual(sameCodeforcesCompiler('GNU G++20 13.2 (64 bit, winlibs)', 'C++20 (GCC 13-64)'), true);
		assert.strictEqual(sameCodeforcesCompiler('GNU G++20 13.2 (64 bit, winlibs)', 'C++20 (GCC 14-64)'), false);
		assert.strictEqual(sameCodeforcesCompiler('GNU G++17 7.3.0', 'C++17 (GCC 7-32)'), true);
		assert.strictEqual(sameCodeforcesCompiler('GNU G++17 7.3.0', 'C++17 (GCC 7-64)'), false);
	});
	test('matches the official GCC 14 msys2 label without matching another toolchain', () => {
		assert.strictEqual(sameCodeforcesCompiler('GNU G++23 14.2 (64 bit, msys2)', 'C++23 (GCC 14-64, msys2)'), true);
		assert.strictEqual(sameCodeforcesCompiler('GNU G++23 14.2 (64 bit, msys2)', 'C++23 (GCC 14-64, winlibs)'), false);
		assert.strictEqual(sameCodeforcesCompiler('GNU G++23 14.2 (64 bit, msys2)', 'C++23 (GCC 14-32, msys2)'), false);
		assert.strictEqual(sameCodeforcesCompiler('GNU G++23 14.2 (64 bit, msys2)', 'C++20 (GCC 14-64, msys2)'), false);
	});
	test('merges the official practice and contest tables in submission order', () => {
		// CF /contest/2202/my returned both My Submissions and My contest submissions.
		const html = cfList(cfRow('21') + cfRow('19'), '', cfRow('22') + cfRow('20'));
		assert.deepStrictEqual(parseCodeforcesList(cfProblem, html).rows.map(row => row.id), ['22', '21', '20', '19']);
		assert.deepStrictEqual(parseCodeforcesList(cfProblem, cfList('', '', cfRow('20'))).rows.map(row => row.id), ['20']);
		assert.throws(() => parseCodeforcesList(cfProblem, cfList(cfRow('21'), '', cfRow('21'))), /order/);
		assert.throws(() => parseCodeforcesList(cfProblem, cfList(cfRow('21'), '', cfRow('20', undefined, 'other'))), /owner/);
		assert.throws(() => parseCodeforcesList(cfProblem, cfList(cfRow('21'), '', cfRow('19') + cfRow('20'))), /order/);
	});
	test('requires current ordinary practice marker and positive empty list evidence', async () => {
		await assert.rejects(parseCodeforcesForm(cfProblem, cfForm.replace('>Practice<', '>Virtual<')), /practice/);
		assert.throws(() => parseCodeforcesList(cfProblem, cfList().replace('<tr><td colspan="8">No items</td></tr>', '')), /empty/);
	});
	test('requires literal task type evidence and rejects official output-only problem indices', async () => {
		await assert.rejects(parseCodeforcesForm(cfProblem, cfForm.replace('const outputOnlyIndices=[];', '')), /task-type/);
		await assert.rejects(parseCodeforcesForm(cfProblem, cfForm.replace('const outputOnlyIndices=[];', `const outputOnlyIndices=['A'];`)), /output-only/);
		await assert.rejects(parseCodeforcesForm(cfProblem, cfForm.replace('const outputOnlyIndices=[];', 'const outputOnlyIndices=getIndices();')), /task-type/);
	});
	test('rejects truncated form/list and excludes test data from record cards', async () => {
		await assert.rejects(parseCodeforcesForm(cfProblem, cfForm.replace('</form>', '')), /incomplete/);
		assert.throws(() => parseCodeforcesList(cfProblem, cfList().replace('</table>', '')), /incomplete/);
		const ref = { problem: cfProblem, id: '21', url: 'https://codeforces.com/contest/4/submission/21' };
		for (const verdict of ['Accepted', 'Wrong answer on test 1']) {
			const snapshot = parseCodeforcesRecord(ref, { waiting: 'false', compilationError: 'false', verdict, 'verdict#1': 'OK', 'input#1': 'private input', 'output#1': 'private output', 'answer#1': 'private answer', 'checkerStdoutAndStderr#1': 'private checker output' });
			assert.deepStrictEqual(snapshot.groups?.[0].rows[0], ['1', 'OK', '', '']);
		}
	});
	test('keeps only the actual process exit code as a concise testcase detail', () => {
		const ref = { problem: cfProblem, id: '21', url: 'https://codeforces.com/contest/4/submission/21' };
		for (const [exitCode, details] of [[0, ['Exit with code 0']], ['-1', ['Exit with code -1']], [undefined, []], ['1\nprivate input', []]] as const) {
			const snapshot = parseCodeforcesRecord(ref, { waiting: false, compilationError: false, verdict: 'Runtime error on test 1', 'verdict#1': 'RUNTIME_ERROR', 'exitCode#1': exitCode });
			assert.deepStrictEqual(snapshot.groups?.[0].rows[0].slice(4), details);
		}
	});
	test('uses resources only from the same record and matching terminal list verdict', () => {
		const ref = { problem: cfProblem, id: '21', url: 'https://codeforces.com/contest/4/submission/21' };
		const raw = { waiting: false, compilationError: false, verdict: 'Accepted', 'timeConsumed#1': '937', 'verdict#1': 'OK' };
		const read = (html: string) => parseCodeforcesRecord(ref, raw, parseCodeforcesList(cfProblem, html).rows[0]);
		for (const row of [cfRow('21').replace('<td>Accepted</td>', '<td waiting="true">Running on test 18</td>'), cfRow('21').replace('<td>Accepted</td>', '<td waiting="true">Accepted</td>'), cfRow('22'), cfRow('21').replace('/contest/4/problem/A', '/contest/4/problem/B')]) {
			const value = read(cfList(row));
			assert.strictEqual(value.time, undefined); assert.strictEqual(value.memory, undefined);
		}
		const value = read(cfList(cfRow('21').replace('15 ms', '937 ms').replace('256 KB', '16 KB')));
		assert.strictEqual(value.time, '937 ms'); assert.strictEqual(value.memory, '16 KB');
	});
	test('omits missing or malformed resources independently and preserves genuine zero values', () => {
		const ref = { problem: cfProblem, id: '21', url: 'https://codeforces.com/contest/4/submission/21' };
		for (const [time, memory, expected] of [['', '', [undefined, undefined]], ['?', '0 KB', [undefined, '0 KB']], ['0 ms', 'unknown', ['0 ms', undefined]], ['0 ms', '0 KB', ['0 ms', '0 KB']]] as const) {
			const row = parseCodeforcesList(cfProblem, cfList(cfRow('21').replace('15 ms', time).replace('256 KB', memory))).rows[0];
			const value = parseCodeforcesRecord(ref, { waiting: false, compilationError: false, verdict: 'Accepted' }, row);
			assert.deepStrictEqual([value.time, value.memory], expected);
		}
		const row = parseCodeforcesList(cfProblem, cfList(cfRow('21')).replace('<th>Time</th>', '<th>Score</th>')).rows[0];
		const value = parseCodeforcesRecord(ref, { waiting: false, compilationError: false, verdict: 'Accepted' }, row);
		assert.strictEqual(value.time, undefined); assert.strictEqual(value.memory, '256 KB');
	});
	test('normal challenge-platform background scripts do not imitate an interstitial', async () => {
		const normal = cfForm.replace('</body>', '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body>');
		assert.strictEqual((await parseCodeforcesForm(cfProblem, normal)).ownerKey, 'fixture');
		assert.throws(() => parseCodeforcesList(cfProblem, cfList().split('</table>')[0] + '</table>'), /incomplete/);
	});
	test('falls back from absent or zero list memory to the maximum available testcase bytes', () => {
		const ref = { problem: cfProblem, id: '21', url: 'https://codeforces.com/contest/4/submission/21' };
		const raw = { waiting: false, compilationError: false, verdict: 'Accepted', 'verdict#1': 'OK', 'memoryConsumed#1': '20480', 'verdict#2': 'OK', 'memoryConsumed#2': '0', 'verdict#4': 'OK', 'memoryConsumed#4': '8192', 'verdict#7': 'OK', 'memoryConsumed#7': '4096' };
		for (const memory of ['0 KB', '', '?']) {
			const row = parseCodeforcesList(cfProblem, cfList(cfRow('21').replace('256 KB', memory))).rows[0];
			const value = parseCodeforcesRecord(ref, raw, row);
			assert.strictEqual(value.memory, '20480 B');
			assert.strictEqual(value.time, '15 ms', 'memory fallback does not change the official aggregate time');
		}
		assert.strictEqual(parseCodeforcesRecord(ref, raw).memory, '20480 B', 'a missing list row cannot discard real detail resources');
		const row = parseCodeforcesList(cfProblem, cfList(cfRow('21').replace('256 KB', '8 KB'))).rows[0];
		assert.strictEqual(parseCodeforcesRecord(ref, raw, row).memory, '8 KB', 'a positive official aggregate remains authoritative');
	});
	test('does not round testcase memory before taking its maximum or invent unavailable values', () => {
		const ref = { problem: cfProblem, id: '21', url: 'https://codeforces.com/contest/4/submission/21' };
		const raw = { waiting: false, compilationError: false, verdict: 'Accepted', 'verdict#1': 'OK', 'memoryConsumed#1': '1', 'verdict#2': 'OK', 'memoryConsumed#2': '1025' };
		const value = parseCodeforcesRecord(ref, raw);
		assert.strictEqual(value.memory, '1025 B');
		assert.strictEqual(value.groups?.[0].rows[0][3], '1 B');
		for (const memory of [undefined, '', -1, 'NaN', 'unknown', '20 KB', Number.MAX_SAFE_INTEGER + 1]) {
			assert.strictEqual(parseCodeforcesRecord(ref, { ...raw, 'memoryConsumed#1': memory, 'memoryConsumed#2': memory }).memory, undefined);
		}
		assert.strictEqual(parseCodeforcesRecord(ref, { ...raw, 'memoryConsumed#1': 0, 'memoryConsumed#2': 0 }).memory, '0 B');
		for (const state of [{ waiting: true, verdict: 'Running on test 2' }, { waiting: false, verdict: 'Brand new status' }, { compilationError: true, verdict: 'Compilation error' }]) {
			assert.strictEqual(parseCodeforcesRecord(ref, { ...raw, ...state }).memory, undefined, 'only a terminal non-CE record has aggregate resources');
		}
	});
	test('parses explicit boolean strings, sanitizes diagnostics and exposes only real tests', () => {
		const ref = { problem: cfProblem, id: '21', url: 'https://codeforces.com/contest/4/submission/21' };
		const queued = parseCodeforcesRecord(ref, { waiting: 'true', compilationError: 'false', verdict: '<span>Running on test 18</span>', source: 'a\n', testCount: '99' });
		assert.strictEqual(queued.phase, 'judging'); assert.strictEqual(queued.rawStatus, 'Running on test 18'); assert.strictEqual(queued.groups?.length ?? 0, 0);
		const ce = parseCodeforcesRecord(ref, { waiting: 'false', compilationError: 'true', verdict: 'Compilation error', submissionProtocol: '<pre>error: &lt;bad&gt;</pre><script>attack()</script>', testCount: '1', 'verdict#1': 'COMPILATION_ERROR' });
		assert.strictEqual(ce.compileMessage, 'error: <bad>'); assert.strictEqual(ce.compileSucceeded, false); assert.strictEqual(ce.groups?.length ?? 0, 0);
		const unknown = parseCodeforcesRecord(ref, { waiting: 'false', compilationError: 'false', verdict: 'Brand new status' }); assert.strictEqual(unknown.phase, 'unknown');
		const ac = parseCodeforcesRecord(ref, { waiting: 'false', compilationError: 'false', verdict: '<b>Accepted</b>', 'verdict#1': 'OK', 'timeConsumed#1': '15', 'memoryConsumed#1': '262144' });
		assert.strictEqual(ac.phase, 'finished'); assert.strictEqual(ac.score, undefined); assert.strictEqual(ac.owner, undefined); assert.strictEqual(ac.groups?.[0].rows[0][3], '262144 B');
	});
	test('removes only the matching problem index from a record title', () => {
		const row = parseCodeforcesList(cfProblem, cfList(cfRow('21'))).rows[0];
		for (const [nativeId, title, expected] of [['4/A', 'A - Watermelon', 'Watermelon'], ['4/A1', 'A1 - Easy version', 'Easy version'], ['4/A1', 'A - Different prefix', 'A - Different prefix'], ['4/A', 'A-Team', 'A-Team']]) {
			const problem = { site: 'codeforces' as const, nativeId, url: 'https://codeforces.com/contest/' + nativeId.replace('/', '/problem/') };
			const ref = { problem, id: '21', url: 'https://codeforces.com/contest/4/submission/21' };
			const snapshot = parseCodeforcesRecord(ref, { waiting: false, compilationError: false, verdict: 'Accepted' }, { ...row, title, problemURL: problem.url });
			assert.strictEqual(snapshot.problemTitle, expected);
			assert.strictEqual(snapshot.ref.problem.nativeId, nativeId);
		}
		assert.strictEqual(row.title, 'A - Watermelon', 'display normalization must not mutate the receipt row');
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { validateProblem, validateRecord, validateProblemRef, validateOutcome } from '../src/domain';
import { cphSamples } from '../src/cphHost';

const ref = { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
test('compiler catalogue failure preserves a readable problem and only accepts fixed error categories', () => {
	const input = { ref, title: 'A+B', bodies: [], samples: [], limits: [], interactive: false };
	for (const languageError of ['unavailable', 'login-required']) {
		assert.strictEqual(validateProblem({ ...input, languageError }).languageError, languageError);
	}
	assert.throws(() => validateProblem({ ...input, languageError: 'private website response' }), /language/);
});
test('an explicit website rejection crosses the DTO boundary without becoming an unsent or pending attempt', () => {
	assert.deepStrictEqual(validateOutcome({ kind: 'rejected', reason: 'codeforces-duplicate-source', source: 'private' }), { kind: 'rejected', reason: 'codeforces-duplicate-source' });
	assert.throws(() => validateOutcome({ kind: 'rejected', reason: '' }));
});
test('Nowcoder records preserve their public or contest identity and accept positive IDs of any prefix', () => {
	for (const nativeId of ['problem/18204', 'contest/5657/A']) {
		const problem = { site: 'nowcoder', nativeId, url: 'https://ac.nowcoder.com/acm/' + nativeId };
		assert.deepStrictEqual(validateProblemRef(problem), problem);
		const record = { ref: { problem, id: '123', url: 'https://ac.nowcoder.com/acm/contest/view-submission?submissionId=123' }, phase: 'queued', rawStatus: 'Waiting', sourceVerification: 'not-checked' };
		assert.deepStrictEqual(validateRecord(record).ref, record.ref);
		assert.throws(() => validateRecord({ ...record, ref: { ...record.ref, url: record.ref.url + '&other=1' } }));
		assert.throws(() => validateProblemRef({ ...problem, nativeId: 'problem/235780' }));
	}
});
test('CPH receives actual units and leaves ranges or missing limits unspecified', () => {
	const document = validateProblem({ ref, title: 'A+B', bodies: [{ locale: 'en', sections: [] }], samples: [], limits: [{ label: 'Time Limit', value: '2 sec' }, { label: 'Memory Limit', value: '256 MiB' }], interactive: false });
	const payload = cphSamples(document) as { timeLimitMs?: number; memoryLimitMiB?: number };
	assert.strictEqual(payload.timeLimitMs, 2000); assert.strictEqual(payload.memoryLimitMiB, 256);
	assert.strictEqual((cphSamples({ ...document, limits: [{ label: 'Time Limit', value: '1–2 sec' }] }) as typeof payload).timeLimitMs, undefined);
});
test('problem validation preserves sample bytes and optional limits without fabrication', () => {
	const problem = validateProblem({ ref, title: 'A+B', bodies: [{ locale: 'zh-CN', sections: [{ format: 'markdown', content: '$a+b$' }] }], samples: [{ input: '  1\n\n', output: '' }], limits: [], interactive: false });
	assert.deepStrictEqual(problem.samples, [{ input: '  1\n\n', output: '' }]);
	assert.deepStrictEqual(problem.limits, []);
});

test('metadata is optional, keeps platform labels and rejects executable CSS', () => {
	const input = { ref, title: 'A+B', bodies: [], samples: [], limits: [], interactive: false, difficulty: { label: 'Rating 1600', color: '#123ABC' }, tags: [{ label: 'dp', color: 'rgb(10, 20, 30)' }] };
	const result = validateProblem(input);
	assert.deepStrictEqual(Reflect.get(result, 'difficulty'), input.difficulty);
	assert.deepStrictEqual(Reflect.get(result, 'tags'), input.tags);
	assert.throws(() => validateProblem({ ...input, difficulty: { label: 'x', color: 'url(https://example.org/)' } }));
});

test('CPH accepts upstream display units and keeps ranges unspecified', () => {
	const input = { ref, title: 'A+B', bodies: [], samples: [], interactive: false, limits: [{ label: 'Time Limit', value: '1.00s' }, { label: 'Memory Limit', value: '128.00MiB' }] };
	const payload = cphSamples(validateProblem(input)) as { timeLimitMs?: number; memoryLimitMiB?: number };
	assert.strictEqual(payload.timeLimitMs, 1000);
	assert.strictEqual(payload.memoryLimitMiB, 128);
	assert.strictEqual((cphSamples(validateProblem({ ...input, limits: [{ label: 'Time Limit', value: '1.00s~2.00s' }] })) as typeof payload).timeLimitMs, undefined);
});
test('records reject cross-site and mismatched identities instead of inventing a result', () => {
	const value = { ref: { problem: ref, id: '123', url: 'https://www.luogu.com.cn/record/123' }, phase: 'unknown', rawStatus: 'new-verdict', sourceVerification: 'not-checked' };
	assert.strictEqual(validateRecord(value).score, undefined);
	assert.strictEqual(validateRecord(value).phase, 'unknown');
	assert.throws(() => validateRecord({ ...value, ref: { ...value.ref, url: 'https://atcoder.jp/contests/abc086/submissions/123' } }));
	assert.throws(() => validateRecord({ ...value, ref: { ...value.ref, url: 'https://www.luogu.com.cn/record/124' } }));
	assert.throws(() => validateProblemRef({ ...ref, nativeId: 'P1002' }));
});

test('record validation preserves only valid case summaries', () => {
	const record = { ref: { problem: ref, id: '123', url: 'https://www.luogu.com.cn/record/123' }, phase: 'finished', rawStatus: 'WA', sourceVerification: 'not-checked', testCaseSummary: { passed: 3, total: 24 } };
	assert.deepStrictEqual(Reflect.get(validateRecord(record), 'testCaseSummary'), record.testCaseSummary);
	for (const summary of [{ passed: 25, total: 24 }, { passed: 0, total: 0 }, { passed: -1, total: 24 }, { passed: '3', total: 24 }]) {
		assert.throws(() => validateRecord({ ...record, testCaseSummary: summary }));
	}
});

test('record problem presentation metadata stays optional and uses existing validation', () => {
	const record = { ref: { problem: ref, id: '123', url: 'https://www.luogu.com.cn/record/123' }, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' };
	const metadata = { problemTitle: 'A+B', problemDifficulty: { label: 'Introductory', color: '#FE4C61' } };
	const result = validateRecord({ ...record, ...metadata });
	assert.strictEqual(Reflect.get(result, 'problemTitle'), metadata.problemTitle);
	assert.deepStrictEqual(Reflect.get(result, 'problemDifficulty'), metadata.problemDifficulty);
	assert.strictEqual(Reflect.get(validateRecord(record), 'problemTitle'), undefined);
	assert.strictEqual(Reflect.get(validateRecord(record), 'problemDifficulty'), undefined);
	for (const problemTitle of ['', 123, 'x'.repeat(2049)]) { assert.throws(() => validateRecord({ ...record, problemTitle })); }
	assert.throws(() => validateRecord({ ...record, problemDifficulty: { label: 'x', color: 'url(https://example.org/)' } }));
});

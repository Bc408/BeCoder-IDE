/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { validateProblem, validateRecord, validateProblemRef } from '../src/domain';
import { cphSamples } from '../src/cphHost';

const ref = { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
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

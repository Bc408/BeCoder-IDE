/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { validateProblem, validateRecord, validateProblemRef, validateOutcome, validateLanqiaoProgress } from '../src/domain';
import { cphSamples } from '../src/cphHost';
import { createBeaconPages } from '../src/beaconPages';

const ref = { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
test('receipt observations retain their real attempt and reject a different formal record', () => {
	const record = { problem: ref, id: '123', url: 'https://www.luogu.com.cn/record/123' };
	const observed = { attemptId: 'native-attempt', snapshot: { ref: record, phase: 'finished', rawStatus: 'AC', sourceVerification: 'not-checked' } };
	assert.deepStrictEqual(Reflect.get(validateOutcome({ kind: 'record', record, observed }), 'observed'), observed);
	assert.throws(() => validateOutcome({ kind: 'record', record, observed: { ...observed, snapshot: { ...observed.snapshot, ref: { ...record, id: '124', url: 'https://www.luogu.com.cn/record/124' } } } }), /receipt/);
});
test('Beacon reads the displayed locale, exact samples and the published record version', () => {
	const document = validateProblem({ ref, title: 'A+B', bodies: [
		{ locale: 'en', sections: [{ format: 'markdown', content: 'english' }] },
		{ locale: 'zh-CN', sections: [{ format: 'markdown', content: '中文题面' }] }
	], samples: [{ input: '  1\n\n', output: '  2\n' }], limits: [], interactive: false });
	const record = validateRecord({ ref: { problem: ref, id: '123', url: 'https://www.luogu.com.cn/record/123' }, phase: 'finished', rawStatus: 'WA', sourceVerification: 'matched', source: 'V1\r\n' });
	let open = true;
	let snapshot = record;
	const problemIdentity = {}, recordIdentity = {};
	const api = createBeaconPages({ beaconProblems: () => open ? [{ identity: problemIdentity, document, locale: 'zh-CN', sourceUri: undefined, active: true }] : [] }, { beaconRecords: () => [{ identity: recordIdentity, snapshot, sourceUri: undefined, active: false }] });
	const [problem, submission] = api.listBeaconPages();
	assert.strictEqual(Object.hasOwn(problem, 'contents'), false);
	const material = JSON.parse(api.readBeaconPage(problem.id, problem.version)!.contents);
	assert.strictEqual(material.body.locale, 'zh-CN');
	assert.deepStrictEqual(material.samples, document.samples);
	assert.match(submission.kind === 'oj-record' ? submission.sourceSha256! : '', /^[0-9a-f]{64}$/);
	snapshot = { ...record, rawStatus: 'AC', sourceVerification: 'not-checked' };
	assert.strictEqual(api.readBeaconPage(submission.id, submission.version), undefined);
	assert.strictEqual(api.listBeaconPages().find(page => page.kind === 'oj-record')?.sourceSha256, undefined);
	open = false;
	assert.strictEqual(api.readBeaconPage(problem.id, problem.version), undefined);
});
for (const kind of ['problem', 'record'] as const) {
	test('Beacon ' + kind + ' handles cannot revive after a panel closes and reopens', () => {
		const document = validateProblem({ ref, title: 'A+B', bodies: [], samples: [], limits: [], interactive: false });
		const snapshot = validateRecord({ ref: { problem: ref, id: '123', url: 'https://www.luogu.com.cn/record/123' }, phase: 'finished', rawStatus: 'WA', sourceVerification: 'matched', source: 'V1' });
		// Like a WebviewPanel, an instance keeps its identity until disposal; reopening creates another object.
		let identity: object | undefined = {};
		const api = createBeaconPages({
			beaconProblems: () => kind === 'problem' && identity ? [{ identity, document, locale: undefined, sourceUri: 'file:///C:/chosen/main.cpp', active: true }] : []
		}, {
			beaconRecords: () => kind === 'record' && identity ? [{ identity, snapshot, sourceUri: 'file:///C:/chosen/main.cpp', active: true }] : []
		});
		const old = api.listBeaconPages()[0];
		identity = undefined;
		assert.deepStrictEqual(api.listBeaconPages(), []);
		assert.strictEqual(api.readBeaconPage(old.id, old.version), undefined);
		identity = {};
		const reopened = api.listBeaconPages()[0];
		assert.strictEqual(reopened.version, old.version);
		assert.notStrictEqual(reopened.id, old.id);
		assert.strictEqual(api.readBeaconPage(old.id, old.version), undefined);
		assert.ok(api.readBeaconPage(reopened.id, reopened.version));
	});
}
test('Beacon keeps separate problem panels readable when both source bindings expire', () => {
	const document = validateProblem({ ref, title: 'A+B', bodies: [
		{ locale: 'en', sections: [{ format: 'markdown', content: 'english' }] },
		{ locale: 'zh-CN', sections: [{ format: 'markdown', content: '中文题面' }] }
	], samples: [], limits: [], interactive: false });
	const identities = [{}, {}];
	let bindings: (string | undefined)[] = ['file:///C:/chosen/a.cpp', 'file:///C:/chosen/b.cpp'];
	const api = createBeaconPages({
		beaconProblems: () => identities.map((identity, index) => ({ identity, document, locale: index ? 'zh-CN' : 'en', sourceUri: bindings[index], active: index === 1 }))
	}, { beaconRecords: () => [] });
	const before = api.listBeaconPages();
	bindings = [undefined, undefined];
	const current = api.listBeaconPages();
	assert.notStrictEqual(current[0].id, current[1].id);
	assert.deepStrictEqual(current.map(page => page.id), before.map(page => page.id));
	assert.strictEqual(JSON.parse(api.readBeaconPage(current[0].id, current[0].version)!.contents).body.locale, 'en');
	assert.strictEqual(JSON.parse(api.readBeaconPage(current[1].id, current[1].version)!.contents).body.locale, 'zh-CN');
});
test('Beacon locale switches change content versions while preserving the panel handle', () => {
	const document = validateProblem({ ref, title: 'A+B', bodies: [
		{ locale: 'en', sections: [{ format: 'markdown', content: 'english' }] },
		{ locale: 'zh-CN', sections: [{ format: 'markdown', content: '中文题面' }] }
	], samples: [], limits: [], interactive: false });
	const identity = {};
	let locale = 'en';
	const api = createBeaconPages({ beaconProblems: () => [{ identity, document, locale, sourceUri: undefined, active: true }] }, { beaconRecords: () => [] });
	const original = api.listBeaconPages()[0];
	locale = 'zh-CN';
	const translated = api.listBeaconPages()[0];
	assert.strictEqual(translated.id, original.id);
	assert.notStrictEqual(translated.version, original.version);
	assert.strictEqual(api.readBeaconPage(original.id, original.version), undefined);
	assert.strictEqual(JSON.parse(api.readBeaconPage(translated.id, translated.version)!.contents).body.locale, 'zh-CN');
	locale = 'en';
	assert.ok(api.readBeaconPage(original.id, original.version));
});
test('Lanqiao progress accepts only bounded local milestones and projected cells', () => {
	assert.strictEqual(validateLanqiaoProgress(undefined), undefined);
	assert.deepStrictEqual(validateLanqiaoProgress({ phase: 'judging', source: 'private', record: 'not-verified' }), { phase: 'judging' });
	const groups = [{ name: 'Test Cases', rows: [['1', 'AC', '0 ms', '0 kb']] }];
	assert.deepStrictEqual(validateLanqiaoProgress({ phase: 'confirming', groups }), { phase: 'confirming', groups });
	assert.throws(() => validateLanqiaoProgress({ phase: 'AC' }));
	assert.throws(() => validateLanqiaoProgress({ phase: 'judging', groups: [{ name: 'Test Cases', rows: [['1', 'AC', '', '', 'hidden output']] }] }));
	assert.throws(() => validateLanqiaoProgress({ phase: 'judging', groups: [{ name: 'Test Cases', rows: [['0', 'AC', '', '']] }] }));
});
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

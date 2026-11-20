/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import { browserProblem } from '../src/browserProblem';
import { resolveProblem } from '../src/problemResolver';
import { defaultDirectories, readDirectories } from '../src/settings';
import { lanqiaoProblem } from '../src/adapters/lanqiao/task';
import { validateLanguageCatalogue, validateProblem, validateRecordRef } from '../src/domain';

const problem = { site: 'lanqiao' as const, nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' };
test('Lanqiao directory or explicit URL identifies the public task without claiming numeric filenames elsewhere', () => {
	const adapters = [{ site: 'lanqiao' as const, resolve: lanqiaoProblem }];
	for (const input of ['254', '254.cpp', '254.c', problem.url, problem.url + '?page=1&first_category_id=1&second_category_id=2']) { assert.deepStrictEqual(lanqiaoProblem(input), problem); }
	assert.deepStrictEqual(browserProblem(problem.url), problem);
	assert.deepStrictEqual(resolveProblem('C:/cpp/lanqiao/254.cpp', defaultDirectories, adapters), { kind: 'problem', problem });
	assert.deepStrictEqual(resolveProblem('C:/cpp/254.cpp', defaultDirectories, adapters), { kind: 'inputRequired' });
	assert.deepStrictEqual(resolveProblem('C:/cpp/蓝桥/254.cpp', readDirectories({ lanqiao: '蓝桥' }), adapters), { kind: 'problem', problem });
	for (const input of ['0', '0254', '-1', '254.txt', problem.url + '?contest_id=1', problem.url + '?unknown=1', problem.url + '?page=1&page=2', problem.url + '?page=-1', problem.url + '#answer', problem.url.replace('www.', ''), problem.url.replace('.cn/', '.cn:443/'), problem.url.replace('https://', 'http://'), problem.url.replace('https://', 'https://user@'), problem.url.replace('/254/', '/%32%35%34/'), problem.url.replace('/254/', '/253/../254/'), '\n' + problem.url]) { assert.strictEqual(lanqiaoProblem(input), undefined, input); }
});

test('Lanqiao tokens and record IDs stay site-specific across catalogue and embedded problem validation', () => {
	const languages = [{ id: 'cpp', label: 'C++（g++17）', family: 'cpp' }, { id: 'c', label: 'C（gcc8.3.0）', family: 'c' }];
	const catalogue = (site: string, items = languages) => Reflect.apply(validateLanguageCatalogue, undefined, [{ languages: items }, site]);
	assert.deepStrictEqual(catalogue('lanqiao').languages, languages);
	assert.throws(() => catalogue('lanqiao', [{ id: 'cpp', label: 'C++', family: 'c' }]));
	assert.throws(() => catalogue('lanqiao', [{ id: '1', label: 'C++', family: 'cpp' }]));
	for (const site of ['luogu', 'atcoder', 'nowcoder', 'codeforces']) { assert.throws(() => catalogue(site)); }
	assert.deepStrictEqual(validateProblem({ ref: problem, title: 'A+B', bodies: [], samples: [], limits: [], interactive: false, languages }).languages, languages);
	assert.throws(() => validateProblem({ ref: problem, title: 'A+B', bodies: [], samples: [], limits: [], interactive: false, languages: [{ id: 'cpp', label: 'C', family: 'c' }] }));
	const id = '6aff1ff717e87398a15a4abf', record = { problem, id, url: 'https://www.lanqiao.cn/problems/254/submissions/' + id + '/' };
	assert.deepStrictEqual(validateRecordRef(record), record);
	assert.throws(() => validateRecordRef({ ...record, id: '123' }));
	assert.throws(() => validateRecordRef({ ...record, url: record.url.replace('/254/', '/255/') }));
	assert.throws(() => validateRecordRef({ ...record, problem: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, url: 'https://www.luogu.com.cn/record/' + id }));
});

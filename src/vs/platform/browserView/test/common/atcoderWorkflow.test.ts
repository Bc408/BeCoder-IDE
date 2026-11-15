/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { atCoderTask, atCoderFormScript } from '../../common/atcoderWorkflow.js';

// This suite contains pure route/script factories, with no tracked disposable objects.
// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('AtCoder basic workflow', () => {
	test('retains contest and task identity', () => {
		assert.deepStrictEqual(atCoderTask('https://atcoder.jp/contests/abc086/tasks/abc086_a?lang=en'), { contestId: 'abc086', taskId: 'abc086_a' });
	});
	test('rejects foreign, credentialed and unrelated routes', () => {
		for (const value of ['https://atcoder.jp.evil.test/contests/abc086/tasks/abc086_a', 'http://atcoder.jp/contests/abc086/tasks/abc086_a', 'https://user@atcoder.jp/contests/abc086/tasks/abc086_a', 'https://atcoder.jp/contests/abc086/submissions/1', 'garbage']) {
			assert.strictEqual(atCoderTask(value), undefined);
		}
	});
	test('rejects empty, oversized or invalid source payloads before creating a script', () => {
		for (const source of ['', 'x'.repeat(1024 * 1024 + 1)]) {
			assert.throws(() => atCoderFormScript('https://atcoder.jp/contests/abc086/tasks/abc086_a', { source, fileName: 'a.cpp', languageId: '6017', replaceDraft: false }), /source/);
		}
	});
});

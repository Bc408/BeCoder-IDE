/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { parseAtCoderRecords, newAtCoderCandidates, atCoderHistoryOwner } from '../../common/atcoderShortcut.js';

// Pure parsing/filtering tests with no tracked disposables.
// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('AtCoder shortcut', () => {
	test('parses real-shaped own-record links and preserves identities', () => {
		const html = '<table><tr><th>Submission Time</th><th>Code Size</th></tr><tr><td><a href="/contests/abc086/tasks/abc086_a">A</a></td><td><a href="/users/test-user">user</a></td><td><a href="/contests/abc086/submissions/me?f.Language=6017">C++</a></td><td><a href="/contests/abc086/submissions/80776365">Detail</a></td></tr></table>';
		assert.deepStrictEqual(parseAtCoderRecords(html, 'abc086'), [{ id: '80776365', taskId: 'abc086_a', owner: 'test-user', languageId: '6017' }]);
	});
	test('a login/challenge template is not an empty baseline', () => {
		assert.throws(() => parseAtCoderRecords('<table>Checking your browser</table>', 'abc086'), /unavailable/);
		assert.throws(() => parseAtCoderRecords('<form action="/login"><table>Submission Time Code Size</table></form>', 'abc086'), /unavailable/);
	});
	test('an empty first-submission history still requires the signed-in owner', () => {
		assert.strictEqual(atCoderHistoryOwner('<script>var userScreenName = "new_user";</script>', []), 'new_user');
		assert.throws(() => atCoderHistoryOwner('<script>var userScreenName = "";</script>', []), /account/);
		assert.throws(() => atCoderHistoryOwner('', []), /account/);
		assert.throws(() => atCoderHistoryOwner('<script>var userScreenName = "other_user";</script>', [{ id: '1', taskId: 'abc086_a', owner: 'me', languageId: '6017' }]), /account/);
	});
	test('excludes old, other-task, other-account and other-language records', () => {
		const record = { id: '11', taskId: 'abc086_a', owner: 'me', languageId: '6017' };
		const rows = [{ ...record, id: '10' }, { ...record, id: '12', taskId: 'abc086_b' }, { ...record, id: '13', owner: 'other' }, { ...record, id: '14', languageId: '1' }, record];
		assert.deepStrictEqual(newAtCoderCandidates(rows, '10', 'abc086_a', '6017', 'me'), [record]);
	});
});

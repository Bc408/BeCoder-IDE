/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test } from 'node:test';
import { checkNoNewJavaScriptFiles, hasAcceptedCopyrightHeader } from '../../hygiene.ts';

test('shared MIT source retains its own copyright and requires the complete license header', () => {
	const header = [
		'/*---------------------------------------------------------------------------------------------',
		' *  Copyright (c) 2026 BeCoder contributors.',
		' *  Licensed under the MIT License. See LICENSE in the component root for license information.',
		' *--------------------------------------------------------------------------------------------*/'
	];
	assert.strictEqual(hasAcceptedCopyrightHeader(header), true);
	assert.strictEqual(hasAcceptedCopyrightHeader(header.slice(0, -1)), false);
	assert.strictEqual(hasAcceptedCopyrightHeader(header.map(line => line.replace('MIT License', 'Unspecified License'))), false);
});

test('commit JavaScript gate rejects additions without misclassifying baseline files', t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'becoder-hygiene-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const git = (...args: string[]) => cp.execFileSync('git', args, { cwd: root, stdio: 'pipe' });
	git('init');
	fs.writeFileSync(path.join(root, '.eslint-allowed-javascript-files'), 'allowed.js\n');
	fs.writeFileSync(path.join(root, 'legacy.js'), 'baseline');
	git('add', '.');
	git('-c', 'core.hooksPath=nonexistent', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'baseline');
	fs.writeFileSync(path.join(root, 'legacy.js'), 'modified');
	git('add', 'legacy.js');
	assert.strictEqual(checkNoNewJavaScriptFiles(root, true), undefined);
	assert.match(checkNoNewJavaScriptFiles(root)!, /legacy\.js/);
	fs.writeFileSync(path.join(root, 'new.cjs'), 'new');
	git('add', 'new.cjs');
	assert.match(checkNoNewJavaScriptFiles(root, true)!, /new\.cjs/);
	fs.writeFileSync(path.join(root, '.eslint-allowed-javascript-files'), 'allowed.js\nnew.cjs\n');
	assert.strictEqual(checkNoNewJavaScriptFiles(root, true), undefined);
});

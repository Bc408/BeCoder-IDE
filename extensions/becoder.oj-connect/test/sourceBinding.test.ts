/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { test } from 'node:test';
import { SourceBinding } from '../src/sourceBinding';
test('a problem panel source cannot silently become a replacement at the same path', t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-bound-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const file = path.join(root, 'a.cpp'); fs.writeFileSync(file, 'original');
	const document = { uri: { fsPath: file, toString: () => pathToFileURL(file).href }, isClosed: false };
	const binding = new SourceBinding(document);
	assert.strictEqual(binding.source, document); binding.assertCurrent();
	fs.renameSync(file, path.join(root, 'renamed.cpp')); fs.writeFileSync(file, 'replacement');
	assert.throws(() => binding.assertCurrent(), /source/i);
	const fresh = new SourceBinding(document); fresh.invalidate(); assert.throws(() => fresh.assertCurrent(), /source/i);
	const closed = new SourceBinding(document); document.isClosed = true; assert.throws(() => closed.assertCurrent(), /source/i);
});

test('source identity retains adjacent Windows file IDs above Number precision', t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-bound-exact-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const file = path.join(root, 'a.cpp'); fs.writeFileSync(file, 'original');
	const document = { uri: { fsPath: file, toString: () => pathToFileURL(file).href }, isClosed: false };
	const statSync = fs.statSync;
	let identity = 9007199254740992n;
	const mocked = t.mock.method(require('fs'), 'statSync', (input: fs.PathLike, options?: { bigint?: boolean }) => {
		const stat = options?.bigint ? statSync(input, { bigint: true }) : statSync(input);
		return Object.assign(stat, { ino: options?.bigint ? identity : Number(identity) });
	});
	t.after(() => mocked.mock.restore());
	const binding = new SourceBinding(document); binding.assertCurrent();
	identity++;
	assert.throws(() => binding.assertCurrent(), /source/i, 'distinct integer IDs must not collapse into one rounded Number');
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { SourceStore } from '../src/sourceStore';

test('source import exclusively creates a site child and preserves an existing solution', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-source-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const store = new SourceStore(), signal = new AbortController().signal;
	const first = await store.openOrCreate(root, 'luogu', 'P1001.cpp', signal);
	assert.strictEqual(first.created, true); assert.strictEqual(first.sourcePath, path.join(root, 'luogu', 'P1001.cpp'));
	fs.writeFileSync(first.sourcePath, 'user code\r\n');
	assert.strictEqual((await store.openOrCreate(root, 'luogu', 'P1001.cpp', signal)).created, false);
	assert.strictEqual(fs.readFileSync(first.sourcePath, 'utf8'), 'user code\r\n');
	await assert.rejects(store.openOrCreate(root, '../escape', 'x.cpp', signal));
	fs.linkSync(first.sourcePath, path.join(root, 'alias.cpp'));
	await assert.rejects(store.openOrCreate(root, 'luogu', 'P1001.cpp', signal));
});
test('a racing target is kept and a replaced site directory is rejected without cleanup', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-source-race-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const file = path.join(root, 'atcoder', 'abc086_a.cpp');
	const store = new SourceStore(() => fs.writeFileSync(file, 'racing user file'));
	assert.strictEqual((await store.openOrCreate(root, 'atcoder', 'abc086_a.cpp', new AbortController().signal)).created, false);
	assert.strictEqual(fs.readFileSync(file, 'utf8'), 'racing user file');
	const second = new SourceStore(() => { fs.renameSync(path.join(root, 'atcoder'), path.join(root, 'old')); fs.mkdirSync(path.join(root, 'atcoder')); });
	await assert.rejects(second.openOrCreate(root, 'atcoder', 'abc086_b.cpp', new AbortController().signal));
	assert.deepStrictEqual(fs.readdirSync(path.join(root, 'atcoder')), []);
});

test('import rejects directory identity changes above Number precision before creating source', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-source-exact-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const target = path.join(root, 'luogu'), lstatSync = fs.lstatSync;
	let identity = 9007199254740992n;
	const mocked = t.mock.method(require('fs'), 'lstatSync', (input: fs.PathLike, options?: { bigint?: boolean }) => {
		const stat = options?.bigint ? lstatSync(input, { bigint: true }) : lstatSync(input);
		return input === target ? Object.assign(stat, { ino: options?.bigint ? identity : Number(identity) }) : stat;
	});
	t.after(() => mocked.mock.restore());
	const store = new SourceStore(() => { identity++; });
	await assert.rejects(store.openOrCreate(root, 'luogu', 'P1001.cpp', new AbortController().signal), /directory changed/i);
	assert.deepStrictEqual(fs.readdirSync(target), [], 'a rejected identity never creates a source file');
});

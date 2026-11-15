/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { test } from 'node:test';
import { ImportController, type ImportHost } from '../src/importController';
import { defaultDirectories } from '../src/settings';
import type { OjAdapter } from '../src/adapters/adapter';
test('browser import opens the same solution without CPH and supports every valid custom directory', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-import-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const opened: string[] = [], host: ImportHost = { folders: () => [root], directories: () => ({ ...defaultDirectories, luogu: '_atcoder' }), selectFolder: async () => undefined, open: async source => { opened.push(source); } };
	const importer = new ImportController([{ site: 'luogu', fileName: () => 'P1001.cpp' }] as unknown as OjAdapter[], host);
	const document = { ref: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, title: 'A+B', bodies: [{ locale: 'zh-CN', sections: [] }], samples: [], limits: [], interactive: false };
	const first = await importer.import(document); assert.ok(first);
	fs.writeFileSync(fileURLToPath(first.sourceUri), 'draft stays');
	assert.deepStrictEqual(await importer.import(document), first);
	assert.strictEqual(fs.readFileSync(fileURLToPath(first.sourceUri), 'utf8'), 'draft stays');
	assert.deepStrictEqual(opened, [first.sourceUri, first.sourceUri]); assert.deepStrictEqual(fs.readdirSync(root), ['_atcoder']);
});

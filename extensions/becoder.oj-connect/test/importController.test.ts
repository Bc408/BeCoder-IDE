/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { test } from 'node:test';
import { ImportController, browserImportTarget, type ImportHost } from '../src/importController';
import { LuoguAdapter } from '../src/adapters/luogu/adapter';
import { AtCoderAdapter } from '../src/adapters/atcoder/adapter';
import { NowcoderAdapter } from '../src/adapters/nowcoder/adapter';
import { defaultDirectories } from '../src/settings';
import type { OjAdapter } from '../src/adapters/adapter';
test('browser targets use actual adapters and settings without accepting unsupported same-site entries', () => {
	const adapters = [new LuoguAdapter({} as ConstructorParameters<typeof LuoguAdapter>[0]), new AtCoderAdapter({} as ConstructorParameters<typeof AtCoderAdapter>[0]), new NowcoderAdapter({} as ConstructorParameters<typeof NowcoderAdapter>[0])];
	for (const [url, expected] of [
		['https://www.luogu.com.cn/problem/P1001', { directory: 'practice', fileName: 'P1001.cpp' }],
		['https://atcoder.jp/contests/abc086/tasks/abc086_a?lang=en', { directory: 'atcoder', fileName: 'abc086_a.cpp' }],
		['https://ac.nowcoder.com/acm/problem/18204', { directory: 'nowcoder', fileName: '18204.cpp' }],
		['https://ac.nowcoder.com/acm/contest/5657/A', { directory: 'nowcoder', fileName: '5657_A.cpp' }],
		['https://ac.nowcoder.com/pat/1/problem/2', undefined],
		['https://codeforces.com/problemset/problem/1/A', undefined],
		['P1001.cpp', undefined]
	] as const) { assert.deepStrictEqual(browserImportTarget(url, () => ({ ...defaultDirectories, luogu: 'practice' }), adapters), expected); }
	assert.strictEqual(browserImportTarget('https://codeforces.com/problemset/problem/1/A', () => assert.fail('unsupported page must ignore OJ settings'), adapters), undefined);
});
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

test('cancellation delivered before extension activation cannot publish an old page', async () => {
	const importer = new ImportController([], { folders: () => assert.fail(), directories: () => assert.fail(), selectFolder: async () => assert.fail(), open: async () => assert.fail() });
	importer.cancel('pending-activation');
	await assert.rejects(importer.import({}, 'pending-activation'), { name: 'AbortError' });
});

test('successful import publishes the original acquisition and full statement without failing the user import', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-acquisition-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const acquisition = { scope: undefined, trigger: 'get-problem' };
	const document = { ref: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, title: 'A+B', bodies: [{ locale: 'zh-CN', sections: [{ format: 'markdown', content: 'Actual full statement' }] }], samples: [], limits: [], interactive: false };
	const published: unknown[][] = [];
	const host = { folders: () => [root], directories: () => defaultDirectories, selectFolder: async () => undefined, open: async () => { }, acquired: async (...args: unknown[]) => { published.push(args); throw new Error('storage-unavailable'); } };
	const importer = new ImportController([{ site: 'luogu', fileName: () => 'P1001.cpp' }] as unknown as OjAdapter[], host);
	const result = await Reflect.apply(importer.import, importer, [document, 'request-one', acquisition]);
	assert.ok(result?.sourceUri);
	assert.equal(published.length, 1);
	assert.deepStrictEqual(published[0].slice(0, 2), [document, result.sourceUri]);
	assert.equal(published[0][2], acquisition, 'explicit absence of scope must survive asynchronous import');
});

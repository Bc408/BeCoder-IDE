/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from '../../../../base/common/path.js';
// eslint-disable-next-line local/code-import-patterns -- Internal statement transport types.
import type { ProblemDocument } from 'becoder-oj-connect';

const document = (id: number, text = 'Original', locale = 'en'): ProblemDocument => ({
	ref: { site: 'luogu', nativeId: 'P' + id, url: 'https://www.luogu.com.cn/problem/P' + id },
	title: 'Task ' + id, bodies: [{ locale, sections: [{ format: 'markdown', content: text }] }],
	samples: [{ input: ' 1\r\n', output: '2\n' }], limits: [], interactive: false
});

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test -- Stores own no persistent handles.
suite('Application problem statement cache', () => {
	async function fixture(run: (module: typeof import('../../node/ojStatementCache.js'), root: string) => Promise<void>) {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'becoder-statements-'));
		try {
			const modulePath = '../../node/ojStatementCache.js';
			let module;
			try { module = await import(modulePath); } catch { assert.fail('Application statement cache implementation is unavailable'); }
			await run(module, root);
		} finally { await fs.rm(root, { recursive: true, force: true }); }
	}

	test('thirty unique problems merge languages and evict oldest', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const store = new OjStatementCacheStore(root);
		for (let id = 1000; id < 1030; id++) { await store.publishAcquired(document(id)); }
		await store.publishAcquired({ ...document(1001), bodies: [...document(1001).bodies, ...document(1001, 'Chinese', 'zh-CN').bodies] });
		await store.publishAcquired(document(1030));
		assert.strictEqual(await store.read(document(1000).ref, 'en'), undefined);
		assert.strictEqual((await store.read(document(1001).ref, 'zh-CN'))?.version.sections[0].content, 'Chinese');
		const saved = JSON.parse(await fs.readFile(store.filePath, 'utf8'));
		assert.strictEqual(saved.entries.length, 30);
		assert.strictEqual(saved.entries.at(-2).document.ref.nativeId, 'P1001');
		assert.ok(!/filePath|viewedAt|apiKey/.test(JSON.stringify(saved)));
	}));

	test('read does not move or write and reopening shares cache', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const store = new OjStatementCacheStore(root);
		await store.publishAcquired(document(1000));
		const before = await fs.readFile(store.filePath);
		assert.strictEqual((await new OjStatementCacheStore(root).read(document(1000).ref, 'en'))?.version.title, 'Task 1000');
		assert.deepStrictEqual(await fs.readFile(store.filePath), before);
	}));

	test('merge compares canonical sources in one read without writing', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const store = new OjStatementCacheStore(root), input = document(1000);
		await store.publishAcquired(input);
		const source = (await store.read(input.ref, 'en'))!;
		await store.publishTranslation(source, { ...source.version, language: 'zh-CN', origin: 'translation' });
		const before = await fs.readFile(store.filePath);
		const merged = await store.merge(input);
		assert.deepStrictEqual(merged.bodies.map(body => body.locale), ['en', 'zh-CN']);
		assert.deepStrictEqual((await store.merge(document(1000, 'New source'))).bodies.map(body => body.locale), ['en']);
		assert.deepStrictEqual(await fs.readFile(store.filePath), before);
	}));

	test('Lanqiao uses the existing learning URL identity', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const store = new OjStatementCacheStore(root);
		const source = { ...document(1000), ref: { site: 'lanqiao' as const, nativeId: '1234', url: 'https://www.lanqiao.cn/problems/1234/learning/' } };
		await store.publishAcquired(source);
		assert.ok(await store.read(source.ref, 'en'));
	}));
	test('Codeforces retains multi-character canonical task indices', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const store = new OjStatementCacheStore(root);
		const source = { ...document(1000), ref: { site: 'codeforces' as const, nativeId: '2000/AA1', url: 'https://codeforces.com/contest/2000/problem/AA1' } };
		await store.publishAcquired(source); assert.ok(await store.read(source.ref, 'en'));
	}));

	test('unchanged source keeps translation changed source invalidates', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const store = new OjStatementCacheStore(root), source = document(1000);
		await store.publishAcquired(source);
		const read = (await store.read(source.ref, 'en'))!;
		await store.publishTranslation(read, { ...read.version, language: 'zh-CN', origin: 'translation', title: 'Translated' });
		await store.publishAcquired(source);
		assert.strictEqual((await store.read(source.ref, 'zh-CN'))?.version.origin, 'translation');
		await store.publishAcquired(document(1000, 'Updated'));
		assert.strictEqual(await store.read(source.ref, 'zh-CN'), undefined);
	}));

	test('site version replaces translation', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const store = new OjStatementCacheStore(root), source = document(1000);
		await store.publishAcquired(source);
		const read = (await store.read(source.ref, 'en'))!;
		await store.publishTranslation(read, { ...read.version, language: 'zh-CN', origin: 'translation' });
		await store.publishAcquired({ ...source, bodies: [...source.bodies, ...document(1000, 'Site Chinese', 'zh-CN').bodies] });
		assert.strictEqual((await store.read(source.ref, 'zh-CN'))?.version.origin, 'site');
	}));

	test('serialized updates preserve both acquired problems', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const store = new OjStatementCacheStore(root);
		await Promise.all([store.publishAcquired(document(1000)), store.publishAcquired(document(1001))]);
		assert.ok(await store.read(document(1000).ref, 'en'));
		assert.ok(await store.read(document(1001).ref, 'en'));
	}));

	test('publication failure preserves old file and corrupt cache is not a miss', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const store = new OjStatementCacheStore(root);
		await store.publishAcquired(document(1000));
		const before = await fs.readFile(store.filePath);
		const failing = new OjStatementCacheStore(root, { rename: async () => { throw new Error('fixture-publication'); } });
		await assert.rejects(failing.publishAcquired(document(1001)), /fixture-publication/);
		assert.deepStrictEqual(await fs.readFile(store.filePath), before);
		await fs.writeFile(store.filePath, '{bad');
		await assert.rejects(store.read(document(1000).ref, 'en'), /statement-cache-unreadable/);
		await assert.rejects(store.publishAcquired(document(1001)), /statement-cache-unreadable/);
		assert.strictEqual(await fs.readFile(store.filePath, 'utf8'), '{bad');
	}));

	test('duplicate translation rejects without waiting and release allows a new task', () => fixture(async ({ OjStatementCacheStore, OjStatementCacheOwner }, root) => {
		assert.ok(OjStatementCacheOwner, 'The application must own translation tickets');
		const owner = new OjStatementCacheOwner(new OjStatementCacheStore(root));
		await owner.publishAcquired(document(1000));
		const source = (await owner.read(document(1000).ref, 'en'))!;
		const ticket = await owner.acquireTranslation(1, source, 'zh-CN');
		await assert.rejects(owner.acquireTranslation(2, source, 'zh-CN'), /statement-translation-busy/);
		await assert.rejects(owner.publishTranslation(2, ticket.id, { ...source.version, language: 'zh-CN', origin: 'translation' }), /statement-translation-owner/);
		owner.releaseTranslation(1, ticket.id);
		assert.notStrictEqual((await owner.acquireTranslation(2, source, 'zh-CN')).id, ticket.id);
	}));

	test('redirected application directory is rejected without touching its target', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'foreign-statements-'));
		try {
			const store = new OjStatementCacheStore(root), sentinel = path.join(outside, 'sentinel.txt');
			await fs.writeFile(sentinel, 'foreign');
			await fs.symlink(outside, store.directory, process.platform === 'win32' ? 'junction' : 'dir');
			await assert.rejects(store.publishAcquired(document(1000)), /statement-cache-invalid-path/);
			await assert.rejects(store.read(document(1000).ref, 'en'), /statement-cache-invalid-path/);
			assert.strictEqual(await fs.readFile(sentinel, 'utf8'), 'foreign');
			assert.deepStrictEqual(await fs.readdir(outside), ['sentinel.txt']);
		} finally { await fs.rm(outside, { recursive: true, force: true }); }
	}));

	test('uncertain publication never removes a replacement at the destination', () => fixture(async ({ OjStatementCacheStore }, root) => {
		const store = new OjStatementCacheStore(root); await store.publishAcquired(document(1000));
		const competing = new OjStatementCacheStore(root, {
			rename: async (from, to) => {
				await fs.rename(from, to);
				await fs.rename(to, path.join(root, 'published.json'));
				await fs.writeFile(to, 'foreign replacement');
			}
		});
		await assert.rejects(competing.publishAcquired(document(1001)), /statement-cache-publication-uncertain/);
		assert.strictEqual(await fs.readFile(store.filePath, 'utf8'), 'foreign replacement');
	}));

	test('new source then eviction never revives an old ticket', () => fixture(async ({ OjStatementCacheStore, OjStatementCacheOwner }, root) => {
		assert.ok(OjStatementCacheOwner, 'The application must invalidate stale tickets');
		const owner = new OjStatementCacheOwner(new OjStatementCacheStore(root));
		await owner.publishAcquired(document(1000));
		const source = (await owner.read(document(1000).ref, 'en'))!;
		const ticket = await owner.acquireTranslation(1, source, 'zh-CN');
		await owner.publishAcquired(document(1000, 'New source'));
		for (let id = 1001; id <= 1030; id++) { await owner.publishAcquired(document(id)); }
		await assert.rejects(owner.publishTranslation(1, ticket.id, { ...source.version, language: 'zh-CN', origin: 'translation' }), /statement-translation-owner/);
	}));

	test('evicted source can be republished by current ticket but window retirement rejects late results', () => fixture(async ({ OjStatementCacheStore, OjStatementCacheOwner }, root) => {
		assert.ok(OjStatementCacheOwner, 'The application must retire window tasks');
		const owner = new OjStatementCacheOwner(new OjStatementCacheStore(root));
		await owner.publishAcquired(document(1000));
		const source = (await owner.read(document(1000).ref, 'en'))!;
		const ticket = await owner.acquireTranslation(1, source, 'zh-CN');
		for (let id = 1001; id <= 1030; id++) { await owner.publishAcquired(document(id)); }
		await owner.publishTranslation(1, ticket.id, { ...source.version, language: 'zh-CN', origin: 'translation' });
		assert.ok(await owner.read(source.ref, 'zh-CN'));
		const second = await owner.acquireTranslation(2, source, 'zh-CN');
		owner.resetWindow(2);
		await assert.rejects(owner.publishTranslation(2, second.id, { ...source.version, language: 'zh-CN', origin: 'translation' }), /statement-translation-owner/);
	}));
});

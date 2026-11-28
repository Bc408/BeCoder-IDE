/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import type { StatementRead, StatementVersion } from 'becoder-oj-connect';

test('cancelled translation releases its ticket and never publishes a late model result', async () => {
	const modulePath = '../src/statementCache'; let module;
	try { module = await import(modulePath); } catch { assert.fail('Statement cache client is missing'); }
	const source: StatementRead = { ref: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, version: { title: 'Task', language: 'en', origin: 'site', sections: [{ format: 'markdown', content: 'Original' }] }, samples: [], limits: [], interactive: false };
	const calls: string[] = []; let finish!: (value: StatementVersion) => void;
	const client = new module.StatementCacheClient(async (operation: string) => { calls.push(operation); return operation === 'acquireTranslation' ? { id: 'ticket', source, targetLanguage: 'zh-CN' } : undefined; }, async () => new Promise<StatementVersion>(resolve => { finish = resolve; }));
	const controller = new AbortController(); const pending = client.translate(source, 'zh-CN', controller.signal, () => {});
	await new Promise(resolve => setImmediate(resolve)); controller.abort(); finish({ ...source.version, language: 'zh-CN', origin: 'translation' });
	await assert.rejects(pending); assert.ok(calls.includes('releaseTranslation')); assert.ok(!calls.includes('publishTranslation'));
});

test('a panel merge delegates source matching to one native cache snapshot', async () => {
	const { StatementCacheClient } = await import('../src/statementCache');
	const ref = { site: 'luogu' as const, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
	const facts = { ref, samples: [], limits: [], interactive: false };
	const calls: string[] = [];
	const client = new StatementCacheClient(async (operation, input) => { calls.push(operation); return (input as { document: unknown }).document; }, async () => { throw new Error('unused'); });
	const result = await client.merge({ ...facts, title: 'New title', bodies: [{ locale: 'en', sections: [{ format: 'markdown', content: 'New source' }] }] });
	assert.deepStrictEqual(result.bodies.map(body => body.locale), ['en']);
	assert.deepStrictEqual(calls, ['merge']);
});

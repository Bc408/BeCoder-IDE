/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import type { StatementContent } from 'becoder-oj-connect';

test('statement languages are explicit, retain titles and never fall back to a different body', async () => {
	const modulePath = '../src/statementLanguages';
	let module;
	try { module = await import(modulePath); } catch { assert.fail('Statement language selection is not implemented'); }
	const source: StatementContent = { ref: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' }, title: 'Original', bodies: [{ locale: 'en', sections: [{ format: 'markdown', content: 'English' }] }, { locale: 'zh-CN', title: 'Translated title', origin: 'translation', sections: [{ format: 'markdown', content: 'Chinese' }] }, { locale: 'ja', sections: [] }], samples: [], limits: [], interactive: false };
	assert.deepStrictEqual(module.statementLanguages(source), ['zh-CN', 'en']);
	assert.strictEqual(module.selectStatement(source, 'zh-CN').version.title, 'Translated title');
	assert.strictEqual(module.selectStatement({ ...source, bodies: source.bodies.slice(0, 1) }, 'zh-CN'), undefined);
});

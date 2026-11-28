/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StatementRead } from 'becoder-oj-connect';
import * as translation from '../src/translationContent';

const source = (content: string, format: 'html' | 'markdown' = 'markdown'): StatementRead => ({
	ref: { site: 'luogu', nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' },
	version: { language: 'en', title: 'Add 2 integers', origin: 'site', sections: [{ format, heading: 'Problem Statement', content }] },
	samples: [{ input: ' 1  2\r\n', output: '3\n' }], limits: [{ label: 'Time Limit', value: '1s' }], interactive: false
});
const connection = { provider: 'deepseek' as const, baseURL: 'https://api.deepseek.com', model: 'fixture', parameters: {}, capabilities: { purpose: 'chat' as const, tools: false, vision: false, reasoning: false, source: 'manual' as const, contextWindow: 32768, maxInputTokens: 24576, maxOutputTokens: 8192 } };
test('code math numbers links and trailing text remain complete after translation', () => {
	assert.equal(typeof translation.prepareStatementTranslation, 'function');
	const input = source('Given $1 \\le n \\le 10^5$, read `n`.\n\n```cpp\nauto s="```";\n```\n\nPrint the answer. [Guide](https://example.org/1).');
	const prepared = translation.prepareStatementTranslation(input, 'zh-CN');
	const batches = translation.translationBatches(prepared, connection);
	const result = translation.applyStatementTranslation(prepared, batches.map(batch => ({ id: batch.id, parts: batch.parts.map(part => ({ ...part, text: part.text.replace('Given', '给定').replace('Print the answer', '输出答案').replace('Guide', '指南') })) })));
	assert.ok(result.sections[0].content.includes('$1 \\le n \\le 10^5$'));
	assert.ok(result.sections[0].content.includes('```cpp\nauto s="```";\n```'));
	assert.ok(result.sections[0].content.includes('输出答案'));
	assert.ok(result.sections[0].content.includes('https://example.org/1'));
	assert.equal(result.language, 'zh-CN'); assert.equal(result.origin, 'translation');
	assert.deepEqual(input.samples, [{ input: ' 1  2\r\n', output: '3\n' }]);
});
test('HTML markup attributes entities code and math are protected', () => {
	const input = source('<p>Given <var>n &lt; 10</var>, print <strong>the answer</strong> &amp; 42.</p><pre> a\r\n</pre>', 'html');
	const prepared = translation.prepareStatementTranslation(input, 'zh-CN');
	const batches = translation.translationBatches(prepared, connection);
	const result = translation.applyStatementTranslation(prepared, batches.map(batch => ({ id: batch.id, parts: batch.parts.map(part => ({ ...part, text: part.text.replace('Given', '给定').replace('the answer', '<script>evil()</script>') })) })));
	assert.ok(result.sections[0].content.includes('<var>n &lt; 10</var>'));
	assert.ok(result.sections[0].content.includes('<pre> a\r\n</pre>'));
	assert.ok(!result.sections[0].content.includes('<script>'));
	assert.ok(result.sections[0].content.includes('&amp;'));
});
test('missing duplicate and extra IDs or mutated protection fail without a version', () => {
	const prepared = translation.prepareStatementTranslation(source('Keep $x$ and 12.'), 'zh-CN');
	const batches = translation.translationBatches(prepared, connection);
	assert.throws(() => translation.applyStatementTranslation(prepared, []));
	assert.throws(() => translation.applyStatementTranslation(prepared, batches.map(batch => ({ id: batch.id, parts: [...batch.parts, batch.parts[0]] }))));
	assert.throws(() => translation.applyStatementTranslation(prepared, batches.map(batch => ({ id: batch.id, parts: batch.parts.map(part => ({ ...part, text: 'Removed everything' })) }))));
});

test('reordered structural protection tokens cannot change the source document tree', () => {
	const prepared = translation.prepareStatementTranslation(source('<p>Keep <strong>important</strong> terms.</p>', 'html'), 'zh-CN');
	const batches = translation.translationBatches(prepared, connection);
	assert.throws(() => translation.applyStatementTranslation(prepared, batches.map(batch => ({ id: batch.id, parts: batch.parts.map(part => {
		const tokens = part.text.match(/BC_[a-f0-9]+_\d+_END/g) ?? [];
		return { ...part, text: tokens.length > 1 ? part.text.replace(tokens[0]!, 'TEMP').replace(tokens.at(-1)!, tokens[0]!).replace('TEMP', tokens.at(-1)!) : part.text };
	}) }))), /translation-protected-content/);
});
test('normal statement is one batch while long content splits only between complete parts', () => {
	const prepared = translation.prepareStatementTranslation(source('Paragraph one.\n\nParagraph two.'), 'zh-CN');
	assert.equal(translation.translationBatches(prepared, connection).length, 1);
	const limited = { ...connection, capabilities: { ...connection.capabilities, contextWindow: 5000, maxInputTokens: 3500, maxOutputTokens: 1500 } };
	const many = translation.prepareStatementTranslation(source(Array.from({ length: 15 }, () => 'Useful natural language. '.repeat(15)).join('\n\n')), 'zh-CN');
	assert.ok(translation.translationBatches(many, limited).length > 1);
	assert.throws(() => translation.translationBatches(translation.prepareStatementTranslation(source('Unbroken '.repeat(10000)), 'zh-CN'), limited), /translation-capacity/);
});

test('mixed Markdown HTML code, signed values and HTML dollar math are immutable', () => {
	for (const [content, format, protectedValue] of [
		['Keep <code>ALPHA</code> as written.', 'markdown', 'ALPHA'],
		['The bound is -5, not +5.', 'markdown', '-5'],
		['<p>Compute $A+B$ then $$C-D$$.</p>', 'html', '$A+B$']
	] as const) {
		const prepared = translation.prepareStatementTranslation(source(content, format), 'zh-CN');
		assert.ok(Object.values(prepared.protected).some(value => value.includes(protectedValue)), protectedValue + ' must be hidden behind protection');
		assert.ok(!prepared.parts.some(part => part.text.includes(protectedValue)));
		const batches = translation.translationBatches(prepared, connection);
		const result = translation.applyStatementTranslation(prepared, batches.map(batch => ({ id: batch.id, parts: batch.parts.map(part => ({ ...part, text: part.text.replace('Keep', '保留').replace('Compute', '计算').replace('The bound is', '边界为') })) })));
		assert.ok(result.sections[0].content.includes(protectedValue));
	}
});

test('a model cannot introduce new paragraphs or lists into a source text slot', () => {
	const prepared = translation.prepareStatementTranslation(source('Print the answer.'), 'zh-CN');
	const batches = translation.translationBatches(prepared, connection);
	assert.throws(() => translation.applyStatementTranslation(prepared, batches.map(batch => ({ id: batch.id, parts: batch.parts.map(part => ({ ...part, text: part.text.replace('Print the answer.', 'Answer:\n\n- changed structure') })) }))), /translation-invalid-structure/);
});

test('Chinese to English retains tables, formulas, code and exact sample bytes', () => {
	const base = source('给定 $n$。\n\n| 条件 | 值 |\n| --- | --- |\n| 上界 | -5 |\n\n```cpp\n// 注释不翻译\nint n = 5;\n```\n\n参阅 [说明](https://example.org/guide)。');
	const input: StatementRead = { ...base, version: { ...base.version, language: 'zh-CN', title: '求和' } };
	const original = structuredClone(input), prepared = translation.prepareStatementTranslation(input, 'en');
	const result = translation.applyStatementTranslation(prepared, translation.translationBatches(prepared, connection).map(batch => ({ id: batch.id, parts: batch.parts.map(part => ({ ...part, text: part.text.replaceAll('给定', 'Given').replaceAll('求和', 'Sum').replaceAll('条件', 'Condition').replaceAll('上界', 'Bound').replaceAll('参阅', 'See') })) })));
	assert.strictEqual(result.language, 'en'); assert.strictEqual(result.title, 'Sum');
	assert.match(result.sections[0].content, /\| Condition \|/); assert.match(result.sections[0].content, /-5/);
	assert.ok(result.sections[0].content.includes('// 注释不翻译\nint n = 5;')); assert.ok(result.sections[0].content.includes('$n$'));
	assert.deepStrictEqual(input, original);
});

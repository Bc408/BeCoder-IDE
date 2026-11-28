/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import { fromHtml } from 'hast-util-from-html';
import type { StatementRead, StatementLanguage, StatementVersion } from 'becoder-oj-connect';
import type { Connection } from './connection';
import { translationSystemPrompt } from './translationPrompts';

export interface TranslationPart { id: string; text: string }
export interface TranslationBatch { id: string; from: StatementLanguage; to: StatementLanguage; parts: readonly TranslationPart[]; protected: Readonly<Record<string, string>> }
export interface TranslationBatchResult { id: string; parts: readonly TranslationPart[] }
interface Slot { partId: string; field: 'title' | 'heading' | 'content'; sectionIndex?: number; start: number; end: number; html: boolean; tokens: string[] }
export interface PreparedStatementTranslation { source: StatementRead; target: StatementLanguage; parts: TranslationPart[]; protected: Record<string, string>; slots: Slot[]; prefix: string }
interface TreeNode { type: string; tagName?: string; children?: TreeNode[]; position?: { start: { offset?: number }; end: { offset?: number } } }
interface Range { start: number; end: number }
const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const protectedTags = new Set(['pre', 'code', 'var', 'math', 'svg', 'script', 'style', 'textarea']);
const blocks = new Set(['p', 'li', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'section', 'blockquote', 'summary', 'caption']);
const bounds = (node: TreeNode): Range | undefined => {
	const start = node.position?.start.offset, end = node.position?.end.offset;
	return start === undefined || end === undefined ? undefined : { start, end };
};
function editable(node: TreeNode): Range[] {
	if (protectedTags.has(node.tagName ?? '') || ['code', 'inlineCode', 'math', 'inlineMath'].includes(node.type)) { return []; }
	if (node.type === 'text') { const range = bounds(node); return range ? [range] : []; }
	return (node.children ?? []).flatMap(editable);
}
function protectedHtmlRanges(raw: string): Range[] {
	const ranges: Range[] = [];
	const walk = (node: TreeNode) => {
		if (protectedTags.has(node.tagName ?? '')) { const range = bounds(node); if (range) { ranges.push(range); } return; }
		for (const child of node.children ?? []) { walk(child); }
	};
	walk(fromHtml(raw, { fragment: true }) as unknown as TreeNode); return ranges;
}
function excludeRanges(ranges: Range[], excluded: Range[]): Range[] {
	return excluded.reduce((remaining, excluded) => remaining.flatMap(range => excluded.end <= range.start || excluded.start >= range.end ? [range] : [
		...(range.start < excluded.start ? [{ start: range.start, end: excluded.start }] : []),
		...(range.end > excluded.end ? [{ start: excluded.end, end: range.end }] : [])
	]), ranges);
}
function structure(raw: string, html: boolean): string {
	const shape = (node: TreeNode): unknown => [node.type, node.tagName ?? '', ...(node.children ?? []).map(shape)];
	return JSON.stringify(shape((html ? fromHtml(raw, { fragment: true }) : markdown.parse(raw)) as unknown as TreeNode));
}
function groups(raw: string, html: boolean): { range: Range; text: Range[] }[] {
	const tree = (html ? fromHtml(raw, { fragment: true }) : markdown.parse(raw)) as unknown as TreeNode;
	const result: { range: Range; text: Range[] }[] = [];
	const walk = (node: TreeNode) => {
		if (protectedTags.has(node.tagName ?? '') || ['code', 'inlineCode', 'math', 'inlineMath'].includes(node.type)) { return; }
		if (!html && node.type === 'html') {
			const range = bounds(node);
			if (range) { for (const group of groups(raw.slice(range.start, range.end), true)) { result.push({ range: { start: group.range.start + range.start, end: group.range.end + range.start }, text: group.text.map(piece => ({ start: piece.start + range.start, end: piece.end + range.start })) }); } }
			return;
		}
		const isGroup = html ? blocks.has(node.tagName ?? '') && !(node.children ?? []).some(child => blocks.has(child.tagName ?? '')) : ['paragraph', 'heading', 'tableCell'].includes(node.type);
		if (isGroup) { const range = bounds(node), text = editable(node); if (range && text.length) { result.push({ range, text }); } return; }
		if (html && node.type === 'text') { const range = bounds(node); if (range) { result.push({ range, text: [range] }); } return; }
		for (const child of node.children ?? []) { walk(child); }
	};
	walk(tree); return result;
}
export function prepareStatementTranslation(input: StatementRead, target: StatementLanguage): PreparedStatementTranslation {
	if (!['zh-CN', 'en'].includes(target) || input.version.language === target || input.version.origin !== 'site') { throw new Error('translation-invalid-source'); }
	const prepared: PreparedStatementTranslation = { source: structuredClone(input), target, parts: [], protected: {}, slots: [], prefix: 'BC_' + randomUUID().replace(/-/g, '') + '_' };
	const htmlRanges = new Map<string, Range[]>();
	const protect = (raw: string, tokens: string[]) => { if (!raw) { return ''; } const key = prepared.prefix + Object.keys(prepared.protected).length + '_END'; prepared.protected[key] = raw; tokens.push(key); return key; };
	const add = (raw: string, range: Range, textRanges: Range[], field: Slot['field'], sectionIndex: number | undefined, html: boolean) => {
		let cursor = range.start, text = ''; const tokens: string[] = [];
		if (!htmlRanges.has(raw)) { htmlRanges.set(raw, protectedHtmlRanges(raw)); }
		for (const piece of excludeRanges(textRanges, htmlRanges.get(raw)!).sort((a, b) => a.start - b.start)) {
			if (piece.start < cursor || piece.end > range.end) { throw new Error('translation-invalid-structure'); }
			text += protect(raw.slice(cursor, piece.start), tokens);
			text += raw.slice(piece.start, piece.end).replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<!\\)\$[^\r\n$]*?(?<!\\)\$|&(?:#\d+|#x[a-f0-9]+|[a-z]+);|https?:\/\/[^\s<>]+|[+-]?(?:[0-9]+(?:[.,][0-9]+)*|\.[0-9]+)(?:[eE][+-]?\d+)?|\r\n|\r|\n/gi, value => protect(value, tokens));
			cursor = piece.end;
		}
		text += protect(raw.slice(cursor, range.end), tokens);
		if (!text.replace(new RegExp(prepared.prefix + '\\d+_END', 'g'), '').trim()) { return; }
		const id = String(prepared.parts.length + 1);
		prepared.parts.push({ id, text }); prepared.slots.push({ partId: id, field, sectionIndex, start: range.start, end: range.end, html, tokens });
	};
	const plain = (raw: string, field: Slot['field'], sectionIndex?: number) => add(raw, { start: 0, end: raw.length }, [{ start: 0, end: raw.length }], field, sectionIndex, false);
	plain(input.version.title, 'title');
	input.version.sections.forEach((section, index) => {
		if (section.heading) { plain(section.heading, 'heading', index); }
		for (const group of groups(section.content, section.format === 'html')) { add(section.content, group.range, group.text, 'content', index, section.format === 'html'); }
	});
	return prepared;
}
export function translationPayload(batch: TranslationBatch, source: StatementRead): string {
	return JSON.stringify({ from: batch.from, to: batch.to, parts: batch.parts, protected: batch.protected, context: { title: source.version.title, samples: source.samples, limits: source.limits, interactive: source.interactive } });
}
export function translationBatches(prepared: PreparedStatementTranslation, connection: Connection): readonly TranslationBatch[] {
	const capabilities = connection.capabilities, output = connection.parameters.maxOutputTokens ?? capabilities?.maxOutputTokens ?? 8192;
	const budget = Math.min(capabilities?.maxInputTokens ?? 24576, (capabilities?.contextWindow ?? 32768) - output);
	const batches: TranslationBatch[] = [];
	const batch = (parts: TranslationPart[]): TranslationBatch => ({ id: String(batches.length + 1), from: prepared.source.version.language, to: prepared.target, parts, protected: Object.fromEntries(Object.entries(prepared.protected).filter(([key]) => parts.some(part => part.text.includes(key)))) });
	const fits = (value: TranslationBatch) => Buffer.byteLength(translationSystemPrompt + translationPayload(value, prepared.source), 'utf8') <= budget && Buffer.byteLength(JSON.stringify(value.parts), 'utf8') <= output;
	let parts: TranslationPart[] = [];
	for (const part of prepared.parts) {
		if (!fits(batch([...parts, part])) && parts.length) { batches.push(batch(parts)); parts = []; }
		if (!fits(batch([part]))) { throw new Error('translation-capacity'); }
		parts.push(part);
	}
	if (parts.length) { batches.push(batch(parts)); }
	return batches;
}
function escapeText(value: string, html: boolean): string {
	return html ? value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : value.replace(/[\\`*_{}\[\]<>$|#!+\-.]/g, '\\$&');
}
export function applyStatementTranslation(prepared: PreparedStatementTranslation, results: readonly TranslationBatchResult[]): StatementVersion {
	const values = new Map<string, string>(), batchIds = new Set<string>();
	for (const batch of results) {
		if (!batch || typeof batch.id !== 'string' || batchIds.has(batch.id) || !Array.isArray(batch.parts)) { throw new Error('translation-invalid-output'); } batchIds.add(batch.id);
		for (const part of batch.parts) {
			if (!part || typeof part.text !== 'string' || !part.text.trim() || values.has(part.id) || !prepared.parts.some(item => item.id === part.id)) { throw new Error('translation-invalid-output'); }
			values.set(part.id, part.text);
		}
	}
	if (values.size !== prepared.parts.length) { throw new Error('translation-incomplete'); }
	const source = structuredClone(prepared.source.version);
	let title = source.title;
	const sections = source.sections.map(section => ({ ...section }));
	for (const slot of prepared.slots.slice().reverse()) {
		const raw = values.get(slot.partId)!;
		if (/[\r\n]/.test(raw)) { throw new Error('translation-invalid-structure'); }
		const tokens = raw.match(new RegExp(prepared.prefix + '\\d+_END', 'g')) ?? [];
		if (tokens.length !== slot.tokens.length || slot.tokens.some((token, index) => tokens[index] !== token)) { throw new Error('translation-protected-content'); }
		const pattern = new RegExp('(' + prepared.prefix + '\\d+_END)', 'g');
		const translated = raw.split(pattern).map(piece => Object.hasOwn(prepared.protected, piece) ? prepared.protected[piece] : slot.field === 'content' ? escapeText(piece, slot.html) : piece).join('');
		if (slot.field === 'title') { title = translated; }
		else {
			const section = sections[slot.sectionIndex!], field = slot.field === 'heading' ? 'heading' : 'content';
			const previous = section[field] ?? ''; section[field] = previous.slice(0, slot.start) + translated + previous.slice(slot.end);
		}
	}
	for (let index = 0; index < sections.length; index++) {
		const original = prepared.source.version.sections[index], translated = sections[index];
		if (structure(original.content, original.format === 'html') !== structure(translated.content, translated.format === 'html')) { throw new Error('translation-invalid-structure'); }
	}
	return { language: prepared.target, origin: 'translation', title, sections };
}

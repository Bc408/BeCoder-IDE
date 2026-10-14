/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { normalizeNotebook, type CellData, type NotebookData } from './model';
import { randomUUID } from 'crypto';
export interface ContentCell { id?: string; kind: 1 | 2; source?: string; language?: 'c' | 'cpp' | 'becoder-input'; name?: string }
export function notebookContent(original: NotebookData, cells: ContentCell[]): NotebookData {
	if (!Array.isArray(cells)) { throw new Error('notebook-invalid-cells'); }
	const used = new Set<string>();
	const next: CellData[] = cells.map(cell => {
		if (!cell || Object.keys(cell).some(key => !['id', 'kind', 'source', 'language', 'name'].includes(key))) { throw new Error('notebook-forbidden-field'); }
		if (![1, 2].includes(cell.kind) || (cell.source !== undefined && typeof cell.source !== 'string') || (cell.name !== undefined && typeof cell.name !== 'string') || (cell.kind === 2 && cell.language !== undefined && !['c', 'cpp', 'becoder-input'].includes(cell.language))) { throw new Error('notebook-invalid-cell'); }
		if (cell.id !== undefined && (typeof cell.id !== 'string' || !cell.id)) { throw new Error('notebook-invalid-cell-id'); }
		const old = cell.id ? original.cells.find(value => (value.metadata?.becoder as { id?: string } | undefined)?.id === cell.id) : undefined;
		if (cell.id && !old) { throw new Error('notebook-unknown-cell'); }
		if (!old && typeof cell.source !== 'string') { throw new Error('notebook-new-source-required'); }
		const id = cell.id ?? randomUUID(); if (used.has(id)) { throw new Error('notebook-duplicate-cell'); } used.add(id);
		const metadata = structuredClone(old?.metadata ?? {}); const previous = (metadata.becoder ?? {}) as Record<string, unknown>; const data: Record<string, unknown> = { ...previous, id };
		const language = cell.kind === 1 ? 'markdown' : cell.language ?? old?.languageId ?? 'cpp';
		const sameType = old?.kind === cell.kind && old.languageId === language;
		if (!sameType) { delete data.attempt; }
		if (cell.kind === 2 && language === 'becoder-input') { data.role = 'input'; data.name = cell.name ?? previous.name ?? ''; }
		else { delete data.role; delete data.name; }
		metadata.becoder = data;
		return { kind: cell.kind, value: cell.source ?? old!.value, languageId: language, metadata, outputs: sameType ? structuredClone(old?.outputs ?? []) : [], executionSummary: sameType ? structuredClone(old?.executionSummary) : undefined };
	});
	return normalizeNotebook({ ...structuredClone(original), cells: next });
}

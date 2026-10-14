/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import type { NotebookCell, NotebookEditor } from 'vscode';
import { beCoderNotebookType, isBeCoderInputCell } from '../../../src/vs/workbench/contrib/becoder/common/beCoderNotebook';
export interface CellData { kind: number; value: string; languageId: string; metadata?: Record<string, unknown>; outputs?: { items: { mime: string; data: Uint8Array }[]; metadata?: Record<string, unknown> }[]; executionSummary?: { success?: boolean; executionOrder?: number; timing?: { startTime: number; endTime: number } } }
export interface NotebookData { cells: CellData[]; metadata?: Record<string, unknown> }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Cell toolbar arguments take precedence; stale targets must not select another cell. */
export function inputCommandTarget(requested: NotebookCell | undefined, editor?: NotebookEditor): NotebookCell | undefined {
	const index = editor?.selections[0]?.start;
	const cell = requested ?? (editor && index !== undefined && index < editor.notebook.cellCount ? editor.notebook.cellAt(index) : undefined);
	if (!cell || cell.notebook.isClosed || cell.notebook.notebookType !== beCoderNotebookType || cell.kind !== 2 || !isBeCoderInputCell(cell.metadata) || !cell.notebook.getCells().includes(cell)) { return undefined; }
	return cell;
}

export function encodeNotebook(data: NotebookData): Uint8Array {
	const normalized = normalizeNotebook(data);
	const cells = normalized.cells.map(cell => ({ ...cell, outputs: (cell.outputs ?? []).map(output => ({ ...output, items: output.items.map(item => ({ mime: item.mime, data: Buffer.from(item.data).toString('base64') })) })) }));
	return Buffer.from(JSON.stringify({ format: 'becoder-notebook', version: 2, metadata: normalized.metadata ?? {}, cells }, null, 2) + '\n');
}

export function decodeNotebook(bytes: Uint8Array): NotebookData {
	if (!bytes.byteLength) { return normalizeNotebook({ cells: [{ kind: 1, languageId: 'markdown', value: '' }] }); }
	const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as { format?: string; version?: number; cells?: CellData[]; metadata?: Record<string, unknown> };
	if (!value || value.format !== 'becoder-notebook' || value.version !== 2 || !Array.isArray(value.cells) || (value.metadata !== undefined && !object(value.metadata))) { throw new Error('Invalid or unsupported BeCoder Notebook format.'); }
	const cells = value.cells.map(cell => {
		if (!cell || ![1, 2].includes(cell.kind) || typeof cell.value !== 'string' || typeof cell.languageId !== 'string' || (cell.metadata !== undefined && !object(cell.metadata)) || (cell.outputs !== undefined && !Array.isArray(cell.outputs))) { throw new Error('Invalid Notebook cell.'); }
		const outputs = (cell.outputs ?? []).map(output => {
			if (!output || !Array.isArray(output.items) || (output.metadata !== undefined && !object(output.metadata))) { throw new Error('Invalid Notebook output.'); }
			return { ...output, items: output.items.map(item => {
				if (typeof item.mime !== 'string' || typeof item.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.data)) { throw new Error('Invalid Notebook output bytes.'); }
				return { mime: item.mime, data: new Uint8Array(Buffer.from(item.data, 'base64')) };
			}) };
		});
		return { ...cell, outputs };
	});
	return normalizeNotebook({ cells, metadata: value.metadata ?? {} });
}

/** Normalize plain data once instead of serializing and parsing the entire document twice. */
export function normalizeNotebook(data: NotebookData): NotebookData {
	const ids = new Set<string>();
	const identify = (candidate: unknown) => { const id = typeof candidate === 'string' && candidate && !ids.has(candidate) ? candidate : randomUUID(); ids.add(id); return id; };
	const cells = data.cells.map(cell => {
		if (cell.kind === 1 ? cell.languageId !== 'markdown' : cell.kind !== 2 || !['c', 'cpp', 'becoder-input'].includes(cell.languageId)) { throw new Error('notebook-unsupported-cell'); }
		const metadata = { ...cell.metadata };
		const previous = object(metadata.becoder) ? { ...metadata.becoder } : {};
		if (cell.languageId === 'becoder-input') { previous.role = 'input'; previous.name ??= 'input'; }
		else { delete previous.role; delete previous.name; }
		return { ...cell, metadata: { ...metadata, becoder: { ...previous, id: identify(previous.id) } }, outputs: cell.outputs ?? [] };
	});
	return { ...data, cells };
}

export function captureInputRun(data: NotebookData, index: number): { code: string; language: 'c' | 'cpp'; input: string; inputName: string; codeCellId: string; inputCellId: string; codeIndex: number; codeNumber: number } {
	const input = data.cells[index];
	if (!input || input.kind !== 2 || !isBeCoderInputCell(input.metadata)) { throw new Error('notebook-not-input'); }
	for (let cursor = index - 1; cursor >= 0; cursor--) {
		const program = data.cells[cursor];
		if (program.kind === 2 && ['c', 'cpp'].includes(program.languageId) && !isBeCoderInputCell(program.metadata)) {
			const metadata = input.metadata?.becoder as { id?: string; name?: string } | undefined;
			const codeNumber = data.cells.slice(0, cursor + 1).filter(cell => cell.kind === 2 && ['c', 'cpp'].includes(cell.languageId)).length;
			return { code: program.value, language: program.languageId as 'c' | 'cpp', input: input.value, inputName: metadata?.name ?? '', codeCellId: (program.metadata?.becoder as { id?: string } | undefined)?.id ?? '', inputCellId: metadata?.id ?? '', codeIndex: cursor, codeNumber };
		}
	}
	throw new Error('notebook-no-program-above');
}

export function associatedNotebook(root: string, source: string): string | undefined {
	if (!path.isAbsolute(root) || !path.isAbsolute(source) || !/\.(?:c|cpp|cc|cxx)$/i.test(source)) { return undefined; }
	const relative = path.relative(root, source);
	return !relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) ? undefined : path.join(root, '.notebook', relative + '.bcnb');
}

export async function notebookCreationTarget(roots: string[], input: { path?: string; sourcePath?: string }, beaconRoot?: string): Promise<{ path: string; associationRoot?: string }> {
	if (!roots.length) { throw new Error('notebook-open-folder-required'); }
	if (input.path && input.sourcePath) { throw new Error('notebook-ambiguous-target'); }
	if (input.sourcePath) {
		const root = [...roots].sort((a, b) => b.length - a.length).find(root => associatedNotebook(root, input.sourcePath!));
		if (!root) { throw new Error('notebook-source-outside-open-folders'); }
		if (beaconRoot && root !== beaconRoot) {
			const relative = path.relative(beaconRoot, root);
			if (relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
				let ancestor = path.dirname(root);
				while (true) {
					try { await fs.lstat(path.join(ancestor, '.notebook')); throw new Error('notebook-open-parent-folder: ' + ancestor); }
					catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
					if (path.relative(ancestor, beaconRoot) === '' || path.dirname(ancestor) === ancestor) { break; } ancestor = path.dirname(ancestor);
				}
			}
		}
		return { path: associatedNotebook(root, input.sourcePath)!, associationRoot: root };
	}
	if (!input.path || !path.isAbsolute(input.path) || !/\.bcnb$/i.test(input.path) || input.path.includes('\0')) { throw new Error('notebook-invalid-target'); }
	return { path: input.path };
}

export async function prepareAssociationLocation(root: string, target: string): Promise<string> {
	const relative = path.relative(root, target);
	if (!path.isAbsolute(root) || !path.isAbsolute(target) || !relative.startsWith('.notebook' + path.sep) || relative.split(path.sep).includes('..')) { throw new Error('Invalid associated Notebook location.'); }
	const canonical = await fs.realpath(root);
	let current = canonical;
	const checkDirectory = async (directory: string) => {
		const stat = await fs.lstat(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(directory, await fs.realpath(directory)) !== '') { throw new Error('The associated Notebook directory is redirected or unavailable.'); }
	};
	for (const part of path.dirname(relative).split(path.sep)) {
		await checkDirectory(current); // Check the parent before mkdir can follow a redirected path.
		current = path.join(current, part);
		try { await fs.mkdir(current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; } }
		await checkDirectory(current);
	}
	const location = path.join(current, path.basename(target));
	try { const stat = await fs.lstat(location); if (!stat.isFile() || stat.isSymbolicLink()) { throw new Error('The associated Notebook file is redirected or unavailable.'); } }
	catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
	return location;
}

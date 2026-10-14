/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const beCoderNotebookType = 'becoder-notebook';
export const beCoderNotebookInputLanguage = 'becoder-input';
export const beCoderNotebookStatusMime = 'application/vnd.becoder.notebook.status';
export function formatBeCoderRunHeading(attempt: { status?: string; compileMs?: number; runMs?: number; exitCode?: number }): string {
	const states: Record<string, string> = { preparing: 'Preparing', compiling: 'Compiling', running: 'Running', completed: 'OK', 'compile-error': 'CE', 'runtime-error': 'RE', cancelled: 'Stopped', 'unable-to-start': 'Unable to start' };
	const status = states[attempt.status ?? ''] ?? 'Preparing';
	return [status + (attempt.status === 'runtime-error' && attempt.exitCode !== undefined ? ` (exit code ${attempt.exitCode})` : ''), ...(attempt.compileMs === undefined ? [] : [`compile ${Math.round(attempt.compileMs)} ms`]), ...(attempt.runMs === undefined ? [] : [`run ${Math.round(attempt.runMs)} ms`])].join(' | ');
}
export const beCoderNotebookStreamMime = 'application/vnd.becoder.notebook.stream';
export function isBeCoderInputCell(metadata: Record<string, unknown> | undefined): boolean { return (metadata?.becoder as { role?: string } | undefined)?.role === 'input'; }

/** Text context exposes attachment identities, never encoded image payloads. */
export function describeNotebookMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
	if (!metadata.attachments || typeof metadata.attachments !== 'object' || Array.isArray(metadata.attachments)) { return metadata; }
	const attachments = Object.fromEntries(Object.entries(metadata.attachments as Record<string, unknown>).map(([name, value]) => {
		const entries = value && typeof value === 'object' ? Object.entries(value) : [];
		return [name, { mimeTypes: entries.map(([mime]) => mime), byteLength: entries.reduce((total, [, data]) => total + (typeof data === 'string' ? Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0) : 0), 0) }];
	}));
	return { ...metadata, attachments };
}
export interface IBeCoderCellMetadata { id: string; role?: 'input'; name?: string; attempt?: Record<string, unknown> }

export function readBeCoderCellMetadata(metadata: Record<string, unknown>): IBeCoderCellMetadata {
	const value = metadata.becoder as IBeCoderCellMetadata | undefined;
	return { id: typeof value?.id === 'string' ? value.id : '', role: value?.role, name: value?.name, attempt: value?.attempt };
}

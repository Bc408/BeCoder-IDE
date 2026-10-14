/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { IBeaconContext } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import type { NotebookEditApi, NotebookEditInput } from '../../becoder.notebook/src/editApi';
import { redactContext, redactValues } from './contextTools';

export interface NotebookInput extends NotebookEditInput { offset?: number; limit?: number }
export interface NotebookOutput { ok: boolean; error?: string; [key: string]: unknown }
export interface NotebookAccess { execute(input: NotebookInput, signal: AbortSignal): Promise<NotebookOutput>; close(): Promise<void> }

/** Request-local handles; main process and Notebook owner enforce paths/versions/results. */
export class NotebookTools implements NotebookAccess {
	private readonly handles = new Set<string>();
	private readonly pending = new Set<Promise<unknown>>();
	private closed = false;
	private used = 0;
	constructor(private readonly getApi: () => Promise<NotebookEditApi>, private readonly scope: IBeaconContext) { }
	async execute(input: NotebookInput, signal: AbortSignal): Promise<NotebookOutput> {
		if (this.closed || !this.scope.usable || this.scope.mode === 'blackout') { return { ok: false, error: 'notebook-write-denied' }; }
		if (!['begin', 'create'].includes(input.operation) && (!input.handle || !this.handles.has(input.handle))) { return { ok: false, error: 'notebook-owner' }; }
		const operation = (async () => {
			signal.throwIfAborted(); const api = await this.getApi(); signal.throwIfAborted();
			try {
				const output = await api.edit(input, this.scope, signal);
				if (input.operation === 'create' && output.released === false && typeof output.handle === 'string') { this.handles.add(output.handle); }
				if (input.operation === 'begin' && typeof output.handle === 'string') {
					this.handles.add(output.handle);
					if (signal.aborted || this.closed) {
						const result = await api.edit({ operation: 'cancel', handle: output.handle }, this.scope);
						if (result.released !== false) { this.handles.delete(output.handle); }
						signal.throwIfAborted(); return { ok: false, error: 'notebook-request-ended' };
					}
				}
				if ((input.operation === 'finish' || input.operation === 'cancel') && output.released !== false) { this.handles.delete(input.handle!); }
				if (typeof output.text === 'string') {
					let contents: string; try { contents = JSON.stringify(redactValues(JSON.parse(output.text)), null, 2); } catch { contents = redactContext(output.text); } const offset = input.offset ?? 0; const limit = input.limit ?? 32768;
					if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 131072) { return { ok: false, error: 'notebook-invalid-range' }; }
					const chunk = contents.slice(offset, offset + limit); const bytes = Buffer.byteLength(chunk, 'utf8');
					if (this.used + bytes > 8 * 1024 * 1024) { return { ok: false, error: 'notebook-context-budget' }; } this.used += bytes;
					return { ok: true, ...output, text: chunk, offset, nextOffset: offset + chunk.length < contents.length ? offset + chunk.length : undefined, redacted: contents !== output.text };
				}
				return { ok: !output.error && !(output.applied && input.operation === 'finish' && output.saved === false), ...output, ...(output.applied && input.operation === 'finish' && output.saved === false && !output.error ? { error: 'notebook-save-failed; edits remain in the native document' } : {}) };
			} catch (error) { if (signal.aborted) { throw error; } return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
		})(); this.pending.add(operation); try { return await operation; } finally { this.pending.delete(operation); }
	}
	async close(): Promise<void> {
		this.closed = true; await Promise.allSettled(this.pending); if (!this.handles.size) { return; } const api = await this.getApi();
		const errors: unknown[] = [];
		for (const handle of this.handles) {
			try { const result = await api.edit({ operation: 'cancel', handle }, this.scope); if (result.released === false) { throw new Error(String(result.error ?? 'notebook-release-failed')); } this.handles.delete(handle); }
			catch (error) { errors.push(error); }
		}
		if (errors.length) { throw new AggregateError(errors, 'Notebook cleanup failed: ' + errors.map(String).join('; ')); }
	}
}

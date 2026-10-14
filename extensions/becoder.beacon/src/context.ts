/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { fileURLToPath } from 'url';
import type { BeaconMode, IBeaconContext, IBeaconConversation, IBeaconHistoryItem, IBeaconStoredConversation, IBeaconPage } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import type { FileInput, FileOutput, FilePermission, FileRoot, FileTool } from './fileTools';
import { readHistory, type Conversation, type HistoryData } from './history';

export type BeaconTransport = <T>(operation: string, input?: unknown) => Promise<T>;
export interface BeaconHistoryBinding { root?: string; data: HistoryData; save(data: HistoryData): Promise<HistoryData> }

export type BeaconPage = IBeaconPage | (Omit<IBeaconPage, 'kind'> & { kind: 'pdf'; pageCount?: number });
export interface PdfPageApi {
	listPages(): BeaconPage[];
	readPage(id: string, version: string, pageNumber: number): Promise<BeaconPage & { contents: string; totalCharacters: number }>;
}

/** Extend the existing scoped transport using only an already active PDF owner. */
export function withPdfPages(native: (operation: string, input?: unknown) => Promise<unknown>, pdf: () => PdfPageApi | undefined): (operation: string, input?: unknown) => Promise<unknown> {
	const check = async (page: BeaconPage) => {
		if (!page.uri?.startsWith('file:')) { throw new Error('beacon-protected-page'); }
		await native('checkPageAccess', { source: fileURLToPath(page.uri) });
	};
	return async (operation, input) => {
		if (operation !== 'pages' && operation !== 'page') { return native(operation, input); }
		const owner = pdf();
		const pages = owner?.listPages() ?? [];
		if (operation === 'pages') {
			const originals = await native(operation, input) as IBeaconPage[];
			const added = await Promise.all(pages.map(async page => {
				try { await check(page); return page; }
				catch { return { ...page, reason: 'beacon-protected-page' }; }
			}));
			return [...originals.filter(page => !added.some(pdf => pdf.uri === page.uri)), ...added];
		}
		const value = input as { id?: string; version?: string; pageNumber?: number };
		if (!value?.id?.startsWith('pdf:')) { return native(operation, input); }
		const page = pages.find(page => page.id === value.id);
		if (!owner || !page) { throw new Error('beacon-page-closed'); }
		if (page.version !== value.version) { throw new Error('beacon-page-changed'); }
		await check(page);
		const result = await owner.readPage(page.id, page.version, value.pageNumber!);
		const current = owner.listPages().find(item => item.id === page.id);
		if (!current) { throw new Error('beacon-page-closed'); }
		if (current.version !== page.version || current.uri !== page.uri || pdf() !== owner) { throw new Error('beacon-page-changed'); }
		await check(current);
		return result;
	};
}

export class BeaconContextClient {
	state: IBeaconContext = { slot: 'initial', usable: false, mode: 'blackout', epoch: 0, busy: false, recent: [] };
	constructor(private readonly transport: (operation: string, input?: unknown) => Promise<unknown>) { }
	private call<T>(operation: string, input?: unknown): Promise<T> { return this.transport(operation, input) as Promise<T>; }
	get roots(): FileRoot[] { return this.state.usable && this.state.root ? [{ name: path.basename(this.state.root) || this.state.root, path: this.state.root }] : []; }
	get permission(): FilePermission { return this.state.mode === 'spot' ? 'workspace' : this.state.mode === 'flood' ? 'computer' : 'none'; }

	private accept(value: unknown): IBeaconContext {
		const state = value as IBeaconContext;
		if (!state || typeof state.slot !== 'string' || !state.slot || typeof state.usable !== 'boolean' || typeof state.busy !== 'boolean' || !Number.isSafeInteger(state.epoch) || state.epoch < 0
			|| !Array.isArray(state.recent) || state.recent.some(root => typeof root !== 'string') || (state.root !== undefined && typeof state.root !== 'string')
			|| (state.usable ? !state.root || !path.isAbsolute(state.root) || !['spot', 'flood'].includes(state.mode) : state.mode !== 'blackout')) { throw new Error('beacon-invalid-context'); }
		this.state = structuredClone(state);
		return this.state;
	}

	async refresh(): Promise<IBeaconContext> { return this.accept(await this.call('context')); }
	async select(root: string): Promise<IBeaconContext> { return this.accept(await this.call('select', { root })); }
	async setMode(mode: BeaconMode): Promise<IBeaconContext> { return this.accept(await this.call('mode', { mode })); }
	async setBusy(busy: boolean): Promise<void> { await this.call('busy', { busy }); }
	async release(): Promise<void> { await this.call('release'); await this.refresh(); }
	captureScope(): IBeaconContext { return structuredClone(this.state); }

	private matches(scope: IBeaconContext): boolean {
		return (['slot', 'root', 'usable', 'mode', 'epoch', 'activeId'] as const).every(key => scope[key] === this.state[key]);
	}

	async scopedCall<T>(scope: IBeaconContext, operation: string, input: object, signal: AbortSignal): Promise<T> {
		signal.throwIfAborted(); await this.refresh();
		if (!this.matches(scope)) { throw new Error('beacon-context-changed'); }
		const result = await this.call<T>(operation, { ...input, scope });
		signal.throwIfAborted(); await this.refresh();
		if (!this.matches(scope)) { throw new Error('beacon-context-changed'); }
		return result;
	}

	async guardRead(scope: IBeaconContext, read: FileTool, input: FileInput, signal: AbortSignal): Promise<FileOutput> {
		try {
			signal.throwIfAborted(); await this.refresh();
			if (!this.matches(scope)) { throw new Error('beacon-context-changed'); }
			const result = await read(input, signal);
			signal.throwIfAborted(); await this.refresh();
			if (!this.matches(scope)) { throw new Error('beacon-context-changed'); }
			return result;
		} catch {
			signal.throwIfAborted();
			return { ok: false, path: input.path, error: 'The Beacon workspace or permission changed during access. Read again under the current context.' };
		}
	}

	async metadata(active?: Conversation): Promise<HistoryData> {
		if (!this.state.usable) { return readHistory(undefined); }
		const items = await this.call<IBeaconHistoryItem[]>('history');
		if (!Array.isArray(items)) { throw new Error('beacon-unreadable-history'); }
		return readHistory({ version: 1, activeId: active?.id ?? '', conversations: items.map(item => active?.id === item.id ? active : { id: item.id, title: item.title, updatedAt: item.updatedAt, messages: [], error: '', workspace: item.workspace }) });
	}

	async bindHistory(open?: { id: string; create?: boolean }): Promise<BeaconHistoryBinding> {
		await this.refresh();
		if (!this.state.usable) { return { data: readHistory(undefined), save: async data => data }; }
		// Read metadata before changing the active conversation: corrupt lists cannot silently close it.
		await this.metadata();
		let active: Conversation | undefined;
		let revision = 0;
		if (open) {
			const stored = await this.call<IBeaconStoredConversation>('open', open);
			active = readHistory({ version: 1, activeId: stored.data.id, conversations: [stored.data] }).conversations[0];
			revision = stored.revision;
			await this.refresh();
		}
		const root = this.state.root;
		const slot = this.state.slot;
		const id = active?.id;
		let baseline = active ? JSON.stringify(active) : '';
		const data = await this.metadata(active);
		return { root, data, save: async value => {
			if (!id) { if (value.activeId || value.conversations.some(item => item.messages.length)) { throw new Error('beacon-conversation-owner'); } return value; }
			const changed = value.conversations.find(item => item.id === id);
			if (!changed || value.activeId !== id) { throw new Error('beacon-conversation-owner'); }
			if (JSON.stringify(changed) === baseline) { return value; }
			await this.refresh();
			if (!this.state.usable || this.state.root !== root || this.state.slot !== slot || this.state.activeId !== id) { throw new Error('beacon-conversation-owner'); }
			const saved = await this.call<IBeaconStoredConversation>('save', { data: changed as IBeaconConversation, revision });
			const next = readHistory({ version: 1, activeId: id, conversations: [saved.data] }).conversations[0];
			revision = saved.revision; baseline = JSON.stringify(next);
			return { ...value, conversations: value.conversations.map(item => item.id === id ? next : item) };
		} };
	}

	async rename(id: string, title: string): Promise<void> { await this.call('rename', { id, title }); }
	async remove(id: string): Promise<void> { await this.call('delete', { id }); await this.refresh(); }
}

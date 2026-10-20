/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { fileURLToPath } from 'url';
import type { BeaconMode, IBeaconContext, IBeaconConversation, IBeaconHistoryItem, IBeaconStoredConversation, IBeaconPage, IBeaconResume } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import type { FileInput, FileOutput, FilePermission, FileRoot, FileTool } from './fileTools';
import { readHistory, type Conversation, type HistoryData } from './history';

export type BeaconTransport = <T>(operation: string, input?: unknown) => Promise<T>;
export interface BeaconHistoryBinding { root?: string; readonly revision?: number; data: HistoryData; save(data: HistoryData): Promise<HistoryData> }

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
	state: IBeaconContext = { slot: 'initial', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, recent: [] };
	constructor(private readonly transport: (operation: string, input?: unknown) => Promise<unknown>) { }
	private call<T>(operation: string, input?: unknown): Promise<T> { return this.transport(operation, input) as Promise<T>; }
	get consumingWorkspace(): boolean { return this.state.usable && this.state.mode !== 'blackout'; }
	get roots(): FileRoot[] { return this.consumingWorkspace && this.state.root ? [{ name: path.basename(this.state.root) || this.state.root, path: this.state.root }] : []; }
	get permission(): FilePermission { return this.state.mode === 'spot' ? 'workspace' : this.state.mode === 'flood' ? 'computer' : 'none'; }

	private accept(value: unknown): IBeaconContext {
		const state = value as IBeaconContext;
		if (!state || typeof state.slot !== 'string' || !state.slot || typeof state.usable !== 'boolean' || typeof state.busy !== 'boolean' || typeof state.runtimeBusy !== 'boolean' || !Number.isSafeInteger(state.epoch) || state.epoch < 0
			|| !Array.isArray(state.recent) || state.recent.some(root => typeof root !== 'string') || (state.root !== undefined && typeof state.root !== 'string')
			|| !['none', 'ready', 'blackout', 'unavailable'].includes(state.workspaceState)
			|| (!state.root ? state.usable || state.mode !== 'blackout' || state.workspaceState !== 'none'
				: !path.isAbsolute(state.root) || (state.usable ? (state.mode === 'blackout' ? state.workspaceState !== 'blackout' : !['spot', 'flood'].includes(state.mode) || state.workspaceState !== 'ready') : state.mode !== 'blackout' || state.workspaceState !== 'unavailable'))) { throw new Error('beacon-invalid-context'); }
		this.state = structuredClone(state);
		return this.state;
	}

	async refresh(): Promise<IBeaconContext> { return this.accept(await this.call('context')); }
	async refreshForRequest(): Promise<void> {
		await this.refresh();
		if (this.state.runtimeBusy) { throw new Error('beacon-runtime-busy'); }
	}
	async select(root: string): Promise<IBeaconContext> { return this.accept(await this.call('select', { root })); }
	async clearWorkspace(): Promise<IBeaconContext> { return this.accept(await this.call('clearWorkspace')); }
	async removeRecentWorkspace(root: string): Promise<IBeaconContext> { return this.accept(await this.call('removeRecentWorkspace', { root })); }
	async setMode(mode: BeaconMode, retainConversation = false): Promise<IBeaconContext> { return this.accept(await this.call('mode', { mode, retainConversation })); }
	async consumeDraft(id: string, revision: number): Promise<void> { await this.call('consumeDraft', { id, revision }); }
	async setBusy(busy: boolean): Promise<void> { await this.call('busy', { busy }); }
	async release(): Promise<void> { await this.call('release'); await this.refresh(); }
	async resume(): Promise<IBeaconResume | undefined> { return this.consumingWorkspace ? this.call('resume') : undefined; }
	async setView(value: IBeaconResume): Promise<void> { if (this.consumingWorkspace) { await this.call('view', { view: value }); } }
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
			return { ok: false, path: input.path, code: 'context-changed', error: 'The Beacon workspace or permission changed during access. Read again under the current context.' };
		}
	}

	async metadata(active?: Conversation): Promise<HistoryData> {
		if (!this.consumingWorkspace) { return readHistory(undefined); }
		const items = await this.call<IBeaconHistoryItem[]>('history');
		if (!Array.isArray(items)) { throw new Error('beacon-unreadable-history'); }
		const conversations = items.map(item => active?.id === item.id ? active : { id: item.id, title: item.title, updatedAt: item.updatedAt, messages: [], error: '', workspace: item.workspace });
		if (active && !conversations.some(item => item.id === active.id)) { conversations.push(active); }
		return readHistory({ version: 1, activeId: active?.id ?? '', conversations });
	}

	async bindHistory(open?: { id: string; create?: boolean }): Promise<BeaconHistoryBinding> {
		await this.refresh();
		if (!this.consumingWorkspace) { return { data: readHistory(undefined), save: async data => data }; }
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
		return { root, data, get revision() { return revision; }, save: async value => {
			if (!id) { if (value.activeId || value.conversations.some(item => item.messages.length)) { throw new Error('beacon-conversation-owner'); } return value; }
			const changed = value.conversations.find(item => item.id === id);
			if (!changed || value.activeId !== id) { throw new Error('beacon-conversation-owner'); }
			if (JSON.stringify(changed) === baseline) { return value; }
			await this.refresh();
			if (!this.consumingWorkspace || this.state.root !== root || this.state.slot !== slot || this.state.activeId !== id) { throw new Error('beacon-conversation-owner'); }
			const saved = await this.call<IBeaconStoredConversation>('save', { data: changed as IBeaconConversation, revision });
			const next = readHistory({ version: 1, activeId: id, conversations: [saved.data] }).conversations[0];
			revision = saved.revision; baseline = JSON.stringify(next);
			return { ...value, conversations: value.conversations.map(item => item.id === id ? next : item) };
		} };
	}

	async rename(id: string, title: string): Promise<void> { await this.call('rename', { id, title }); }
	async remove(id: string): Promise<void> { await this.call('delete', { id }); await this.refresh(); }
}

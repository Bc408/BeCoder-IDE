/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { ChatSession, type Message, type Snapshot } from './session';
import type { FileRoot } from './fileTools';
import { modelMessageSchema } from 'ai';
import { isWebSource } from './webTools';
import { validAttachments, type Attachment } from './attachments';
import { isToolError } from './toolFeedback';
import { validContextSnapshots, type ContextSnapshot } from './contextTools';
import { selectCompaction, type BeaconCompaction, type CompactionExpectation } from './compaction';
import type { IBeaconContext } from '../../../src/vs/platform/beacon/common/beaconContextTypes';

export interface Conversation {
	id: string;
	title: string;
	updatedAt: number;
	messages: Message[];
	error: string;
	workspace: FileRoot[];
	draft?: { text: string; attachments: Attachment[] };
	draftOnly?: boolean;
	contextSnapshots?: ContextSnapshot[];
	compaction?: BeaconCompaction;
}

export interface HistoryData {
	version: 1;
	activeId: string;
	conversations: Conversation[];
}

export interface HistoryItem {
	id: string;
	title: string;
	updatedAt: number;
	workspace: FileRoot[];
}

/** Validate persisted data before it can become model context. Never replace unreadable history. */
export function readHistory(value: unknown): HistoryData {
	if (value === undefined) { return { version: 1, activeId: '', conversations: [] }; }
	if (!value || typeof value !== 'object') { throw new Error('invalid-history'); }
	const data = structuredClone(value) as HistoryData;
	if (data.version !== 1 || typeof data.activeId !== 'string' || !Array.isArray(data.conversations)) { throw new Error('invalid-history'); }
	const ids = new Set<string>();
	for (const item of data.conversations) {
		if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.title !== 'string' || typeof item.error !== 'string' || (!Number.isFinite(item.updatedAt) || item.updatedAt < 0 || item.updatedAt > 8640000000000000) || !Array.isArray(item.messages)) { throw new Error('invalid-history'); }
		ids.add(item.id);
		Reflect.deleteProperty(item, 'pinnedTarget');
		if (item.draftOnly !== undefined && typeof item.draftOnly !== 'boolean') { throw new Error('invalid-history'); }
		if (item.contextSnapshots !== undefined && !validContextSnapshots(item.contextSnapshots)) { throw new Error('invalid-history'); }
		if (item.compaction !== undefined && (!item.compaction || item.compaction.schemaVersion !== 1 || typeof item.compaction.summary !== 'string' || !item.compaction.summary || typeof item.compaction.prefixSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.compaction.prefixSha256) || !Number.isFinite(item.compaction.createdAt) || !Number.isSafeInteger(item.compaction.coveredThrough?.messageId) || !Number.isSafeInteger(item.compaction.coveredThrough?.unit) || item.compaction.coveredThrough.unit < 0)) { throw new Error('invalid-history'); }
		if (item.draft !== undefined && (!item.draft || typeof item.draft.text !== 'string' || !validAttachments(item.draft.attachments))) { throw new Error('invalid-history'); }
		if (!Array.isArray(item.workspace) || item.workspace.some(root => typeof root.name !== 'string' || typeof root.path !== 'string')) { throw new Error('invalid-history'); }
		let previous = 0;
		for (const message of item.messages) {
			if (message && typeof message === 'object') { Reflect.deleteProperty(message, 'target'); Reflect.deleteProperty(message, 'targetSelection'); }
			if (message?.transition !== undefined && (message.role !== 'user' || !['temporary', 'persistent'].includes(message.transition))) { throw new Error('invalid-history'); }
			if (message?.failure !== undefined && (message.role !== 'assistant' || !message.failure || !['connection', 'timeout', 'rate-limit', 'unavailable'].includes(message.failure.kind) || !Number.isInteger(message.failure.retries) || message.failure.retries < 0 || message.failure.retries > 2)) { throw new Error('invalid-history'); }
			if (message?.attachments !== undefined && (message.role !== 'user' || !validAttachments(message.attachments))) { throw new Error('invalid-history'); }
			if (message?.sources !== undefined && (message.role !== 'assistant' || !Array.isArray(message.sources) || message.sources.length > 1000 || message.sources.some(source => !isWebSource(source)) || new Set(message.sources.map(source => source.id)).size !== message.sources.length)) { throw new Error('invalid-history'); }
			if (message?.protocol !== undefined && (message.role !== 'assistant' || !Array.isArray(message.protocol) || Buffer.byteLength(JSON.stringify(message.protocol), 'utf8') > 32 * 1024 * 1024 || message.protocol.some(turn => !turn || typeof turn.provider !== 'string' || typeof turn.baseURL !== 'string' || typeof turn.model !== 'string' || !Array.isArray(turn.messages) || turn.messages.some(part => !part || part.role === 'system' || !modelMessageSchema.safeParse(part).success)))) { throw new Error('invalid-history'); }
			for (const turn of message?.protocol ?? []) {
				if (turn.stepEnds === undefined) { continue; }
				if (!Array.isArray(turn.stepEnds)) { throw new Error('invalid-history'); }
				let end = 0; const steps = new Set<string>();
				for (const step of turn.stepEnds) { if (!step || typeof step.stepId !== 'string' || !step.stepId || steps.has(step.stepId) || !Number.isSafeInteger(step.end) || step.end <= end || step.end > turn.messages.length) { throw new Error('invalid-history'); } end = step.end; steps.add(step.stepId); }
			}
			if ((message?.model !== undefined && typeof message.model !== 'string') || (message?.provider !== undefined && typeof message.provider !== 'string') || (message?.baseURL !== undefined && typeof message.baseURL !== 'string')) { throw new Error('invalid-history'); }
			if (message?.reasoning !== undefined && typeof message.reasoning !== 'string') { throw new Error('invalid-history'); }
			if (message?.activeStartedAt !== undefined && (!Number.isFinite(message.activeStartedAt) || message.activeStartedAt < 0 || message.activeStartedAt > 8640000000000000)) { throw new Error('invalid-history'); }
			if (message?.toolResults !== undefined && (!Array.isArray(message.toolResults) || message.role !== 'assistant' || message.toolResults.some(result => !result || typeof result.id !== 'string' || !result.id || typeof result.path !== 'string' || result.path.length > 4096 || !result.input || !['read', 'list', 'find', 'search'].includes(result.input.operation) || typeof result.input.path !== 'string' || !result.output || typeof result.output.ok !== 'boolean' || typeof result.output.path !== 'string' || result.output.path.length > 4096 || (result.output.contents !== undefined && (typeof result.output.contents !== 'string' || Buffer.byteLength(result.output.contents, 'utf8') > 8 * 1024 * 1024)) || (result.output.kind === 'image' && !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(result.output.mediaType ?? '')) || (result.output.error !== undefined && typeof result.output.error !== 'string')))) { throw new Error('invalid-history'); }
			if ((message?.createdAt !== undefined && (!Number.isFinite(message.createdAt) || message.createdAt < 0 || message.createdAt > 8640000000000000)) || (message?.durationMs !== undefined && (!Number.isFinite(message.durationMs) || message.durationMs < 0))) { throw new Error('invalid-history'); }
			if (!message || !Number.isSafeInteger(message.id) || message.id <= previous || !['user', 'assistant'].includes(message.role) || !['complete', 'streaming', 'stopped', 'error'].includes(message.status) || typeof message.text !== 'string') { throw new Error('invalid-history'); }
			if (!Array.isArray(message.activities) || message.activities.some(activity => !activity || typeof activity.id !== 'string' || !activity.id || activity.id.length > 256 || !['read', 'list', 'find', 'search', 'web-search', 'web-fetch', 'notebook-edit'].includes(activity.type) || typeof activity.path !== 'string' || activity.path.length > 4096 || !['running', 'complete', 'error', 'stopped'].includes(activity.status) || (activity.error !== undefined && !isToolError(activity.error)))) { throw new Error('invalid-history'); }
			previous = message.id;
		}
	}
	if (data.activeId && !ids.has(data.activeId)) { throw new Error('invalid-history'); }
	return structuredClone(data);
}

/** One live request per window. The supplied binding determines storage ownership. */
export class ChatHistory {
	readonly session: ChatSession;
	private data: HistoryData;
	private pending: HistoryData | undefined;
	private writing: Promise<void> | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;
	private restoring = false;
	private saveFailed = false;
	private compactionWriting: Promise<void> | undefined;

	constructor(value: unknown, private readonly save: (data: HistoryData, expectedScope?: IBeaconContext) => PromiseLike<HistoryData | void>, private readonly changed: () => void, describeError: (error: unknown) => string, private readonly workspace: () => FileRoot[] = () => []) {
		this.data = readHistory(value);
		this.session = new ChatSession(snapshot => this.capture(snapshot), describeError, {
			current: () => ({ conversationId: this.data.activeId, checkpoints: this.currentConversation?.compaction ? [this.currentConversation.compaction] : [] }),
			commit: (candidate, expected, signal) => this.commitCompaction(candidate, expected, signal)
		});
		const active = this.data.conversations.find(item => item.id === this.data.activeId);
		if (active) {
			this.restoring = true;
			this.session.restore(active);
			this.restoring = false;
		}
	}

	get snapshot(): Snapshot & { activeId: string; history: HistoryItem[]; saveFailed: boolean; persisting: boolean } {
		return { ...this.session.snapshot, activeId: this.data.activeId, history: this.data.conversations.filter(item => !item.draftOnly).map(({ id, title, updatedAt, workspace }) => ({ id, title, updatedAt, workspace })).sort((a, b) => b.updatedAt - a.updatedAt), saveFailed: this.saveFailed, persisting: !!(this.timer || this.pending || this.writing) };
	}

	get draft(): { text: string; attachments: Attachment[] } {
		return structuredClone(this.data.conversations.find(item => item.id === this.data.activeId)?.draft ?? { text: '', attachments: [] });
	}

	setDraft(text: string, attachments: Attachment[]): void {
		if (this.disposed) { return; }
		if (typeof text !== 'string' || !validAttachments(attachments)) { throw new Error('invalid-history'); }
		const active = this.data.conversations.find(item => item.id === this.data.activeId);
		if (!active) { return; }
		active.draft = structuredClone({ text, attachments });
		if (!this.timer) { this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 300); }
		this.changed();
	}

	get currentConversation(): Conversation | undefined {
		return structuredClone(this.data.conversations.find(item => item.id === this.data.activeId));
	}

	get contextSnapshots(): ContextSnapshot[] {
		return structuredClone(this.data.conversations.find(item => item.id === this.data.activeId)?.contextSnapshots ?? []);
	}
	/** Project retained evidence from the effective prefix without deleting original assets. */
	effectiveContextSnapshots(beforeId = Infinity): ContextSnapshot[] { return this.effectiveContextAccess(beforeId).snapshots; }
	effectiveContextAccess(beforeId = Infinity): { keys: readonly string[]; snapshots: ContextSnapshot[] } {
		const keys = new Set<string>();
		for (const message of this.session.snapshot.messages) {
			if (message.id >= beforeId) { continue; }
			if (message.role !== 'assistant' || !['complete', 'stopped', 'error'].includes(message.status)) { continue; }
			for (const turn of message.protocol ?? []) {
				for (const part of turn.messages) {
					if (part.role !== 'tool') { continue; }
					for (const result of part.content) {
						if (result.type !== 'tool-result' || !['readPage', 'inspectContext'].includes(result.toolName) || result.output.type !== 'json') { continue; }
						const value: unknown = result.output.value;
						if (!value || typeof value !== 'object' || Array.isArray(value)) { continue; }
						const output = value as Record<string, unknown>;
						if (output.ok !== true) { continue; }
						if (typeof output.materialId === 'string') { keys.add(`material:${output.materialId}`); }
						const source = output.source as Record<string, unknown> | undefined;
						if (source && typeof source === 'object' && !Array.isArray(source) && source.kind === 'page' && typeof source.id === 'string' && typeof source.version === 'string') {
							keys.add(`page:${source.id}:${source.version}:${typeof source.pageNumber === 'number' ? source.pageNumber : ''}`);
						}
					}
				}
			}
		}
		return { keys: [...keys], snapshots: this.contextSnapshots.filter(snapshot => keys.has(snapshot.key)) };
	}

	captureContext(snapshot: ContextSnapshot): void {
		if (this.disposed) { return; }
		const active = this.data.conversations.find(item => item.id === this.data.activeId);
		if (!active) { return; }
		const snapshots = this.contextSnapshots.filter(item => item.key !== snapshot.key).concat(snapshot);
		if (!validContextSnapshots(snapshots)) { throw new Error('invalid-history'); }
		active.contextSnapshots = structuredClone(snapshots);
		if (!this.timer) { this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 300); }
		this.changed();
	}

	get checkpoint(): HistoryData { return structuredClone(this.data); }

	private capture(snapshot: Snapshot): void {
		if (this.restoring || this.disposed) { return; }
		let active = this.data.conversations.find(item => item.id === this.data.activeId);
		if (!active && snapshot.messages.length) {
			active = { id: randomUUID(), title: (snapshot.messages[0].text || snapshot.messages[0].attachments?.map(item => item.name).join(', ') || '').replace(/\s+/g, ' ').slice(0, 80), updatedAt: Date.now(), messages: [], error: '', workspace: this.workspace() };
			this.data.conversations.push(active);
			this.data.activeId = active.id;
		}
		if (active) {
			if (snapshot.messages.length) { active.draftOnly = false; }
			if (!active.title && snapshot.messages.length) { active.title = (snapshot.messages[0].text || snapshot.messages[0].attachments?.map(item => item.name).join(', ') || '').replace(/\s+/g, ' ').slice(0, 80); }
			active.messages = snapshot.messages.map(message => {
				if (message.status !== 'streaming' || message.activeStartedAt === undefined) { return message; }
				const saved = { ...message, durationMs: (message.durationMs ?? 0) + Math.max(0, Date.now() - message.activeStartedAt) };
				delete saved.activeStartedAt;
				return saved;
			});
			active.error = snapshot.error;
			active.updatedAt = Date.now();
		}
		// Checkpoint partial output, while committing completed turns immediately.
		if (snapshot.busy) {
			if (!this.timer) { this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 500); }
		} else { void this.flush(); }
		this.changed();
	}

	newConversation(): void {
		if (this.session.snapshot.busy || this.disposed) { return; }
		this.data.activeId = '';
		this.session.clear();
	}

	open(id: string): void {
		if (this.session.snapshot.busy || this.disposed) { return; }
		const item = this.data.conversations.find(item => item.id === id);
		if (!item) { return; }
		this.data.activeId = id;
		this.restoring = true;
		this.session.restore(item);
		this.restoring = false;
		void this.flush();
		this.changed();
	}

	rename(id: string, title: string): void {
		if (this.session.snapshot.busy || this.disposed || !title.trim()) { return; }
		const item = this.data.conversations.find(item => item.id === id);
		if (!item) { return; }
		item.title = title.trim().slice(0, 80);
		void this.flush();
		this.changed();
	}

	remove(id: string): void {
		if (this.session.snapshot.busy || this.disposed) { return; }
		this.data.conversations = this.data.conversations.filter(item => item.id !== id);
		if (this.data.activeId === id) { this.newConversation(); }
		else { void this.flush(); this.changed(); }
	}

	refresh(value: HistoryData): boolean {
		if (this.session.snapshot.busy || this.timer || this.pending || this.writing || this.saveFailed || this.disposed) { return false; }
		const activeId = this.data.activeId;
		this.data = readHistory({ ...value, activeId: value.conversations.some(item => item.id === activeId) ? activeId : '' });
		this.restoring = true;
		const active = this.data.conversations.find(item => item.id === this.data.activeId);
		if (active) { this.session.restore(active); } else { this.session.clear(); }
		this.restoring = false;
		this.changed();
		return true;
	}

	async flush(): Promise<void> {
		if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
		this.pending = structuredClone(this.data);
		if (this.compactionWriting) { await this.compactionWriting.catch(() => { }); }
		if (!this.writing) {
			this.writing = this.drain();
		}
		await this.writing;
	}

	async commitCompaction(candidate: BeaconCompaction, expected: CompactionExpectation, signal: AbortSignal): Promise<void> {
		if (this.compactionWriting) { throw new Error('beacon-compaction-busy'); }
		const previousWriter = this.writing;
		const operation = Promise.resolve().then(async () => {
			await previousWriter;
			signal.throwIfAborted();
			const current = this.data.conversations.find(item => item.id === expected.conversationId);
			if (this.disposed || !current || this.data.activeId !== expected.conversationId || this.session.activeRequestId !== expected.requestId || expected.prefixSha256 !== candidate.prefixSha256 || !selectCompaction(this.session.effectiveContextUnits(), [candidate])) { throw new Error('beacon-compaction-stale'); }
			const data = structuredClone(this.data), target = data.conversations.find(item => item.id === current.id)!;
			target.compaction = structuredClone(candidate);
			const saved = expected.persist === false ? data : await this.save(data, expected.scope);
			// A completed save is authoritative even if cancellation arrived during publication.
			const accepted = saved ?? data;
			const local = this.data.conversations.find(item => item.id === current.id);
			const committed = accepted.conversations.find(item => item.id === current.id);
			if (!local || !committed?.compaction) { throw new Error('beacon-compaction-save-failed'); }
			local.compaction = structuredClone(committed.compaction);
			if (this.pending) { this.pending = structuredClone(this.data); }
			this.saveFailed = false; this.changed();
		});
		this.compactionWriting = operation;
		try { await operation; } finally { this.compactionWriting = undefined; }
	}

	private async drain(): Promise<void> {
		// Yield before saving, so even synchronous storage failures retire the writer correctly.
		await Promise.resolve();
		try {
			while (this.pending) {
				const data = this.pending;
				this.pending = undefined;
				try {
					const saved = await this.save(data);
					if (saved) {
						// Adopt other windows' records without discarding local changes made
						// while this snapshot was being written.
						const previous = new Map(data.conversations.map(item => [item.id, item]));
						const local = new Map(this.data.conversations.map(item => [item.id, item]));
						const merged = new Map(saved.conversations.map(item => [item.id, item]));
						for (const id of new Set([...previous.keys(), ...local.keys()])) {
							if (JSON.stringify(previous.get(id)) === JSON.stringify(local.get(id))) { continue; }
							const item = local.get(id);
							if (item) { merged.set(id, item); } else { merged.delete(id); }
						}
						this.data = { version: 1, activeId: merged.has(this.data.activeId) ? this.data.activeId : '', conversations: [...merged.values()] };
						if (this.pending) { this.pending = structuredClone(this.data); }
					}
					this.saveFailed = false;
				}
				catch { this.saveFailed = true; this.pending = undefined; break; }
			}
		} finally {
			this.writing = undefined;
			if (!this.disposed) { this.changed(); }
		}
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		this.session.dispose();
		await this.flush();
	}
}

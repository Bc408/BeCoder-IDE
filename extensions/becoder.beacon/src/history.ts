/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { ChatSession, type Message, type Snapshot } from './session';

interface Conversation {
	id: string;
	title: string;
	updatedAt: number;
	messages: Message[];
	error: string;
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
}

/** Validate persisted data before it can become model context. Never replace unreadable history. */
export function readHistory(value: unknown): HistoryData {
	if (value === undefined) { return { version: 1, activeId: '', conversations: [] }; }
	if (!value || typeof value !== 'object') { throw new Error('invalid-history'); }
	const data = value as HistoryData;
	if (data.version !== 1 || typeof data.activeId !== 'string' || !Array.isArray(data.conversations)) { throw new Error('invalid-history'); }
	const ids = new Set<string>();
	for (const item of data.conversations) {
		if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.title !== 'string' || typeof item.error !== 'string' || (!Number.isFinite(item.updatedAt) || item.updatedAt < 0 || item.updatedAt > 8640000000000000) || !Array.isArray(item.messages)) { throw new Error('invalid-history'); }
		ids.add(item.id);
		let previous = 0;
		for (const message of item.messages) {
			if ((message?.model !== undefined && typeof message.model !== 'string') || (message?.provider !== undefined && typeof message.provider !== 'string')) { throw new Error('invalid-history'); }
			if ((message?.createdAt !== undefined && (!Number.isFinite(message.createdAt) || message.createdAt < 0 || message.createdAt > 8640000000000000)) || (message?.durationMs !== undefined && (!Number.isFinite(message.durationMs) || message.durationMs < 0))) { throw new Error('invalid-history'); }
			if (!message || !Number.isSafeInteger(message.id) || message.id <= previous || !['user', 'assistant'].includes(message.role) || !['complete', 'streaming', 'stopped', 'error'].includes(message.status) || typeof message.text !== 'string' || typeof message.reasoning !== 'string') { throw new Error('invalid-history'); }
			previous = message.id;
		}
	}
	if (data.activeId && !ids.has(data.activeId)) { throw new Error('invalid-history'); }
	return structuredClone(data);
}

/** One live request per window, durable conversations scoped by the host's workspaceState. */
export class ChatHistory {
	readonly session: ChatSession;
	private data: HistoryData;
	private pending: HistoryData | undefined;
	private writing: Promise<void> | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;
	private restoring = false;
	private saveFailed = false;

	constructor(value: unknown, private readonly save: (data: HistoryData) => PromiseLike<void>, private readonly changed: () => void, describeError: (error: unknown) => string) {
		this.data = readHistory(value);
		this.session = new ChatSession(snapshot => this.capture(snapshot), describeError);
		const active = this.data.conversations.find(item => item.id === this.data.activeId);
		if (active) {
			this.restoring = true;
			this.session.restore(active);
			this.restoring = false;
		}
	}

	get snapshot(): Snapshot & { activeId: string; history: HistoryItem[]; saveFailed: boolean } {
		return { ...this.session.snapshot, activeId: this.data.activeId, history: this.data.conversations.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt), saveFailed: this.saveFailed };
	}

	private capture(snapshot: Snapshot): void {
		if (this.restoring || this.disposed) { return; }
		let active = this.data.conversations.find(item => item.id === this.data.activeId);
		if (!active && snapshot.messages.length) {
			active = { id: randomUUID(), title: snapshot.messages[0].text.replace(/\s+/g, ' ').slice(0, 80), updatedAt: Date.now(), messages: [], error: '' };
			this.data.conversations.push(active);
			this.data.activeId = active.id;
		}
		if (active) {
			active.messages = snapshot.messages;
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

	async flush(): Promise<void> {
		if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
		this.pending = structuredClone(this.data);
		if (!this.writing) {
			this.writing = this.drain();
		}
		await this.writing;
	}

	private async drain(): Promise<void> {
		// Yield before saving, so even synchronous storage failures retire the writer correctly.
		await Promise.resolve();
		try {
			while (this.pending) {
				const data = this.pending;
				this.pending = undefined;
				try { await this.save(data); this.saveFailed = false; }
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

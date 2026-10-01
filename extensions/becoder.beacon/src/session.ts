/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { ModelMessage } from 'ai';

export interface WorkspaceReadResult {
	id: string;
	path: string;
	output: { ok: boolean; path: string; contents?: string; error?: string };
}

export interface Message {
	id: number;
	role: 'user' | 'assistant';
	text: string;
	reasoning?: string;
	activities: ToolActivity[];
	status: 'complete' | 'streaming' | 'stopped' | 'error';
	createdAt?: number;
	durationMs?: number;
	activeStartedAt?: number;
	toolResults?: WorkspaceReadResult[];
	model?: string;
	provider?: string;
}

export interface ToolActivity {
	id: string;
	type: 'read-workspace-file';
	path: string;
	status: 'running' | 'complete' | 'error' | 'stopped';
}

export type WorkspaceFileReader = (path: string, signal: AbortSignal) => Promise<{ path: string; content: string }>;

export interface Snapshot {
	messages: Message[];
	busy: boolean;
	error: string;
	canRetry: boolean;
	stopping?: boolean;
}

export type Delta = { type: 'text'; text: string } | { type: 'reasoning'; text: string } | { type: 'activity'; activity: ToolActivity } | { type: 'tool-result'; result: WorkspaceReadResult };
export type Generate = (messages: ReadonlyArray<ModelMessage>, signal: AbortSignal, readWorkspaceFile: WorkspaceFileReader) => AsyncIterable<Delta>;

const unavailableWorkspaceFileReader: WorkspaceFileReader = async () => { throw new Error('workspace-file-unavailable'); };

/** The extension host owns request retirement, partial answers and durable tool context. */
export class ChatSession {
	private messages: Message[] = [];
	private controller: AbortController | undefined;
	private sequence = 0;
	private error = '';
	private disposed = false;

	constructor(private readonly changed: (snapshot: Snapshot) => void, private readonly describeError: (error: unknown) => string) { }

	get snapshot(): Snapshot {
		return { messages: structuredClone(this.messages), busy: !!this.controller, error: this.error, canRetry: !this.controller && this.messages.at(-1)?.status === 'error', ...(this.controller?.signal.aborted ? { stopping: true } : {}) };
	}

	private publish(): void {
		if (!this.disposed) { this.changed(this.snapshot); }
	}

	async send(text: string, generate: Generate, retry = false, source?: { model: string; provider: string }, readWorkspaceFile: WorkspaceFileReader = unavailableWorkspaceFileReader): Promise<void> {
		if (this.disposed || this.controller) { return; }
		if (retry) {
			if (!this.snapshot.canRetry) { return; }
			this.messages.pop();
		} else {
			text = text.trim();
			if (!text || text.length > 32000) { return; }
			this.messages.push({ id: ++this.sequence, role: 'user', text, activities: [], status: 'complete', createdAt: Date.now() });
		}
		await this.respond(generate, readWorkspaceFile, source);
	}

	async edit(id: number, text: string, generate: Generate, source?: { model: string; provider: string }, readWorkspaceFile: WorkspaceFileReader = unavailableWorkspaceFileReader): Promise<void> {
		text = text.trim();
		const index = this.messages.findIndex(message => message.id === id && message.role === 'user');
		if (this.disposed || this.controller || index < 0 || !text || text.length > 32000) { return; }
		this.messages[index] = { ...this.messages[index], text, createdAt: Date.now() };
		this.messages.splice(index + 1);
		await this.respond(generate, readWorkspaceFile, source);
	}

	async regenerate(id: number, generate: Generate, source?: { model: string; provider: string }, readWorkspaceFile: WorkspaceFileReader = unavailableWorkspaceFileReader): Promise<void> {
		const index = this.messages.findIndex(message => message.id === id && message.role === 'assistant');
		if (this.disposed || this.controller || index < 1 || this.messages[index - 1].role !== 'user') { return; }
		this.messages.splice(index);
		await this.respond(generate, readWorkspaceFile, source);
	}

	async resume(id: number, generate: Generate, source?: { model: string; provider: string }, readWorkspaceFile: WorkspaceFileReader = unavailableWorkspaceFileReader): Promise<void> {
		const reply = this.messages.at(-1);
		if (this.disposed || this.controller || reply?.id !== id || reply.role !== 'assistant' || reply.status !== 'stopped') { return; }
		await this.respond(generate, readWorkspaceFile, source, reply);
	}

	private modelContext(): ModelMessage[] {
		const context: ModelMessage[] = [];
		for (const message of this.messages) {
			if (message.status !== 'complete' && message.status !== 'stopped') { continue; }
			for (const [index, result] of (message.toolResults ?? []).entries()) {
				const toolCallId = `beacon_${message.id}_${index}`;
				context.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId, toolName: 'readWorkspaceFile', input: { path: result.path } }] });
				context.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId, toolName: 'readWorkspaceFile', output: { type: 'json', value: result.output } }] });
			}
			if (message.text) { context.push({ role: message.role, content: message.text }); }
		}
		return context;
	}

	private async respond(generate: Generate, readWorkspaceFile: WorkspaceFileReader, source?: { model: string; provider: string }, resumedReply?: Message): Promise<void> {
		const context = this.modelContext();
		if (resumedReply) {
			context.push({ role: 'user', content: 'The user paused the previous answer and explicitly asked to continue it. Continue the unfinished answer using the saved conversation and completed tool results. Your new text will be appended directly to the existing answer. Continue exactly where it ends, including any unfinished sentence, code fence or formula. Do not repeat the existing answer or add a new introduction. If no answer text exists, begin answering the original request.' });
		}
		const startedAt = Date.now();
		const reply: Message = resumedReply ?? { id: ++this.sequence, role: 'assistant', text: '', reasoning: '', activities: [], status: 'streaming', createdAt: startedAt, ...source };
		const previousDuration = reply.durationMs ?? 0;
		const previousText = reply.text;
		const activityOffset = reply.activities.length;
		const activityId = (id: string) => activityOffset ? `${id}:${activityOffset}` : id;
		reply.status = 'streaming';
		reply.activeStartedAt = startedAt;
		if (source) { Object.assign(reply, source); }
		if (!resumedReply) { this.messages.push(reply); }
		const controller = new AbortController();
		this.controller = controller;
		this.error = '';
		this.publish();
		try {
			for await (const delta of generate(context, controller.signal, readWorkspaceFile)) {
				if (controller.signal.aborted) { break; }
				if (delta.type === 'text') {
					reply.text += delta.text;
				} else if (delta.type === 'reasoning') {
					reply.reasoning = (reply.reasoning ?? '') + delta.text;
				} else if (delta.type === 'tool-result') {
					(reply.toolResults ??= []).push({ ...delta.result, id: activityId(delta.result.id), output: { ...delta.result.output } });
				} else {
					const activity = { ...delta.activity, id: activityId(delta.activity.id) };
					const index = reply.activities.findIndex(item => item.id === activity.id);
					if (index < 0) { reply.activities.push(activity); }
					else { reply.activities[index] = activity; }
				}
				this.publish();
			}
			if (!controller.signal.aborted && !reply.text.slice(previousText.length).trim()) { throw new Error('empty-response'); }
			reply.status = controller.signal.aborted ? 'stopped' : 'complete';
		} catch (error) {
			reply.status = controller.signal.aborted || resumedReply ? 'stopped' : 'error';
			if (!controller.signal.aborted) { this.error = this.describeError(error); }
		} finally {
			for (const activity of reply.activities) {
				if (activity.status === 'running') { activity.status = controller.signal.aborted ? 'stopped' : 'error'; }
			}
			reply.durationMs = previousDuration + Math.max(0, Date.now() - startedAt);
			delete reply.activeStartedAt;
			this.controller = undefined;
			this.publish();
		}
	}

	stop(): void { if (this.controller && !this.controller.signal.aborted) { this.controller.abort(); this.publish(); } }

	restore(snapshot: Pick<Snapshot, 'messages' | 'error'>): void {
		if (this.controller || this.disposed) { return; }
		this.messages = structuredClone(snapshot.messages).map((message): Message => {
			delete message.activeStartedAt;
			return { ...message, activities: (message.activities ?? []).map(activity => ({ ...activity, status: activity.status === 'running' ? 'stopped' : activity.status })), status: message.status === 'streaming' ? 'stopped' : message.status };
		});
		this.sequence = this.messages.reduce((maximum, message) => Math.max(maximum, message.id), 0);
		this.error = snapshot.error;
		this.publish();
	}

	clear(): void {
		if (this.controller) { return; }
		this.messages = [];
		this.error = '';
		this.publish();
	}

	dispose(): void { this.disposed = true; this.stop(); }
}

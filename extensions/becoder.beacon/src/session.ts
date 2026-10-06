/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { ModelMessage } from 'ai';
import type { FileInput, FileOutput, FileTool } from './fileTools';
import { replayProtocol, type ProtocolTurn } from './protocol';
import type { WebSource, WebError } from './webTools';
import { attachmentParts, validAttachments, type Attachment } from './attachments';
import { RequestRecoveryError, type RequestFailure, type RequestRetry } from './requestRecovery';

export interface FileResult {
	id: string;
	path: string;
	input: FileInput;
	output: FileOutput;
}

export function fileModelOutput(output: FileOutput) {
	if (output.ok && output.kind === 'image' && output.contents && output.mediaType) {
		return { type: 'content' as const, value: [{ type: 'text' as const, text: JSON.stringify({ ...output, contents: undefined }) }, { type: 'file' as const, mediaType: output.mediaType, data: { type: 'data' as const, data: output.contents } }] };
	}
	return { type: 'json' as const, value: { ...output } };
}

export interface Message {
	failure?: RequestFailure;
	attachments?: Attachment[];
	id: number;
	role: 'user' | 'assistant';
	text: string;
	reasoning?: string;
	activities: ToolActivity[];
	status: 'complete' | 'streaming' | 'stopped' | 'error';
	createdAt?: number;
	durationMs?: number;
	activeStartedAt?: number;
	toolResults?: FileResult[];
	protocol?: ProtocolTurn[];
	sources?: WebSource[];
	model?: string;
	provider?: string;
}

export interface ToolActivity {
	id: string;
	type: 'read' | 'list' | 'find' | 'search' | 'web-search' | 'web-fetch';
	path: string;
	status: 'running' | 'complete' | 'error' | 'stopped';
	error?: WebError;
}

export interface Snapshot {
	retry?: RequestRetry;
	messages: Message[];
	busy: boolean;
	error: string;
	stopping?: boolean;
}

export type Delta = { type: 'text'; text: string; turn?: ProtocolTurn } | { type: 'reasoning'; text: string; turn?: ProtocolTurn } | { type: 'activity'; activity: ToolActivity } | { type: 'tool-result'; result: FileResult } | { type: 'web-result'; sources: WebSource[] } | { type: 'protocol'; turn: ProtocolTurn };
export type Generate = (messages: ReadonlyArray<ModelMessage>, signal: AbortSignal, files: FileTool, progress?: (retry: RequestRetry | undefined) => void) => AsyncIterable<Delta>;
type ResponseSource = { model: string; provider: string; baseURL?: string };

const unavailableFileTool: FileTool = async input => ({ ok: false, path: input.path, error: 'Local file access is disabled.' });

/** The extension host owns request retirement, partial answers and durable tool context. */
export class ChatSession {
	private messages: Message[] = [];
	private controller: AbortController | undefined;
	private sequence = 0;
	private error = '';
	private retry: RequestRetry | undefined;
	private disposed = false;

	constructor(private readonly changed: (snapshot: Snapshot) => void, private readonly describeError: (error: unknown) => string) { }

	get snapshot(): Snapshot {
		const messages = this.messages.map(message => {
			const { attachments, ...content } = message;
			// Attachment strings are immutable. Copy their records without copying
			// megabytes of image bytes on each streaming update.
			return { ...structuredClone(content), ...(attachments ? { attachments: attachments.map(item => ({ ...item })) } : {}) };
		});
		return { messages, busy: !!this.controller, error: this.error, ...(this.retry ? { retry: { ...this.retry } } : {}), ...(this.controller?.signal.aborted ? { stopping: true } : {}) };
	}

	private publish(): void {
		if (!this.disposed) { this.changed(this.snapshot); }
	}

	async send(text: string, generate: Generate, source?: ResponseSource, files: FileTool = unavailableFileTool, attachments: Attachment[] = []): Promise<void> {
		if (this.disposed || this.controller) { return; }
		text = text.trim();
		if ((!text && !attachments.length) || text.length > 32000 || !validAttachments(attachments)) { return; }
		this.messages.push({ id: ++this.sequence, role: 'user', text, ...(attachments.length ? { attachments: structuredClone(attachments) } : {}), activities: [], status: 'complete', createdAt: Date.now() });
		await this.respond(generate, files, source);
	}

	async edit(id: number, text: string, generate: Generate, source?: ResponseSource, files: FileTool = unavailableFileTool): Promise<void> {
		text = text.trim();
		const index = this.messages.findIndex(message => message.id === id && message.role === 'user');
		if (this.disposed || this.controller || index < 0 || (!text && !this.messages[index].attachments?.length) || text.length > 32000) { return; }
		this.messages[index] = { ...this.messages[index], text, createdAt: Date.now() };
		this.messages.splice(index + 1);
		await this.respond(generate, files, source);
	}

	async regenerate(id: number, generate: Generate, source?: ResponseSource, files: FileTool = unavailableFileTool): Promise<void> {
		const index = this.messages.findIndex(message => message.id === id && message.role === 'assistant');
		if (this.disposed || this.controller || index < 1 || this.messages[index - 1].role !== 'user') { return; }
		this.messages.splice(index);
		await this.respond(generate, files, source);
	}

	async resume(id: number, generate: Generate, source?: ResponseSource, files: FileTool = unavailableFileTool): Promise<void> {
		const reply = this.messages.at(-1);
		if (this.disposed || this.controller || reply?.id !== id || reply.role !== 'assistant' || reply.status !== 'stopped') { return; }
		await this.respond(generate, files, source, reply);
	}

	private modelContext(source?: ResponseSource): ModelMessage[] {
		const context: ModelMessage[] = [];
		for (const message of this.messages) {
			if (message.status !== 'complete' && message.status !== 'stopped') { continue; }
			if (message.protocol?.length) {
				for (const turn of message.protocol) { context.push(...replayProtocol(turn, source)); }
				continue;
			}
			if (message.role === 'user' && message.attachments?.length) {
				context.push({ role: 'user', content: [...(message.text ? [{ type: 'text' as const, text: message.text }] : []), ...attachmentParts(message.attachments)] });
				continue;
			}
			if (message.text) { context.push({ role: message.role, content: message.text }); }
		}
		return context;
	}

	private async respond(generate: Generate, files: FileTool, source?: ResponseSource, resumedReply?: Message): Promise<void> {
		const context = this.modelContext(source);
		if (resumedReply) {
			context.push({ role: 'user', content: 'The user paused the previous answer and explicitly asked to continue it. Continue the unfinished answer using the saved conversation and completed tool results. Your new text will be appended directly to the existing answer. Continue exactly where it ends, including any unfinished sentence, code fence or formula. Do not repeat the existing answer or add a new introduction. If no answer text exists, begin answering the original request.' });
		}
		const startedAt = Date.now();
		const reply: Message = resumedReply ?? { id: ++this.sequence, role: 'assistant', text: '', reasoning: '', activities: [], status: 'streaming', createdAt: startedAt, ...source };
		const previousDuration = reply.durationMs ?? 0;
		const previousText = reply.text;
		const protocolOffset = reply.protocol?.length ?? 0;
		const activityOffset = reply.activities.length;
		const activityId = (id: string) => activityOffset ? `${id}:${activityOffset}` : id;
		reply.status = 'streaming';
		delete reply.failure;
		reply.activeStartedAt = startedAt;
		if (source) { Object.assign(reply, source); }
		if (!resumedReply) { this.messages.push(reply); }
		const controller = new AbortController();
		this.controller = controller;
		this.error = '';
		this.retry = undefined;
		this.publish();
		try {
			for await (const delta of generate(context, controller.signal, files, retry => { if (!controller.signal.aborted) { this.retry = retry; this.publish(); } })) {
				if (controller.signal.aborted) { break; }
				if ('turn' in delta && delta.turn) {
					(reply.protocol ??= [])[protocolOffset] = structuredClone({ ...delta.turn, messages: [...(resumedReply ? [context.at(-1)!] : []), ...delta.turn.messages] });
				}
				if (delta.type === 'protocol') { this.publish(); continue; }
				if (delta.type === 'text') {
					reply.text += delta.text;
				} else if (delta.type === 'reasoning') {
					reply.reasoning = (reply.reasoning ?? '') + delta.text;
				} else if (delta.type === 'tool-result') {
					(reply.toolResults ??= []).push({ ...delta.result, id: activityId(delta.result.id), output: { ...delta.result.output } });
				} else if (delta.type === 'web-result') {
					const sources = new Map((reply.sources ?? []).map(source => [source.id, source]));
					for (const source of delta.sources) {
						if (sources.get(source.id)?.kind !== 'page' || source.kind === 'page') { sources.set(source.id, structuredClone(source)); }
					}
					reply.sources = [...sources.values()];
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
			if (!controller.signal.aborted) { this.error = this.describeError(error); if (error instanceof RequestRecoveryError) { reply.failure = { ...error.failure }; } }
		} finally {
			for (const activity of reply.activities) {
				if (activity.status === 'running') { activity.status = controller.signal.aborted ? 'stopped' : 'error'; }
			}
			reply.durationMs = previousDuration + Math.max(0, Date.now() - startedAt);
			delete reply.activeStartedAt;
			this.controller = undefined;
			this.retry = undefined;
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

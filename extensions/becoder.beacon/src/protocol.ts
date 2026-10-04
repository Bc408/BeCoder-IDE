/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import type { AssistantModelMessage, ModelMessage, ProviderMetadata, ToolModelMessage } from 'ai';

export interface ProtocolTurn {
	provider: string;
	baseURL: string;
	model: string;
	messages: ModelMessage[];
}
type AssistantContent = Exclude<AssistantModelMessage['content'], string>;
type TextualPart = Extract<AssistantContent[number], { type: 'text' | 'reasoning' }>;

/** SDK messages are authoritative at step end. Partial checkpoints retain only completed tool pairs. */
export class ProtocolRecorder {
	private completed: ModelMessage[] = [];
	private assistant: AssistantContent = [];
	private results: ToolModelMessage['content'] = [];
	private readonly parts = new Map<string, TextualPart>();
	private readonly steps: ModelMessage[][] = [];

	step(messages: ModelMessage[]): void { this.steps.push(messages); }
	finishStep(): void {
		const messages = this.steps.shift();
		if (!messages) { throw new Error('incomplete-protocol-step'); }
		const matched = new Set(messages.flatMap(message => message.role === 'tool' ? message.content.filter(part => part.type === 'tool-result').map(part => part.toolCallId) : []));
		this.completed.push(...messages.map(message => message.role === 'assistant' && Array.isArray(message.content) ? { ...message, content: message.content.filter(part => part.type !== 'tool-call' || matched.has(part.toolCallId)) } : message));
		this.assistant = []; this.results = []; this.parts.clear();
	}
	text(type: 'text' | 'reasoning', id: string, text: string, metadata?: ProviderMetadata): void {
		const key = `${type}:${id}`;
		let part = this.parts.get(key);
		if (!part) {
			const created: TextualPart = type === 'text' ? { type: 'text', text: '' } : { type: 'reasoning', text: '' };
			this.parts.set(key, created); this.assistant.push(created); part = created;
		}
		part.text += text;
		if (metadata) { part.providerOptions = metadata; }
	}
	call(part: AssistantContent[number]): void { this.assistant.push(part); }
	result(part: ToolModelMessage['content'][number]): void { this.results.push(part); }
	get messages(): ModelMessage[] {
		const matched = new Set(this.results.filter(part => part.type === 'tool-result').map(part => part.toolCallId));
		const content = this.assistant.filter(part => part.type !== 'tool-call' || matched.has(part.toolCallId));
		return [...this.completed, ...(content.length ? [{ role: 'assistant' as const, content }] : []), ...(this.results.length ? [{ role: 'tool' as const, content: this.results }] : [])];
	}
}

/** A model switch preserves ordinary text/tool context, but not another endpoint's private reasoning metadata. */
export function replayProtocol(turn: ProtocolTurn, source?: { provider: string; baseURL?: string }): ModelMessage[] {
	if (!source || (source.provider === turn.provider && source.baseURL === turn.baseURL)) { return structuredClone(turn.messages); }
	return turn.messages.map(message => {
		const common = structuredClone(message);
		delete common.providerOptions;
		if (typeof common.content === 'string') { return common; }
		return { ...common, content: common.content.filter(part => part.type !== 'reasoning').map(part => {
			const content = { ...part };
			delete (content as { providerOptions?: unknown }).providerOptions;
			return content;
		}) } as ModelMessage;
	});
}

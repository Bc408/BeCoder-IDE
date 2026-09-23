/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

export interface Message {
	id: number;
	role: 'user' | 'assistant';
	text: string;
	reasoning: string;
	status: 'complete' | 'streaming' | 'stopped' | 'error';
}

export interface Snapshot {
	messages: Message[];
	busy: boolean;
	error: string;
	canRetry: boolean;
}

export type Delta = { type: 'text' | 'reasoning'; text: string };
export type Generate = (messages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>, signal: AbortSignal) => AsyncIterable<Delta>;

/** The extension host owns history. Failed/interrupted responses never enter model context. */
export class ChatSession {
	private messages: Message[] = [];
	private controller: AbortController | undefined;
	private sequence = 0;
	private error = '';
	private disposed = false;

	constructor(private readonly changed: (snapshot: Snapshot) => void, private readonly describeError: (error: unknown) => string) { }

	get snapshot(): Snapshot {
		return { messages: this.messages.map(message => ({ ...message })), busy: !!this.controller, error: this.error, canRetry: !this.controller && ['error', 'stopped'].includes(this.messages.at(-1)?.status ?? '') };
	}

	private publish(): void {
		if (!this.disposed) { this.changed(this.snapshot); }
	}

	async send(text: string, generate: Generate, retry = false): Promise<void> {
		if (this.disposed || this.controller) { return; }
		if (retry) {
			if (!this.snapshot.canRetry) { return; }
			this.messages.pop();
		} else {
			text = text.trim();
			if (!text || text.length > 32000) { return; }
			this.messages.push({ id: ++this.sequence, role: 'user', text, reasoning: '', status: 'complete' });
		}
		const context = this.messages.filter(message => message.status === 'complete' && message.text).map(message => ({ role: message.role, content: message.text }));
		const reply: Message = { id: ++this.sequence, role: 'assistant', text: '', reasoning: '', status: 'streaming' };
		this.messages.push(reply);
		const controller = new AbortController();
		this.controller = controller;
		this.error = '';
		this.publish();
		try {
			for await (const delta of generate(context, controller.signal)) {
				if (controller.signal.aborted) { break; }
				if (delta.type === 'text') { reply.text += delta.text; } else { reply.reasoning += delta.text; }
				this.publish();
			}
			if (!controller.signal.aborted && !reply.text.trim()) { throw new Error('empty-response'); }
			reply.status = controller.signal.aborted ? 'stopped' : 'complete';
		} catch (error) {
			reply.status = controller.signal.aborted ? 'stopped' : 'error';
			if (!controller.signal.aborted) { this.error = this.describeError(error); }
		} finally {
			this.controller = undefined;
			this.publish();
		}
	}

	stop(): void { this.controller?.abort(); }

	clear(): void {
		if (this.controller) { return; }
		this.messages = [];
		this.error = '';
		this.publish();
	}

	dispose(): void { this.disposed = true; this.stop(); }
}

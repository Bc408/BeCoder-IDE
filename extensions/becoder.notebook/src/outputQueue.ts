/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface OutputPart { phase: 'compiling' | 'running'; stream: 'stdout' | 'stderr' | 'merged'; text: string }
export { AnsiStream } from './ansiStream';
export class CellOutputQueue {
	private pending: OutputPart[] = [];
	private generation = 0;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private tail = Promise.resolve();
	private failure: unknown;
	constructor(private readonly write: (parts: OutputPart[]) => Promise<void>) { }
	append(part: OutputPart): void {
		const previous = this.pending.at(-1);
		if (previous?.phase === part.phase && previous.stream === part.stream) { previous.text += part.text; }
		else { this.pending.push({ ...part }); }
		this.timer ??= setTimeout(() => this.drain(), 100);
	}
	clear(): void { this.generation++; this.pending = []; if (this.timer) { clearTimeout(this.timer); this.timer = undefined; } }
	private drain(): void {
		if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
		const parts = this.pending; this.pending = []; const generation = this.generation;
		if (parts.length) { this.tail = this.tail.then(async () => { if (generation === this.generation && !this.failure) { await this.write(parts); } }).catch(error => { this.failure = error; }); }
	}
	async flush(): Promise<void> { this.drain(); await this.tail; if (this.failure) { throw this.failure; } }
}

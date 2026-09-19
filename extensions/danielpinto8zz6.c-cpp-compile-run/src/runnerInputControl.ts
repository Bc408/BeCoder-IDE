/*---------------------------------------------------------------------------------------------
 * Copyright (c) 2026 BeCoder contributors.
 * Licensed under GPL-3.0-or-later; see ../LICENSE.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as net from 'net';

/** Request-private control channel; never shares bytes with program output. */
export class RunnerInputControl {
	readonly pipe = `\\\\.\\pipe\\becoder-input-${process.pid}-${crypto.randomUUID()}`;
	private readonly server: net.Server;
	private socket: net.Socket | undefined;
	private buffer = '';
	private started = false;
	private exitCode: number | undefined;
	private failure: Error | undefined;
	private settle: () => void = () => undefined;
	private readonly ended = new Promise<void>(resolve => this.settle = resolve);
	private timer: NodeJS.Timeout | undefined;

	constructor(private readonly onStarted: (pid: number) => void, private readonly onFailure: () => void) {
		this.server = net.createServer(socket => {
			if (this.socket) { socket.destroy(); return; }
			this.socket = socket;
			socket.setEncoding('utf8');
			socket.on('data', data => this.read(String(data)));
			socket.on('error', error => this.fail(error));
			socket.on('close', () => { this.clearTimer(); this.settle(); });
		});
	}

	async listen(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			this.server.once('error', reject);
			this.server.listen(this.pipe, () => { this.server.removeListener('error', reject); resolve(); });
		});
		this.server.on('error', error => this.fail(error));
	}

	armStartupTimeout(): void {
		if (!this.started) {
			this.timer = setTimeout(() => this.fail(new Error('Runner input helper did not start the program within 15 seconds.')), 15000);
		}
	}

	private clearTimer(): void {
		if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
	}

	private fail(error: Error): void {
		if (this.failure) { return; }
		this.failure = error;
		this.clearTimer();
		this.socket?.destroy();
		this.settle();
		this.onFailure();
	}

	private read(data: string): void {
		this.buffer += data;
		if (this.buffer.length > 4096) { this.fail(new Error('Runner helper control message exceeded its limit.')); return; }
		let newline: number;
		while ((newline = this.buffer.indexOf('\n')) !== -1) {
			const line = this.buffer.slice(0, newline);
			this.buffer = this.buffer.slice(newline + 1);
			try {
				const message = JSON.parse(line);
				if (message.type === 'started' && !this.started && Number.isInteger(message.pid) && message.pid > 0) {
					this.started = true;
					this.clearTimer();
					this.onStarted(message.pid);
					this.socket?.write('G');
				} else if (message.type === 'exit' && this.started && this.exitCode === undefined && Number.isInteger(message.code) && message.code >= 0 && message.code <= 0xFFFFFFFF) {
					this.exitCode = message.code;
				} else if (message.type === 'error' && typeof message.stage === 'string' && Number.isInteger(message.code)) {
					throw new Error(`Runner input helper failed (${message.stage}, Windows error ${message.code}).`);
				} else {
					throw new Error('Invalid Runner input helper control message.');
				}
			} catch (error) {
				this.fail(error instanceof Error ? error : new Error(String(error)));
				return;
			}
		}
	}

	async result(): Promise<number> {
		// PTY exit and pipe close use different callbacks. Bound their drain wait.
		let timeout: NodeJS.Timeout | undefined;
		try {
			await Promise.race([this.ended, new Promise<void>(resolve => timeout = setTimeout(resolve, 1000))]);
			if (this.failure) { throw this.failure; }
			if (this.exitCode === undefined) { throw new Error('Runner input helper exited without a program result.'); }
			return this.exitCode;
		} finally {
			if (timeout) { clearTimeout(timeout); }
		}
	}

	async dispose(): Promise<void> {
		this.clearTimer();
		this.socket?.destroy();
		this.settle();
		await new Promise<void>(resolve => this.server.close(() => resolve()));
	}
}

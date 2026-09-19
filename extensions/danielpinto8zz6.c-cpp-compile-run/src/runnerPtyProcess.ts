/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type IDisposable, type IPty, type IWindowsPtyForkOptions } from 'node-pty';

export type RunnerPtySpawnOptions = {
	readonly file: string;
	readonly args: readonly string[];
	readonly cwd: string;
	readonly env: Record<string, string>;
	readonly cols: number;
	readonly rows: number;
	readonly inheritCursor?: boolean;
};

export type RunnerPtyProcessDependencies = {
	readonly spawn: typeof spawn;
};

export type RunnerPtyExit = {
	readonly exitCode: number;
	readonly signal?: number;
};

export type RunnerPtyProcessCallbacks = {
	readonly onData: (data: string) => void;
	readonly onExit: (exit: RunnerPtyExit) => void;
};

// node-pty 1.2.0-beta.13 defers Windows operations until the first output,
// even after the input/output pipes are connected. A silent program must
// accept input and cancellation too. Keep this compatibility seam separate
// from the session and do not modify installed/generated dependency files.
const defaultDependencies: RunnerPtyProcessDependencies = {
	spawn: (file, args, options) => {
		if (process.platform === 'win32' && require('node-pty/package.json').version !== '1.2.0-beta.13') {
			throw new Error('Runner ConPTY compatibility must be reviewed for this node-pty version.');
		}
		const pty = spawn(file, args, options);
		if (process.platform === 'win32') {
			const windowsPty = pty as IPty & {
				_socket: { once(event: string, callback: () => void): void };
				_isReady: boolean;
				_deferreds: Array<{ run(): void }>;
			};
			windowsPty._socket.once('ready_datapipe', () => {
				if (typeof windowsPty._isReady !== 'boolean' || !Array.isArray(windowsPty._deferreds)) {
					throw new Error('Unexpected node-pty readiness state.');
				}
				if (windowsPty._isReady) {
					return;
				}
				windowsPty._isReady = true;
				const pending = windowsPty._deferreds;
				windowsPty._deferreds = [];
				for (const operation of pending) {
					operation.run();
				}
			});
		}
		return pty;
	}
};

/**
 * Owns one user-program ConPTY session. The owner must dispose it after the
 * exit callback or when the terminal is closed.
 */
export class RunnerPtyProcess implements IDisposable {
	private readonly pty: IPty;
	private readonly subscriptions: IDisposable[] = [];
	private disposed = false;
	private exited = false;
	private killRequested = false;

	constructor(
		options: RunnerPtySpawnOptions,
		callbacks: RunnerPtyProcessCallbacks,
		dependencies: RunnerPtyProcessDependencies = defaultDependencies
	) {
		const env = { ...options.env };
		for (const key of Object.keys(env)) {
			if (['NO_COLOR', 'TERM', 'COLORTERM'].includes(key.toUpperCase())) {
				delete env[key];
			}
		}
		env.TERM = 'xterm-256color';
		env.COLORTERM = 'truecolor';
		this.pty = dependencies.spawn(options.file, [...options.args], {
			cwd: options.cwd,
			env,
			cols: options.cols,
			rows: options.rows,
			useConpty: true,
			conptyInheritCursor: options.inheritCursor ?? false,
			name: env.TERM ?? 'BeCoder Runner'
		} as IWindowsPtyForkOptions);
		this.subscriptions.push(
			this.pty.onData(callbacks.onData),
			this.pty.onExit(exit => {
				if (this.exited) {
					return;
				}
				this.exited = true;
				callbacks.onExit({ exitCode: exit.exitCode, signal: exit.signal });
			})
		);
	}

	write(data: string): boolean {
		if (this.disposed || this.exited || this.killRequested) {
			return false;
		}
		this.pty.write(data);
		return true;
	}

	resize(cols: number, rows: number): boolean {
		if (this.disposed || this.exited || this.killRequested || !Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
			return false;
		}
		this.pty.resize(cols, rows);
		return true;
	}

	kill(): boolean {
		if (this.disposed || this.exited || this.killRequested) {
			return false;
		}
		this.pty.kill();
		this.killRequested = true;
		return true;
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const subscription of this.subscriptions) {
			subscription.dispose();
		}
		this.subscriptions.length = 0;
		// Windows ConPTY still owns native resources and a conout worker after
		// the program exit event. Match the core terminal's post-exit cleanup.
		if (!this.killRequested) {
			this.pty.kill();
			this.killRequested = true;
		}
	}
}

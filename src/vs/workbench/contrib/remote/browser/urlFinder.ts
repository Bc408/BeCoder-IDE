/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { RunOnceWorker } from '../../../../base/common/async.js';

export class UrlFinder extends Disposable {
	/**
	 * Debounce time in ms before processing accumulated terminal data.
	 */
	private static readonly dataDebounceTimeout = 500;

	/**
	 * Maximum amount of data to accumulate before skipping URL detection.
	 * When data exceeds this threshold, it indicates high-throughput scenarios
	 * (like games or animations) where URL detection is unlikely to find useful results.
	 */
	private static readonly maxDataLength = 10000;
	/**
	 * Local server url pattern matching following urls:
	 * http://localhost:3000/ - commonly used across multiple frameworks
	 * https://127.0.0.1:5001/ - ASP.NET
	 * http://:8080 - Beego Golang
	 * http://0.0.0.0:4000 - Elixir Phoenix
	 */
	private static readonly localUrlRegex = /\b\w{0,20}(?::\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|:\d{2,5})[\w\-\.\~:\/\?\#[\]\@!\$&\(\)\*\+\,\;\=]*/gim;
	private static readonly extractPortRegex = /(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})/;
	/**
	 * https://github.com/microsoft/vscode-remote-release/issues/3949
	 */
	private static readonly localPythonServerRegex = /HTTP\son\s(127\.0\.0\.1|0\.0\.0\.0)\sport\s(\d+)/;

	private static readonly excludeTerminals = ['Dev Containers'];

	private readonly _onDidMatchLocalUrl = this._register(new Emitter<{ host: string; port: number }>());
	readonly onDidMatchLocalUrl = this._onDidMatchLocalUrl.event;
	private readonly listeners: Map<ITerminalInstance | string, IDisposable> = new Map();
	private readonly terminalDataWorkers = this._register(new DisposableMap<ITerminalInstance, RunOnceWorker<string>>());

	constructor(terminalService: ITerminalService) {
		super();
		// Terminal
		terminalService.instances.forEach(instance => {
			this.registerTerminalInstance(instance);
		});
		this._register(terminalService.onDidCreateInstance(instance => {
			this.registerTerminalInstance(instance);
		}));
		this._register(terminalService.onDidDisposeInstance(instance => {
			this.listeners.get(instance)?.dispose();
			this.listeners.delete(instance);
			this.terminalDataWorkers.deleteAndDispose(instance);
		}));
	}

	private registerTerminalInstance(instance: ITerminalInstance) {
		if (!UrlFinder.excludeTerminals.includes(instance.title)) {
			this.listeners.set(instance, instance.onData(data => {
				this.getOrCreateWorker(instance).work(data);
			}));
		}
	}

	private getOrCreateWorker(instance: ITerminalInstance): RunOnceWorker<string> {
		let worker = this.terminalDataWorkers.get(instance);
		if (!worker) {
			worker = new RunOnceWorker<string>(chunks => this.processTerminalData(chunks), UrlFinder.dataDebounceTimeout);
			this.terminalDataWorkers.set(instance, worker);
		}
		return worker;
	}

	private processTerminalData(chunks: string[]): void {
		// Skip processing if data exceeds threshold (high-throughput scenario like games)
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
		if (totalLength > UrlFinder.maxDataLength) {
			return;
		}
		this.processData(chunks.join(''));
	}

	override dispose() {
		super.dispose();
		for (const listener of this.listeners.values()) {
			listener.dispose();
		}
	}

	private processData(data: string) {
		// strip ANSI terminal codes
		data = removeAnsiEscapeCodes(data);
		const urlMatches = data.match(UrlFinder.localUrlRegex) || [];
		if (urlMatches && urlMatches.length > 0) {
			urlMatches.forEach((match) => {
				// check if valid url
				let serverUrl;
				try {
					serverUrl = new URL(match);
				} catch (e) {
					// Not a valid URL
				}
				if (serverUrl) {
					// check if the port is a valid integer value
					const portMatch = match.match(UrlFinder.extractPortRegex);
					const port = parseFloat(serverUrl.port ? serverUrl.port : (portMatch ? portMatch[2] : 'NaN'));
					if (!isNaN(port) && Number.isInteger(port) && port > 0 && port <= 65535) {
						// normalize the host name
						let host = serverUrl.hostname;
						if (host !== '0.0.0.0' && host !== '127.0.0.1') {
							host = 'localhost';
						}
						// Exclude node inspect, except when using default port
						if (port !== 9229 && data.startsWith('Debugger listening on')) {
							return;
						}
						this._onDidMatchLocalUrl.fire({ port, host });
					}
				}
			});
		} else {
			// Try special python case
			const pythonMatch = data.match(UrlFinder.localPythonServerRegex);
			if (pythonMatch && pythonMatch.length === 3) {
				this._onDidMatchLocalUrl.fire({ host: pythonMatch[1], port: Number(pythonMatch[2]) });
			}
		}
	}
}

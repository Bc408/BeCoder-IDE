/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import type { Connection, ProviderId } from './connection';
export interface ProviderTestSnapshot {
	id: string; revision: number; running: boolean;
	provider?: ProviderId;
	models: { id: string; status: 'waiting' | 'running' | 'success' | 'failure' | 'cancelled'; error?: string }[];
}
export class ProviderTests {
	private state: ProviderTestSnapshot | undefined;
	private controller: AbortController | undefined;
	private disposed = false;
	constructor(private readonly probe: (connection: Connection, signal: AbortSignal) => Promise<void>, private readonly changed: () => void, private readonly describeError: (error: unknown) => string = () => 'Connection test failed.') {}
	get snapshot(): ProviderTestSnapshot | undefined { return this.state && structuredClone(this.state); }
	get running(): boolean { return !!this.state?.running; }
	private publish(): void { if (!this.disposed) { this.changed(); } }
	async start(connections: readonly Connection[], revision: number): Promise<void> {
		if (this.disposed || this.running) { throw new Error('settings-pending'); }
		const frozen = structuredClone(connections);
		const controller = new AbortController(); this.controller = controller;
		const state: ProviderTestSnapshot = { id: randomUUID(), revision, provider: frozen[0]?.provider, running: true, models: frozen.map(connection => ({ id: connection.model, status: 'waiting' })) };
		this.state = state; this.publish();
		try {
			for (const [index, connection] of frozen.entries()) {
				const item = state.models[index];
				if (controller.signal.aborted) { item.status = 'cancelled'; continue; }
				item.status = 'running'; this.publish();
				try { await this.probe(connection, AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])); item.status = controller.signal.aborted ? 'cancelled' : 'success'; }
				catch (error) { item.status = controller.signal.aborted ? 'cancelled' : 'failure'; if (!controller.signal.aborted) { item.error = this.describeError(error); } }
				this.publish();
			}
		} finally { state.running = false; if (this.controller === controller) { this.controller = undefined; } this.publish(); }
	}
	cancel(id?: string): void { if (!id || this.state?.id === id) { this.controller?.abort(); } }
	clear(): void { this.cancel(); this.state = undefined; }
	dispose(): void { this.disposed = true; this.cancel(); }
}

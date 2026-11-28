/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IProblemStatementCacheService } from '../common/ojStatementCache.js';
import { OjStatementCacheOwner, OjStatementCacheStore } from '../node/ojStatementCache.js';
// eslint-disable-next-line local/code-import-patterns -- Internal statement transport types.
import type { ProblemRef, StatementContent, StatementLanguage, StatementRead, StatementVersion } from 'becoder-oj-connect';

export class OjStatementCacheService extends Disposable implements IProblemStatementCacheService {
	declare readonly _serviceBrand: undefined;
	private readonly owner: OjStatementCacheOwner;
	private readonly windows = this._register(new DisposableMap<number, DisposableStore>());
	constructor(
		@IEnvironmentMainService environment: IEnvironmentMainService,
		@IWindowsMainService private readonly windowService: IWindowsMainService,
		@ILifecycleMainService lifecycle: ILifecycleMainService
	) {
		super();
		this.owner = new OjStatementCacheOwner(new OjStatementCacheStore(environment.userDataPath));
		for (const window of windowService.getWindows()) { this.watch(window); }
		this._register(windowService.onDidOpenWindow(window => this.watch(window)));
		this._register(windowService.onDidDestroyWindow(window => { this.owner.resetWindow(window.id); this.windows.deleteAndDispose(window.id); }));
		this._register(lifecycle.onWillShutdown(event => event.join('problemStatements.shutdown', this.owner.store.flush())));
	}
	private watch(window: ICodeWindow): void {
		if (this.windows.has(window.id)) { return; }
		const listeners = new DisposableStore(); this.windows.set(window.id, listeners);
		listeners.add(window.onWillLoad(() => this.owner.resetWindow(window.id)));
		listeners.add(window.onDidClose(() => { this.owner.resetWindow(window.id); this.windows.deleteAndDispose(window.id); }));
	}
	private check(windowId: number): void { if (!this.windowService.getWindowById(windowId)) { throw new Error('statement-translation-owner'); } }
	read(windowId: number, ref: ProblemRef, language: StatementLanguage) { this.check(windowId); return this.owner.read(ref, language); }
	merge(windowId: number, document: StatementContent) { this.check(windowId); return this.owner.merge(document); }
	publishAcquired(windowId: number, document: StatementContent) { this.check(windowId); return this.owner.publishAcquired(document); }
	acquireTranslation(windowId: number, source: StatementRead, target: StatementLanguage) { this.check(windowId); return this.owner.acquireTranslation(windowId, source, target); }
	publishTranslation(windowId: number, ticketId: string, version: StatementVersion) { this.check(windowId); return this.owner.publishTranslation(windowId, ticketId, version); }
	async releaseTranslation(windowId: number, ticketId: string): Promise<void> { this.owner.releaseTranslation(windowId, ticketId); }
	override dispose(): void { for (const id of this.windows.keys()) { this.owner.resetWindow(id); } super.dispose(); }
}

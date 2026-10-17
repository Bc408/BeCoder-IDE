/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { IStateService } from '../../state/node/state.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { BeaconMode, IBeaconContextService, IBeaconConversation, IBeaconResume } from '../common/beaconContext.js';
import { BeaconCoordinator } from '../node/beaconCoordinator.js';
import type { BeaconProducer, IBeaconContext } from '../common/beaconContextTypes.js';

export class BeaconContextMainService extends Disposable implements IBeaconContextService {
	declare readonly _serviceBrand: undefined;
	private readonly changed = this._register(new Emitter<number>());
	readonly onDidChange = this.changed.event;
	private readonly coordinator: BeaconCoordinator;
	private readonly watched = new Map<number, DisposableStore>();

	constructor(
		@IWindowsMainService private readonly windowsService: IWindowsMainService,
		@IStateService state: IStateService,
		@ILifecycleMainService lifecycle: ILifecycleMainService,
		@ILogService private readonly log: ILogService
	) {
		super();
		this.coordinator = new BeaconCoordinator({
			getSelection: id => {
				const configuration = this.windowsService.getWindowById(id)?.config;
				if (!configuration) { return undefined; }
				return configuration.beaconSelection ??= { slot: generateUuid(), mode: 'blackout' };
			},
			saveSelection: (id, selection) => this.windowsService.updateBeaconWindowSelection(id, selection),
			getRecent: () => { const value = state.getItem<unknown>('becoderBeaconRecentRoots'); return Array.isArray(value) ? value.filter((root): root is string => typeof root === 'string' && !!root) : []; },
			saveRecent: roots => state.setItem('becoderBeaconRecentRoots', roots),
			changed: id => this.changed.fire(id)
		});
		for (const window of windowsService.getWindows()) { this.watchWindow(window); }
		this._register(lifecycle.onWillShutdown(event => event.join('beacon.resume', Promise.resolve().then(() => this.coordinator.flushResume()))));
		this._register(windowsService.onDidOpenWindow(window => this.watchWindow(window)));
		this._register(windowsService.onDidDestroyWindow(window => {
			this.watched.get(window.id)?.dispose(); this.watched.delete(window.id);
			void this.coordinator.closeWindow(window.id).catch(error => this.log.error('Beacon window release', error));
		}));
		this._register(toDisposable(() => {
			for (const store of this.watched.values()) { store.dispose(); } this.watched.clear();
			void this.coordinator.dispose().catch(error => this.log.error('Beacon shutdown', error));
		}));
	}

	private watchWindow(window: ICodeWindow): void {
		if (this.watched.has(window.id)) { return; }
		const disposables = new DisposableStore();
		disposables.add(window.onDidClose(() => {
			void this.coordinator.closeWindow(window.id, true).catch(error => this.log.error('Beacon window resume', error));
			disposables.dispose(); this.watched.delete(window.id);
		}));
		disposables.add(window.onWillLoad(() => { void this.coordinator.resetWindow(window.id).catch(error => this.log.error('Beacon reload release', error)); }));
		this.watched.set(window.id, disposables);
	}

	getContext(windowId: number) { return this.coordinator.getContext(windowId); }
	getResume(windowId: number) { return this.coordinator.getResume(windowId); }
	setView(windowId: number, view: IBeaconResume) { return this.coordinator.setView(windowId, view); }
	selectWorkspace(windowId: number, root: string) { return this.coordinator.selectWorkspace(windowId, root); }
	clearWorkspace(windowId: number) { return this.coordinator.clearWorkspace(windowId); }
	removeRecentWorkspace(windowId: number, root: string) { return this.coordinator.removeRecentWorkspace(windowId, root); }
	setMode(windowId: number, mode: BeaconMode) { return this.coordinator.setMode(windowId, mode); }
	async setBusy(windowId: number, busy: boolean): Promise<void> { this.coordinator.setBusy(windowId, busy); }
	async beginRuntimeActivity(windowId: number): Promise<string> { return this.coordinator.beginRuntimeActivity(windowId); }
	async endRuntimeActivity(windowId: number, handle: string): Promise<void> { this.coordinator.endRuntimeActivity(windowId, handle); }
	beginActivity(windowId: number, source: string) { return this.coordinator.beginActivity(windowId, source); }
	endActivity(windowId: number, handle: string) { return this.coordinator.endActivity(windowId, handle); }
	reportNotebooks(windowId: number, files: { file: string; dirty: boolean }[]) { return this.coordinator.reportNotebooks(windowId, files); }
	notebookReadonly(windowId: number, files: string[]) { return this.coordinator.notebookReadonly(windowId, files); }
	beginNotebookRun(windowId: number, file: string) { return this.coordinator.beginNotebookRun(windowId, file); }
	beginNotebookEdit(windowId: number, file: string, scope: IBeaconContext) { return this.coordinator.beginNotebookEdit(windowId, file, scope); }
	beginNotebookCreate(windowId: number, file: string, scope: IBeaconContext) { return this.coordinator.beginNotebookCreate(windowId, file, scope); }
	verifyNotebookEdit(windowId: number, handle: string) { return this.coordinator.verifyNotebookEdit(windowId, handle); }
	endNotebookResource(windowId: number, handle: string) { return this.coordinator.endNotebookResource(windowId, handle); }
	startRuntime(windowId: number, handle: string, producer: BeaconProducer, source: string, code: string, events: unknown[]) { return this.coordinator.startRuntime(windowId, handle, producer, source, code, events); }
	appendRuntime(windowId: number, handle: string, sequence: number, events: unknown[]) { return this.coordinator.appendRuntime(windowId, handle, sequence, events); }
	listRuntime(windowId: number, producer: BeaconProducer, scope: IBeaconContext) { return this.coordinator.listRuntime(windowId, producer, scope); }
	consumeRuntime(windowId: number, producer: BeaconProducer, id: string, revision: number, scope: IBeaconContext) { return this.coordinator.consumeRuntime(windowId, producer, id, revision, scope); }
	readConsumed(windowId: number, materialId: string, scope: IBeaconContext) { return this.coordinator.readConsumed(windowId, materialId, scope); }
	checkPageAccess(windowId: number, file: string) { return this.coordinator.checkPageAccess(windowId, file); }
	async resetWindow(windowId: number): Promise<void> { await this.coordinator.resetWindow(windowId); this.changed.fire(windowId); }
	listHistory(windowId: number) { return this.coordinator.listHistory(windowId); }
	openConversation(windowId: number, id: string, create?: boolean) { return this.coordinator.openConversation(windowId, id, create); }
	saveConversation(windowId: number, data: IBeaconConversation, revision: number) { return this.coordinator.saveConversation(windowId, data, revision); }
	renameConversation(windowId: number, id: string, title: string) { return this.coordinator.renameConversation(windowId, id, title); }
	deleteConversation(windowId: number, id: string) { return this.coordinator.deleteConversation(windowId, id); }
	releaseConversation(windowId: number) { return this.coordinator.releaseConversation(windowId); }
}

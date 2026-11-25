/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { beaconContextChannel, beaconContextCommand, IBeaconContextService, IBeaconConversation } from '../../../../platform/beacon/common/beaconContext.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IBrowserViewService, ipcBrowserViewChannelName } from '../../../../platform/browserView/common/browserView.js';
import { BeaconWorkbenchPages } from './beaconPages.js';
import type { IBeaconContext, IBeaconResume, IBeaconCollectionScope, BeaconRecordKind, IBeaconRecordByKind, IBeaconRecordWrite } from '../../../../platform/beacon/common/beaconContextTypes.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';

let pageProvider: BeaconWorkbenchPages | undefined;

/** The window identifier comes from this workbench, never from model or webview arguments. */
CommandsRegistry.registerCommand(beaconContextCommand, (accessor, operation: unknown, input: unknown) => {
	const service = ProxyChannel.toService<IBeaconContextService>(accessor.get(IMainProcessService).getChannel(beaconContextChannel));
	const windowId = mainWindow.vscodeWindowId;
	const recent = input as { collectionScope?: IBeaconCollectionScope } | undefined;
	const value = input as { root?: string; source?: string; handle?: string; producer?: 'runner' | 'cph' | 'notebook'; code?: string; events?: unknown[]; sequence?: number; mode?: unknown; retainConversation?: boolean; busy?: boolean; id?: string; create?: boolean; title?: string; revision?: number; data?: IBeaconConversation; scope?: IBeaconContext; version?: string; view?: IBeaconResume } | undefined;
	const pages = () => pageProvider ??= new BeaconWorkbenchPages(accessor.get(IEditorService), accessor.get(IModelService), ProxyChannel.toService<IBrowserViewService>(accessor.get(IMainProcessService).getChannel(ipcBrowserViewChannelName)), service, windowId, accessor.get(INotebookService));
	const semantic = input as { kind?: BeaconRecordKind; record?: IBeaconRecordByKind[BeaconRecordKind]; collectionScope?: IBeaconCollectionScope; scope?: IBeaconContext; handle?: string; id?: string } | undefined;
	switch (operation) {
		case 'visibleCurrentCode': return pages().readVisibleCurrentCode();
		case 'captureProblemRecord': if (semantic?.record && semantic.collectionScope) { return service.captureProblemRecord(windowId, semantic.record as IBeaconRecordWrite<'problem'>, semantic.collectionScope); } break;
		case 'captureVerdict': if (semantic?.record && semantic.collectionScope) { return service.captureVerdict(windowId, semantic.record as IBeaconRecordWrite<'verdict'>, semantic.collectionScope); } break;
		case 'captureRun': if (semantic?.record && semantic.handle) { return service.captureRun(windowId, semantic.handle, semantic.record as IBeaconRecordWrite<'run'>); } break;
		case 'listRecords': if (semantic?.kind && semantic.scope) { return service.listRecords(windowId, semantic.kind, semantic.scope); } break;
		case 'readRecord': if (semantic?.kind && semantic.id && semantic.scope) { return service.readRecord(windowId, semantic.kind, semantic.id, semantic.scope); } break;
		case 'context': return service.getContext(windowId);
		case 'resume': return service.getResume(windowId);
		case 'view': if (value?.view) { return service.setView(windowId, value.view); } break;
		case 'select': if (typeof value?.root === 'string') { return service.selectWorkspace(windowId, value.root); } break;
		case 'clearWorkspace': return service.clearWorkspace(windowId);
		case 'removeRecentWorkspace': if (typeof value?.root === 'string') { return service.removeRecentWorkspace(windowId, value.root); } break;
		case 'mode': if (value?.mode === 'blackout' || value?.mode === 'spot' || value?.mode === 'flood') { return service.setMode(windowId, value.mode, value.retainConversation === true); } break;
		case 'busy': if (typeof value?.busy === 'boolean') { return service.setBusy(windowId, value.busy); } break;
		case 'beginRuntimeActivity': return service.beginRuntimeActivity(windowId);
		case 'endRuntimeActivity': if (typeof value?.handle === 'string') { return service.endRuntimeActivity(windowId, value.handle); } break;
		case 'captureCollectionScope': return service.captureCollectionScope(windowId);
		case 'beginActivity': if (typeof value?.source === 'string') { return service.beginActivity(windowId, value.source, recent?.collectionScope); } break;
		case 'endActivity': if (typeof value?.handle === 'string') { return service.endActivity(windowId, value.handle); } break;
		case 'pages': return pages().pages.list();
		case 'checkPageAccess': if (typeof value?.source === 'string') { return service.checkPageAccess(windowId, value.source); } break;
		case 'page': if (typeof value?.id === 'string' && typeof value.version === 'string') { return pages().pages.read(value.id, value.version, 0, Number.MAX_SAFE_INTEGER); } break;
		case 'history': return service.listHistory(windowId);
		case 'open': if (typeof value?.id === 'string') { return service.openConversation(windowId, value.id, value.create === true); } break;
		case 'save': if (value?.data && typeof value.revision === 'number') { return service.saveConversation(windowId, value.data, value.revision, value.scope); } break;
		case 'consumeDraft': if (typeof value?.id === 'string' && typeof value.revision === 'number') { return service.consumeDraft(windowId, value.id, value.revision); } break;
		case 'rename': if (typeof value?.id === 'string' && typeof value.title === 'string') { return service.renameConversation(windowId, value.id, value.title); } break;
		case 'delete': if (typeof value?.id === 'string') { return service.deleteConversation(windowId, value.id); } break;
		case 'release': return service.releaseConversation(windowId);
	}
	throw new Error('beacon-invalid-command');
});

class BeaconContextContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.beaconContext';
	constructor(
		@IMainProcessService mainProcess: IMainProcessService,
		@ICommandService commands: ICommandService,
		@IExtensionService extensions: IExtensionService,
		@ILifecycleService lifecycle: ILifecycleService,
		@ILogService log: ILogService
	) {
		super();
		this._register({ dispose: () => { pageProvider?.dispose(); pageProvider = undefined; } });
		const service = ProxyChannel.toService<IBeaconContextService>(mainProcess.getChannel(beaconContextChannel));
		this._register(service.onDidChange(id => {
			if ((id === 0 || id === mainWindow.vscodeWindowId) && CommandsRegistry.getCommand('_becoder.beacon.contextChanged')) {
				void commands.executeCommand('_becoder.beacon.contextChanged').catch(error => log.error('Beacon context update', error));
			}
		}));
		this._register(extensions.onWillStop(event => {
			if (CommandsRegistry.getCommand('_becoder.beacon.shutdown')) {
				event.veto(commands.executeCommand('_becoder.beacon.shutdown').then(() => false, error => { log.error('Beacon extension shutdown', error); return false; }), 'Beacon conversation save');
			}
		}));
		// Save while the extension host is still running. onWillShutdown stops hosts concurrently.
		this._register(lifecycle.onBeforeShutdown(event => {
			if (CommandsRegistry.getCommand('_becoder.beacon.flush')) {
				event.veto(commands.executeCommand('_becoder.beacon.flush').then(() => false, error => { log.error('Beacon window save', error); return false; }), 'beacon.drafts');
			}
		}));
		this._register(extensions.onDidChangeExtensionsStatus(ids => {
			const owners = new Set(['becoder.beacon', 'becoder.cph', 'becoder.runner', 'becoder.notebook']);
			const status = extensions.getExtensionsStatus();
			if (ids.some(id => owners.has(id.value.toLowerCase()) && !status[id.value]?.activationTimes)) {
				void service.resetWindow(mainWindow.vscodeWindowId).catch(error => log.error('Beacon extension host release', error));
			}
		}));
	}
}

registerWorkbenchContribution2(BeaconContextContribution.ID, BeaconContextContribution, WorkbenchPhase.AfterRestored);

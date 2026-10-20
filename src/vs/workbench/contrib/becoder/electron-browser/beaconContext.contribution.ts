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
import type { IBeaconContext, IBeaconResume } from '../../../../platform/beacon/common/beaconContextTypes.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';

let pageProvider: BeaconWorkbenchPages | undefined;

/** The window identifier comes from this workbench, never from model or webview arguments. */
CommandsRegistry.registerCommand(beaconContextCommand, (accessor, operation: unknown, input: unknown) => {
	const service = ProxyChannel.toService<IBeaconContextService>(accessor.get(IMainProcessService).getChannel(beaconContextChannel));
	const windowId = mainWindow.vscodeWindowId;
	const value = input as { root?: string; source?: string; handle?: string; producer?: 'runner' | 'cph' | 'notebook'; code?: string; events?: unknown[]; sequence?: number; mode?: unknown; retainConversation?: boolean; busy?: boolean; id?: string; create?: boolean; title?: string; revision?: number; data?: IBeaconConversation; scope?: IBeaconContext; version?: string; view?: IBeaconResume } | undefined;
	const pages = () => pageProvider ??= new BeaconWorkbenchPages(accessor.get(IEditorService), accessor.get(IModelService), ProxyChannel.toService<IBrowserViewService>(accessor.get(IMainProcessService).getChannel(ipcBrowserViewChannelName)), service, windowId, accessor.get(INotebookService));
	switch (operation) {
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
		case 'beginActivity': if (typeof value?.source === 'string') { return service.beginActivity(windowId, value.source); } break;
		case 'endActivity': if (typeof value?.handle === 'string') { return service.endActivity(windowId, value.handle); } break;
		case 'startRuntime': if (typeof value?.handle === 'string' && (value.producer === 'runner' || value.producer === 'cph' || value.producer === 'notebook') && typeof value.source === 'string' && typeof value.code === 'string' && Array.isArray(value.events)) { return service.startRuntime(windowId, value.handle, value.producer, value.source, value.code, value.events); } break;
		case 'appendRuntime': if (typeof value?.handle === 'string' && typeof value.sequence === 'number' && Array.isArray(value.events)) { return service.appendRuntime(windowId, value.handle, value.sequence, value.events); } break;
		case 'pages': return pages().pages.list();
		case 'checkPageAccess': if (typeof value?.source === 'string') { return service.checkPageAccess(windowId, value.source); } break;
		case 'page': if (typeof value?.id === 'string' && typeof value.version === 'string') { return pages().pages.read(value.id, value.version, 0, Number.MAX_SAFE_INTEGER); } break;
		case 'runtimeList': if (value?.scope && (value.producer === 'runner' || value.producer === 'cph' || value.producer === 'notebook')) { return service.listRuntime(windowId, value.producer, value.scope); } break;
		case 'runtimeRead': if (value?.scope && typeof value.id === 'string' && typeof value.revision === 'number' && (value.producer === 'runner' || value.producer === 'cph' || value.producer === 'notebook')) { return service.consumeRuntime(windowId, value.producer, value.id, value.revision, value.scope); } break;
		case 'materialRead': if (value?.scope && typeof value.id === 'string') { return service.readConsumed(windowId, value.id, value.scope); } break;
		case 'history': return service.listHistory(windowId);
		case 'open': if (typeof value?.id === 'string') { return service.openConversation(windowId, value.id, value.create === true); } break;
		case 'save': if (value?.data && typeof value.revision === 'number') { return service.saveConversation(windowId, value.data, value.revision); } break;
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

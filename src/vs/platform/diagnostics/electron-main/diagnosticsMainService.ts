/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, BrowserWindow } from 'electron';
import { URI } from '../../../base/common/uri.js';
import { IGPULogMessage, IMainProcessDiagnostics, IProcessDiagnostics, IWindowDiagnostics } from '../common/diagnostics.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { getAllWindowsExcludingOffscreen, IWindowsMainService } from '../../windows/electron-main/windows.js';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IWorkspacesManagementMainService } from '../../workspaces/electron-main/workspacesManagementMainService.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { ILogService } from '../../log/common/log.js';
import { UtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';

export const ID = 'diagnosticsMainService';
export const IDiagnosticsMainService = createDecorator<IDiagnosticsMainService>(ID);

export interface IDiagnosticsMainService {
	readonly _serviceBrand: undefined;
	getMainDiagnostics(): Promise<IMainProcessDiagnostics>;
}

export class DiagnosticsMainService implements IDiagnosticsMainService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IWorkspacesManagementMainService private readonly workspacesManagementMainService: IWorkspacesManagementMainService,
		@ILogService private readonly logService: ILogService
	) { }

	async getMainDiagnostics(): Promise<IMainProcessDiagnostics> {
		this.logService.trace('Received request for main process info from other instance.');

		const windows: IWindowDiagnostics[] = [];
		for (const window of getAllWindowsExcludingOffscreen()) {
			const codeWindow = this.windowsMainService.getWindowById(window.id);
			if (codeWindow) {
				windows.push(await this.codeWindowToInfo(codeWindow));
			} else {
				windows.push(this.browserWindowToInfo(window));
			}
		}

		const pidToNames: IProcessDiagnostics[] = [];
		for (const { pid, name } of UtilityProcess.getAll()) {
			pidToNames.push({ pid, name });
		}

		type AppWithGPULogMethod = typeof app & {
			getGPULogMessages(): IGPULogMessage[];
		};

		let gpuLogMessages: IGPULogMessage[] = [];
		const customApp = app as AppWithGPULogMethod;
		if (typeof customApp.getGPULogMessages === 'function') {
			gpuLogMessages = customApp.getGPULogMessages();
		}

		return {
			mainPID: process.pid,
			mainArguments: process.argv.slice(1),
			windows,
			pidToNames,
			screenReader: !!app.accessibilitySupportEnabled,
			gpuFeatureStatus: app.getGPUFeatureStatus(),
			gpuLogMessages
		};
	}

	private async codeWindowToInfo(window: ICodeWindow): Promise<IWindowDiagnostics> {
		const folderURIs = await this.getFolderURIs(window);
		const win = assertReturnsDefined(window.win);

		return this.browserWindowToInfo(win, folderURIs);
	}

	private browserWindowToInfo(window: BrowserWindow, folderURIs: URI[] = []): IWindowDiagnostics {
		return {
			id: window.id,
			pid: window.webContents.getOSProcessId(),
			title: window.getTitle(),
			folderURIs
		};
	}

	private async getFolderURIs(window: ICodeWindow): Promise<URI[]> {
		const folderURIs: URI[] = [];

		const workspace = window.openedWorkspace;
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			folderURIs.push(workspace.uri);
		} else if (isWorkspaceIdentifier(workspace)) {
			const resolvedWorkspace = await this.workspacesManagementMainService.resolveLocalWorkspace(workspace.configPath); // workspace folders can only be shown for local (resolved) workspaces
			if (resolvedWorkspace) {
				const rootFolders = resolvedWorkspace.folders;
				rootFolders.forEach(root => {
					folderURIs.push(root.uri);
				});
			}
		}

		return folderURIs;
	}
}

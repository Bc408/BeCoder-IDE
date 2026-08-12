/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../base/common/collections.js';
import { ProcessItem } from '../../../base/common/processes.js';
import { UriComponents } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IWorkspace } from '../../workspace/common/workspace.js';

export const ID = 'diagnosticsService';
export const IDiagnosticsService = createDecorator<IDiagnosticsService>(ID);

export interface IDiagnosticsService {
	readonly _serviceBrand: undefined;

	getPerformanceInfo(mainProcessInfo: IMainProcessDiagnostics, options?: { skipCache?: boolean; unbounded?: boolean }): Promise<PerformanceInfo>;
	getSystemInfo(mainProcessInfo: IMainProcessDiagnostics): Promise<SystemInfo>;
	getDiagnostics(mainProcessInfo: IMainProcessDiagnostics): Promise<string>;
	getWorkspaceFileExtensions(workspace: IWorkspace): Promise<{ extensions: string[] }>;
	reportWorkspaceStats(workspace: IWorkspaceInformation): Promise<void>;
}

export interface IMachineInfo {
	os: string;
	cpus?: string;
	memory: string;
	vmHint: string;
	linuxEnv?: ILinuxEnv;
}

export interface ILinuxEnv {
	desktopSession?: string;
	xdgSessionDesktop?: string;
	xdgCurrentDesktop?: string;
	xdgSessionType?: string;
}

export interface IDiagnosticInfo {
	machineInfo: IMachineInfo;
	workspaceMetadata?: IStringDictionary<WorkspaceStats>;
	processes?: ProcessItem;
}
export interface SystemInfo extends IMachineInfo {
	processArgs: string;
	gpuStatus: any;
	screenReader: string;
	load?: string;
}

export interface IDiagnosticInfoOptions {
	includeProcesses?: boolean;
	folders?: UriComponents[];
}

export interface WorkspaceStatItem {
	name: string;
	count: number;
}

export interface WorkspaceStats {
	fileTypes: WorkspaceStatItem[];
	configFiles: WorkspaceStatItem[];
	fileCount: number;
	maxFilesReached: boolean;
	totalScanTime: number;
	totalReaddirCount: number;
}

export interface PerformanceInfo {
	processInfo?: string;
	workspaceInfo?: string;
}

export interface IWorkspaceInformation extends IWorkspace {
	telemetryId: string | undefined;
	rendererSessionId: string;
}

export class NullDiagnosticsService implements IDiagnosticsService {
	_serviceBrand: undefined;

	async getPerformanceInfo(mainProcessInfo: IMainProcessDiagnostics, options?: { skipCache?: boolean; unbounded?: boolean }): Promise<PerformanceInfo> {
		return {};
	}

	async getSystemInfo(mainProcessInfo: IMainProcessDiagnostics): Promise<SystemInfo> {
		return {
			processArgs: 'nullProcessArgs',
			gpuStatus: 'nullGpuStatus',
			screenReader: 'nullScreenReader',
			os: 'nullOs',
			memory: 'nullMemory',
			vmHint: 'nullVmHint',
		};
	}

	async getDiagnostics(mainProcessInfo: IMainProcessDiagnostics): Promise<string> {
		return '';
	}

	async getWorkspaceFileExtensions(workspace: IWorkspace): Promise<{ extensions: string[] }> {
		return { extensions: [] };
	}

	async reportWorkspaceStats(workspace: IWorkspaceInformation): Promise<void> { }

}

export interface IWindowDiagnostics {
	readonly id: number;
	readonly pid: number;
	readonly title: string;
	readonly folderURIs: UriComponents[];
}

export interface IProcessDiagnostics {
	readonly pid: number;
	readonly name: string;
}

export interface IGPULogMessage {
	readonly header: string;
	readonly message: string;
}

export interface IMainProcessDiagnostics {
	readonly mainPID: number;
	readonly mainArguments: string[]; // All arguments after argv[0], the exec path
	readonly windows: IWindowDiagnostics[];
	readonly pidToNames: IProcessDiagnostics[];
	readonly screenReader: boolean;
	readonly gpuFeatureStatus: any;
	readonly gpuLogMessages: IGPULogMessage[];
}

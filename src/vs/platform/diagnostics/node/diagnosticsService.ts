/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as osLib from 'os';
import { Promises } from '../../../base/common/async.js';
import { Schemas } from '../../../base/common/network.js';
import { basename, join } from '../../../base/common/path.js';
import { isLinux, isWindows } from '../../../base/common/platform.js';
import { ProcessItem } from '../../../base/common/processes.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { URI } from '../../../base/common/uri.js';
import { virtualMachineHint } from '../../../base/node/id.js';
import { IDirent, Promises as pfs } from '../../../base/node/pfs.js';
import { listProcesses } from '../../../base/node/ps.js';
import { IDiagnosticsService, IMachineInfo, IMainProcessDiagnostics, IWorkspaceInformation, PerformanceInfo, SystemInfo, WorkspaceStatItem, WorkspaceStats } from '../common/diagnostics.js';
import { ByteSize } from '../../files/common/files.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IWorkspace } from '../../workspace/common/workspace.js';

interface ConfigFilePatterns {
	tag: string;
	filePattern: RegExp;
	relativePathPattern?: RegExp;
}

const workspaceStatsCache = new Map<string, Promise<WorkspaceStats>>();

/** Sentinel key in {@link WorkspaceStats.fileTypes} for files with no extension. */
const NO_EXT_KEY = '\0no-extension';

export async function collectWorkspaceStats(folder: string, filter: string[], options?: { skipCache?: boolean; unbounded?: boolean }): Promise<WorkspaceStats> {
	// Include `unbounded` in the cache key so a bounded (20k-cap) result is never
	// returned for an unbounded request (which would silently truncate counts).
	const cacheKey = `${folder}::${filter.join(':')}::${options?.unbounded ? 'unbounded' : 'bounded'}`;
	if (!options?.skipCache) {
		const cached = workspaceStatsCache.get(cacheKey);
		if (cached) {
			return cached;
		}
	} else {
		// Drop any in-flight or stale entry so callers can be sure they get fresh data.
		workspaceStatsCache.delete(cacheKey);
	}

	const configFilePatterns: ConfigFilePatterns[] = [
		{ tag: 'grunt.js', filePattern: /^gruntfile\.js$/i },
		{ tag: 'gulp.js', filePattern: /^gulpfile\.js$/i },
		{ tag: 'tsconfig.json', filePattern: /^tsconfig\.json$/i },
		{ tag: 'package.json', filePattern: /^package\.json$/i },
		{ tag: 'jsconfig.json', filePattern: /^jsconfig\.json$/i },
		{ tag: 'tslint.json', filePattern: /^tslint\.json$/i },
		{ tag: 'eslint.json', filePattern: /^eslint\.json$/i },
		{ tag: 'tasks.json', filePattern: /^tasks\.json$/i },
		{ tag: 'settings.json', filePattern: /^settings\.json$/i },
		{ tag: 'webpack.config.js', filePattern: /^webpack\.config\.js$/i },
		{ tag: 'project.json', filePattern: /^project\.json$/i },
		{ tag: 'makefile', filePattern: /^makefile$/i },
		{ tag: 'sln', filePattern: /^.+\.sln$/i },
		{ tag: 'csproj', filePattern: /^.+\.csproj$/i },
		{ tag: 'cmake', filePattern: /^.+\.cmake$/i },
		{ tag: 'github-actions', filePattern: /^.+\.ya?ml$/i, relativePathPattern: /^\.github(?:\/|\\)workflows$/i },
		{ tag: 'devcontainer.json', filePattern: /^devcontainer\.json$/i },
		{ tag: 'dockerfile', filePattern: /^(dockerfile|docker\-compose\.ya?ml)$/i },
	];

	const fileTypes = new Map<string, number>();
	const configFiles = new Map<string, number>();

	const MAX_FILES = options?.unbounded ? Number.POSITIVE_INFINITY : 20000;

	function collect(root: string, dir: string, filter: string[], token: { count: number; maxReached: boolean; readdirCount: number }): Promise<void> {
		const relativePath = dir.substring(root.length + 1);

		return Promises.withAsyncBody(async resolve => {
			// Bail before touching the filesystem when the cap has already been hit so
			// sibling-directory recursion doesn't pay readdir IO after the scan is
			// effectively done.
			if (token.count >= MAX_FILES) {
				token.maxReached = true;
				resolve();
				return;
			}

			let files: IDirent[];

			token.readdirCount++;
			try {
				files = await pfs.readdir(dir, { withFileTypes: true });
			} catch (error) {
				// Ignore folders that can't be read
				resolve();
				return;
			}

			if (token.count >= MAX_FILES) {
				token.maxReached = true;
				resolve();
				return;
			}

			let pending = files.length;
			if (pending === 0) {
				resolve();
				return;
			}

			for (const file of files) {
				if (file.isDirectory()) {
					if (!filter.includes(file.name)) {
						await collect(root, join(dir, file.name), filter, token);
					}

					if (--pending === 0) {
						resolve();
						return;
					}
				} else {
					if (token.count >= MAX_FILES) {
						token.maxReached = true;
						resolve();
						return;
					}
					token.count++;

					const index = file.name.lastIndexOf('.');
					let fileType: string | undefined;
					if (index >= 0) {
						fileType = file.name.substring(index + 1) || undefined;
					}
					// Track files with no usable extension under a sentinel key so they
					// can be folded into the "other" bucket at render time. Without this,
					// extension-less files (Makefile, LICENSE, scripts in bin/, etc.) would
					// be silently dropped from the file-type counts and the totals would
					// not reconcile with the overall file count.
					fileTypes.set(fileType ?? NO_EXT_KEY, (fileTypes.get(fileType ?? NO_EXT_KEY) ?? 0) + 1);

					for (const configFile of configFilePatterns) {
						if (configFile.relativePathPattern?.test(relativePath) !== false && configFile.filePattern.test(file.name)) {
							configFiles.set(configFile.tag, (configFiles.get(configFile.tag) ?? 0) + 1);
						}
					}

					if (--pending === 0) {
						resolve();
						return;
					}
				}
			}
		});
	}

	const statsPromise = Promises.withAsyncBody<WorkspaceStats>(async (resolve) => {
		const token: { count: number; maxReached: boolean; readdirCount: number } = { count: 0, maxReached: false, readdirCount: 0 };
		const sw = new StopWatch(true);
		await collect(folder, folder, filter, token);
		resolve({
			configFiles: asSortedItems(configFiles),
			fileTypes: asSortedItems(fileTypes),
			fileCount: token.count,
			maxFilesReached: token.maxReached,
			totalScanTime: sw.elapsed(),
			totalReaddirCount: token.readdirCount
		});
	});

	workspaceStatsCache.set(cacheKey, statsPromise);
	return statsPromise;
}

function asSortedItems(items: Map<string, number>): WorkspaceStatItem[] {
	return Array.from(items.entries(), ([name, count]) => ({ name: name, count: count }))
		.sort((a, b) => b.count - a.count);
}

export function getMachineInfo(): IMachineInfo {

	const machineInfo: IMachineInfo = {
		os: `${osLib.type()} ${osLib.arch()} ${osLib.release()}`,
		memory: `${(osLib.totalmem() / ByteSize.GB).toFixed(2)}GB (${(osLib.freemem() / ByteSize.GB).toFixed(2)}GB free)`,
		vmHint: `${Math.round((virtualMachineHint.value() * 100))}%`,
	};

	const cpus = osLib.cpus();
	if (cpus && cpus.length > 0) {
		machineInfo.cpus = `${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`;
	}

	return machineInfo;
}

export class DiagnosticsService implements IDiagnosticsService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService
	) { }

	private formatEnvironment(info: IMainProcessDiagnostics): string {
		const output: string[] = [];
		output.push(`Version:          ${this.productService.nameShort} ${this.productService.version} (${this.productService.commit || 'Commit unknown'}, ${this.productService.date || 'Date unknown'})`);
		output.push(`OS Version:       ${osLib.type()} ${osLib.arch()} ${osLib.release()}`);
		const cpus = osLib.cpus();
		if (cpus && cpus.length > 0) {
			output.push(`CPUs:             ${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`);
		}
		output.push(`Memory (System):  ${(osLib.totalmem() / ByteSize.GB).toFixed(2)}GB (${(osLib.freemem() / ByteSize.GB).toFixed(2)}GB free)`);
		if (!isWindows) {
			output.push(`Load (avg):       ${osLib.loadavg().map(l => Math.round(l)).join(', ')}`); // only provided on Linux/macOS
		}
		output.push(`VM:               ${Math.round((virtualMachineHint.value() * 100))}%`);
		output.push(`Screen Reader:    ${info.screenReader ? 'yes' : 'no'}`);
		output.push(`Process Argv:     ${info.mainArguments.join(' ')}`);
		output.push(`GPU Status:       ${this.expandGPUFeatures(info.gpuFeatureStatus)}`);
		if (info.gpuLogMessages && info.gpuLogMessages.length > 0) {
			output.push(`GPU Log Messages:`);
			info.gpuLogMessages.forEach(msg => {
				output.push(`${msg.header}: ${msg.message}`);
			});
		}

		return output.join('\n');
	}

	public async getPerformanceInfo(info: IMainProcessDiagnostics, options?: { skipCache?: boolean; unbounded?: boolean }): Promise<PerformanceInfo> {
		return Promise.all([listProcesses(info.mainPID), this.formatWorkspaceMetadata(info, options)]).then(async result => {
			const [rootProcess, workspaceInfo] = result;
			const processInfo = this.formatProcessList(info, rootProcess);

			return {
				processInfo,
				workspaceInfo
			};
		});
	}

	public async getSystemInfo(info: IMainProcessDiagnostics): Promise<SystemInfo> {
		const { memory, vmHint, os, cpus } = getMachineInfo();
		const systemInfo: SystemInfo = {
			os,
			memory,
			cpus,
			vmHint,
			processArgs: `${info.mainArguments.join(' ')}`,
			gpuStatus: info.gpuFeatureStatus,
			screenReader: `${info.screenReader ? 'yes' : 'no'}`
		};

		if (!isWindows) {
			systemInfo.load = `${osLib.loadavg().map(l => Math.round(l)).join(', ')}`;
		}

		if (isLinux) {
			systemInfo.linuxEnv = {
				desktopSession: process.env['DESKTOP_SESSION'],
				xdgSessionDesktop: process.env['XDG_SESSION_DESKTOP'],
				xdgCurrentDesktop: process.env['XDG_CURRENT_DESKTOP'],
				xdgSessionType: process.env['XDG_SESSION_TYPE']
			};
		}

		return Promise.resolve(systemInfo);
	}

	public async getDiagnostics(info: IMainProcessDiagnostics): Promise<string> {
		const output: string[] = [];
		return listProcesses(info.mainPID).then(async rootProcess => {

			// Environment Info
			output.push('');
			output.push(this.formatEnvironment(info));

			// Process List
			output.push('');
			output.push(this.formatProcessList(info, rootProcess));

			// Workspace Stats
			if (info.windows.some(window => window.folderURIs && window.folderURIs.length > 0)) {
				output.push('');
				output.push('Workspace Stats: ');
				output.push(await this.formatWorkspaceMetadata(info));
			}

			output.push('');
			output.push('');

			return output.join('\n');
		});
	}

	private formatWorkspaceStats(workspaceStats: WorkspaceStats): string {
		const output: string[] = [];
		const lineLength = 60;
		let col = 0;

		const appendAndWrap = (name: string, count: number) => {
			const item = ` ${name}(${count})`;

			if (col + item.length > lineLength) {
				output.push(line);
				line = '|                 ';
				col = line.length;
			}
			else {
				col += item.length;
			}
			line += item;
		};

		// File Types
		// Skip the no-extension sentinel from the named list and fold its count into
		// the "other" bucket so totals reconcile with fileCount.
		let line = '|      File types:';
		const maxShown = 10;
		const namedTypes = workspaceStats.fileTypes.filter(t => t.name !== NO_EXT_KEY);
		const noExtCount = workspaceStats.fileTypes
			.filter(t => t.name === NO_EXT_KEY)
			.reduce((sum, t) => sum + t.count, 0);
		const max = Math.min(namedTypes.length, maxShown);
		for (let i = 0; i < max; i++) {
			const item = namedTypes[i];
			appendAndWrap(item.name, item.count);
		}
		let otherCount = noExtCount;
		for (let i = max; i < namedTypes.length; i++) {
			otherCount += namedTypes[i].count;
		}
		if (otherCount > 0) {
			appendAndWrap('other', otherCount);
		}
		output.push(line);

		// Conf Files
		if (workspaceStats.configFiles.length >= 0) {
			line = '|      Conf files:';
			col = 0;
			workspaceStats.configFiles.forEach((item) => {
				appendAndWrap(item.name, item.count);
			});
			output.push(line);
		}

		return output.join('\n');
	}

	private expandGPUFeatures(gpuFeatures: Record<string, string>): string {
		const longestFeatureName = Math.max(...Object.keys(gpuFeatures).map(feature => feature.length));
		// Make columns aligned by adding spaces after feature name
		return Object.keys(gpuFeatures).map(feature => `${feature}:  ${' '.repeat(longestFeatureName - feature.length)}  ${gpuFeatures[feature]}`).join('\n                  ');
	}

	private formatWorkspaceMetadata(info: IMainProcessDiagnostics, options?: { skipCache?: boolean; unbounded?: boolean }): Promise<string> {
		const output: string[] = [];
		const workspaceStatPromises: Promise<void>[] = [];

		info.windows.forEach(window => {
			if (window.folderURIs.length === 0) {
				return;
			}

			output.push(`|  Window (${window.title})`);

			window.folderURIs.forEach(uriComponents => {
				const folderUri = URI.revive(uriComponents);
				if (folderUri.scheme === Schemas.file) {
					const folder = folderUri.fsPath;
					workspaceStatPromises.push(collectWorkspaceStats(folder, ['node_modules', '.git'], options).then(stats => {
						let countMessage = `${stats.fileCount} files`;
						if (stats.maxFilesReached) {
							countMessage = `more than ${countMessage}`;
						}
						output.push(`|    Folder (${basename(folder)}): ${countMessage}`);
						output.push(this.formatWorkspaceStats(stats));

					}).catch(error => {
						output.push(`|      Error: Unable to collect workspace stats for folder ${folder} (${error.toString()})`);
					}));
				} else {
					output.push(`|    Folder (${folderUri.toString()}): Workspace stats not available.`);
				}
			});
		});

		return Promise.all(workspaceStatPromises)
			.then(_ => output.join('\n'))
			.catch(e => `Unable to collect workspace stats: ${e}`);
	}

	private formatProcessList(info: IMainProcessDiagnostics, rootProcess: ProcessItem): string {
		const mapProcessToName = new Map<number, string>();
		info.windows.forEach(window => mapProcessToName.set(window.pid, `window [${window.id}] (${window.title})`));
		info.pidToNames.forEach(({ pid, name }) => mapProcessToName.set(pid, name));

		const output: string[] = [];

		output.push('CPU %\tMem MB\t   PID\tProcess');

		if (rootProcess) {
			this.formatProcessItem(info.mainPID, mapProcessToName, output, rootProcess, 0);
		}

		return output.join('\n');
	}

	private formatProcessItem(mainPid: number, mapProcessToName: Map<number, string>, output: string[], item: ProcessItem, indent: number): void {
		const isRoot = (indent === 0);

		// Format name with indent
		let name: string;
		if (isRoot) {
			name = item.pid === mainPid ? this.productService.applicationName : 'remote-server';
		} else {
			if (mapProcessToName.has(item.pid)) {
				name = mapProcessToName.get(item.pid)!;
			} else {
				name = `${'  '.repeat(indent)} ${item.name}`;
			}
		}

		const memory = process.platform === 'win32' ? item.mem : (osLib.totalmem() * (item.mem / 100));
		output.push(`${item.load.toFixed(0).padStart(5, ' ')}\t${(memory / ByteSize.MB).toFixed(0).padStart(6, ' ')}\t${item.pid.toFixed(0).padStart(6, ' ')}\t${name}`);

		// Recurse into children if any
		if (Array.isArray(item.children)) {
			item.children.forEach(child => this.formatProcessItem(mainPid, mapProcessToName, output, child, indent + 1));
		}
	}

	public async getWorkspaceFileExtensions(workspace: IWorkspace): Promise<{ extensions: string[] }> {
		const items = new Set<string>();
		for (const { uri } of workspace.folders) {
			const folderUri = URI.revive(uri);
			if (folderUri.scheme !== Schemas.file) {
				continue;
			}
			const folder = folderUri.fsPath;
			try {
				const stats = await collectWorkspaceStats(folder, ['node_modules', '.git']);
				stats.fileTypes.forEach(item => {
					if (item.name !== NO_EXT_KEY) {
						items.add(item.name);
					}
				});
			} catch { }
		}
		return { extensions: [...items] };
	}

	public async reportWorkspaceStats(workspace: IWorkspaceInformation): Promise<void> {
		for (const { uri } of workspace.folders) {
			const folderUri = URI.revive(uri);
			if (folderUri.scheme !== Schemas.file) {
				continue;
			}

			const folder = folderUri.fsPath;
			try {
				const stats = await collectWorkspaceStats(folder, ['node_modules', '.git']);
				type WorkspaceStatsClassification = {
					owner: 'lramos15';
					comment: 'Metadata related to the workspace';
					'workspace.id': { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A UUID given to a workspace to identify it.' };
					rendererSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the session' };
				};
				type WorkspaceStatsEvent = {
					'workspace.id': string | undefined;
					rendererSessionId: string;
				};
				this.telemetryService.publicLog2<WorkspaceStatsEvent, WorkspaceStatsClassification>('workspace.stats', {
					'workspace.id': workspace.telemetryId,
					rendererSessionId: workspace.rendererSessionId
				});
				type WorkspaceStatsFileClassification = {
					owner: 'lramos15';
					comment: 'Helps us gain insights into what type of files are being used in a workspace';
					rendererSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the session.' };
					type: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of file' };
					count: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How many types of that file are present' };
				};
				type WorkspaceStatsFileEvent = {
					rendererSessionId: string;
					type: string;
					count: number;
				};
				stats.fileTypes.forEach(e => {
					if (e.name === NO_EXT_KEY) {
						return;
					}
					this.telemetryService.publicLog2<WorkspaceStatsFileEvent, WorkspaceStatsFileClassification>('workspace.stats.file', {
						rendererSessionId: workspace.rendererSessionId,
						type: e.name,
						count: e.count
					});
				});
				stats.configFiles.forEach(e => {
					this.telemetryService.publicLog2<WorkspaceStatsFileEvent, WorkspaceStatsFileClassification>('workspace.stats.configFiles', {
						rendererSessionId: workspace.rendererSessionId,
						type: e.name,
						count: e.count
					});
				});

				// Workspace stats metadata
				type WorkspaceStatsMetadataClassification = {
					owner: 'jrieken';
					comment: 'Metadata about workspace metadata collection';
					duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'How did it take to make workspace stats' };
					reachedLimit: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Did making workspace stats reach its limits' };
					fileCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'How many files did workspace stats discover' };
					readdirCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'How many readdir call were needed' };
				};
				type WorkspaceStatsMetadata = {
					duration: number;
					reachedLimit: boolean;
					fileCount: number;
					readdirCount: number;
				};
				this.telemetryService.publicLog2<WorkspaceStatsMetadata, WorkspaceStatsMetadataClassification>('workspace.stats.metadata', { duration: stats.totalScanTime, reachedLimit: stats.maxFilesReached, fileCount: stats.fileCount, readdirCount: stats.totalReaddirCount });
			} catch {
				// Report nothing if collecting metadata fails.
			}
		}
	}
}

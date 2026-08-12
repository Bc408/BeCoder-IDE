/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWhenWindowIdle } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { isCI } from '../../../../base/common/platform.js';
import * as nls from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionKind } from '../../../../platform/environment/common/environment.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService, IPromptChoice, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { IWebWorkerExtensionHostDataProvider, IWebWorkerExtensionHostInitData, WebWorkerExtensionHost } from '../browser/webWorkerExtensionHost.js';
import { AbstractExtensionService, ExtensionHostCrashTracker, IExtensionHostFactory, LocalExtensions, ResolvedExtensions, checkEnabledAndProposedAPI } from '../common/abstractExtensionService.js';
import { ExtensionDescriptionRegistrySnapshot } from '../common/extensionDescriptionRegistry.js';
import { parseExtensionDevOptions } from '../common/extensionDevOptions.js';
import { ExtensionHostKind, IExtensionHostKindPicker, extensionHostKindToString } from '../common/extensionHostKind.js';
import { IExtensionHostManager } from '../common/extensionHostManagers.js';
import { ExtensionHostExitCode } from '../common/extensionHostProtocol.js';
import { IExtensionManifestPropertiesService } from '../common/extensionManifestPropertiesService.js';
import { ExtensionRunningLocation, LocalProcessRunningLocation, LocalWebWorkerRunningLocation } from '../common/extensionRunningLocation.js';
import { ExtensionRunningLocationTracker, filterExtensionDescriptions } from '../common/extensionRunningLocationTracker.js';
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionHost, IExtensionService, WebWorkerExtHostConfigValue, webWorkerExtHostConfig } from '../common/extensions.js';
import { ExtensionsProposedApi } from '../common/extensionsProposedApi.js';
import { CachedExtensionScanner } from './cachedExtensionScanner.js';
import { ILocalProcessExtensionHostDataProvider, ILocalProcessExtensionHostInitData, NativeLocalProcessExtensionHost } from './localProcessExtensionHost.js';
import { IHostService } from '../../host/browser/host.js';
import { ILifecycleService, LifecyclePhase } from '../../lifecycle/common/lifecycle.js';
import { AsyncIterableEmitter, AsyncIterableProducer } from '../../../../base/common/async.js';

export class NativeExtensionService extends AbstractExtensionService implements IExtensionService {

	private readonly _extensionScanner: CachedExtensionScanner;
	private readonly _localCrashTracker = new ExtensionHostCrashTracker();

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchExtensionEnablementService extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService,
		@IWorkbenchExtensionManagementService extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@ILogService logService: ILogService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IDialogService dialogService: IDialogService,
	) {
		const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
		const extensionScanner = instantiationService.createInstance(CachedExtensionScanner);
		const extensionHostFactory = new NativeExtensionHostFactory(
			extensionsProposedApi,
			extensionScanner,
			() => this._getExtensionRegistrySnapshotWhenReady(),
			instantiationService,
			environmentService,
			extensionEnablementService,
			configurationService,
			logService
		);
		super(
			{ hasLocalProcess: true },
			extensionsProposedApi,
			extensionHostFactory,
			new NativeExtensionHostKindPicker(environmentService, configurationService, logService),
			instantiationService,
			notificationService,
			environmentService,
			telemetryService,
			extensionEnablementService,
			fileService,
			productService,
			extensionManagementService,
			contextService,
			configurationService,
			extensionManifestPropertiesService,
			logService,
			lifecycleService,
			dialogService
		);

		this._extensionScanner = extensionScanner;

		// delay extension host creation and extension scanning
		// until the workbench is running. we cannot defer the
		// extension host more (LifecyclePhase.Restored) because
		// some editors require the extension host to restore
		// and this would result in a deadlock
		// see https://github.com/microsoft/vscode/issues/41322
		lifecycleService.when(LifecyclePhase.Ready).then(() => {
			// reschedule to ensure this runs after restoring viewlets, panels, and editors
			runWhenWindowIdle(mainWindow, () => {
				this._initializeIfNeeded();
			}, 50 /*max delay*/);
		});
	}

	private async _scanAllLocalExtensions(): Promise<IExtensionDescription[]> {
		return this._extensionScanner.scannedExtensions;
	}

	protected override _onExtensionHostCrashed(extensionHost: IExtensionHostManager, code: number, signal: string | null): void {

		const activatedExtensions: ExtensionIdentifier[] = [];
		const extensionsStatus = this.getExtensionsStatus();
		for (const key of Object.keys(extensionsStatus)) {
			const extensionStatus = extensionsStatus[key];
			if (extensionStatus.activationStarted && extensionHost.containsExtension(extensionStatus.id)) {
				activatedExtensions.push(extensionStatus.id);
			}
		}

		super._onExtensionHostCrashed(extensionHost, code, signal);

		if (extensionHost.kind === ExtensionHostKind.LocalProcess) {
			if (code === ExtensionHostExitCode.VersionMismatch) {
				this._notificationService.prompt(
					Severity.Error,
					nls.localize('extensionService.versionMismatchCrash', "Extension host cannot start: version mismatch."),
					[{
						label: nls.localize('relaunch', "Relaunch VS Code"),
						run: () => {
							this._instantiationService.invokeFunction((accessor) => {
								const hostService = accessor.get(IHostService);
								hostService.restart();
							});
						}
					}]
				);
				return;
			}

			this._logExtensionHostCrash(extensionHost);
			this._sendExtensionHostCrashTelemetry(code, signal, activatedExtensions);

			this._localCrashTracker.registerCrash();

			if (this._localCrashTracker.shouldAutomaticallyRestart()) {
				this._logService.info(`Automatically restarting the extension host.`);
				this._notificationService.status(nls.localize('extensionService.autoRestart', "The extension host terminated unexpectedly. Restarting..."), { hideAfter: 5000 });
				this.startExtensionHosts();
			} else {
				const choices: IPromptChoice[] = [];
				if (this._environmentService.isBuilt) {
					choices.push({
						label: nls.localize('startBisect', "Start Extension Bisect"),
						run: () => {
							this._instantiationService.invokeFunction(accessor => {
								const commandService = accessor.get(ICommandService);
								commandService.executeCommand('extension.bisect.start');
							});
						}
					});
				} else {
					choices.push({
						label: nls.localize('devTools', "Open Developer Tools"),
						run: () => this._nativeHostService.openDevTools()
					});
				}

				choices.push({
					label: nls.localize('restart', "Restart Extension Host"),
					run: () => this.startExtensionHosts()
				});

				if (this._environmentService.isBuilt) {
					choices.push({
						label: nls.localize('learnMore', "Learn More"),
						run: () => {
							this._instantiationService.invokeFunction(accessor => {
								const openerService = accessor.get(IOpenerService);
								openerService.open('https://aka.ms/vscode-extension-bisect');
							});
						}
					});
				}

				this._notificationService.prompt(Severity.Error, nls.localize('extensionService.crash', "Extension host terminated unexpectedly 3 times within the last 5 minutes."), choices);
			}
		}
	}

	private _sendExtensionHostCrashTelemetry(code: number, signal: string | null, activatedExtensions: ExtensionIdentifier[]): void {
		type ExtensionHostCrashClassification = {
			owner: 'alexdima';
			comment: 'The extension host has terminated unexpectedly';
			code: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The exit code of the extension host process.' };
			signal: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The signal that caused the extension host process to exit.' };
			extensionIds: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The list of loaded extensions.' };
		};
		type ExtensionHostCrashEvent = {
			code: number;
			signal: string | null;
			extensionIds: string[];
		};
		this._telemetryService.publicLog2<ExtensionHostCrashEvent, ExtensionHostCrashClassification>('extensionHostCrash', {
			code,
			signal,
			extensionIds: activatedExtensions.map(e => e.value)
		});

		for (const extensionId of activatedExtensions) {
			type ExtensionHostCrashExtensionClassification = {
				owner: 'alexdima';
				comment: 'The extension host has terminated unexpectedly';
				code: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The exit code of the extension host process.' };
				signal: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The signal that caused the extension host process to exit.' };
				extensionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the extension.' };
			};
			type ExtensionHostCrashExtensionEvent = {
				code: number;
				signal: string | null;
				extensionId: string;
			};
			this._telemetryService.publicLog2<ExtensionHostCrashExtensionEvent, ExtensionHostCrashExtensionClassification>('extensionHostCrashExtension', {
				code,
				signal,
				extensionId: extensionId.value
			});
		}
	}

	// --- impl

	protected _resolveExtensions(): AsyncIterable<ResolvedExtensions> {
		return new AsyncIterableProducer(emitter => this._doResolveExtensions(emitter));
	}

	private async _doResolveExtensions(emitter: AsyncIterableEmitter<ResolvedExtensions>): Promise<void> {
		this._extensionScanner.startScanningExtensions();
		await this._workspaceTrustManagementService.workspaceTrustInitialized;
		emitter.emitOne(new LocalExtensions(await this._scanAllLocalExtensions()));
	}

	protected async _onExtensionHostExit(code: number): Promise<void> {
		// Dispose everything associated with the extension host
		await this._doStopExtensionHosts();

		if (parseExtensionDevOptions(this._environmentService).isExtensionDevTestFromCli) {
			// When CLI testing make sure to exit with proper exit code
			if (isCI) {
				this._logService.info(`Asking native host service to exit with code ${code}.`);
			}
			this._nativeHostService.exit(code);
		} else {
			// Expected development extension termination: When the extension host goes down we also shutdown the window
			this._nativeHostService.closeWindow();
		}
	}

}

class NativeExtensionHostFactory implements IExtensionHostFactory {

	private readonly _webWorkerExtHostEnablement: LocalWebWorkerExtHostEnablement;

	constructor(
		private readonly _extensionsProposedApi: ExtensionsProposedApi,
		private readonly _extensionScanner: CachedExtensionScanner,
		private readonly _getExtensionRegistrySnapshotWhenReady: () => Promise<ExtensionDescriptionRegistrySnapshot>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IWorkbenchExtensionEnablementService private readonly _extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._webWorkerExtHostEnablement = determineLocalWebWorkerExtHostEnablement(environmentService, configurationService);
	}

	public createExtensionHost(runningLocations: ExtensionRunningLocationTracker, runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
		switch (runningLocation.kind) {
			case ExtensionHostKind.LocalProcess: {
				const startup = (
					isInitialStart
						? ExtensionHostStartup.EagerManualStart
						: ExtensionHostStartup.EagerAutoStart
				);
				return this._instantiationService.createInstance(NativeLocalProcessExtensionHost, runningLocation, startup, this._createLocalProcessExtensionHostDataProvider(runningLocations, isInitialStart, runningLocation));
			}
			case ExtensionHostKind.LocalWebWorker: {
				if (this._webWorkerExtHostEnablement !== LocalWebWorkerExtHostEnablement.Disabled) {
					const startup = this._webWorkerExtHostEnablement === LocalWebWorkerExtHostEnablement.Lazy ? ExtensionHostStartup.LazyAutoStart : ExtensionHostStartup.EagerManualStart;
					return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, startup, this._createWebWorkerExtensionHostDataProvider(runningLocations, runningLocation));
				}
				return null;
			}
		}
	}

	private _createLocalProcessExtensionHostDataProvider(runningLocations: ExtensionRunningLocationTracker, isInitialStart: boolean, desiredRunningLocation: LocalProcessRunningLocation): ILocalProcessExtensionHostDataProvider {
		return {
			getInitData: async (): Promise<ILocalProcessExtensionHostInitData> => {
				if (isInitialStart) {
					// Here we load even extensions that would be disabled by workspace trust
					const scannedExtensions = await this._extensionScanner.scannedExtensions;
					if (isCI) {
						this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.scannedExtensions: ${scannedExtensions.map(ext => ext.identifier.value).join(',')}`);
					}

					const localExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, scannedExtensions, /* ignore workspace trust */true);
					if (isCI) {
						this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.localExtensions: ${localExtensions.map(ext => ext.identifier.value).join(',')}`);
					}

					const runningLocation = runningLocations.computeRunningLocation(localExtensions, false);
					const myExtensions = filterExtensionDescriptions(localExtensions, runningLocation, extRunningLocation => desiredRunningLocation.equals(extRunningLocation));
					const extensions = new ExtensionHostExtensions(0, localExtensions, myExtensions.map(extension => extension.identifier));
					if (isCI) {
						this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.myExtensions: ${myExtensions.map(ext => ext.identifier.value).join(',')}`);
					}
					return { extensions };
				} else {
					// restart case
					const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
					const myExtensions = runningLocations.filterByRunningLocation(snapshot.extensions, desiredRunningLocation);
					const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map(extension => extension.identifier));
					return { extensions };
				}
			}
		};
	}

	private _createWebWorkerExtensionHostDataProvider(runningLocations: ExtensionRunningLocationTracker, desiredRunningLocation: LocalWebWorkerRunningLocation): IWebWorkerExtensionHostDataProvider {
		return {
			getInitData: async (): Promise<IWebWorkerExtensionHostInitData> => {
				const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
				const myExtensions = runningLocations.filterByRunningLocation(snapshot.extensions, desiredRunningLocation);
				const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map(extension => extension.identifier));
				return { extensions };
			}
		};
	}

}

function determineLocalWebWorkerExtHostEnablement(environmentService: IWorkbenchEnvironmentService, configurationService: IConfigurationService): LocalWebWorkerExtHostEnablement {
	if (environmentService.isExtensionDevelopment && environmentService.extensionDevelopmentKind?.some(k => k === 'web')) {
		return LocalWebWorkerExtHostEnablement.Eager;
	} else {
		const config = configurationService.getValue<WebWorkerExtHostConfigValue>(webWorkerExtHostConfig);
		if (config === true) {
			return LocalWebWorkerExtHostEnablement.Eager;
		} else if (config === 'auto') {
			return LocalWebWorkerExtHostEnablement.Lazy;
		} else {
			return LocalWebWorkerExtHostEnablement.Disabled;
		}
	}
}

const enum LocalWebWorkerExtHostEnablement {
	Disabled = 0,
	Eager = 1,
	Lazy = 2
}

export class NativeExtensionHostKindPicker implements IExtensionHostKindPicker {

	private readonly _hasWebWorkerExtHost: boolean;

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		const webWorkerExtHostEnablement = determineLocalWebWorkerExtHostEnablement(environmentService, configurationService);
		this._hasWebWorkerExtHost = (webWorkerExtHostEnablement !== LocalWebWorkerExtHostEnablement.Disabled);
	}

	public pickExtensionHostKind(extensionId: ExtensionIdentifier, extensionKinds: ExtensionKind[], isInstalledLocally: boolean): ExtensionHostKind | null {
		const result = NativeExtensionHostKindPicker.pickExtensionHostKind(extensionKinds, isInstalledLocally, this._hasWebWorkerExtHost);
		this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(', ')}], isInstalledLocally: ${isInstalledLocally} => ${extensionHostKindToString(result)}`);
		return result;
	}

	public static pickExtensionHostKind(extensionKinds: ExtensionKind[], isInstalledLocally: boolean, hasWebWorkerExtHost: boolean): ExtensionHostKind | null {
		for (const extensionKind of extensionKinds) {
			if (extensionKind === 'ui' && isInstalledLocally) {
				return ExtensionHostKind.LocalProcess;
			}
			if (extensionKind === 'workspace' && isInstalledLocally) {
				return ExtensionHostKind.LocalProcess;
			}
			if (extensionKind === 'web' && isInstalledLocally && hasWebWorkerExtHost) {
				return ExtensionHostKind.LocalWebWorker;
			}
		}
		return null;
	}
}

class RestartExtensionHostAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.restartExtensionHost',
			title: nls.localize2('restartExtensionHost', "Restart Extension Host"),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const extensionService = accessor.get(IExtensionService);

		const stopped = await extensionService.stopExtensionHosts(nls.localize('restartExtensionHost.reason', "An explicit request"));
		if (stopped) {
			extensionService.startExtensionHosts();
		}
	}
}

registerAction2(RestartExtensionHostAction);

registerSingleton(IExtensionService, NativeExtensionService, InstantiationType.Eager);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Schemas } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionKind } from '../../../../platform/environment/common/environment.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAutomatedWindow, getLogs } from '../../../../platform/log/browser/log.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { IWebWorkerExtensionHostDataProvider, IWebWorkerExtensionHostInitData, WebWorkerExtensionHost } from './webWorkerExtensionHost.js';
import { FetchFileSystemProvider } from './webWorkerFileSystemProvider.js';
import { AbstractExtensionService, IExtensionHostFactory, LocalExtensions, ResolvedExtensions, checkEnabledAndProposedAPI } from '../common/abstractExtensionService.js';
import { ExtensionDescriptionRegistrySnapshot } from '../common/extensionDescriptionRegistry.js';
import { ExtensionHostKind, IExtensionHostKindPicker, extensionHostKindToString } from '../common/extensionHostKind.js';
import { IExtensionManifestPropertiesService } from '../common/extensionManifestPropertiesService.js';
import { ExtensionRunningLocation } from '../common/extensionRunningLocation.js';
import { ExtensionRunningLocationTracker, filterExtensionDescriptions } from '../common/extensionRunningLocationTracker.js';
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionHost, IExtensionService, toExtensionDescription } from '../common/extensions.js';
import { ExtensionsProposedApi } from '../common/extensionsProposedApi.js';
import { dedupExtensions } from '../common/extensionsUtil.js';
import { ILifecycleService, LifecyclePhase } from '../../lifecycle/common/lifecycle.js';
import { IUserDataInitializationService } from '../../userData/browser/userDataInit.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { AsyncIterableProducer } from '../../../../base/common/async.js';

export class ExtensionService extends AbstractExtensionService implements IExtensionService {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@IBrowserWorkbenchEnvironmentService browserEnvironmentService: IBrowserWorkbenchEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchExtensionEnablementService extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService,
		@IWorkbenchExtensionManagementService extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IWebExtensionsScannerService private readonly _webExtensionsScannerService: IWebExtensionsScannerService,
		@ILogService logService: ILogService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IUserDataInitializationService private readonly _userDataInitializationService: IUserDataInitializationService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IDialogService dialogService: IDialogService,
	) {
		const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
		const extensionHostFactory = new BrowserExtensionHostFactory(
			extensionsProposedApi,
			() => this._scanWebExtensions(),
			() => this._getExtensionRegistrySnapshotWhenReady(),
			instantiationService,
			extensionEnablementService,
			logService
		);
		super(
			{ hasLocalProcess: false },
			extensionsProposedApi,
			extensionHostFactory,
			new BrowserExtensionHostKindPicker(logService),
			instantiationService,
			notificationService,
			browserEnvironmentService,
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

		// Initialize installed extensions first and do it only after workbench is ready
		lifecycleService.when(LifecyclePhase.Ready).then(async () => {
			await this._initializeIfNeeded();
		});

		this._initFetchFileSystem();
	}

	private _initFetchFileSystem(): void {
		const provider = new FetchFileSystemProvider();
		this._register(this._fileService.registerProvider(Schemas.http, provider));
		this._register(this._fileService.registerProvider(Schemas.https, provider));
	}

	protected override async _initialize(): Promise<void> {
		await this._userDataInitializationService.initializeInstalledExtensions(this._instantiationService);
		await super._initialize();
	}

	private _scanWebExtensionsPromise: Promise<IExtensionDescription[]> | undefined;
	private async _scanWebExtensions(): Promise<IExtensionDescription[]> {
		if (!this._scanWebExtensionsPromise) {
			this._scanWebExtensionsPromise = (async () => {
				const system: IExtensionDescription[] = [], user: IExtensionDescription[] = [], development: IExtensionDescription[] = [];
				try {
					await Promise.all([
						this._webExtensionsScannerService.scanSystemExtensions().then(extensions => system.push(...extensions.map(e => toExtensionDescription(e)))),
						this._webExtensionsScannerService.scanUserExtensions(this._userDataProfileService.currentProfile.extensionsResource, { skipInvalidExtensions: true }).then(extensions => user.push(...extensions.map(e => toExtensionDescription(e)))),
						this._webExtensionsScannerService.scanExtensionsUnderDevelopment().then(extensions => development.push(...extensions.map(e => toExtensionDescription(e, true))))
					]);
				} catch (error) {
					this._logService.error(error);
				}
				return dedupExtensions(system, user, [], development, this._logService);
			})();
		}
		return this._scanWebExtensionsPromise;
	}

	protected _resolveExtensions(): AsyncIterable<ResolvedExtensions> {
		return new AsyncIterableProducer(async emitter => {
			await this._workspaceTrustManagementService.workspaceTrustInitialized;
			emitter.emitOne(new LocalExtensions(await this._scanWebExtensions()));
		});
	}

	protected async _onExtensionHostExit(code: number): Promise<void> {
		// Dispose everything associated with the extension host
		await this._doStopExtensionHosts();

		// If we are running extension tests, forward logs and exit code
		const automatedWindow = mainWindow as unknown as IAutomatedWindow;
		if (typeof automatedWindow.codeAutomationExit === 'function') {
			automatedWindow.codeAutomationExit(code, await getLogs(this._fileService, this._environmentService));
		}
	}

}

class BrowserExtensionHostFactory implements IExtensionHostFactory {

	constructor(
		private readonly _extensionsProposedApi: ExtensionsProposedApi,
		private readonly _scanWebExtensions: () => Promise<IExtensionDescription[]>,
		private readonly _getExtensionRegistrySnapshotWhenReady: () => Promise<ExtensionDescriptionRegistrySnapshot>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchExtensionEnablementService private readonly _extensionEnablementService: IWorkbenchExtensionEnablementService,
		@ILogService private readonly _logService: ILogService,
	) { }

	createExtensionHost(runningLocations: ExtensionRunningLocationTracker, runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
		switch (runningLocation.kind) {
			case ExtensionHostKind.LocalProcess: {
				return null;
			}
			case ExtensionHostKind.LocalWebWorker: {
				const startup = (
					isInitialStart
						? ExtensionHostStartup.EagerManualStart
						: ExtensionHostStartup.EagerAutoStart
				);
				return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, startup, this._createLocalExtensionHostDataProvider(runningLocations, runningLocation, isInitialStart));
			}
		}
	}

	private _createLocalExtensionHostDataProvider(runningLocations: ExtensionRunningLocationTracker, desiredRunningLocation: ExtensionRunningLocation, isInitialStart: boolean): IWebWorkerExtensionHostDataProvider {
		return {
			getInitData: async (): Promise<IWebWorkerExtensionHostInitData> => {
				if (isInitialStart) {
					// Here we load even extensions that would be disabled by workspace trust
					const localExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, await this._scanWebExtensions(), /* ignore workspace trust */true);
					const runningLocation = runningLocations.computeRunningLocation(localExtensions, false);
					const myExtensions = filterExtensionDescriptions(localExtensions, runningLocation, extRunningLocation => desiredRunningLocation.equals(extRunningLocation));
					const extensions = new ExtensionHostExtensions(0, localExtensions, myExtensions.map(extension => extension.identifier));
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

}

export class BrowserExtensionHostKindPicker implements IExtensionHostKindPicker {

	constructor(
		@ILogService private readonly _logService: ILogService,
	) { }

	pickExtensionHostKind(extensionId: ExtensionIdentifier, extensionKinds: ExtensionKind[], isInstalledLocally: boolean): ExtensionHostKind | null {
		const result = BrowserExtensionHostKindPicker.pickRunningLocation(extensionKinds, isInstalledLocally);
		this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(', ')}], isInstalledLocally: ${isInstalledLocally} => ${extensionHostKindToString(result)}`);
		return result;
	}

	public static pickRunningLocation(extensionKinds: ExtensionKind[], isInstalledLocally: boolean): ExtensionHostKind | null {
		for (const extensionKind of extensionKinds) {
			if (extensionKind === 'web' && isInstalledLocally) {
				return ExtensionHostKind.LocalWebWorker;
			}
		}
		return null;
	}
}

registerSingleton(IExtensionService, ExtensionService, InstantiationType.Eager);

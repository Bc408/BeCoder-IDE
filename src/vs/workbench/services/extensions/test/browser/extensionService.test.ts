/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IExtension, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService, createServices } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import product from '../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IUserDataProfilesService, UserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustEnablementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../extensionManagement/common/extensionManagement.js';
import { BrowserExtensionHostKindPicker } from '../../browser/extensionService.js';
import { AbstractExtensionService, IExtensionHostFactory, ResolvedExtensions } from '../../common/abstractExtensionService.js';
import { ExtensionHostKind } from '../../common/extensionHostKind.js';
import { IExtensionHostManager } from '../../common/extensionHostManagers.js';
import { ExtensionManifestPropertiesService, IExtensionManifestPropertiesService } from '../../common/extensionManifestPropertiesService.js';
import { ExtensionRunningLocation } from '../../common/extensionRunningLocation.js';
import { ExtensionRunningLocationTracker } from '../../common/extensionRunningLocationTracker.js';
import { ActivationKind, IExtensionHost, IExtensionService, IWillActivateEvent } from '../../common/extensions.js';
import { ExtensionsProposedApi } from '../../common/extensionsProposedApi.js';
import { ILifecycleService } from '../../../lifecycle/common/lifecycle.js';
import { IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { WorkspaceTrustEnablementService } from '../../../workspaces/common/workspaceTrust.js';
import { TestEnvironmentService, TestLifecycleService, TestWebExtensionsScannerService, TestWorkbenchExtensionEnablementService, TestWorkbenchExtensionManagementService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestFileService, TestUserDataProfileService } from '../../../../test/common/workbenchTestServices.js';
suite('BrowserExtensionService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('pickRunningLocation uses only local web extensions', () => {
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation([], false), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui'], true), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace'], true), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web'], false), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web'], true), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web'], true), ExtensionHostKind.LocalWebWorker);
	});
});

suite('ExtensionService', () => {

	class MyTestExtensionService extends AbstractExtensionService {

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
		) {
			const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
			const extensionHostFactory = new class implements IExtensionHostFactory {
				createExtensionHost(runningLocations: ExtensionRunningLocationTracker, runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
					return new class extends mock<IExtensionHost>() {
						override runningLocation = runningLocation;
					};
				}
			};
			super(
				{ hasLocalProcess: true },
				extensionsProposedApi,
				extensionHostFactory,
				null!,
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
				new TestDialogService()
			);

			this._initializeIfNeeded();
		}

		private _extHostId = 0;
		public readonly order: string[] = [];
		public readonly activationEvents: { event: string; activationKind: ActivationKind; kind: ExtensionHostKind }[] = [];
		public localExtHostIsReady = true;
		protected override _doCreateExtensionHostManager(extensionHost: IExtensionHost, initialActivationEvents: string[]): IExtensionHostManager {
			const order = this.order;
			const activationEvents = this.activationEvents;
			const extService = this;
			const extensionHostId = ++this._extHostId;
			const extHostKind = extensionHost.runningLocation.kind;
			order.push(`create ${extensionHostId}`);
			return new class extends mock<IExtensionHostManager>() {
				override onDidExit = Event.None;
				override onDidChangeResponsiveState = Event.None;
				override kind = extHostKind;
				override get isReady() { return extService.localExtHostIsReady; }
				override disconnect() {
					return Promise.resolve();
				}
				override start(): Promise<void> {
					return Promise.resolve();
				}
				override dispose(): void {
					order.push(`dispose ${extensionHostId}`);
				}
				override representsRunningLocation(runningLocation: ExtensionRunningLocation): boolean {
					return extensionHost.runningLocation.equals(runningLocation);
				}
				override activateByEvent(event: string, activationKind: ActivationKind): Promise<void> {
					activationEvents.push({ event, activationKind, kind: extHostKind });
					return Promise.resolve();
				}
				override ready(): Promise<void> {
					return Promise.resolve();
				}
			};
		}
		protected async *_resolveExtensions(): AsyncIterable<ResolvedExtensions> {
			// Return empty iterable - no extensions to resolve in tests
		}
		protected _scanSingleExtension(extension: IExtension): Promise<IExtensionDescription | null> {
			throw new Error('Method not implemented.');
		}
		protected _onExtensionHostExit(code: number): Promise<void> {
			throw new Error('Method not implemented.');
		}
	}

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let extService: MyTestExtensionService;

	setup(() => {
		disposables = new DisposableStore();
		const testProductService = { _serviceBrand: undefined, ...product };
		disposables.add(instantiationService = createServices(disposables, [
			// custom
			[IExtensionService, MyTestExtensionService],
			// default
			[ILifecycleService, TestLifecycleService],
			[IWorkbenchExtensionManagementService, TestWorkbenchExtensionManagementService],
			[INotificationService, TestNotificationService],
			[ILogService, NullLogService],
			[IWebExtensionsScannerService, TestWebExtensionsScannerService],
			[IExtensionManifestPropertiesService, ExtensionManifestPropertiesService],
			[IConfigurationService, TestConfigurationService],
			[IWorkspaceContextService, TestContextService],
			[IProductService, testProductService],
			[IFileService, TestFileService],
			[IWorkbenchExtensionEnablementService, TestWorkbenchExtensionEnablementService],
			[ITelemetryService, NullTelemetryService],
			[IEnvironmentService, TestEnvironmentService],
			[IWorkspaceTrustEnablementService, WorkspaceTrustEnablementService],
			[IUserDataProfilesService, UserDataProfilesService],
			[IUserDataProfileService, TestUserDataProfileService],
			[IUriIdentityService, UriIdentityService],
		]));
		extService = <MyTestExtensionService>instantiationService.get(IExtensionService);
	});

	teardown(async () => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Extension host disposed when awaited', async () => {
		await extService.stopExtensionHosts('foo');
		assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3', 'dispose 3', 'dispose 2', 'dispose 1']));
	});

	test('Extension host not disposed when vetoed (sync)', async () => {

		disposables.add(extService.onWillStop(e => e.veto(true, 'test 1')));
		disposables.add(extService.onWillStop(e => e.veto(false, 'test 2')));

		await extService.stopExtensionHosts('foo');
		assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3']));
	});

	test('Extension host not disposed when vetoed (async)', async () => {

		disposables.add(extService.onWillStop(e => e.veto(false, 'test 1')));
		disposables.add(extService.onWillStop(e => e.veto(Promise.resolve(true), 'test 2')));
		disposables.add(extService.onWillStop(e => e.veto(Promise.resolve(false), 'test 3')));

		await extService.stopExtensionHosts('foo');
		assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3']));
	});

	test('onWillActivateByEvent includes activationKind for Normal activation', async () => {

		const events: IWillActivateEvent[] = [];
		disposables.add(extService.onWillActivateByEvent(e => events.push(e)));

		await extService.activateByEvent('onTest', ActivationKind.Normal);

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].event, 'onTest');
		assert.strictEqual(events[0].activationKind, ActivationKind.Normal);
	});

	test('onWillActivateByEvent includes activationKind for Immediate activation', async () => {

		const events: IWillActivateEvent[] = [];
		disposables.add(extService.onWillActivateByEvent(e => events.push(e)));

		await extService.activateByEvent('onTest', ActivationKind.Immediate);

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].event, 'onTest');
		assert.strictEqual(events[0].activationKind, ActivationKind.Immediate);
	});

	test('Immediate activation still activates local extension hosts even when not ready', async () => {
		extService.localExtHostIsReady = false;
		extService.activationEvents.length = 0; // Clear any initial activations

		await extService.activateByEvent('onTest', ActivationKind.Immediate);

		// Local hosts should always be activated for Immediate, regardless of isReady
		const activatedKinds = extService.activationEvents.map(e => e.kind);
		assert.ok(activatedKinds.includes(ExtensionHostKind.LocalProcess), 'Should activate on LocalProcess even when not ready');
		assert.ok(activatedKinds.includes(ExtensionHostKind.LocalWebWorker), 'Should activate on LocalWebWorker even when not ready');
	});

	test('Normal activation activates all extension hosts', async () => {
		extService.activationEvents.length = 0; // Clear any initial activations

		await extService.activateByEvent('onTest', ActivationKind.Normal);

		// Should activate on both local extension hosts
		const activatedKinds = extService.activationEvents.map(e => e.kind);
		assert.ok(activatedKinds.includes(ExtensionHostKind.LocalProcess), 'Should activate on LocalProcess');
		assert.ok(activatedKinds.includes(ExtensionHostKind.LocalWebWorker), 'Should activate on LocalWebWorker');
	});
});

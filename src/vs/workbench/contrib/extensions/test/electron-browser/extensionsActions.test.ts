/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IExtensionsWorkbenchService, ExtensionContainers } from '../../common/extensions.js';
import * as ExtensionsActions from '../../browser/extensionsActions.js';
import { ExtensionsWorkbenchService } from '../../browser/extensionsWorkbenchService.js';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension, IGalleryExtension,
	DidUninstallExtensionEvent, InstallExtensionEvent, InstallOperation, IExtensionTipsService, InstallExtensionResult, getTargetPlatform, UninstallExtensionEvent, Metadata
} from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IExtensionManagementServer, IProfileAwareExtensionManagementService, IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { getGalleryExtensionId } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { TestExtensionEnablementService } from '../../../../services/extensionManagement/test/browser/extensionEnablementService.test.js';
import { ExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionGalleryService.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IPager } from '../../../../../base/common/paging.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IExtensionService, toExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { TestContextService, TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { TestExtensionTipsService, TestSharedProcessService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { NativeURLService } from '../../../../../platform/url/common/urlService.js';
import { URI } from '../../../../../base/common/uri.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IExtensionContributions, ExtensionType, IExtensionDescription, IExtension } from '../../../../../platform/extensions/common/extensions.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILabelService, IFormatterChangeEvent } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { ProgressService } from '../../../../services/progress/browser/progressService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestEnvironmentService, TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSyncEnablementService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { platform } from '../../../../../base/common/platform.js';
import { arch } from '../../../../../base/common/process.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { IMeteredConnectionService } from '../../../../../platform/meteredConnection/common/meteredConnection.js';
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { Mutable } from '../../../../../base/common/types.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfileService.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';

let instantiationService: TestInstantiationService;
let installEvent: Emitter<InstallExtensionEvent>,
	didInstallEvent: Emitter<readonly InstallExtensionResult[]>,
	uninstallEvent: Emitter<UninstallExtensionEvent>,
	didUninstallEvent: Emitter<DidUninstallExtensionEvent>;

function setupTest(disposables: Pick<DisposableStore, 'add'>) {
	installEvent = disposables.add(new Emitter<InstallExtensionEvent>());
	didInstallEvent = disposables.add(new Emitter<readonly InstallExtensionResult[]>());
	uninstallEvent = disposables.add(new Emitter<UninstallExtensionEvent>());
	didUninstallEvent = disposables.add(new Emitter<DidUninstallExtensionEvent>());

	instantiationService = disposables.add(new TestInstantiationService());

	instantiationService.stub(IEnvironmentService, TestEnvironmentService);
	instantiationService.stub(IWorkbenchEnvironmentService, TestEnvironmentService);

	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(ILogService, NullLogService);

	instantiationService.stub(IWorkspaceContextService, new TestContextService());
	instantiationService.stub(IFileService, disposables.add(new FileService(new NullLogService())));
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(IProgressService, ProgressService);
	instantiationService.stub(IProductService, {});
	instantiationService.stub(IContextKeyService, new MockContextKeyService());

	instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
	instantiationService.stub(IExtensionGalleryManifestService, {
		onDidChangeExtensionGalleryManifest: Event.None,
		onDidChangeExtensionGalleryManifestStatus: Event.None,
		extensionGalleryManifestStatus: ExtensionGalleryManifestStatus.Unavailable,
		async getExtensionGalleryManifest() { return null; }
	});
	instantiationService.stub(ISharedProcessService, TestSharedProcessService);

	instantiationService.stub(IWorkbenchExtensionManagementService, {
		onDidInstallExtensions: didInstallEvent.event,
		// eslint-disable-next-line local/code-no-any-casts
		onInstallExtension: installEvent.event as any,
		// eslint-disable-next-line local/code-no-any-casts
		onUninstallExtension: uninstallEvent.event as any,
		// eslint-disable-next-line local/code-no-any-casts
		onDidUninstallExtension: didUninstallEvent.event as any,
		onDidUpdateExtensionMetadata: Event.None,
		onDidChangeProfile: Event.None,
		onProfileAwareDidInstallExtensions: Event.None,
		async getInstalled() { return []; },
		async getInstalledWorkspaceExtensions() { return []; },
		async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
		async updateMetadata(local: Mutable<ILocalExtension>, metadata: Partial<Metadata>) {
			local.identifier.uuid = metadata.id;
			local.publisherDisplayName = metadata.publisherDisplayName!;
			local.publisherId = metadata.publisherId!;
			return local;
		},
		async canInstall() { return true; },
		async getTargetPlatform() { return getTargetPlatform(platform, arch); },
	});


	const localExtensionManagementServer = { extensionManagementService: instantiationService.get(IExtensionManagementService) as IProfileAwareExtensionManagementService, label: 'local', id: 'vscode-local' };
	instantiationService.stub(IExtensionManagementServerService, {
		get localExtensionManagementServer(): IExtensionManagementServer {
			return localExtensionManagementServer;
		},
		getExtensionManagementServer(extension: IExtension): IExtensionManagementServer | null {
			if (extension.location.scheme === Schemas.file) {
				return localExtensionManagementServer;
			}
			throw new Error(`Invalid Extension ${extension.location}`);
		}
	});

	instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(toUserDataProfile('test', 'test', URI.file('foo'), URI.file('cache')))));
	instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
	instantiationService.stub(ILabelService, { onDidChangeFormatters: disposables.add(new Emitter<IFormatterChangeEvent>()).event });

	instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
	instantiationService.stub(IExtensionTipsService, disposables.add(instantiationService.createInstance(TestExtensionTipsService)));
	instantiationService.stub(IExtensionRecommendationsService, {});
	instantiationService.stub(IURLService, NativeURLService);

	instantiationService.stub(IExtensionGalleryService, 'isEnabled', true);
	instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
	instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', []);
	instantiationService.stub(IExtensionService, { extensions: [], onDidChangeExtensions: Event.None, canAddExtension: (extension: IExtensionDescription) => false, canRemoveExtension: (extension: IExtensionDescription) => false, whenInstalledExtensionsRegistered: () => Promise.resolve(true) });
	(<TestExtensionEnablementService>instantiationService.get(IWorkbenchExtensionEnablementService)).reset();

	instantiationService.stub(IUserDataSyncEnablementService, disposables.add(instantiationService.createInstance(UserDataSyncEnablementService)));

	instantiationService.stub(IUpdateService, { onStateChange: Event.None, state: State.Uninitialized });
	instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: Event.None });
	instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
	instantiationService.stub(IWorkspaceTrustManagementService, disposables.add(new TestWorkspaceTrustManagementService()));
}


suite('ExtensionsActions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	setup(() => setupTest(disposables));

	test('Install action is disabled when there is no extension', () => {
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));

		assert.ok(!testObject.enabled);
	});

	test('Test Install action when state is installed', () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		return workbenchService.queryLocal()
			.then(() => {
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier })));
				return workbenchService.queryGallery(CancellationToken.None)
					.then((paged) => {
						testObject.extension = paged.firstPage[0];
						assert.ok(!testObject.enabled);
						assert.strictEqual('Install', testObject.label);
						assert.strictEqual('extension-action label prominent install hide', testObject.class);
					});
			});
	});

	test('Test InstallingLabelAction when state is installing', () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallingLabelAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return workbenchService.queryGallery(CancellationToken.None)
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });

				assert.ok(!testObject.enabled);
				assert.strictEqual('Installing', testObject.label);
				assert.strictEqual('extension-action label install installing', testObject.class);
			});
	});

	test('Test Install action when state is uninstalled', async () => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const paged = await workbenchService.queryGallery(CancellationToken.None);
		const promise = Event.toPromise(Event.filter(testObject.onDidChange, e => e.enabled === true));
		testObject.extension = paged.firstPage[0];
		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual('Install', testObject.label);
	});

	test('Test Install action when extension is system action', () => {
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test Install action when extension doesnot has gallery', () => {
		const testObject: ExtensionsActions.InstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Uninstall action is disabled when there is no extension', () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		assert.ok(!testObject.enabled);
	});

	test('Test Uninstall action when state is uninstalling', () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				assert.ok(!testObject.enabled);
				assert.strictEqual('Uninstalling', testObject.label);
				assert.strictEqual('extension-action label uninstall uninstalling', testObject.class);
			});
	});

	test('Test Uninstall action when state is installed and is user extension', () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.strictEqual('Uninstall', testObject.label);
				assert.strictEqual('extension-action label uninstall', testObject.class);
			});
	});

	test('Test Uninstall action when state is installed and is system extension', () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
				assert.strictEqual('Uninstall', testObject.label);
				assert.strictEqual('extension-action label uninstall', testObject.class);
			});
	});

	test('Test Uninstall action when state is installing and is user extension', () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const gallery = aGalleryExtension('a');
				const extension = extensions[0];
				extension.gallery = gallery;
				installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
				testObject.extension = extension;
				assert.ok(!testObject.enabled);
			});
	});

	test('Test Uninstall action after extension is installed', async () => {
		const testObject: ExtensionsActions.UninstallAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];

		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		const promise = Event.toPromise(testObject.onDidChange);
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);

		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual('Uninstall', testObject.label);
		assert.strictEqual('extension-action label uninstall', testObject.class);
	});

	test('Test UpdateAction when there is no extension', () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		assert.ok(!testObject.enabled);
	});

	test('Test UpdateAction when extension is uninstalled', () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then((paged) => {
				testObject.extension = paged.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test UpdateAction when extension is installed and not outdated', () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: local.manifest.version })));
				return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
					.then(extensions => assert.ok(!testObject.enabled));
			});
	});

	test('Test UpdateAction when extension is installed outdated and system extension', () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.0' }, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' })));
				return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
					.then(extensions => assert.ok(!testObject.enabled));
			});
	});

	test('Test UpdateAction when extension is installed outdated and user extension', () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		return workbenchService.queryLocal()
			.then(async extensions => {
				testObject.extension = extensions[0];
				const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' });
				instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
				instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery);
				instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery]);
				assert.ok(!testObject.enabled);
				return new Promise<void>(c => {
					disposables.add(testObject.onDidChange(() => {
						if (testObject.enabled) {
							c();
						}
					}));
					instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
				});
			});
	});

	test('Test UpdateAction when extension is installing and outdated and user extension', async () => {
		const testObject: ExtensionsActions.UpdateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];
		const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery);
		instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery]);
		await new Promise<void>(c => {
			disposables.add(testObject.onDidChange(() => {
				if (testObject.enabled) {
					c();
				}
			}));
			instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		});
		await new Promise<void>(c => {
			disposables.add(testObject.onDidChange(() => {
				if (!testObject.enabled) {
					c();
				}
			}));
			installEvent.fire({ identifier: local.identifier, source: gallery, profileLocation: null! });
		});
	});

	test('Test ManageExtensionAction when there is no extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		assert.ok(!testObject.enabled);
	});

	test('Test ManageExtensionAction when extension is installed', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
				assert.strictEqual('Manage', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is uninstalled', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage hide', testObject.class);
				assert.strictEqual('Manage', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is installing', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				testObject.extension = page.firstPage[0];

				installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
				assert.ok(!testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage hide', testObject.class);
				assert.strictEqual('Manage', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is queried from gallery and installed', async () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		const promise = Event.toPromise(testObject.onDidChange);
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);

		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
		assert.strictEqual('Manage', testObject.tooltip);
	});

	test('Test ManageExtensionAction when extension is system extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', {}, { type: ExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
				assert.strictEqual('Manage', testObject.tooltip);
			});
	});

	test('Test ManageExtensionAction when extension is uninstalling', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });

				assert.ok(!testObject.enabled);
				assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
				assert.strictEqual('Manage', testObject.tooltip);
			});
	});

	test('Test EnableForWorkspaceAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));

		assert.ok(!testObject.enabled);
	});

	test('Test EnableForWorkspaceAction when there extension is not disabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableForWorkspaceAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableForWorkspaceAction when extension is disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableForWorkspaceAction when the extension is disabled globally and workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace))
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableGloballyAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));

		assert.ok(!testObject.enabled);
	});

	test('Test EnableGloballyAction when the extension is not disabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableGloballyAction when the extension is disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test EnableGloballyAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableGloballyAction when the extension is disabled in both', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace))
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));

		assert.ok(!testObject.enabled);
	});

	test('Test EnableDropDownAction when extension is installed and enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
				testObject.extension = extensions[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is installed and disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableDropDownAction when extension is installed and disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
						testObject.extension = extensions[0];
						assert.ok(testObject.enabled);
					});
			});
	});

	test('Test EnableDropDownAction when extension is uninstalled', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is installing', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
				testObject.extension = page.firstPage[0];
				disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

				installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test EnableDropDownAction when extension is uninstalling', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.EnableDropDownAction = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
				testObject.extension = extensions[0];
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableForWorkspaceAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));

		assert.ok(!testObject.enabled);
	});

	test('Test DisableForWorkspaceAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableForWorkspaceAction when the extension is disabled workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableForWorkspaceAction when extension is enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableForWorkspaceAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));

		assert.ok(!testObject.enabled);
	});

	test('Test DisableGloballyAction when the extension is disabled globally', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when the extension is disabled for workspace', () => {
		const local = aLocalExtension('a');
		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledWorkspace)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when the extension is enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is installed and enabled', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
				testObject.extension = extensions[0];
				assert.ok(testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is installed and disabled globally', () => {
		const local = aLocalExtension('a');
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally)
			.then(() => {
				instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

				return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
					.then(extensions => {
						const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
						testObject.extension = extensions[0];
						assert.ok(!testObject.enabled);
					});
			});
	});

	test('Test DisableGloballyAction when extension is uninstalled', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
				testObject.extension = page.firstPage[0];
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is installing', () => {
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
				testObject.extension = page.firstPage[0];
				disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
				installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
				assert.ok(!testObject.enabled);
			});
	});

	test('Test DisableGloballyAction when extension is uninstalling', () => {
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});

		return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
			.then(extensions => {
				const testObject: ExtensionsActions.DisableGloballyAction = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
				testObject.extension = extensions[0];
				disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
				uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
				assert.ok(!testObject.enabled);
			});
	});

});

suite('ExtensionRuntimeStateAction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => setupTest(disposables));

	test('Test Runtime State when there is no extension', () => {
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension state is installing', async () => {
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const paged = await workbenchService.queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension state is uninstalling', async () => {
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];
		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is newly installed', async () => {
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		const promise = Event.toPromise(testObject.onDidChange);
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);
		await promise;
		assert.ok(testObject.enabled);
		assert.strictEqual(testObject.tooltip, `Please restart extensions to enable this extension.`);
	});

	test('Test Runtime State when extension is newly installed and ext host restart is not required', async () => {
		const onDidChangeExtensionsEmitter = new Emitter<{ added: IExtensionDescription[]; removed: IExtensionDescription[] }>();
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
			canAddExtension: (extension) => true,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is installed and uninstalled', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);

		testObject.extension = paged.firstPage[0];
		const identifier = gallery.identifier;
		installEvent.fire({ identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, { identifier }), profileLocation: null! }]);
		uninstallEvent.fire({ identifier, profileLocation: null! });
		didUninstallEvent.fire({ identifier, profileLocation: null! });

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is uninstalled', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];

		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		assert.ok(testObject.enabled);
		assert.strictEqual(testObject.tooltip, `Please restart extensions to complete the uninstallation of this extension.`);
	});

	test('Test Runtime State when extension is uninstalled and can be removed', async () => {
		const local = aLocalExtension('a');
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(local)],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => true,
			canAddExtension: (extension) => true,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
		testObject.extension = extensions[0];

		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is uninstalled and installed', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();

		testObject.extension = extensions[0];
		uninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });
		didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null! });

		const gallery = aGalleryExtension('a');
		const identifier = gallery.identifier;
		installEvent.fire({ identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier, source: gallery, operation: InstallOperation.Install, local, profileLocation: null! }]);

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is updated while running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.1' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => true,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.1' });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		return new Promise<void>(c => {
			disposables.add(testObject.onDidChange(() => {
				if (testObject.enabled && testObject.tooltip === `Please restart extensions to enable the updated extension.`) {
					c();
				}
			}));
			const gallery = aGalleryExtension('a', { uuid: local.identifier.id, version: '1.0.2' });
			installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
			didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);
		});
	});

	test('Test Runtime State when extension is updated when not running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a', { version: '1.0.1' });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.2' });
		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Update, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);

		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is disabled when running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.DisabledGlobally);
		await testObject.update();

		assert.ok(testObject.enabled);
		assert.strictEqual(`Please restart extensions to disable this extension.`, testObject.tooltip);
	});

	test('Test Runtime State when extension enablement is toggled when running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.DisabledGlobally);
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is enabled when not running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a');
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		await testObject.update();
		assert.ok(testObject.enabled);
		assert.strictEqual(`Please restart extensions to enable this extension.`, testObject.tooltip);
	});

	test('Test Runtime State when extension enablement is toggled when not running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a');
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		await workbenchService.setEnablement(extensions[0], EnablementState.DisabledGlobally);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when extension is updated when not running and enabled', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const local = aLocalExtension('a', { version: '1.0.1' });
		await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], EnablementState.DisabledGlobally);
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.2' });
		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', gallery, gallery), profileLocation: null! }]);
		await workbenchService.setEnablement(extensions[0], EnablementState.EnabledGlobally);
		await testObject.update();
		assert.ok(testObject.enabled);
		assert.strictEqual(`Please restart extensions to enable this extension.`, testObject.tooltip);
	});

	test('Test Runtime State when a localization extension is newly installed', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('b'))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
		testObject.extension = paged.firstPage[0];
		assert.ok(!testObject.enabled);

		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', { ...gallery, ...{ contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } } }, gallery), profileLocation: null! }]);
		assert.ok(!testObject.enabled);
	});

	test('Test Runtime State when a localization extension is updated while running', async () => {
		instantiationService.stub(IExtensionService, {
			extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.1' }))],
			onDidChangeExtensions: Event.None,
			canRemoveExtension: (extension) => false,
			canAddExtension: (extension) => false,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		});
		const testObject: ExtensionsActions.ExtensionRuntimeStateAction = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
		disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
		const local = aLocalExtension('a', { version: '1.0.1', contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		const extensions = await workbenchService.queryLocal();
		testObject.extension = extensions[0];

		const gallery = aGalleryExtension('a', { uuid: local.identifier.id, version: '1.0.2' });
		installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null! });
		didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: InstallOperation.Install, local: aLocalExtension('a', { ...gallery, ...{ contributes: <IExtensionContributions>{ localizations: [{ languageId: 'de', translations: [] }] } } }, gallery), profileLocation: null! }]);
		assert.ok(!testObject.enabled);
	});

});

function aLocalExtension(name: string = 'someext', manifest: any = {}, properties: any = {}): ILocalExtension {
	manifest = { name, publisher: 'pub', version: '1.0.0', ...manifest };
	properties = {
		type: ExtensionType.User,
		location: URI.file(`pub.${name}`),
		identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name) },
		...properties,
		isValid: properties.isValid ?? true,
	};
	properties.isBuiltin = properties.type === ExtensionType.System;
	return <ILocalExtension>Object.create({ manifest, ...properties });
}

function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: any = {}): IGalleryExtension {
	const targetPlatform = getTargetPlatform(platform, arch);
	const galleryExtension = <IGalleryExtension>Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, isSigned: true, ...properties });
	galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
	galleryExtension.assets = { ...galleryExtension.assets, ...assets };
	galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
	galleryExtension.hasReleaseVersion = true;
	return <IGalleryExtension>galleryExtension;
}

function aPage<T>(...objects: T[]): IPager<T> {
	return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null! };
}

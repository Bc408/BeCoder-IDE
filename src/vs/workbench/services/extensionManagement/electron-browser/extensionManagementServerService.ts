/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ExtensionInstallLocation, IExtensionManagementServer, IExtensionManagementServerService } from '../common/extensionManagement.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IExtension } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { NativeExtensionManagementService } from './nativeExtensionManagementService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export class ExtensionManagementServerService extends Disposable implements IExtensionManagementServerService {

	declare readonly _serviceBrand: undefined;

	readonly localExtensionManagementServer: IExtensionManagementServer;
	readonly webExtensionManagementServer: IExtensionManagementServer | null = null;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const localExtensionManagementService = this._register(instantiationService.createInstance(NativeExtensionManagementService, sharedProcessService.getChannel('extensions')));
		this.localExtensionManagementServer = { extensionManagementService: localExtensionManagementService, id: 'local', label: localize('local', "Local") };
	}

	getExtensionManagementServer(extension: IExtension): IExtensionManagementServer {
		return this.localExtensionManagementServer;
	}

	getExtensionInstallLocation(extension: IExtension): ExtensionInstallLocation | null {
		return ExtensionInstallLocation.Local;
	}
}

registerSingleton(IExtensionManagementServerService, ExtensionManagementServerService, InstantiationType.Delayed);

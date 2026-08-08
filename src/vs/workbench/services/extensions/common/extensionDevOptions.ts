/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';

export interface IExtensionDevOptions {
	readonly isExtensionDevHost: boolean;
	readonly isExtensionDevTestFromCli: boolean;
}

export function parseExtensionDevOptions(environmentService: IEnvironmentService): IExtensionDevOptions {
	// handle extension host lifecycle a bit special when we know we are developing an extension that runs inside
	const isExtensionDevHost = environmentService.isExtensionDevelopment;

	const isExtensionDevTestFromCli = isExtensionDevHost && !!environmentService.extensionTestsLocationURI;
	return {
		isExtensionDevHost,
		isExtensionDevTestFromCli
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ErrorNoTelemetry } from '../../../../base/common/errors.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITerminalLogService } from '../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITerminalInstanceService } from '../browser/terminal.js';
import { BaseTerminalProfileResolverService } from '../browser/terminalProfileResolverService.js';
import { ITerminalProfileService } from '../common/terminal.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../services/history/common/history.js';

export class ElectronTerminalProfileResolverService extends BaseTerminalProfileResolverService {

	constructor(
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHistoryService historyService: IHistoryService,
		@ITerminalLogService logService: ITerminalLogService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@ITerminalProfileService terminalProfileService: ITerminalProfileService,
		@ITerminalInstanceService terminalInstanceService: ITerminalInstanceService
	) {
		super(
			{
				getDefaultSystemShell: async platform => {
					const backend = await terminalInstanceService.getBackend();
					if (!backend) {
						throw new ErrorNoTelemetry('Cannot get default system shell when there is no local backend');
					}
					return backend.getDefaultSystemShell(platform);
				},
				getEnvironment: async () => {
					const backend = await terminalInstanceService.getBackend();
					if (!backend) {
						throw new ErrorNoTelemetry('Cannot get environment when there is no local backend');
					}
					return backend.getEnvironment();
				}
			},
			configurationService,
			configurationResolverService,
			historyService,
			logService,
			terminalProfileService,
			workspaceContextService
		);
	}
}

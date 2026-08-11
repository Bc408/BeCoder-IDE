/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isLinux, isMacintosh, isWindows, OperatingSystem as OS } from '../../../../base/common/platform.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IExtensionManagementServerService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { GettingStartedInputSerializer, GettingStartedPage } from './gettingStarted.js';
import { GettingStartedInput } from './gettingStartedInput.js';
import { StartupPageEditorResolverContribution, StartupPageRunnerContribution } from './startupPage.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openWelcomePage',
			title: localize2('miWelcome', 'Welcome'),
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '1_welcome',
				order: 1,
			},
			metadata: {
				description: localize2('minWelcomeDescription', 'Opens the BeCoder Welcome page.')
			}
		});
	}

	run(accessor: ServicesAccessor, options?: { toSide?: boolean; inactive?: boolean } | boolean): void {
		const editorService = accessor.get(IEditorService);
		const toSide = typeof options === 'object' ? options.toSide : options;
		const inactive = typeof options === 'object' ? options.inactive : false;
		editorService.openEditor({
			resource: GettingStartedInput.RESOURCE,
			options: { preserveFocus: toSide ?? false, inactive }
		}, toSide ? SIDE_GROUP : undefined);
	}
});

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(GettingStartedInput.ID, GettingStartedInputSerializer);
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(GettingStartedPage, GettingStartedPage.ID, localize('welcome', "Welcome")),
	[new SyncDescriptor(GettingStartedInput)]
);

export const WorkspacePlatform = new RawContextKey<'mac' | 'linux' | 'windows' | 'webworker' | undefined>(
	'workspacePlatform',
	undefined,
	localize('workspacePlatform', "The platform of the current workspace, which in remote or serverless contexts may be different from the platform of the UI")
);

class WorkspacePlatformContribution {

	static readonly ID = 'workbench.contrib.workspacePlatform';

	constructor(
		@IExtensionManagementServerService extensionManagementServerService: IExtensionManagementServerService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IContextKeyService contextService: IContextKeyService,
	) {
		remoteAgentService.getEnvironment().then(environment => {
			const remotePlatform = environment?.os === OS.Macintosh ? 'mac'
				: environment?.os === OS.Windows ? 'windows'
					: environment?.os === OS.Linux ? 'linux'
						: undefined;
			const platform = remotePlatform
				?? (extensionManagementServerService.localExtensionManagementServer
					? isMacintosh ? 'mac' : isLinux ? 'linux' : isWindows ? 'windows' : undefined
					: extensionManagementServerService.webExtensionManagementServer ? 'webworker' : undefined);
			if (platform) {
				WorkspacePlatform.bindTo(contextService).set(platform);
			}
		});
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.startupEditor': {
			scope: ConfigurationScope.RESOURCE,
			type: 'string',
			enum: ['none', 'welcomePage', 'readme', 'newUntitledFile', 'welcomePageInEmptyWorkbench', 'terminal'],
			enumDescriptions: [
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.none' }, "Start without an editor."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.welcomePage' }, "Open the Welcome page."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.readme' }, "Open the README when opening a folder that contains one, fallback to 'welcomePage' otherwise. Note: This is only observed as a global configuration, it will be ignored if set in a workspace or folder configuration."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.newUntitledFile' }, "Open a new untitled text file (only applies when opening an empty window)."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.welcomePageInEmptyWorkbench' }, "Open the Welcome page when opening an empty workbench."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.terminal' }, "Open a new terminal in the editor area."),
			],
			default: 'welcomePage',
			description: localize('workbench.startupEditor', "Controls which editor is shown at startup, if none are restored from the previous session."),
			experiment: { mode: 'auto' },
		}
	}
});

registerWorkbenchContribution2(WorkspacePlatformContribution.ID, WorkspacePlatformContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(StartupPageEditorResolverContribution.ID, StartupPageEditorResolverContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(StartupPageRunnerContribution.ID, StartupPageRunnerContribution, WorkbenchPhase.AfterRestored);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';

export interface IGettingStartedStartEntry {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly icon: ThemeIcon;
	readonly when?: string;
	readonly command: string;
}

export const startEntries: readonly IGettingStartedStartEntry[] = [
	{
		id: 'welcome.showNewFileEntries',
		title: localize('gettingStarted.newFile.title', "New File..."),
		description: localize('gettingStarted.newFile.description', "Open a new untitled text file, notebook, or custom editor."),
		icon: Codicon.newFile,
		command: 'command:welcome.showNewFileEntries',
	},
	{
		id: 'becoder.openIntegratedBrowser',
		title: localize('gettingStarted.integratedBrowser.title', "Open Integrated Browser"),
		description: localize('gettingStarted.integratedBrowser.description', "Open a browser tab inside BeCoder."),
		icon: Codicon.globe,
		command: 'workbench.action.browser.open',
	},
	{
		id: 'topLevelOpenMac',
		title: localize('gettingStarted.openMac.title', "Open..."),
		description: localize('gettingStarted.openMac.description', "Open a file or folder to start working"),
		icon: Codicon.folderOpened,
		when: '!isWeb && isMac',
		command: 'command:workbench.action.files.openFileFolder',
	},
	{
		id: 'topLevelOpenFile',
		title: localize('gettingStarted.openFile.title', "Open File..."),
		description: localize('gettingStarted.openFile.description', "Open a file to start working"),
		icon: Codicon.goToFile,
		when: 'isWeb || !isMac',
		command: 'command:workbench.action.files.openFile',
	},
	{
		id: 'topLevelOpenFolder',
		title: localize('gettingStarted.openFolder.title', "Open Folder..."),
		description: localize('gettingStarted.openFolder.description', "Open a folder to start working"),
		icon: Codicon.folderOpened,
		when: '!isWeb && !isMac',
		command: 'command:workbench.action.files.openFolder',
	},
	{
		id: 'topLevelOpenFolderWeb',
		title: localize('gettingStarted.openFolder.title', "Open Folder..."),
		description: localize('gettingStarted.openFolder.description', "Open a folder to start working"),
		icon: Codicon.folderOpened,
		when: '!openFolderWorkspaceSupport && workbenchState == \'workspace\'',
		command: 'command:workbench.action.files.openFolderViaWorkspace',
	},
	{
		id: 'topLevelRemoteOpen',
		title: localize('gettingStarted.topLevelRemoteOpen.title', "Connect to..."),
		description: localize('gettingStarted.topLevelRemoteOpen.description', "Connect to remote development workspaces."),
		icon: Codicon.remote,
		when: '!isWeb',
		command: 'command:workbench.action.remote.showMenu',
	},
	{
		id: 'topLevelOpenTunnel',
		title: localize('gettingStarted.topLevelOpenTunnel.title', "Open Tunnel..."),
		description: localize('gettingStarted.topLevelOpenTunnel.description', "Connect to a remote machine through a Tunnel"),
		icon: Codicon.remote,
		when: 'isWeb && showRemoteStartEntryInWeb',
		command: 'command:workbench.action.remote.showWebStartEntryActions',
	},
];

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { URI } from '../../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { BrowserViewCommandId, IBrowserViewService, ipcBrowserViewChannelName } from '../../../../../platform/browserView/common/browserView.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { GroupDirection, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { BrowserEditor, BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from '../browserEditor.js';

class ImportProblemAction extends Action2 {
	private busy = false;
	constructor() {
		super({
			id: BrowserViewCommandId.ImportProblem,
			title: localize2('browser.importProblem', 'Import Problem'),
			category: BrowserActionCategory,
			icon: Codicon.cloudDownload,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
			menu: { id: MenuId.BrowserActionsToolbar, group: BrowserActionGroup.Tools, order: 1 }
		});
	}

	async run(accessor: ServicesAccessor, editor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (!(editor instanceof BrowserEditor) || !editor.model) { return; }
		const notifications = accessor.get(INotificationService);
		if (this.busy) { notifications.info(localize('browser.problem.busy', 'A problem import is already in progress.')); return; }
		const commands = accessor.get(ICommandService);
		const groups = accessor.get(IEditorGroupsService);
		const browserGroup = editor.group;
		const browserInput = editor.input;
		const existingGroups = new Set(groups.groups.map(group => group.id));
		const service = ProxyChannel.toService<IBrowserViewService>(accessor.get(IMainProcessService).getChannel(ipcBrowserViewChannelName));
		this.busy = true;
		try {
			const result = await service.parseProblem(editor.model.id, mainWindow.vscodeWindowId);
			const imported = await commands.executeCommand<{ problem: { srcPath: string } } | undefined>('_becoder.cph.importProblem', result.json, result.url);
			if (imported && browserInput && groups.getGroup(browserGroup.id) === browserGroup && browserGroup.contains(browserInput)) {
				const source = URI.file(imported.problem.srcPath);
				const sourceGroup = groups.groups.find(group => !existingGroups.has(group.id) && group.count === 1 && group.contains({ resource: source }));
				if (sourceGroup && sourceGroup !== browserGroup) {
					groups.moveGroup(sourceGroup, browserGroup, GroupDirection.LEFT);
				}
			}
		} catch (error) {
			notifications.error(localize('browser.problem.failed', 'Could not import the problem: {0}', error instanceof Error ? error.message : String(error)));
		} finally {
			this.busy = false;
		}
	}
}

registerAction2(ImportProblemAction);

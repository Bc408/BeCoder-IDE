/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { DropdownWithDefaultActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuId, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

// The API submenu owns localized labels, command ordering and availability.
// Its native renderer keeps the primary action fixed at ordinary Run.
export const beCoderRunnerMenu = MenuId.for('api:becoder.runner.runMenu');

export class BeCoderRunnerActionViewContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.beCoderRunnerActionView';

	constructor(@IActionViewItemService items: IActionViewItemService) {
		super();
		this._register(items.register(MenuId.EditorTitle, beCoderRunnerMenu, (action, options, instantiation) => {
			if (action instanceof SubmenuItemAction) {
				return instantiation.createInstance(DropdownWithDefaultActionViewItem, action, {
					...options, togglePrimaryAction: false, primaryActionIds: ['becoder.runner.run'], menuAsChild: false
				});
			}
			return undefined;
		}));
	}
}

registerWorkbenchContribution2(BeCoderRunnerActionViewContribution.ID, BeCoderRunnerActionViewContribution, WorkbenchPhase.BlockRestore);

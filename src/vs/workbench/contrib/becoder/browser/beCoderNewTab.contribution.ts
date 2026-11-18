/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../common/editor.js';
import { BrowserEditorInput } from '../../browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../browserView/common/browserView.js';

registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'becoder.action.openNewTab', title: localize2('becoder.newTab', 'New Tab'), f1: false });
	}

	run(accessor: ServicesAccessor, groupId?: number): Promise<unknown> {
		return accessor.get(ICommandService).executeCommand(BrowserViewCommandId.NewTab, undefined, groupId);
	}
});

/** Restore tabs saved by older builds into the same native browser homepage. */
export class BeCoderNewTabInputSerializer implements IEditorSerializer {
	canSerialize(): boolean { return false; }
	serialize(): undefined { return undefined; }
	deserialize(instantiationService: IInstantiationService): BrowserEditorInput {
		return instantiationService.invokeFunction(accessor => accessor.get(IBrowserViewWorkbenchService).getOrCreateLazy(generateUuid()));
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer('workbench.editor.beCoderNewTab', BeCoderNewTabInputSerializer);

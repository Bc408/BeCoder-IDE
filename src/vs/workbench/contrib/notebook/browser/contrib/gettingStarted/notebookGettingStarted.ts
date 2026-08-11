/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../../../common/contributions.js';
import { Memento } from '../../../../../common/memento.js';
import { HAS_OPENED_NOTEBOOK } from '../../../common/notebookContextKeys.js';
import { NotebookEditorInput } from '../../../common/notebookEditorInput.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';

const hasOpenedNotebookKey = 'hasOpenedNotebook';

interface INotebookGettingStartedMemento {
	hasOpenedNotebook?: boolean;
}

export class NotebookGettingStarted extends Disposable implements IWorkbenchContribution {

	constructor(
		@IEditorService editorService: IEditorService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const hasOpenedNotebook = HAS_OPENED_NOTEBOOK.bindTo(contextKeyService);
		const memento = new Memento<INotebookGettingStartedMemento>('notebookGettingStarted2', storageService);
		const storedValue = memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);
		if (storedValue[hasOpenedNotebookKey]) {
			hasOpenedNotebook.set(true);
			return;
		}

		const onDidOpenNotebook = () => {
			hasOpenedNotebook.set(true);
			storedValue[hasOpenedNotebookKey] = true;
			memento.saveMemento();
		};
		if (editorService.activeEditor?.typeId === NotebookEditorInput.ID) {
			onDidOpenNotebook();
			return;
		}

		const listener = this._register(editorService.onDidActiveEditorChange(() => {
			if (editorService.activeEditor?.typeId === NotebookEditorInput.ID) {
				listener.dispose();
				onDidOpenNotebook();
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookGettingStarted, LifecyclePhase.Restored);

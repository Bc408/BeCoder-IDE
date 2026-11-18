/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorSerializer } from '../../../common/editor.js';
import { BrowserEditorInput } from '../../browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../browserView/common/browserView.js';

/** Old Welcome tabs restore into the native browser homepage. */
export class GettingStartedInputSerializer implements IEditorSerializer {
	canSerialize(): boolean { return false; }
	serialize(): undefined { return undefined; }

	deserialize(instantiationService: IInstantiationService): BrowserEditorInput {
		return instantiationService.invokeFunction(accessor => accessor.get(IBrowserViewWorkbenchService).getOrCreateLazy(generateUuid()));
	}
}

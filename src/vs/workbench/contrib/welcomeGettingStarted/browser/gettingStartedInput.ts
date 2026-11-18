/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';

// Retained only to restore tabs and resources saved by the old Welcome page.
export const gettingStartedInputTypeId = 'workbench.editors.gettingStartedInput';
export const gettingStartedResource = URI.from({ scheme: Schemas.walkThrough, authority: 'vscode_getting_started_page' });

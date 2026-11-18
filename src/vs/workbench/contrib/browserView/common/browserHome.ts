/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const BrowserHomeCommandId = 'workbench.action.browser.home';

export function isBrowserHomeUrl(url: string | undefined): boolean {
	return !url || url === 'about:blank';
}

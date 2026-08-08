/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserViewWorkbenchService, IBrowserViewModel, IBrowserEditorViewState } from '../common/browserView.js';
import type { PreferredGroup } from '../../../services/editor/common/editorService.js';
import { Event } from '../../../../base/common/event.js';
import { ITunnelProxyInfo } from '../../../../platform/tunnel/common/tunnelProxy.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';

class WebBrowserViewWorkbenchService implements IBrowserViewWorkbenchService {
	declare readonly _serviceBrand: undefined;

	willUseRemoteProxy(): boolean {
		return false;
	}

	setRemoteProxyInfo(_info: ITunnelProxyInfo | undefined): void { }

	readonly onDidChangeBrowserViews = Event.None;

	private readonly _known = new Map<string, BrowserEditorInput>();

	getKnownBrowserViews(): Map<string, BrowserEditorInput> {
		return this._known;
	}

	async getPreferredGroup(preferredGroup?: PreferredGroup): Promise<PreferredGroup | undefined> {
		return preferredGroup;
	}

	getOrCreateLazy(_id: string, _state: IBrowserEditorViewState): BrowserEditorInput {
		throw new Error('Integrated Browser is not available in web.');
	}

	getBrowserViewModel(_id: string): IBrowserViewModel | undefined {
		return undefined;
	}

	async clearGlobalStorage(): Promise<void> { }
	async clearWorkspaceStorage(): Promise<void> { }
}

registerSingleton(IBrowserViewWorkbenchService, WebBrowserViewWorkbenchService, InstantiationType.Delayed);

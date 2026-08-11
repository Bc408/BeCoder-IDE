/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/gettingStarted.css';
import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { IUntypedEditorInput } from '../../../common/editor.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';

export const gettingStartedInputTypeId = 'workbench.editors.gettingStartedInput';

export interface GettingStartedEditorOptions extends IEditorOptions {
	showTelemetryNotice?: boolean;
}

export class GettingStartedInput extends EditorInput {

	static readonly ID = gettingStartedInputTypeId;
	static readonly RESOURCE = URI.from({ scheme: Schemas.walkThrough, authority: 'vscode_getting_started_page' });
	static readonly ICON = FileAccess.asBrowserUri('vs/workbench/contrib/welcomeGettingStarted/common/media/becoder-icon.png');
	private _showTelemetryNotice: boolean;

	override get typeId(): string {
		return GettingStartedInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: GettingStartedInput.RESOURCE,
			options: {
				override: GettingStartedInput.ID,
				pinned: false
			}
		};
	}

	get resource(): URI | undefined {
		return GettingStartedInput.RESOURCE;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		return other instanceof GettingStartedInput;
	}

	constructor(
		options: GettingStartedEditorOptions) {
		super();
		this._showTelemetryNotice = !!options.showTelemetryNotice;
	}

	override getName() {
		return localize('getStarted', "Welcome");
	}

	override getIcon(): URI {
		return GettingStartedInput.ICON;
	}

	get showTelemetryNotice(): boolean {
		return this._showTelemetryNotice;
	}

	set showTelemetryNotice(value: boolean) {
		this._showTelemetryNotice = value;
	}
}

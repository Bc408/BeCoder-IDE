/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *---------------------------------------------------------------------------------------------
 *  Modifications Copyright (c) 2026 BeCoder IDE contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../common/editor/editorInput.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { URI } from '../../../../base/common/uri.js';
import { getNLSLanguage } from '../../../../nls.js';

export function localizeNewTab(english: string, chinese: string): string {
	return getNLSLanguage()?.toLowerCase().startsWith('zh') ? chinese : english;
}

export class BeCoderNewTabInput extends EditorInput {

	static readonly ID = 'workbench.editor.beCoderNewTab';
	static readonly RESOURCE = URI.from({ scheme: 'becoder-new-tab', path: 'default' });

	override get typeId(): string { return BeCoderNewTabInput.ID; }
	override get editorId(): string { return BeCoderNewTabInput.ID; }
	// A New Tab is intentionally duplicable: splitting it must populate the new
	// editor group with another New Tab instead of leaving that group blank.
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.NoNewWindow; }
	override get resource(): URI { return BeCoderNewTabInput.RESOURCE; }

	override getName(): string {
		// allow-any-unicode-next-line
		return localizeNewTab('New Tab', '新建标签页');
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || other instanceof BeCoderNewTabInput;
	}
}

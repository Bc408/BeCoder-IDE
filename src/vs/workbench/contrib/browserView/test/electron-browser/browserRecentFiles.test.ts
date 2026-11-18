/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserRecentFilesContribution } from '../../electron-browser/browserView.contribution.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IRecentFile, IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

suite('Browser unified recent files', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers actual local file activations in the existing native recent store', () => {
		const changed = disposables.add(new Emitter<void>());
		const recent: IRecentFile[] = [];
		let resource = URI.file('C:/practice/first.cpp');
		const editors = { get activeEditor() { return { resource } as EditorInput; }, onDidActiveEditorChange: changed.event };
		disposables.add(new BrowserRecentFilesContribution(editors as unknown as IEditorService,
			{ addRecentlyOpened: async (entries: IRecentFile[]) => { recent.push(...entries); } } as unknown as IWorkspacesService));
		resource = URI.file('C:/another-folder/second.cpp');
		changed.fire();
		resource = URI.parse('vscode-browser:/hidden-login');
		changed.fire();
		resource = URI.parse('untitled:Untitled-1');
		changed.fire();
		assert.deepStrictEqual(recent.map(entry => entry.fileUri.path), [URI.file('C:/practice/first.cpp').path, URI.file('C:/another-folder/second.cpp').path]);
	});
});

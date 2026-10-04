/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { FileTools, type FilePermission, type FileRoot } from './fileTools';

export function currentFileRoots(): FileRoot[] {
	return (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => ({ name: folder.name, path: folder.uri.fsPath }));
}

export function createFileTools(permission: FilePermission, roots = currentFileRoots()): FileTools {
	return new FileTools(permission, roots, async file => {
		// Resolve aliases when reading, so documents opened during a response also
		// include unsaved edits. FileTools has already authorized the actual target.
		for (const document of vscode.workspace.textDocuments) {
			if (document.uri.scheme !== 'file' || document.isClosed) { continue; }
			try { if (await fs.realpath(document.uri.fsPath) === file) { return document.getText(); } } catch { /* An editor file may have been removed. */ }
		}
		return undefined;
	});
}

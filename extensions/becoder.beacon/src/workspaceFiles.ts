/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { FileTools, type FileAccessOptions, type FilePermission, type FileRoot } from './fileTools';

export function currentFileRoots(): FileRoot[] {
	return (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => ({ name: folder.name, path: folder.uri.fsPath }));
}

export function createFileTools(permission: FilePermission, roots = currentFileRoots(), options: FileAccessOptions = {}): FileTools {
	return new FileTools(permission, roots, async file => {
		// Resolve aliases when reading, so documents opened during a response also
		// include unsaved edits. FileTools has already authorized the actual target.
		for (const document of vscode.workspace.textDocuments) {
			if (document.uri.scheme !== 'file' || document.isClosed) { continue; }
			try {
				if (await fs.realpath(document.uri.fsPath) === file) {
					const version = document.version;
					return { contents: document.getText(), verify: () => { if (document.isClosed || document.version !== version || !vscode.workspace.textDocuments.includes(document)) { throw new Error('file-changed'); } } };
				}
			} catch { /* An editor file may have been removed. */ }
		}
		return undefined;
	}, { ...options, readRepresentation: options.readRepresentation ?? (async (file, signal) => {
		if (!/\.bcnb(?:-backup)?$/i.test(file)) { return undefined; }
		const extension = vscode.extensions.getExtension<{ readBeaconContent?(sourceUri: string, signal: AbortSignal): Promise<{ contents: string; representation: 'notebook-content'; verify?(): void }> }>('becoder.notebook');
		const api = await extension?.activate();
		if (!api?.readBeaconContent) { throw new Error('notebook-content-unavailable'); }
		return api.readBeaconContent(vscode.Uri.file(file).toString(), signal);
	}) });
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { WorkspaceFileReader } from './session';

const maxFileBytes = 128 * 1024;

export function normalizeWorkspaceFilePath(value: unknown): string[] {
	if (typeof value !== 'string' || !value.trim() || value.length > 1024) { throw new Error('invalid-workspace-path'); }
	const normalized = value.trim().replaceAll('\\', '/');
	if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) { throw new Error('invalid-workspace-path'); }
	const parts = normalized.split('/').filter(part => part !== '.');
	if (!parts.length || parts.some(part => !part || part === '..' || /[<>:"|?*\0]/.test(part) || part.endsWith('.') || part.endsWith(' '))) {
		throw new Error('invalid-workspace-path');
	}
	if (parts.some(part => /^(?:\.git|\.ssh|\.aws|\.azure|\.kube|\.gnupg)$/i.test(part) || /^\.env(?:\.|$)/i.test(part) || /^(?:id_rsa|id_ed25519|credentials|\.npmrc|\.pypirc|\.netrc|\.htpasswd)$/i.test(part) || /\.(?:pem|key|p12|pfx|p8)$/i.test(part))) {
		throw new Error('protected-workspace-file');
	}
	return parts;
}

export function decodeWorkspaceFile(bytes: Uint8Array): string {
	if (bytes.byteLength > maxFileBytes) { throw new Error('workspace-file-too-large'); }
	let text: string;
	try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
	catch { throw new Error('workspace-file-not-text'); }
	if (text.includes('\0')) { throw new Error('workspace-file-not-text'); }
	return text;
}

export function createWorkspaceFileReader(): WorkspaceFileReader {
	return async (input, signal) => {
		signal.throwIfAborted();
		const parts = normalizeWorkspaceFilePath(input);
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (!folders.length) { throw new Error('no-workspace'); }
		let folder: vscode.WorkspaceFolder;
		if (folders.length === 1) {
			folder = folders[0];
		} else {
			const matches = folders.filter(candidate => candidate.name === parts[0]);
			if (matches.length !== 1 || parts.length < 2) { throw new Error('workspace-folder-required'); }
			folder = matches[0];
			parts.shift();
		}
		const relativePath = parts.join('/');
		const uri = vscode.Uri.joinPath(folder.uri, ...parts);
		if (vscode.workspace.getWorkspaceFolder(uri)?.index !== folder.index) { throw new Error('workspace-path-outside-root'); }

		for (let index = 1; index <= parts.length; index++) {
			signal.throwIfAborted();
			const current = vscode.Uri.joinPath(folder.uri, ...parts.slice(0, index));
			const stat = await vscode.workspace.fs.stat(current);
			if ((stat.type & vscode.FileType.SymbolicLink) !== 0) { throw new Error('workspace-symlink-not-allowed'); }
			if (index < parts.length && (stat.type & vscode.FileType.Directory) === 0) { throw new Error('workspace-file-not-found'); }
			if (index === parts.length) {
				if ((stat.type & vscode.FileType.File) === 0) { throw new Error('workspace-file-not-readable'); }
				if (stat.size > maxFileBytes) { throw new Error('workspace-file-too-large'); }
			}
		}

		const bytes = await vscode.workspace.fs.readFile(uri);
		signal.throwIfAborted();
		return { path: relativePath, content: decodeWorkspaceFile(bytes) };
	};
}

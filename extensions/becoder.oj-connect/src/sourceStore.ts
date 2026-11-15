/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { validDirectoryName } from './settings';

function ordinary(value: string, directory: boolean): fs.BigIntStats {
	const stat = fs.lstatSync(value, { bigint: true });
	if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1n)) { throw new Error('The import path is linked or is not an ordinary file/directory.'); }
	return stat;
}
function same(value: string, identity: fs.BigIntStats, directory: boolean): void {
	const current = ordinary(value, directory);
	if (current.dev !== identity.dev || current.ino !== identity.ino) { throw new Error('The import directory changed.'); }
}
/** Only one explicitly selected workspace and its direct site child; never truncates a solution. */
export class SourceStore {
	constructor(private readonly beforeCreate?: () => void) { }
	async openOrCreate(root: string, directory: string, fileName: string, signal: AbortSignal): Promise<{ sourcePath: string; created: boolean }> {
		signal.throwIfAborted();
		// Reuse the settings validator without accepting a page-provided directory.
		if (!validDirectoryName(directory)) { throw new Error('Invalid site directory setting.'); }
		if (!/^[A-Za-z0-9_@.-]+\.cpp$/.test(fileName) || fileName.length > 200 || fileName.startsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(fileName)) { throw new Error('Invalid problem source filename.'); }
		root = path.resolve(root);
		const canonical = fs.realpathSync(root);
		if (canonical.toLowerCase() !== root.toLowerCase()) { throw new Error('The workspace path is redirected.'); }
		const rootIdentity = ordinary(root, true), target = path.join(root, directory), sourcePath = path.join(target, fileName);
		const checkRoot = () => { signal.throwIfAborted(); same(root, rootIdentity, true); if (fs.realpathSync(root).toLowerCase() !== canonical.toLowerCase()) { throw new Error('The workspace changed.'); } };
		checkRoot();
		try { fs.mkdirSync(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; } }
		const identity = ordinary(target, true);
		const check = () => { checkRoot(); same(target, identity, true); if (path.dirname(fs.realpathSync(target)).toLowerCase() !== canonical.toLowerCase()) { throw new Error('The site directory escaped the workspace.'); } };
		check(); this.beforeCreate?.(); check();
		let descriptor: number | undefined, created = false;
		try {
			try { descriptor = fs.openSync(sourcePath, 'wx'); created = true; }
			catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; } }
			check(); const source = ordinary(sourcePath, false);
			if (descriptor !== undefined) { const opened = fs.fstatSync(descriptor, { bigint: true }); if (source.dev !== opened.dev || source.ino !== opened.ino) { throw new Error('The source file changed during import.'); } }
			return { sourcePath, created };
		} finally { if (descriptor !== undefined) { fs.closeSync(descriptor); } }
	}
}

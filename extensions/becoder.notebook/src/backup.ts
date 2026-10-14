/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

export async function writeNotebookBackup(file: string, bytes: Uint8Array, verify: () => Promise<void>): Promise<string> {
	if (!path.isAbsolute(file) || !/\.bcnb$/i.test(file)) { throw new Error('notebook-invalid-backup-target'); }
	const backup = file.replace(/\.bcnb$/i, '.bcnb-backup'); const directory = await fs.realpath(path.dirname(file)); const parent = await fs.stat(directory);
	const check = async () => {
		await verify(); const now = await fs.stat(await fs.realpath(path.dirname(file)));
		if (now.dev !== parent.dev || now.ino !== parent.ino) { throw new Error('notebook-backup-parent-changed'); }
		try { const stat = await fs.lstat(backup); if (!stat.isFile() || stat.isSymbolicLink()) { throw new Error('notebook-backup-conflict'); } }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
	};
	await check(); const temporary = path.join(directory, '.' + path.basename(backup) + '-' + randomUUID() + '.tmp');
	const handle = await fs.open(temporary, 'wx'); const owned = await handle.stat(); let published = false; let failure: unknown; let cleanup: unknown;
	try { await handle.writeFile(bytes); await handle.close(); await check(); await fs.rename(temporary, backup); published = true; } catch (error) { failure = error; }
	try { await handle.close(); if (!published) { try { const current = await fs.lstat(temporary); if (!current.isSymbolicLink() && current.dev === owned.dev && current.ino === owned.ino) { await fs.unlink(temporary); } } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } } } } catch (error) { cleanup = error; }
	if (failure) { throw new Error(String(failure) + (cleanup ? '; cleanup: ' + String(cleanup) : ''), { cause: failure }); } if (cleanup) { throw cleanup; } return backup;
}

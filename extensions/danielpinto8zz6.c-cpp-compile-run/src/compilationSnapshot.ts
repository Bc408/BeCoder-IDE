/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

/** Main source only. Local headers remain live and are not reproducibility evidence. */
export interface CompilationSourceSnapshot {
	readonly originalPath: string;
	readonly canonicalPath: string;
	readonly path: string;
	readonly capturedAt: number;
	readonly bytesBase64: string;
	readonly byteLength: number;
	readonly sha256: string;
}

/** The request owner retires the containing session after its compiler exits. */
export async function captureCompilationSource(source: string, session: string): Promise<CompilationSourceSnapshot> {
	const originalPath = path.resolve(source);
	const canonicalPath = await fs.promises.realpath(originalPath);
	const handle = await fs.promises.open(canonicalPath, 'r');
	let bytes: Buffer;
	let stat: fs.Stats;
	try {
		stat = await handle.stat();
		if (!stat.isFile()) { throw new Error('Compilation requires an ordinary source file.'); }
		bytes = await handle.readFile();
	} finally {
		await handle.close();
	}
	const capturedAt = Date.now();
	const directory = await fs.promises.mkdtemp(path.join(session, 'source-'));
	const mirrorPath = path.join(directory, path.basename(originalPath));
	await fs.promises.writeFile(mirrorPath, bytes, { flag: 'wx' });
	// __TIMESTAMP__ uses the source mtime, not the time the mirror was written.
	await fs.promises.utimes(mirrorPath, stat.atime, stat.mtime);
	return Object.freeze({ originalPath, canonicalPath, path: mirrorPath, capturedAt, bytesBase64: bytes.toString('base64'), byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}

/** Map compiler locations across arbitrary stdout/stderr chunk boundaries. */
export class CompilerPathMapper {
	private pending = '';
	private readonly paths: readonly string[];

	constructor(private readonly snapshot: CompilationSourceSnapshot) {
		this.paths = [...new Set([snapshot.path, snapshot.path.replace(/\\/g, '/')])];
	}

	write(chunk: string): string {
		let content = this.pending + chunk;
		for (const from of this.paths) { content = content.split(from).join(this.snapshot.originalPath); }
		let retained = 0;
		for (const from of this.paths) {
			for (let length = Math.min(from.length - 1, content.length); length > retained; length--) {
				if (content.endsWith(from.slice(0, length))) { retained = length; break; }
			}
		}
		this.pending = retained ? content.slice(-retained) : '';
		return retained ? content.slice(0, -retained) : content;
	}

	end(): string {
		const pending = this.pending;
		this.pending = '';
		return pending;
	}
}

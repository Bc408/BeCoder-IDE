/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';

export type FilePermission = 'none' | 'workspace' | 'computer';
export const isFilePermission = (value: unknown): value is FilePermission => value === 'none' || value === 'workspace' || value === 'computer';
export interface FileInput {
	operation: 'read' | 'list' | 'find' | 'search';
	path: string;
	offset?: number;
	limit?: number;
	query?: string;
}
export interface FileOutput {
	ok: boolean;
	path: string;
	kind?: 'text' | 'binary' | 'image' | 'entries' | 'matches';
	contents?: string;
	mediaType?: string;
	nextOffset?: number;
	truncated?: boolean;
	error?: string;
}
export type FileTool = (input: FileInput, signal: AbortSignal) => Promise<FileOutput>;
export interface FileRoot { name: string; path: string }

const chunkBytes = 128 * 1024;
const responseBytes = 8 * 1024 * 1024;
const imageBytes = 4 * 1024 * 1024;
const protectedPart = /^(?:\.git|\.ssh|\.aws|\.azure|\.kube|\.gnupg|\.npmrc|\.pypirc|\.netrc|\.htpasswd|id_rsa|id_ed25519|credentials|secrets?|cookies|login data|web data|local state|state\.vscdb(?:.*)|keychains?|vault)(?:$|\.)|^\.env(?:\.|$)|\.(?:pem|key|p12|pfx|p8|kdbx)$/i;

function checkPath(value: string): void {
	if (!value || value.length > 4096 || /[\0<>"|?*]/.test(value) || /^(?:\\\\[?.]\\|\/\/\?|[a-z]:[^\\/])/i.test(value) || /:/.test(value.replace(/^[a-z]:/i, ''))) { throw new Error('invalid-file-path'); }
	if (value.split(/[\\/]/).some(part => protectedPart.test(part))) { throw new Error('protected-file'); }
}
const within = (target: string, root: string) => { const relative = path.relative(root, target); return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };

export function safeFileError(error: unknown): string {
	const code = error instanceof Error ? error.message : '';
	const messages: Record<string, string> = {
		'files-disabled': 'Local file access is disabled for this response.',
		'no-workspace': 'No local workspace folder is open.',
		'invalid-file-path': 'Specify an ordinary file or directory path, without device paths or alternate streams.',
		'workspace-folder-required': 'Prefix a relative path with the workspace folder name.',
		'outside-workspace': 'The actual file target is outside the authorized workspace.',
		'protected-file': 'This private or credential file is excluded in every permission mode.',
		'file-changed': 'The file changed during access. Request it again.',
		'file-budget': 'The file result budget for this response has been reached.',
		'image-too-large': 'This image exceeds the 4 MiB limit. Use a smaller image.',
		'invalid-file-input': 'Use a nonnegative integer offset, a limit between 1 and 131072, and a nonempty search query.',
		'not-ordinary-file': 'Only ordinary files and directories can be accessed.'
	};
	return messages[code] ?? 'The file could not be accessed. Check the path and operating system permissions.';
}

/** One instance per response: permission, workspace roots and read budget never change mid-stream. */
export class FileTools {
	private used = 0;
	private readonly roots: Promise<FileRoot[]>;
	constructor(readonly permission: FilePermission, roots: FileRoot[], private readonly openText: (file: string) => string | undefined | Promise<string | undefined> = () => undefined) {
		this.roots = permission === 'none' ? Promise.resolve([]) : Promise.all(roots.map(async root => {
			try { return { ...root, path: await fs.realpath(root.path) }; } catch { return undefined; }
		})).then(roots => roots.filter((root): root is FileRoot => root !== undefined));
	}
	private async resolve(input: string, signal: AbortSignal): Promise<string> {
		signal.throwIfAborted();
		if (this.permission === 'none') { throw new Error('files-disabled'); }
		checkPath(input);
		const roots = await this.roots;
		let target = input;
		if (!path.isAbsolute(target)) {
			if (!roots.length) { throw new Error('no-workspace'); }
			let root = roots[0];
			if (roots.length > 1) {
				const parts = target.replaceAll('\\', '/').split('/');
				const matches = roots.filter(root => root.name === parts[0]);
				if (matches.length !== 1) { throw new Error('workspace-folder-required'); }
				root = matches[0]; parts.shift(); target = parts.join('/');
			}
			target = path.resolve(root.path, target);
		}
		checkPath(target);
		const real = await fs.realpath(target);
		checkPath(real);
		if (this.permission === 'workspace' && !roots.some(root => within(real, root.path))) { throw new Error('outside-workspace'); }
		signal.throwIfAborted();
		return real;
	}
	private charge(size: number): void {
		this.used += size;
		if (this.used > responseBytes) { throw new Error('file-budget'); }
	}
	readonly execute: FileTool = async (input, signal) => {
		try {
			if (!['read', 'list', 'find', 'search'].includes(input.operation) || (input.offset !== undefined && (!Number.isSafeInteger(input.offset) || input.offset < 0)) || (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > chunkBytes)) || (['find', 'search'].includes(input.operation) && (!input.query?.trim() || input.query.length > 256))) { throw new Error('invalid-file-input'); }
			if (this.used >= responseBytes) { throw new Error('file-budget'); }
			const file = await this.resolve(input.path, signal);
			const result = input.operation === 'read' ? await this.read(file, input, signal) : await this.scan(file, input, signal);
			this.charge(Buffer.byteLength(result.contents ?? '', 'utf8'));
			return result;
		} catch (error) {
			if (signal.aborted) { throw error; }
			return { ok: false, path: input.path, error: safeFileError(error) };
		}
	};
	private async read(file: string, input: FileInput, signal: AbortSignal): Promise<FileOutput> {
		const offset = input.offset ?? 0;
		const limit = input.limit ?? chunkBytes;
		const base = { ok: true, path: file };
		if (!(await fs.stat(file)).isFile()) { throw new Error('not-ordinary-file'); }
		const handle = await fs.open(file, 'r');
		try {
			const stat = await handle.stat();
			if (!stat.isFile()) { throw new Error('not-ordinary-file'); }
			await this.verify(file, stat, signal);
			const text = await this.openText(file);
			if (text !== undefined) {
				// Character offsets preserve surrogate pairs; disk reads below use byte offsets.
				let end = Math.min(text.length, offset + Math.max(1, Math.floor(limit / 4)));
				if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) { end += end === offset + 1 ? 1 : -1; }
				signal.throwIfAborted();
				return { ...base, kind: 'text', contents: text.slice(offset, end), ...(end < text.length ? { nextOffset: end } : {}) };
			}
			const imageType: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
			const mediaType = imageType[path.extname(file).toLowerCase()];
			if (mediaType && (offset || stat.size > imageBytes)) { throw new Error('image-too-large'); }
			const buffer = Buffer.alloc(Math.min(mediaType ? imageBytes : limit, Math.max(0, stat.size - offset)));
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
			await this.verify(file, stat, signal);
			const bytes = buffer.subarray(0, bytesRead);
			if (mediaType) { return { ...base, kind: 'image', contents: bytes.toString('base64'), mediaType }; }
			let length = bytes.length;
			let contents: string | undefined;
			for (let trim = 0; trim <= Math.min(3, bytes.length); trim++) {
				try { const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytes.length - trim)); if (!decoded.includes('\0')) { contents = decoded; length -= trim; } break; } catch { /* A chunk may end inside a UTF-8 character. */ }
			}
			const binary = contents === undefined || (length === 0 && bytes.length > 0);
			if (binary) { length = Math.min(bytes.length, 8192); contents = bytes.subarray(0, length).toString('hex'); }
			return { ...base, kind: binary ? 'binary' : 'text', contents, ...(offset + length < stat.size ? { nextOffset: offset + length } : {}) };
		} finally { await handle.close(); }
	}
	private async verify(file: string, original: { ino: number; dev: number; size: number; mtimeMs: number }, signal: AbortSignal): Promise<void> {
		const canonical = await this.resolve(file, signal);
		const current = await fs.stat(canonical);
		if (canonical !== file || current.ino !== original.ino || current.dev !== original.dev || current.size !== original.size || current.mtimeMs !== original.mtimeMs) { throw new Error('file-changed'); }
	}
	private async scan(root: string, input: FileInput, signal: AbortSignal): Promise<FileOutput> {
		const pending = [root];
		const visited = new Set<string>();
		const results: string[] = [];
		let inspected = 0;
		const maxResults = Math.min(input.limit ?? 100, 200);
		while (pending.length && results.length < maxResults && inspected < 2000) {
			const directory = await this.resolve(pending.pop()!, signal);
			if (visited.has(directory)) { continue; }
			visited.add(directory);
			const entries = await fs.opendir(directory);
			for await (const entry of entries) {
				if (++inspected > 2000 || results.length >= maxResults) { break; }
				let file: string;
				try { file = await this.resolve(path.join(directory, entry.name), signal); } catch (error) { if (signal.aborted) { throw error; } continue; }
				const stat = await fs.stat(file);
				if (!stat.isDirectory() && !stat.isFile()) { continue; }
				if (input.operation === 'list') { results.push(`${stat.isDirectory() ? 'directory' : 'file'}\t${file}`); }
				else {
					if (stat.isDirectory()) { pending.push(file); }
					if (input.operation === 'find' && entry.name.toLowerCase().includes(input.query!.toLowerCase())) { results.push(file); }
					if (input.operation === 'search' && stat.isFile()) {
						let output: FileOutput;
						try { output = await this.read(file, { operation: 'read', path: file, limit: chunkBytes }, signal); } catch (error) { if (signal.aborted) { throw error; } continue; }
						this.charge(Buffer.byteLength(output.contents ?? '', 'utf8'));
						if (output.kind !== 'text') { continue; }
						for (const [index, line] of output.contents!.split('\n').entries()) {
							if (line.toLowerCase().includes(input.query!.toLowerCase())) { results.push(`${file}:${index + 1}: ${line.slice(0, 500)}`); }
							if (results.length >= maxResults) { break; }
						}
					}
				}
			}
			if (input.operation === 'list') { break; }
		}
		return { ok: true, path: root, kind: input.operation === 'list' ? 'entries' : 'matches', contents: results.join('\n'), truncated: inspected >= 2000 || results.length >= maxResults || pending.length > 0 };
	}
}

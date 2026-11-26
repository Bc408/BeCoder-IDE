/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import { toolErrorCode, type ToolError } from './toolFeedback';

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
	representation?: 'notebook-content';
	contents?: string;
	mediaType?: string;
	offsetUnit?: 'character' | 'byte';
	nextOffset?: number;
	truncated?: boolean;
	error?: string;
	failureCode?: string;
	code?: ToolError;
}
export type FileTool = (input: FileInput, signal: AbortSignal) => Promise<FileOutput>;
export interface FileRoot { name: string; path: string }
export interface FileText { contents: string; verify?(): void }
export interface FileAccessOptions { protectedRoots?: string[]; suppliedFiles?: string[]; readRepresentation?: (file: string, signal: AbortSignal) => Promise<FileText & { representation: 'notebook-content' } | undefined> }

const chunkBytes = 128 * 1024;
const responseBytes = 8 * 1024 * 1024;
const imageBytes = 4 * 1024 * 1024;
const defaultCharacters = 32768;
const protectedPart = /^(?:\.git|\.ssh|\.aws|\.azure|\.kube|\.gnupg|\.npmrc|\.pypirc|\.netrc|\.htpasswd|id_rsa|id_ed25519|credentials|secrets?|cookies|login data|web data|local state|state\.vscdb(?:.*)|keychains?|vault)(?:$|\.)|^\.env(?:\.|$)|\.(?:pem|key|p12|pfx|p8|kdbx)$/i;
export const isProtectedFilePath = (value: string): boolean => value.split(/[\\/]/).some(part => protectedPart.test(part));

function checkPath(value: string): void {
	if (typeof value !== 'string' || !value || value.length > 4096 || /[\0<>"|?*]/.test(value) || /^(?:\\\\[?.]\\|\/\/\?|[a-z]:[^\\/])/i.test(value) || /:/.test(value.replace(/^[a-z]:/i, ''))) { throw new Error('invalid-file-path'); }
	if (value.split(/[\\/]/).some(part => protectedPart.test(part))) { throw new Error('protected-file'); }
}
const within = (target: string, root: string) => { const relative = path.relative(root, target); return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };

function fileErrorName(error: unknown): string {
	if (error instanceof Error && error.message === 'notebook-version-changed') { return 'file-changed'; }
	const osCode = error && typeof error === 'object' ? (error as NodeJS.ErrnoException).code : undefined;
	const codes: Record<string, string> = { ENOENT: 'file-not-found', EACCES: 'file-permission-denied', EPERM: 'file-permission-denied', ENOTDIR: 'not-directory', EISDIR: 'not-ordinary-file', ELOOP: 'invalid-file-path', EINVAL: 'invalid-file-path' };
	return osCode && Object.hasOwn(codes, osCode) ? codes[osCode] : error instanceof Error ? error.message : '';
}

/** A bounded output window shared by decoded disk text and owner/editor text. */
class CharacterWindow {
	private readonly parts: string[] = [];
	private position = 0;
	private bytes = 0;
	private more = false;
	constructor(private readonly offset: number, private readonly limit: number, private readonly byteLimit: number) { }
	append(text: string): boolean {
		for (const character of text) {
			if (this.position < this.offset) { this.position++; continue; }
			const size = Buffer.byteLength(character, 'utf8');
			if (this.parts.length >= this.limit || this.bytes + size > this.byteLimit) {
				if (!this.parts.length) { throw new Error('file-budget'); }
				this.more = true; return true;
			}
			this.parts.push(character); this.bytes += size; this.position++;
		}
		return false;
	}
	result(): Pick<FileOutput, 'contents' | 'offsetUnit' | 'nextOffset'> {
		return { contents: this.parts.join(''), offsetUnit: 'character', ...(this.more ? { nextOffset: this.offset + this.parts.length } : {}) };
	}
}

const knownFileErrors = new Set(['files-disabled', 'no-workspace', 'beacon-assets', 'not-supplied-file', 'invalid-file-path', 'workspace-folder-required', 'outside-workspace', 'protected-file', 'file-changed', 'file-budget', 'image-too-large', 'invalid-file-input', 'not-ordinary-file', 'not-directory', 'file-not-found', 'file-permission-denied', 'image-range']);

export function safeFileError(error: unknown): string {
	const code = fileErrorName(error);
	const messages: Record<string, string> = {
		'files-disabled': 'Local file access is disabled for this response.',
		'no-workspace': 'No usable Beacon workspace is selected.',
		'beacon-assets': 'Beacon private assets are excluded from ordinary file access.',
		'not-supplied-file': 'This capture is limited to the files supplied by the user.',
		'invalid-file-path': 'Specify an ordinary file or directory path, without device paths or alternate streams.',
		'workspace-folder-required': 'Prefix a relative path with the workspace folder name.',
		'outside-workspace': 'The actual file target is outside the authorized workspace.',
		'protected-file': 'This private or credential file is excluded in every permission mode.',
		'file-changed': 'The file changed during access. Request it again.',
		'file-budget': 'The file result budget for this response has been reached.',
		'image-too-large': 'This image exceeds the 4 MiB limit. Use a smaller image.',
		'invalid-file-input': 'Use only parameters for this operation: read takes character offset/limit (default 32768, maximum 131072); directory operations take limit (default 100, maximum 200); find/search require query.',
		'not-ordinary-file': 'Reading requires an ordinary file, not a directory or special file.',
		'not-directory': 'Listing, finding and searching require a directory. Use read for a file.',
		'file-not-found': 'The requested path does not exist. Check the listed root and relative or absolute path.',
		'file-permission-denied': 'Operating system access was denied. Check the file or directory permissions.',
		'image-range': 'Read an image without offset or limit; text continuation is unavailable for images.'
	};
	return Object.hasOwn(messages, code) ? messages[code] : 'The file could not be accessed. Check the path and operating system permissions.';
}

/** One instance per response: permission, workspace roots and read budget never change mid-stream. */
export class FileTools {
	private used = 0;
	private readonly roots: Promise<FileRoot[]>;
	private readonly protectedRoots: Promise<string[]>;
	private readonly suppliedFiles: Promise<string[]> | undefined;
	constructor(readonly permission: FilePermission, roots: FileRoot[], private readonly openText: (file: string) => string | FileText | undefined | Promise<string | FileText | undefined> = () => undefined, private readonly options: FileAccessOptions = {}) {
		const canonical = async (files: string[]) => Promise.all(files.map(async file => { try { return await fs.realpath(file); } catch { return path.resolve(file); } }));
		this.protectedRoots = canonical(options.protectedRoots ?? []);
		this.suppliedFiles = options.suppliedFiles ? canonical(options.suppliedFiles) : undefined;
		this.roots = permission === 'none' ? Promise.resolve([]) : Promise.all(roots.map(async root => {
			try { return { ...root, path: await fs.realpath(root.path) }; } catch { return undefined; }
		})).then(roots => roots.filter((root): root is FileRoot => root !== undefined));
	}
	authorize(file: string, signal: AbortSignal): Promise<string> { return this.resolve(file, signal); }
	private async resolve(input: string, signal: AbortSignal): Promise<string> {
		signal.throwIfAborted();
		if (this.permission === 'none') { throw new Error('files-disabled'); }
		checkPath(input);
		if (!this.suppliedFiles && input.split(/[\\/]/).some(part => part.toLowerCase() === '.beaconwork')) { throw new Error('beacon-assets'); }
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
		if (!this.suppliedFiles && target.split(/[\\/]/).some(part => part.toLowerCase() === '.beaconwork')) { throw new Error('beacon-assets'); }
		const real = await fs.realpath(target);
		checkPath(real);
		if (this.suppliedFiles) {
			if (!(await this.suppliedFiles).includes(real)) { throw new Error('not-supplied-file'); }
		} else if (real.split(/[\\/]/).some(part => part.toLowerCase() === '.beaconwork') || (await this.protectedRoots).some(root => within(real, root))) { throw new Error('beacon-assets'); }
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
			if (this.suppliedFiles && input.operation !== 'read') { throw new Error('not-supplied-file'); }
			if (!input || typeof input !== 'object' || !['read', 'list', 'find', 'search'].includes(input.operation)) { throw new Error('invalid-file-input'); }
			const allowed = input.operation === 'read' ? ['operation', 'path', 'offset', 'limit'] : input.operation === 'list' ? ['operation', 'path', 'limit'] : ['operation', 'path', 'limit', 'query'];
			if (Object.keys(input).some(key => !allowed.includes(key)) || (input.offset !== undefined && (!Number.isSafeInteger(input.offset) || input.offset < 0)) || (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > (input.operation === 'read' ? chunkBytes : 200))) || (['find', 'search'].includes(input.operation) && (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 256))) { throw new Error('invalid-file-input'); }
			if (this.used >= responseBytes) { throw new Error('file-budget'); }
			const file = await this.resolve(input.path, signal);
			const result = input.operation === 'read' ? await this.read(file, input, signal) : await this.scan(file, input, signal);
			signal.throwIfAborted();
			if (input.operation === 'read') { this.charge(Buffer.byteLength(result.contents ?? '', 'utf8')); }
			return result;
		} catch (error) {
			if (signal.aborted) { throw error; }
			const name = fileErrorName(error);
			return { ok: false, path: input?.path, code: name === 'file-not-found' ? 'material-missing' : name === 'file-permission-denied' ? 'protected' : ['not-directory', 'image-range'].includes(name) ? 'invalid-input' : toolErrorCode(name), failureCode: knownFileErrors.has(name) ? name : 'read_failed', error: safeFileError(error) };
		}
	};
	private async read(file: string, input: FileInput, signal: AbortSignal): Promise<FileOutput> {
		const offset = input.offset ?? 0;
		const limit = input.limit ?? defaultCharacters;
		const byteLimit = Math.min(chunkBytes, responseBytes - this.used);
		const base = { ok: true, path: file };
		if (!(await fs.stat(file)).isFile()) { throw new Error('not-ordinary-file'); }
		const handle = await fs.open(file, 'r');
		let verifyOwner: (() => void) | undefined;
		try {
			const stat = await handle.stat();
			if (!stat.isFile()) { throw new Error('not-ordinary-file'); }
			await this.verify(file, stat, signal);
			const representation = this.suppliedFiles ? undefined : await this.options.readRepresentation?.(file, signal);
			if (!this.suppliedFiles && /\.bcnb(?:-backup)?$/i.test(file) && !representation) { throw new Error('notebook-content-unavailable'); }
			const owner = representation ?? await this.openText(file);
			const text = typeof owner === 'string' ? owner : owner?.contents;
			if (text !== undefined) {
				const window = new CharacterWindow(offset, limit, byteLimit); window.append(text);
				signal.throwIfAborted();
				await this.verify(file, stat, signal);
				if (typeof owner !== 'string') { verifyOwner = owner?.verify; }
				return { ...base, kind: 'text', ...(representation ? { representation: representation.representation } : {}), ...window.result() };
			}
			const imageType: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
			const mediaType = imageType[path.extname(file).toLowerCase()];
			if (mediaType) {
				if (input.offset !== undefined || input.limit !== undefined) { throw new Error('image-range'); }
				if (stat.size > imageBytes) { throw new Error('image-too-large'); }
				const buffer = Buffer.alloc(stat.size); let position = 0;
				while (position < buffer.length) { signal.throwIfAborted(); const result = await handle.read(buffer, position, buffer.length - position, position); if (!result.bytesRead) { break; } position += result.bytesRead; }
				await this.verify(file, stat, signal);
				return { ...base, kind: 'image', contents: buffer.subarray(0, position).toString('base64'), mediaType };
			}
			const window = new CharacterWindow(offset, limit, byteLimit), decoder = new TextDecoder('utf-8', { fatal: true });
			const buffer = Buffer.alloc(64 * 1024); let position = 0, binary = false;
			while (true) {
				signal.throwIfAborted();
				const { bytesRead } = await handle.read(buffer, 0, buffer.length, position); position += bytesRead;
				let decoded: string;
				try { decoded = decoder.decode(buffer.subarray(0, bytesRead), { stream: bytesRead > 0 }); } catch { binary = true; break; }
				if (decoded.includes('\0')) { binary = true; break; }
				if (window.append(decoded) || !bytesRead) { break; }
			}
			if (!binary) { await this.verify(file, stat, signal); return { ...base, kind: 'text', ...window.result() }; }
			const bytes = Buffer.alloc(Math.min(limit, 8192, Math.floor(byteLimit / 2), Math.max(0, stat.size - offset)));
			if (!bytes.length && offset < stat.size) { throw new Error('file-budget'); }
			const { bytesRead } = await handle.read(bytes, 0, bytes.length, offset);
			await this.verify(file, stat, signal);
			return { ...base, kind: 'binary', offsetUnit: 'byte', contents: bytes.subarray(0, bytesRead).toString('hex'), ...(offset + bytesRead < stat.size ? { nextOffset: offset + bytesRead } : {}) };
		} finally { await handle.close(); verifyOwner?.(); }
	}
	private async verify(file: string, original: { ino: number; dev: number; size: number; mtimeMs: number }, signal: AbortSignal): Promise<void> {
		try {
			const canonical = await this.resolve(file, signal);
			const current = await fs.stat(canonical);
			if (canonical !== file || current.ino !== original.ino || current.dev !== original.dev || current.size !== original.size || current.mtimeMs !== original.mtimeMs) { throw new Error('file-changed'); }
		} catch (error) {
			if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) { throw new Error('file-changed'); }
			throw error;
		}
	}
	private async scan(root: string, input: FileInput, signal: AbortSignal): Promise<FileOutput> {
		const pending = [root];
		const visited = new Set<string>();
		const results: string[] = [];
		let inspected = 0, bytes = 0, full = false, partial = false;
		const append = (value: string) => {
			const size = Buffer.byteLength(value, 'utf8') + (results.length ? 1 : 0);
			if (bytes + size > chunkBytes || this.used + size > responseBytes) {
				if (!results.length) { throw new Error('file-budget'); }
				full = true; return;
			}
			results.push(value); bytes += size; this.charge(size);
		};
		const maxResults = Math.min(input.limit ?? 100, 200);
		while (pending.length && results.length < maxResults && inspected < 2000 && !full) {
			const directory = await this.resolve(pending.pop()!, signal);
			if (visited.has(directory)) { continue; }
			visited.add(directory);
			const entries = await fs.opendir(directory);
			for await (const entry of entries) {
				if (++inspected > 2000 || results.length >= maxResults || full) { break; }
				let file: string;
				try { file = await this.resolve(path.join(directory, entry.name), signal); } catch (error) {
					if (signal.aborted) { throw error; }
					if (input.operation === 'search' && !['protected-file', 'beacon-assets', 'outside-workspace', 'not-supplied-file', 'invalid-file-path'].includes(fileErrorName(error))) { partial = true; }
					continue;
				}
				const stat = await fs.stat(file);
				if (!stat.isDirectory() && !stat.isFile()) { continue; }
				if (input.operation === 'list') { append(`${stat.isDirectory() ? 'directory' : 'file'}\t${file}`); }
				else {
					if (stat.isDirectory()) { pending.push(file); }
					if (input.operation === 'find' && entry.name.toLowerCase().includes(input.query!.toLowerCase())) { append(file); }
					if (input.operation === 'search' && stat.isFile()) {
						let output: FileOutput;
						try { output = await this.read(file, { operation: 'read', path: file, limit: chunkBytes }, signal); } catch (error) { if (signal.aborted || fileErrorName(error) === 'file-budget') { throw error; } partial = true; continue; }
						this.charge(Buffer.byteLength(output.contents ?? '', 'utf8'));
						if (output.kind !== 'text') { continue; }
						if (output.nextOffset !== undefined) { partial = true; }
						for (const [index, line] of output.contents!.split('\n').entries()) {
							if (line.toLowerCase().includes(input.query!.toLowerCase())) { append(`${file}:${index + 1}: ${Array.from(line).slice(0, 500).join('')}`); }
							if (results.length >= maxResults || full) { break; }
						}
					}
				}
			}
			if (input.operation === 'list') { break; }
		}
		return { ok: true, path: root, kind: input.operation === 'list' ? 'entries' : 'matches', contents: results.join('\n'), truncated: partial || full || inspected >= 2000 || results.length >= maxResults || pending.length > 0 };
	}
}

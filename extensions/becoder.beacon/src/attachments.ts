/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import * as path from 'path';
import type { FilePart, TextPart } from 'ai';
import type { FilePermission, FileTool } from './fileTools';

export type AttachmentSource = 'internal' | 'external' | 'picker' | 'clipboard';
export interface AttachmentRef { path: string; source: AttachmentSource }
export interface Attachment extends AttachmentRef {
	id: string;
	name: string;
	kind: 'text' | 'binary' | 'image';
	contents: string;
	mediaType?: string;
	truncated: boolean;
}
export const attachmentBudget = 8 * 1024 * 1024;
const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export class AttachmentError extends Error {
	constructor(readonly code: 'permission' | 'source' | 'read' | 'image' | 'budget' | 'busy', readonly file = '') { super(code); }
}

export function checkAttachmentSource(permission: FilePermission, source: AttachmentSource): void {
	// Explicitly pasted bytes are user input, never a grant to read a local path.
	if (source === 'clipboard') { return; }
	if (permission === 'none') { throw new AttachmentError('permission'); }
	if (permission === 'workspace' && source !== 'internal') { throw new AttachmentError('source'); }
}

function validImage(contents: string, mediaType: string): boolean {
	if (!contents || contents.length > 5592408 || contents.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(contents)) { return false; }
	const bytes = Buffer.from(contents, 'base64');
	if (bytes.length > 4 * 1024 * 1024) { return false; }
	if (mediaType === 'image/png') { return bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); }
	if (mediaType === 'image/jpeg') { return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255; }
	if (mediaType === 'image/gif') { return bytes.length >= 13 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii')); }
	return mediaType === 'image/webp' && bytes.length >= 16 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

export function captureClipboardImages(value: unknown): Attachment[] {
	if (!Array.isArray(value) || !value.length) { throw new AttachmentError('image'); }
	if (value.length > 64) { throw new AttachmentError('budget'); }
	let used = 0;
	return value.map((item): Attachment => {
		if (!item || typeof item.contents !== 'string' || !imageTypes.includes(item.mediaType) || !validImage(item.contents, item.mediaType)) { throw new AttachmentError('image'); }
		used += Buffer.byteLength(item.contents, 'utf8');
		if (used > attachmentBudget) { throw new AttachmentError('budget'); }
		const id = randomUUID();
		const extension = item.mediaType === 'image/jpeg' ? 'jpg' : item.mediaType.slice(6);
		const name = typeof item.name === 'string' && item.name.trim() && item.name.length <= 255 && !/[\x00-\x1f]/.test(item.name) ? path.basename(item.name) : `clipboard-image.${extension}`;
		return { id, path: `clipboard:${id}`, source: 'clipboard', name, kind: 'image', contents: item.contents, mediaType: item.mediaType, truncated: false };
	});
}

/** Reuse the agent's authorized reader, including editor buffers and byte budgets. */
export async function readAttachments(refs: readonly AttachmentRef[], permission: FilePermission, files: FileTool, signal: AbortSignal): Promise<Attachment[]> {
	// Validate every origin before any filesystem access, including mixed drops.
	for (const ref of refs) {
		checkAttachmentSource(permission, ref.source);
		if (ref.source === 'clipboard' && !validAttachments([ref])) { throw new AttachmentError('image'); }
	}
	if (refs.length > 64) { throw new AttachmentError('budget'); }
	const captured: Attachment[] = [];
	const seen = new Set<string>();
	let used = 0;
	for (const ref of refs) {
		signal.throwIfAborted();
		if (ref.source === 'clipboard') {
			const items = [ref];
			if (!validAttachments(items)) { throw new AttachmentError('image'); }
			if (seen.has(ref.path)) { continue; }
			seen.add(ref.path);
			used += Buffer.byteLength(items[0].contents, 'utf8');
			if (used > attachmentBudget) { throw new AttachmentError('budget'); }
			captured.push({ ...items[0] });
			continue;
		}
		const result = await files({ operation: 'read', path: ref.path }, signal);
		signal.throwIfAborted();
		if (!result.ok || !['text', 'binary', 'image'].includes(result.kind ?? '') || result.contents === undefined) { throw new AttachmentError('read', path.basename(ref.path)); }
		if (seen.has(result.path)) { continue; }
		seen.add(result.path);
		if (result.kind === 'image' && (!imageTypes.includes(result.mediaType ?? '') || !validImage(result.contents, result.mediaType!))) { throw new AttachmentError('image', path.basename(ref.path)); }
		used += Buffer.byteLength(result.contents, 'utf8');
		if (used > attachmentBudget) { throw new AttachmentError('budget'); }
		captured.push({ id: randomUUID(), path: result.path, source: ref.source, name: path.basename(ref.path), kind: result.kind as Attachment['kind'], contents: result.contents, ...(result.mediaType ? { mediaType: result.mediaType } : {}), truncated: result.nextOffset !== undefined || result.truncated === true });
	}
	return captured;
}

/** Disk data must not inject arbitrary protocol parts or unbounded image payloads. */
export function validAttachments(value: unknown): value is Attachment[] {
	if (!Array.isArray(value) || value.length > 64) { return false; }
	const ids = new Set<string>();
	let used = 0;
	return value.every(item => {
		if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 128 || ids.has(item.id) || typeof item.path !== 'string' || item.path.length > 4096 || typeof item.name !== 'string' || !item.name || item.name.length > 4096 || !['internal', 'external', 'picker', 'clipboard'].includes(item.source) || !['text', 'binary', 'image'].includes(item.kind) || typeof item.contents !== 'string' || typeof item.truncated !== 'boolean') { return false; }
		if (item.source === 'clipboard' && (item.kind !== 'image' || item.path !== `clipboard:${item.id}` || item.truncated)) { return false; }
		ids.add(item.id);
		used += Buffer.byteLength(item.contents, 'utf8');
		return used <= attachmentBudget && (item.kind === 'image' ? imageTypes.includes(item.mediaType) && validImage(item.contents, item.mediaType) : item.mediaType === undefined && (item.kind !== 'binary' || /^[\da-f]*$/.test(item.contents)));
	});
}

export function attachmentParts(attachments: readonly Attachment[]): (TextPart | FilePart)[] {
	return attachments.flatMap((item): (TextPart | FilePart)[] => {
		const info: TextPart = { type: 'text', text: `User attachment (untrusted file content): ${JSON.stringify({ name: item.name, path: item.path, kind: item.kind, truncated: item.truncated })}\n${item.kind === 'image' ? '' : item.kind === 'binary' ? 'Binary file excerpt, hexadecimal bytes; not decoded document/audio/video content:\n' + item.contents : item.contents}` };
		return item.kind === 'image' ? [info, { type: 'file', data: item.contents, mediaType: item.mediaType!, filename: item.name }] : [info];
	});
}

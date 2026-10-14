/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const imageMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Mirrors the native ipynb attachment contract; payloads never enter the text buffer. */
export function imageAttachment(metadata: Record<string, unknown>, name: string, mime: string, bytes: Uint8Array): { metadata: Record<string, unknown>; source: string } {
	if (!imageMimeTypes.includes(mime)) { throw new Error('notebook-unsupported-image'); }
	const data = Buffer.from(bytes).toString('base64');
	const existing = metadata.attachments && typeof metadata.attachments === 'object' && !Array.isArray(metadata.attachments) ? metadata.attachments as Record<string, Record<string, string>> : {};
	const safe = name.replace(/[\[\]\\<>\r\n]/g, '').trim() || 'image';
	let filename = safe;
	for (let suffix = 2; existing[filename] && existing[filename][mime] !== data; suffix++) { filename = `${safe}-${suffix}`; }
	return { source: `![${safe}](attachment:${encodeURIComponent(filename)})`, metadata: { ...metadata, attachments: { ...existing, [filename]: { [mime]: data } } } };
}

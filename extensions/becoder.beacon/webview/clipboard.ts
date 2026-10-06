/* Copyright (c) BeCoder contributors. Licensed under MIT. */

/** Read only image bytes supplied by a paste event; never request clipboard access. */
export async function readClipboardImages(files: readonly File[], signal: AbortSignal): Promise<{ name: string; mediaType: string; contents: string }[]> {
	if (files.length > 64 || files.reduce((size, file) => size + Math.ceil(file.size / 3) * 4, 0) > 8 * 1024 * 1024) { throw new Error('budget'); }
	for (const file of files) {
		if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || !file.size || file.size > 4 * 1024 * 1024) { throw new Error('image'); }
	}
	const images = [];
	for (const file of files) {
		signal.throwIfAborted();
		const data = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			const abort = () => reader.abort();
			const finish = () => signal.removeEventListener('abort', abort);
			reader.onload = () => { finish(); if (typeof reader.result === 'string') { resolve(reader.result); } else { reject(new Error('image')); } };
			reader.onerror = () => { finish(); reject(new Error('image')); };
			reader.onabort = () => { finish(); reject(new DOMException('Cancelled', 'AbortError')); };
			signal.addEventListener('abort', abort, { once: true });
			try { reader.readAsDataURL(file); } catch (error) { finish(); reject(error); }
		});
		signal.throwIfAborted();
		images.push({ name: file.name, mediaType: file.type, contents: data.slice(data.indexOf(',') + 1) });
	}
	return images;
}

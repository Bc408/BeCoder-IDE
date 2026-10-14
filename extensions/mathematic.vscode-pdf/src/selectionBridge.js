/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors.
 *  Licensed under the Apache License, Version 2.0. See ../LICENSE.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const { randomUUID } = require('crypto');

class PDFSelectionBridge {
	constructor(postMessage, isOpen, timeout = 5000) {
		this.postMessage = postMessage;
		this.isOpen = isOpen;
		this.timeout = timeout;
		this.version = 0;
		this.loaded = false;
		this.closed = false;
		this.pageCount = undefined;
		this.pending = new Map();
	}

	ready(version) { if (version === this.version && !this.closed) { this.loaded = true; } }
	current(version) { return !this.closed && this.loaded && this.isOpen() && version === this.version; }
	documentReady(version, pageCount) { if (version === this.version && !this.closed && Number.isSafeInteger(pageCount) && pageCount > 0) { this.pageCount = pageCount; } }
	invalidate() { this.version++; this.loaded = false; this.pageCount = undefined; this.rejectPending('pdf-selection-changed'); }
	dispose() { this.closed = true; this.rejectPending('pdf-selection-closed'); }
	rejectPending(reason) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(reason)); } this.pending.clear(); }

	async capture() {
		if (this.closed || !this.isOpen()) { throw new Error('pdf-selection-closed'); }
		if (!this.loaded) { throw new Error('pdf-selection-not-ready'); }
		return this.request('becoderPdfCaptureSelection');
	}

	async readPage(pageNumber) {
		if (this.closed || !this.isOpen()) { throw new Error('beacon-page-closed'); }
		if (!this.pageCount) { throw new Error('beacon-page-not-ready'); }
		if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > this.pageCount) { throw new Error('beacon-invalid-context-input'); }
		return this.request('becoderPdfReadPage', pageNumber);
	}

	request(action, pageNumber) {
		const request = randomUUID(); const version = this.version;
		return new Promise((resolve, reject) => {
			const prefix = pageNumber === undefined ? 'pdf-selection' : 'beacon-page';
			const timer = setTimeout(() => { this.pending.delete(request); reject(new Error(`${prefix}-timeout`)); }, this.timeout);
			this.pending.set(request, { version, pageNumber, resolve, reject, timer });
			Promise.resolve().then(() => this.postMessage({ action, request, version, ...(pageNumber === undefined ? {} : { pageNumber }) })).then(sent => {
				if (!sent) { this.fail(request, `${prefix}-provider-unavailable`); }
			}, () => this.fail(request, `${prefix}-provider-unavailable`));
		});
	}

	fail(request, reason) { const pending = this.pending.get(request); if (pending) { clearTimeout(pending.timer); this.pending.delete(request); pending.reject(new Error(reason)); } }
	receive(message) {
		if (!['becoderPdfSelection', 'becoderPdfPage'].includes(message?.type) || typeof message.request !== 'string') { return; }
		const pending = this.pending.get(message.request); if (!pending) { return; }
		const isPage = pending.pageNumber !== undefined;
		if ((message.type === 'becoderPdfPage') !== isPage) { return; }
		if (this.closed || !this.isOpen() || message.version !== pending.version || pending.version !== this.version) { this.fail(message.request, isPage ? 'beacon-page-changed' : 'pdf-selection-changed'); return; }
		if (isPage) {
			if (message.pageNumber !== pending.pageNumber) { this.fail(message.request, 'beacon-invalid-context-input'); return; }
			if (['beacon-page-changed', 'beacon-page-not-ready', 'beacon-page-provider-unavailable', 'beacon-invalid-context-input'].includes(message.error)) { this.fail(message.request, message.error); return; }
			if (typeof message.text !== 'string' || Buffer.byteLength(message.text) > 8 * 1024 * 1024) { this.fail(message.request, 'beacon-page-too-large'); return; }
			clearTimeout(pending.timer); this.pending.delete(message.request);
			pending.resolve({ text: message.text, pageNumber: pending.pageNumber, version: pending.version }); return;
		}
		if (!this.current(pending.version)) { this.fail(message.request, 'pdf-selection-changed'); return; }
		if (typeof message.text !== 'string' || !message.text.trim() || Buffer.byteLength(message.text) > 8 * 1024 * 1024) { this.fail(message.request, 'pdf-selection-empty-or-too-large'); return; }
		clearTimeout(pending.timer); this.pending.delete(message.request);
		const pages = Number.isSafeInteger(message.firstPage) && Number.isSafeInteger(message.lastPage) && message.firstPage > 0 && message.lastPage >= message.firstPage ? { firstPage: message.firstPage, lastPage: message.lastPage } : {};
		pending.resolve({ text: message.text, ...pages, version: pending.version });
	}
}

module.exports = { PDFSelectionBridge };

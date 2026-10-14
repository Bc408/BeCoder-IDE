/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors.
 *  Licensed under the Apache License, Version 2.0. See ../LICENSE.
 *--------------------------------------------------------------------------------------------*/

/** Read selected text from the existing text layer, never PDF bytes or unrelated controls. */
export function installPdfSelectionCapture(document, window, send, version) {
	let frozen;
	const selection = () => {
		const value = window.getSelection();
		if (!value?.rangeCount || value.isCollapsed) { return undefined; }
		const range = value.getRangeAt(0);
		const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
		const end = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
		const viewer = document.querySelector('#viewer');
		if (!start?.closest('.textLayer') || !end?.closest('.textLayer') || !viewer?.contains(start) || !viewer.contains(end)) { return undefined; }
		const text = value.toString(); if (!text.trim()) { return undefined; }
		return { text, firstPage: Number(start.closest('.page')?.dataset.pageNumber), lastPage: Number(end.closest('.page')?.dataset.pageNumber), version: version() };
	};
	document.addEventListener('contextmenu', event => {
		frozen = event.target?.closest?.('.textLayer') ? selection() : undefined;
		const existing = JSON.parse(document.body.dataset.vscodeContext ?? '{}');
		document.body.dataset.vscodeContext = JSON.stringify({ ...existing, beCoderPdfSelection: !!frozen });
	});
	window.addEventListener('message', event => {
		const request = event.data;
		if (event.origin !== window.origin || request?.action !== 'becoderPdfCaptureSelection' || typeof request.request !== 'string' || request.version !== version()) { return; }
		const current = frozen?.version === version() ? frozen : selection(); frozen = undefined;
		send({ type: 'becoderPdfSelection', request: request.request, version: version(), text: current?.text ?? '', firstPage: current?.firstPage, lastPage: current?.lastPage });
	});
}

/** Use the viewer's existing worker/document, only after its native full download. */
export function installPdfPageReading(window, send, version, currentDocument) {
	let loadedDocument; let loadedVersion;
	window.addEventListener('message', async event => {
		const request = event.data;
		if (event.origin !== window.origin || request?.action !== 'becoderPdfReadPage' || typeof request.request !== 'string') { return; }
		const reply = { type: 'becoderPdfPage', request: request.request, version: request.version, pageNumber: request.pageNumber };
		const document = loadedDocument;
		try {
			if (request.version !== version()) { throw new Error('beacon-page-changed'); }
			if (!document || loadedVersion !== request.version || currentDocument() !== document) { throw new Error('beacon-page-not-ready'); }
			if (!Number.isSafeInteger(request.pageNumber) || request.pageNumber < 1 || request.pageNumber > document.numPages) { throw new Error('beacon-invalid-context-input'); }
			const page = await document.getPage(request.pageNumber);
			const { items } = await page.getTextContent();
			if (request.version !== version() || currentDocument() !== document) { throw new Error('beacon-page-changed'); }
			// Same string/EOL/null handling as PDFViewer.getAllText, restricted to one page.
			const text = items.map(item => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join('').replaceAll('\0', '');
			send({ ...reply, text });
		} catch (error) {
			send({ ...reply, error: error instanceof Error && error.message.startsWith('beacon-') ? error.message : 'beacon-page-provider-unavailable' });
		}
	});
	return { async documentLoaded(document, capturedVersion) {
		if (!document) { return; }
		try {
			await document.getDownloadInfo();
			if (version() !== capturedVersion || currentDocument() !== document) { return; }
			loadedDocument = document; loadedVersion = capturedVersion;
			send({ type: 'becoderPdfDocumentReady', version: capturedVersion, pageCount: document.numPages });
		} catch { /* Native loading failure is shown by PDF.js; no disk fallback. */ }
	} };
}

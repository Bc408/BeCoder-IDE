/*---------------------------------------------------------------------------------------------
 *  Copyright 2021 Mathematic Inc
 *  Modified by BeCoder contributors for the built-in read-only PDF viewer.
 *  Licensed under the Apache License, Version 2.0. See ../LICENSE.
 *--------------------------------------------------------------------------------------------*/

import { PDFViewerApplicationOptions } from './pdf.js/web/viewer.mjs';

function loadConfig() {
	const element = document.querySelector('#pdf-view-config');
	if (!element) {
		throw new Error('Could not load the PDF viewer configuration.');
	}
	return JSON.parse(element.dataset.config);
}

const config = loadConfig();

PDFViewerApplicationOptions.set('defaultUrl', '');
PDFViewerApplicationOptions.set('disablePreferences', true);
PDFViewerApplicationOptions.set('defaultZoomValue', config.defaultZoomValue ?? 'auto');
PDFViewerApplicationOptions.set('sidebarViewOnLoad', config.sidebarViewOnLoad ?? 0);
PDFViewerApplicationOptions.set('cMapUrl', config.cMapUrl);
PDFViewerApplicationOptions.set('iccUrl', config.iccUrl);
PDFViewerApplicationOptions.set('standardFontDataUrl', config.standardFontDataUrl);
PDFViewerApplicationOptions.set('wasmUrl', config.wasmUrl);
PDFViewerApplicationOptions.set('imageResourcesPath', config.imageResourcesPath);
PDFViewerApplicationOptions.set('supportsDownloading', false);
PDFViewerApplicationOptions.set('supportsPrinting', false);
PDFViewerApplicationOptions.set('annotationEditorMode', -1);
PDFViewerApplicationOptions.set('annotationMode', 1);
PDFViewerApplicationOptions.set('enableScripting', false);
PDFViewerApplicationOptions.set('enableXfa', false);
PDFViewerApplicationOptions.set('enableSignatureEditor', false);

document.addEventListener('keydown', event => {
	if ((event.ctrlKey || event.metaKey) && ['p', 's'].includes(event.key.toLowerCase())) {
		event.preventDefault();
		event.stopImmediatePropagation();
	}
}, true);

document.addEventListener('click', event => {
	const anchor = event.target instanceof Element ? event.target.closest('a[href]') : undefined;
	if (!anchor) {
		return;
	}
	try {
		const target = new URL(anchor.href, window.location.href);
		const resourceRoot = new URL(config.resourceRoot);
		const isViewerNavigation = target.origin === window.location.origin;
		const isLocalPdf = target.origin === resourceRoot.origin
			&& target.pathname.startsWith(resourceRoot.pathname)
			&& target.pathname.toLowerCase().endsWith('.pdf');
		if (isViewerNavigation || isLocalPdf) {
			return;
		}
	} catch { }
	event.preventDefault();
	event.stopImmediatePropagation();
}, true);

void (async () => {
	await window.PDFViewerApplication.initializedPromise;
	await window.PDFViewerApplication.open(config);
	await window.PDFViewerApplication.pdfViewer.pagesPromise;
	const [, hash] = config.url.split('#');
	if (hash) {
		window.PDFViewerApplication.pdfLinkService.setHash(decodeURIComponent(hash));
	}
})();

window.addEventListener('message', async event => {
	if (event.origin !== window.origin || event.data?.action !== 'reload') {
		return;
	}
	await window.PDFViewerApplication.initializedPromise;
	const currentPage = window.PDFViewerApplication.pdfViewer.currentPageNumber;
	await window.PDFViewerApplication.open(config);
	await window.PDFViewerApplication.pdfViewer.pagesPromise;
	window.PDFViewerApplication.pdfViewer.currentPageNumber = Math.min(
		currentPage,
		window.PDFViewerApplication.pdfViewer.pagesCount
	);
});

window.addEventListener('error', error => console.error(error));

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors.
 *  Licensed under the Apache License, Version 2.0. See ../LICENSE.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(new URL('../../becoder.cph/package.json', import.meta.url));
const { JSDOM } = require('jsdom');

test('PDF page extraction waits for native full loading and rejects replaced document results', async () => {
	const module = await import('../assets/selection.mjs');
	assert.equal(typeof module.installPdfPageReading, 'function', 'Reuse loaded PDF.js document for page text');
	const dom = new JSDOM('<body></body>');
	try {
		const { window } = dom; const messages = []; let version = 0; let finishLoad; let finishText;
		const loaded = new Promise(resolve => { finishLoad = resolve; });
		const document = { numPages: 3, getDownloadInfo: () => loaded, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: '题目', hasEOL: true }, { str: 'x\0 y' }] }) }) };
		let current = document;
		const reader = module.installPdfPageReading(window, message => messages.push(message), () => version, () => current);
		const pending = reader.documentLoaded(document, 0);
		const request = pageNumber => window.dispatchEvent(new window.MessageEvent('message', { origin: window.origin, data: { action: 'becoderPdfReadPage', request: 'request', version, pageNumber } }));
		request(2); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(messages.at(-1).error, 'beacon-page-not-ready');
		finishLoad({ length: 100 }); await pending; assert.equal(messages.at(-1).pageCount, 3);
		request(2); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(messages.at(-1).text, '题目\nx y');
		request(4); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(messages.at(-1).error, 'beacon-invalid-context-input');
		document.getPage = async () => ({ getTextContent: () => new Promise(resolve => { finishText = resolve; }) });
		request(1); await new Promise(resolve => setTimeout(resolve, 0)); version++; current = undefined;
		finishText({ items: [{ str: 'stale text' }] }); await new Promise(resolve => setTimeout(resolve, 0));
		assert.equal(messages.at(-1).error, 'beacon-page-changed'); assert.equal(messages.at(-1).text, undefined);
	} finally { dom.window.close(); }
});

test('PDF context-menu capture freezes text-layer selection and excludes toolbar text', async () => {
	const module = new URL('../assets/selection.mjs', import.meta.url); assert.ok(existsSync(module), 'PDF needs a DOM selection owner');
	const { installPdfSelectionCapture } = await import(module.href);
	const dom = new JSDOM('<body><button id="toolbar">toolbar</button><div id="viewer"><div class="page" data-page-number="2"><div class="textLayer"><span>selected text</span></div></div></div></body>');
	try {
		const { window } = dom; const { document } = window; const messages = []; let version = 0;
		installPdfSelectionCapture(document, window, message => messages.push(message), () => version);
		const text = document.querySelector('span').firstChild; const range = document.createRange(); range.selectNodeContents(text); window.getSelection().addRange(range);
		text.parentElement.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
		assert.equal(JSON.parse(document.body.dataset.vscodeContext).beCoderPdfSelection, true);
		window.getSelection().removeAllRanges();
		window.dispatchEvent(new window.MessageEvent('message', { origin: window.origin, data: { action: 'becoderPdfCaptureSelection', request: 'one', version: 0 } }));
		assert.deepEqual(messages[0], { type: 'becoderPdfSelection', request: 'one', version: 0, text: 'selected text', firstPage: 2, lastPage: 2 });
		const toolbar = document.querySelector('button'); const other = document.createRange(); other.selectNodeContents(toolbar); window.getSelection().addRange(other);
		toolbar.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
		assert.equal(JSON.parse(document.body.dataset.vscodeContext).beCoderPdfSelection, false);
		version = 1; window.dispatchEvent(new window.MessageEvent('message', { origin: window.origin, data: { action: 'becoderPdfCaptureSelection', request: 'late', version: 0 } }));
		assert.equal(messages.length, 1);
	} finally { dom.window.close(); }
});

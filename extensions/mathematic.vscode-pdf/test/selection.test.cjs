/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors.
 *  Licensed under the Apache License, Version 2.0. See ../LICENSE.
 *--------------------------------------------------------------------------------------------*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('actual PDF provider binds selected text to its own open resource and retires capture on reload', async () => {
	const path = require('node:path'); const vm = require('node:vm'); const { pathToFileURL } = require('node:url');
	const extension = path.join(__dirname, '../src/extension.js'); let provider;
	class EventEmitter {
		constructor() { this.listeners = new Set(); this.event = listener => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }; }
		fire(value) { for (const listener of this.listeners) { listener(value); } }
		dispose() { this.listeners.clear(); }
	}
	const uri = file => ({ fsPath: file, toString: () => pathToFileURL(file).href });
	const vscode = { EventEmitter, Uri: { file: uri, joinPath: (root, ...parts) => uri(path.join(root.fsPath, ...parts)) }, workspace: { createFileSystemWatcher: () => ({ onDidChange: () => ({ dispose() {} }), onDidCreate: () => ({ dispose() {} }), dispose() {} }), getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: { registerCustomEditorProvider: (_type, value) => { provider = value; return { dispose() {} }; } } };
	const module = { exports: {} };
	vm.runInNewContext(fs.readFileSync(extension, 'utf8'), { module, __dirname: path.dirname(extension), require: name => name === 'vscode' ? vscode : name === './selectionBridge' ? require('../src/selectionBridge') : require(name) });
	const context = { extensionPath: path.join(__dirname, '..'), subscriptions: [] }; const api = module.exports.activate(context);
	let receiver; const closed = []; const sent = []; const requests = [];
	const panel = { active: true, visible: true, onDidDispose: callback => { closed.push(callback); return { dispose() {} }; }, webview: { asWebviewUri: value => value, cspSource: 'self', onDidReceiveMessage: callback => { receiver = callback; return { dispose() {} }; }, postMessage: async message => { sent.push(message); if (message.action === 'becoderPdfCaptureSelection') { requests.shift()?.(message); } return true; } } };
	const file = uri(path.join(__dirname, 'not-on-disk.pdf')); const document = provider.openCustomDocument(file); provider.resolveCustomEditor(document, panel);
	receiver({ type: 'becoderPdfReady', version: 0 });
	assert.equal(typeof api.listPages, 'function', 'The PDF owner must list its actual open panels');
	let listed = api.listPages(); assert.equal(listed.length, 1); assert.equal(listed[0].reason, 'beacon-page-not-ready');
	receiver({ type: 'becoderPdfDocumentReady', version: 0, pageCount: 3 });
	listed = api.listPages(); assert.equal(listed[0].pageCount, 3);
	const pageReply = panel.webview.postMessage;
	panel.webview.postMessage = async message => {
		if (message.action === 'becoderPdfReadPage') { receiver({ type: 'becoderPdfPage', request: message.request, version: message.version, pageNumber: message.pageNumber, text: 'page text' }); return true; }
		return pageReply(message);
	};
	panel.visible = false;
	assert.equal((await api.readPage(listed[0].id, listed[0].version, 2)).contents, 'page text');
	panel.visible = true;
	const ready = new Promise(resolve => { requests.push(resolve); }); const capture = api.captureSelection(); const request = await ready;
	receiver({ type: 'becoderPdfSelection', request: request.request, version: 0, text: 'problem', firstPage: 1, lastPage: 1 });
	const selected = await capture; assert.equal(selected.uri, file.toString()); assert.equal(selected.contents, 'problem'); assert.equal(selected.isCurrent(), true);
	const next = new Promise(resolve => { requests.push(resolve); }); const pending = api.captureSelection(); await next;
	document.changeEmitter.fire(file); await assert.rejects(pending, /changed/); assert.equal(selected.isCurrent(), false);
	await assert.rejects(api.readPage(listed[0].id, listed[0].version, 1), /changed/);
	assert.equal(sent.at(-1).action, 'reload'); assert.equal(sent.at(-1).version, 1);
	panel.visible = false; assert.equal(await api.captureSelection(), undefined);
	panel.visible = true; for (const callback of closed) { callback(); } assert.equal(await api.captureSelection(), undefined);
	assert.equal(api.listPages().length, 0); await assert.rejects(api.readPage(listed[0].id, listed[0].version, 1), /closed/);
	for (const subscription of context.subscriptions) { subscription.dispose(); } document.dispose();
});

test('PDF selection capture rejects reload and late responses without reading the file', async () => {
	const file = require.resolve('../src/extension.js');
	assert.ok(fs.existsSync(file));
	const bridgePath = require('node:path').join(__dirname, '../src/selectionBridge.js');
	assert.ok(fs.existsSync(bridgePath), 'The PDF owner needs a version-bound selection bridge');
	const { PDFSelectionBridge } = require(bridgePath);
	const messages = []; const bridge = new PDFSelectionBridge(message => { messages.push(message); return Promise.resolve(true); }, () => true);
	bridge.ready(0); const pending = bridge.capture(); await Promise.resolve();
	const request = messages[0]; bridge.invalidate();
	await assert.rejects(pending, /changed/);
	bridge.receive({ type: 'becoderPdfSelection', request: request.request, version: 0, text: 'old text' });
	bridge.ready(1); const current = bridge.capture(); await Promise.resolve();
	bridge.receive({ type: 'becoderPdfSelection', request: messages[1].request, version: 1, text: ' selected\ntext ', firstPage: 2, lastPage: 3 });
	assert.deepEqual(await current, { text: ' selected\ntext ', firstPage: 2, lastPage: 3, version: 1 });
	bridge.dispose();
});

test('PDF selection capture rejects closure, unready documents and unanswered requests', async () => {
	const bridgePath = require('node:path').join(__dirname, '../src/selectionBridge.js'); assert.ok(fs.existsSync(bridgePath));
	const { PDFSelectionBridge } = require(bridgePath);
	const bridge = new PDFSelectionBridge(async () => true, () => true, 10);
	await assert.rejects(bridge.capture(), /not-ready/); bridge.ready(0);
	await assert.rejects(bridge.capture(), /timeout/);
	const pending = bridge.capture(); bridge.dispose(); await assert.rejects(pending, /closed/);
	await assert.rejects(bridge.capture(), /closed/);
});

test('PDF page requests require loaded bytes, page bounds and matching reload version', async () => {
	const { PDFSelectionBridge } = require('../src/selectionBridge');
	const messages = []; const bridge = new PDFSelectionBridge(async message => { messages.push(message); return true; }, () => true, 20);
	assert.equal(typeof bridge.readPage, 'function', 'Open PDF needs a page request on the existing bridge');
	bridge.ready(0); await assert.rejects(bridge.readPage(1), /not-ready/);
	bridge.documentReady(0, 3); await assert.rejects(bridge.readPage(4), /invalid/);
	const read = bridge.readPage(2); await Promise.resolve();
	bridge.receive({ type: 'becoderPdfPage', request: messages[0].request, version: 0, pageNumber: 1, text: 'wrong page' });
	await assert.rejects(read, /invalid/);
	const empty = bridge.readPage(3); await Promise.resolve();
	bridge.receive({ type: 'becoderPdfPage', request: messages[1].request, version: 0, pageNumber: 3, text: '' });
	assert.deepEqual(await empty, { text: '', pageNumber: 3, version: 0 });
	const stale = bridge.readPage(1); bridge.invalidate(); await assert.rejects(stale, /changed/);
	bridge.documentReady(0, 3); await assert.rejects(bridge.readPage(1), /not-ready/);
	bridge.documentReady(1, 3); await assert.rejects(bridge.readPage(1), /timeout/);
	const closing = bridge.readPage(1); bridge.dispose(); await assert.rejects(closing, /closed/);
});

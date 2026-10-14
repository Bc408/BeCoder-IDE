/*---------------------------------------------------------------------------------------------
 *  Copyright 2021 Mathematic Inc
 *  Modified by BeCoder contributors for the built-in read-only PDF viewer.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in this extension.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { randomUUID } = require('crypto');
const { PDFSelectionBridge } = require('./selectionBridge');

const viewType = 'pdf.view';
const viewerPath = path.join(__dirname, '..', 'assets', 'pdf.js', 'web', 'viewer.html');

function removeRequired(contents, fragment) {
	if (!contents.includes(fragment)) {
		throw new Error(`The bundled PDF.js viewer is missing a required integration point: ${fragment}`);
	}
	return contents.replace(fragment, '');
}

let viewerHtml = fs.readFileSync(viewerPath, 'utf8');
viewerHtml = removeRequired(viewerHtml, '<link rel="resource" type="application/l10n" href="locale/locale.json" />');
viewerHtml = removeRequired(viewerHtml, '<script src="../build/pdf.mjs" type="module"></script>');
viewerHtml = removeRequired(viewerHtml, '<script src="viewer.mjs" type="module"></script>');
viewerHtml = removeRequired(viewerHtml, '<link rel="stylesheet" href="viewer.css" />');

function withTrailingSlash(uri) {
	const value = uri.toString();
	return value.endsWith('/') ? value : `${value}/`;
}

function escapeAttribute(value) {
	return JSON.stringify(value)
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function sameUri(left, right) {
	return left.toString() === right.toString();
}

class PDFDocument {
	constructor(uri) {
		this.uri = uri;
		this.closed = false;
		this.disposables = [];
		this.changeEmitter = new vscode.EventEmitter();
		this.onDidChange = this.changeEmitter.event;
		this.disposables.push(this.changeEmitter);

		const watcher = vscode.workspace.createFileSystemWatcher(uri.fsPath);
		this.disposables.push(watcher);
		const notifyChange = changedUri => {
			if (sameUri(changedUri, uri)) {
				this.changeEmitter.fire(changedUri);
			}
		};
		this.disposables.push(watcher.onDidChange(notifyChange));
		this.disposables.push(watcher.onDidCreate(notifyChange));
	}

	dispose() {
		this.closed = true;
		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
	}
}

class WebviewCollection {
	constructor() {
		this.entries = new Set();
	}

	*get(uri) {
		const resource = uri.toString();
		for (const entry of this.entries) {
			if (entry.resource === resource) {
				yield entry.panel;
			}
		}
	}

	add(uri, panel) {
		const entry = { resource: uri.toString(), panel };
		this.entries.add(entry);
		panel.onDidDispose(() => this.entries.delete(entry));
	}
}

class PDFViewerProvider {
	constructor(context) {
		this.extensionRoot = vscode.Uri.file(context.extensionPath);
		this.webviews = new WebviewCollection();
		this.selections = new Map();
	}

	openCustomDocument(uri) {
		const document = new PDFDocument(uri);
		document.onDidChange(changedUri => {
			for (const panel of this.webviews.get(changedUri)) {
				const bridge = this.selections.get(panel); bridge?.invalidate();
				void panel.webview.postMessage({ action: 'reload', version: bridge?.version });
			}
		});
		return document;
	}

	resolveCustomEditor(document, panel) {
		this.webviews.add(document.uri, panel);
		let closed = false;
		const bridge = new PDFSelectionBridge(message => panel.webview.postMessage(message), () => !closed && !document.closed);
		bridge.id = `pdf:${randomUUID()}`;
		this.selections.set(panel, bridge);
		const dispose = panel.onDidDispose(() => { closed = true; bridge.dispose(); this.selections.delete(panel); receive.dispose(); dispose.dispose(); });

		const resourceRoot = vscode.Uri.file(path.dirname(document.uri.fsPath));
		const webviewResourceRoot = withTrailingSlash(panel.webview.asWebviewUri(resourceRoot));
		panel.webview.options = {
			enableScripts: true,
			localResourceRoots: [resourceRoot, this.extensionRoot]
		};
		panel.webview.html = this.getHtml(document, panel.webview, resourceRoot);
		const receive = panel.webview.onDidReceiveMessage(async message => {
			if (message?.type === 'becoderPdfReady') { bridge.ready(message.version); return; }
			if (message?.type === 'becoderPdfDocumentReady') { bridge.documentReady(message.version, message.pageCount); return; }
			if (['becoderPdfSelection', 'becoderPdfPage'].includes(message?.type)) { bridge.receive(message); return; }
			if (!message || typeof message !== 'object' || typeof message.open !== 'string') {
				return;
			}
			try {
				const rootUrl = new URL(webviewResourceRoot);
				const targetUrl = new URL(message.open);
				if (targetUrl.origin !== rootUrl.origin || !targetUrl.pathname.startsWith(rootUrl.pathname)) {
					return;
				}
				const relativePath = decodeURIComponent(targetUrl.pathname.slice(rootUrl.pathname.length));
				if (!relativePath || relativePath.includes('/') || relativePath.includes('\\') || path.extname(relativePath).toLowerCase() !== '.pdf') {
					return;
				}
				const fragment = decodeURIComponent(targetUrl.hash.slice(1));
				await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(resourceRoot, relativePath).with({ fragment }));
			} catch {
				// Ignore malformed or non-local messages from the webview.
			}
		});
	}

	async captureSelection() {
		const entry = [...this.selections].find(([panel]) => panel.active && panel.visible);
		if (!entry) { return undefined; }
		const [panel, bridge] = entry;
		const resource = [...this.webviews.entries].find(entry => entry.panel === panel)?.resource;
		const captured = await bridge.capture();
		if (!resource || !bridge.current(captured.version) || !panel.active) { throw new Error('pdf-selection-changed'); }
		return { uri: resource, contents: captured.text, firstPage: captured.firstPage, lastPage: captured.lastPage, isCurrent: () => panel.visible && bridge.current(captured.version) };
	}

	listPages() {
		return [...this.selections].filter(([, bridge]) => !bridge.closed && bridge.isOpen()).map(([panel, bridge]) => {
			const uri = [...this.webviews.entries].find(entry => entry.panel === panel)?.resource;
			return { id: bridge.id, kind: 'pdf', uri, title: panel.title || 'PDF', version: String(bridge.version), pageCount: bridge.pageCount, ...(!bridge.pageCount ? { reason: 'beacon-page-not-ready' } : {}) };
		});
	}

	async readPage(id, version, pageNumber) {
		const page = this.listPages().find(page => page.id === id);
		if (!page) { throw new Error('beacon-page-closed'); }
		if (page.version !== version) { throw new Error('beacon-page-changed'); }
		const bridge = [...this.selections.values()].find(bridge => bridge.id === id);
		try {
			const result = await bridge.readPage(pageNumber);
			const current = this.listPages().find(page => page.id === id);
			if (!current) { throw new Error('beacon-page-closed'); }
			if (current.version !== version) { throw new Error('beacon-page-changed'); }
			return { ...page, pageNumber, contents: result.text, totalCharacters: result.text.length };
		} catch (error) {
			if (error.message === 'pdf-selection-changed') { throw new Error('beacon-page-changed'); }
			if (error.message === 'pdf-selection-closed') { throw new Error('beacon-page-closed'); }
			throw error;
		}
	}

	resolveAsset(webview, ...segments) {
		return webview.asWebviewUri(vscode.Uri.joinPath(this.extensionRoot, ...segments));
	}

	getHtml(document, webview, resourceRoot) {
		const pdfJs = (...segments) => this.resolveAsset(webview, 'assets', 'pdf.js', ...segments);
		const settings = vscode.workspace.getConfiguration('pdf', document.uri);
		const config = {
			url: webview.asWebviewUri(document.uri).toString(),
			docBaseUrl: webview.asWebviewUri(document.uri).toString(),
			resourceRoot: withTrailingSlash(webview.asWebviewUri(resourceRoot)),
			defaultZoomValue: settings.get('defaultZoomValue', 'auto'),
			sidebarViewOnLoad: settings.get('sidebarViewOnLoad', 0),
			cMapUrl: withTrailingSlash(pdfJs('web', 'cmaps')),
			iccUrl: withTrailingSlash(pdfJs('web', 'iccs')),
			standardFontDataUrl: withTrailingSlash(pdfJs('web', 'standard_fonts')),
			wasmUrl: withTrailingSlash(pdfJs('web', 'wasm')),
			imageResourcesPath: withTrailingSlash(pdfJs('web', 'images'))
		};
		const injection = `
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${webview.cspSource} blob: data:; script-src ${webview.cspSource} 'wasm-unsafe-eval'; worker-src ${webview.cspSource} blob:; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} blob: data:; font-src ${webview.cspSource} data:; media-src blob:; base-uri 'none'; form-action 'none';">
<meta id="pdf-view-config" data-config="${escapeAttribute(config)}">

<title>PDF.js viewer</title>

<link rel="stylesheet" href="${pdfJs('web', 'viewer.css')}">
<link rel="stylesheet" href="${this.resolveAsset(webview, 'assets', 'main.css')}">
<link rel="stylesheet" href="${this.resolveAsset(webview, 'dist', 'hover.css')}">

<script src="${pdfJs('build', 'pdf.mjs')}" type="module"></script>
<script src="${this.resolveAsset(webview, 'assets', 'main.mjs')}" type="module"></script>

<link rel="resource" type="application/l10n" href="${pdfJs('web', 'locale', 'locale.json')}">`;
		if (!viewerHtml.includes('<title>PDF.js viewer</title>')) {
			throw new Error('The bundled PDF.js viewer cannot be initialized.');
		}
		return viewerHtml.replace('<title>PDF.js viewer</title>', injection).trim();
	}
}

function activate(context) {
	const provider = new PDFViewerProvider(context);
	context.subscriptions.push(vscode.window.registerCustomEditorProvider(
		viewType,
		provider,
		{ supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
	));
	context.subscriptions.push({ dispose: () => { for (const bridge of provider.selections.values()) { bridge.dispose(); } provider.selections.clear(); } });
	return { captureSelection: () => provider.captureSelection(), listPages: () => provider.listPages(), readPage: (id, version, pageNumber) => provider.readPage(id, version, pageNumber) };
}

function deactivate() { }

module.exports = { activate, deactivate };

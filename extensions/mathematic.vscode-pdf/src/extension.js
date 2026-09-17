/*---------------------------------------------------------------------------------------------
 *  Copyright 2021 Mathematic Inc
 *  Modified by BeCoder contributors for the built-in read-only PDF viewer.
 *  Licensed under the Apache License, Version 2.0. See LICENSE in this extension.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

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
	}

	openCustomDocument(uri) {
		const document = new PDFDocument(uri);
		document.onDidChange(changedUri => {
			for (const panel of this.webviews.get(changedUri)) {
				void panel.webview.postMessage({ action: 'reload' });
			}
		});
		return document;
	}

	resolveCustomEditor(document, panel) {
		this.webviews.add(document.uri, panel);

		const resourceRoot = vscode.Uri.file(path.dirname(document.uri.fsPath));
		const webviewResourceRoot = withTrailingSlash(panel.webview.asWebviewUri(resourceRoot));
		panel.webview.options = {
			enableScripts: true,
			localResourceRoots: [resourceRoot, this.extensionRoot]
		};
		panel.webview.html = this.getHtml(document, panel.webview, resourceRoot);
		panel.webview.onDidReceiveMessage(async message => {
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
	context.subscriptions.push(vscode.window.registerCustomEditorProvider(
		viewType,
		new PDFViewerProvider(context),
		{ supportsMultipleEditorsPerDocument: false }
	));
}

function deactivate() { }

module.exports = { activate, deactivate };

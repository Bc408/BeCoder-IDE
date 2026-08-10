/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { CompilerRun, CompilerRunner, DiagnosticTarget } from './compilerRunner';
import { ParsedGccError, byteRangeToUtf16 } from './diagnosticModel';
import { DiagnosticStore } from './diagnosticStore';
import { LatestRequestCoordinator } from './latestCoordinator';
import { bundledCompiler } from './toolchain';

const openDelayMs = 1000;
const editDelayMs = 800;
const diagnosticSource = 'BeCoder GCC';
const maximumToolchainRetryAttempts = 300;

function eligibleTarget(document: vscode.TextDocument): DiagnosticTarget | undefined {
	if (document.uri.scheme !== 'file' || document.isUntitled || !fs.existsSync(document.fileName)
		|| !['c', 'cpp'].includes(document.languageId)) {
		return undefined;
	}
	const extension = path.extname(document.fileName).toLowerCase();
	if (extension !== '.c' && !['.cc', '.cpp', '.cxx'].includes(extension)) {
		return undefined;
	}
	return {
		uri: document.uri.toString(),
		version: document.version,
		filePath: document.fileName,
		language: extension === '.c' ? 'c' : 'cpp',
		text: document.getText()
	};
}

function samePath(left: string, right: string): boolean {
	return path.resolve(left).replace(/\\/g, '/').toLowerCase() === path.resolve(right).replace(/\\/g, '/').toLowerCase();
}

function textForFile(filePath: string, target: DiagnosticTarget): string | undefined {
	if (samePath(filePath, target.filePath)) {
		return target.text;
	}
	const openDocument = vscode.workspace.textDocuments.find(document =>
		document.uri.scheme === 'file' && samePath(document.fileName, filePath));
	if (openDocument) {
		if (openDocument.isDirty) {
			return undefined;
		}
		return openDocument.getText();
	}
	try {
		return fs.readFileSync(filePath, 'utf8');
	} catch {
		return undefined;
	}
}

function vscodeRange(filePath: string, errorRange: ParsedGccError['range'], target: DiagnosticTarget): vscode.Range | undefined {
	const text = textForFile(filePath, target);
	if (text === undefined) {
		return undefined;
	}
	const converted = byteRangeToUtf16(text, errorRange);
	return new vscode.Range(
		converted.startLine,
		converted.startCharacter,
		converted.endLine,
		converted.endCharacter
	);
}

function toDiagnostic(error: ParsedGccError, target: DiagnosticTarget): { uri: vscode.Uri; diagnostic: vscode.Diagnostic } | undefined {
	const range = vscodeRange(error.range.start.filePath, error.range, target);
	if (!range) {
		return undefined;
	}
	const diagnostic = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
	diagnostic.source = diagnosticSource;
	const related: vscode.DiagnosticRelatedInformation[] = [];
	for (const information of error.related) {
		const relatedRange = vscodeRange(information.range.start.filePath, information.range, target);
		if (relatedRange) {
			related.push(new vscode.DiagnosticRelatedInformation(
				new vscode.Location(vscode.Uri.file(information.range.start.filePath), relatedRange),
				information.message
			));
		}
	}
	if (related.length > 0) {
		diagnostic.relatedInformation = related;
	}
	return { uri: vscode.Uri.file(error.range.start.filePath), diagnostic };
}

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel('BeCoder GCC Diagnostics', { log: true });
	const collection = vscode.languages.createDiagnosticCollection(diagnosticSource);
	const store = new DiagnosticStore<vscode.Diagnostic>();
	const runner = new CompilerRunner(context);
	let lastFailure = '';
	let lastEligibleDocumentUri: string | undefined;
	let toolchainRetryHandle: NodeJS.Timeout | undefined;
	let toolchainRetryAttempts = 0;

	const stopToolchainRetry = (): void => {
		if (toolchainRetryHandle) {
			clearTimeout(toolchainRetryHandle);
			toolchainRetryHandle = undefined;
		}
		toolchainRetryAttempts = 0;
	};

	const refreshUris = (uris: Iterable<string>): void => {
		for (const uriString of uris) {
			const uri = vscode.Uri.parse(uriString);
			const merged = store.merged(uriString);
			if (merged.length === 0) {
				collection.delete(uri);
				continue;
			}
			const seen = new Set<string>();
			const unique = merged.filter(diagnostic => {
				const key = `${diagnostic.range.start.line}:${diagnostic.range.start.character}:${diagnostic.range.end.line}:${diagnostic.range.end.character}:${diagnostic.message}`;
				if (seen.has(key)) {
					return false;
				}
				seen.add(key);
				return true;
			});
			collection.set(uri, unique);
		}
	};

	const coordinator = new LatestRequestCoordinator<DiagnosticTarget, CompilerRun>(
		(target, signal, waitMs) => runner.run(target, signal, waitMs),
		(target, result) => {
			const current = vscode.workspace.textDocuments.find(document => document.uri.toString() === target.uri);
			if (!current || current.version !== target.version || !eligibleTarget(current)) {
				return;
			}
			const publishStarted = Date.now();
			const grouped = new Map<string, vscode.Diagnostic[]>();
			for (const error of result.errors) {
				const converted = toDiagnostic(error, target);
				if (!converted) {
					continue;
				}
				const key = converted.uri.toString();
				const diagnostics = grouped.get(key) ?? [];
				diagnostics.push(converted.diagnostic);
				grouped.set(key, diagnostics);
			}
			refreshUris(store.replace(target.uri, grouped));
			lastFailure = '';
			stopToolchainRetry();
			const publishMs = Date.now() - publishStarted;
			const totalEditToDiagnosticMs = result.metrics.debounceWaitMs + result.metrics.compilerSpawnMs
				+ result.metrics.gccMs + result.metrics.parseMs + publishMs;
			output.info(
				`${path.basename(target.filePath)} v${target.version}: errors=${result.errors.length} ` +
				`debounceWaitMs=${result.metrics.debounceWaitMs} compilerSpawnMs=${result.metrics.compilerSpawnMs} ` +
				`gccMs=${result.metrics.gccMs} parseMs=${result.metrics.parseMs} ` +
				`publishMs=${publishMs} totalEditToDiagnosticMs=${totalEditToDiagnosticMs} ` +
				`cancellations=${coordinator.cancellationCount}`
			);
		},
		(target, reason) => {
			if (reason !== lastFailure) {
				lastFailure = reason;
				output.warn(`${path.basename(target.filePath)} v${target.version}: ${reason}`);
			}
			if (reason.startsWith('Bundled compiler is unavailable:')) {
				scheduleToolchainRetry();
			}
		}
	);

	const removeOwner = (uri: vscode.Uri): void => {
		const key = uri.toString();
		coordinator.cancelUri(key);
		refreshUris(store.remove(key));
	};
	const removeDiagnosticUri = (uri: vscode.Uri): void => {
		refreshUris(store.removeUri(uri.toString()));
	};
	const schedule = (document: vscode.TextDocument, delayMs: number, force = false): void => {
		const target = eligibleTarget(document);
		if (target) {
			lastEligibleDocumentUri = target.uri;
			coordinator.schedule(target, delayMs, force);
		} else {
			removeOwner(document.uri);
			removeDiagnosticUri(document.uri);
		}
	};
	const recentEligibleDocument = (excludedUris: ReadonlySet<string> = new Set()): vscode.TextDocument | undefined => {
		const activeDocument = vscode.window.activeTextEditor?.document;
		if (activeDocument && !excludedUris.has(activeDocument.uri.toString()) && eligibleTarget(activeDocument)) {
			return activeDocument;
		}
		return vscode.workspace.textDocuments.find(document =>
			document.uri.toString() === lastEligibleDocumentUri
			&& !excludedUris.has(document.uri.toString())
			&& Boolean(eligibleTarget(document)));
	};
	const scheduleRecentEligible = (excludedUris: ReadonlySet<string> = new Set()): void => {
		const document = recentEligibleDocument(excludedUris);
		if (document) {
			schedule(document, 0, true);
		}
	};
	const scheduleToolchainRetry = (): void => {
		if (toolchainRetryHandle || toolchainRetryAttempts >= maximumToolchainRetryAttempts) {
			return;
		}
		toolchainRetryHandle = setTimeout(() => {
			toolchainRetryHandle = undefined;
			toolchainRetryAttempts++;
			const document = recentEligibleDocument();
			if (!document) {
				stopToolchainRetry();
				return;
			}
			const target = eligibleTarget(document);
			if (!target) {
				stopToolchainRetry();
				return;
			}
			if (fs.existsSync(bundledCompiler(context, target.language))) {
				stopToolchainRetry();
				schedule(document, 0, true);
				return;
			}
			scheduleToolchainRetry();
		}, 1000);
	};

	context.subscriptions.push(
		output,
		collection,
		vscode.workspace.onDidOpenTextDocument(document => schedule(document, openDelayMs)),
		vscode.workspace.onDidChangeTextDocument(event => schedule(event.document, editDelayMs)),
		vscode.workspace.onDidSaveTextDocument(document => {
			if (eligibleTarget(document)) {
				schedule(document, 0);
			} else {
				removeDiagnosticUri(document.uri);
				scheduleRecentEligible();
			}
		}),
		vscode.workspace.onDidCloseTextDocument(document => removeOwner(document.uri)),
		vscode.workspace.onDidDeleteFiles(event => {
			const deleted = new Set(event.files.map(uri => uri.toString()));
			event.files.forEach(uri => {
				removeOwner(uri);
				removeDiagnosticUri(uri);
			});
			scheduleRecentEligible(deleted);
		}),
		vscode.workspace.onDidRenameFiles(event => {
			const oldUris = new Set(event.files.map(file => file.oldUri.toString()));
			event.files.forEach(file => {
				removeOwner(file.oldUri);
				removeDiagnosticUri(file.oldUri);
			});
			scheduleRecentEligible(oldUris);
		}),
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				schedule(editor.document, openDelayMs);
			}
		}),
		{
			dispose: () => {
				stopToolchainRetry();
				coordinator.dispose();
				runner.dispose();
				store.clear();
			}
		}
	);

	if (vscode.window.activeTextEditor) {
		schedule(vscode.window.activeTextEditor.document, openDelayMs);
	}
}

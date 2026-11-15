/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { type ProblemDocument, type ProblemRef, type LanguageOption, type SiteId, validateProblem } from '../domain';
import { Panel, labels } from './webview';
import { SourceBinding } from '../sourceBinding';

export interface ProblemActions {
	preferredLanguage(site: SiteId, family: 'c' | 'cpp'): string | undefined;
	selectLanguage(site: SiteId, family: 'c' | 'cpp', languageId: string): void;
	submit(source: vscode.TextDocument, document: ProblemDocument): Promise<void>;
	importCph(sourceUri: string, document: ProblemDocument): Promise<void>;
	viewRecord(sourceUri: string, document: ProblemDocument): Promise<void>;
	openOriginal(url: string): Promise<void>;
}
export class ProblemPanel implements vscode.Disposable {
	private readonly panels = new Map<string, { panel: Panel; binding: SourceBinding<vscode.TextDocument> }>();
	constructor(private readonly context: vscode.ExtensionContext, private readonly actions: ProblemActions) { }
	async open(input: ProblemDocument, sourceUri: string, sourceDocument?: vscode.TextDocument): Promise<void> {
		const document = validateProblem(input), key = sourceUri + '\n' + document.ref.url;
		const source = sourceDocument ?? await vscode.workspace.openTextDocument(vscode.Uri.parse(sourceUri));
		const binding = new SourceBinding(source);
		const family = source.languageId === 'c' ? 'c' : 'cpp';
		const languages = document.languages?.filter(option => option.family === family) ?? [];
		const saved = this.actions.preferredLanguage(document.ref.site, family);
		const languageId = languages.find(option => option.id === saved)?.id ?? languages[0]?.id;
		if (languageId) { this.updateLanguage(document.ref, languages, languageId); }
		if (binding.uri !== sourceUri) { throw new Error(vscode.l10n.t('The original source is unavailable. Reopen the problem from the source editor.')); }
		const existing = this.panels.get(key);
		if (existing) {
			let current = false;
			try { existing.binding.assertCurrent(); current = existing.binding.source === source; } catch { /* Explicitly reopening binds the new source. */ }
			if (current) { existing.panel.reveal(); return; }
			existing.panel.dispose();
		}
		const listeners: vscode.Disposable[] = [];
		const affects = (uri: vscode.Uri) => { const relative = path.relative(uri.fsPath, binding.filePath); return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)); };
		listeners.push(vscode.workspace.onDidCloseTextDocument(value => { if (value === source) { binding.invalidate(); } }),
			vscode.workspace.onDidSaveTextDocument(value => { if (value === source) { try { binding.refreshAfterSave(value); } catch { binding.invalidate(); } } }),
			vscode.workspace.onDidRenameFiles(event => { if (event.files.some(file => affects(file.oldUri))) { binding.invalidate(); } }),
			vscode.workspace.onDidDeleteFiles(event => { if (event.files.some(affects)) { binding.invalidate(); } }));
		const panel = new Panel(this.context, { kind: 'problem', labels: labels(), problem: document, languages, languageId, sourceName: path.basename(vscode.Uri.parse(sourceUri).fsPath), locale: document.bodies.find(body => body.locale.toLowerCase().startsWith(vscode.env.language.toLowerCase().split('-')[0]))?.locale ?? document.bodies[0]?.locale }, async value => {
			switch (value.action) {
				case 'selectLocale': if (document.bodies.some(body => body.locale === value.locale)) { panel.update({ locale: value.locale }); } break;
				case 'selectLanguage': this.updateLanguage(document.ref, panel.state.languages ?? [], value.languageId); break;
				case 'submit': binding.assertCurrent(); await this.actions.submit(source, document); break;
				case 'importCph': binding.assertCurrent(); await this.actions.importCph(sourceUri, document); break;
				case 'viewRecord': await this.actions.viewRecord(sourceUri, document); break;
				case 'openOriginal': await this.actions.openOriginal(document.ref.url); break;
			}
		}, () => { listeners.splice(0).forEach(listener => listener.dispose()); this.panels.delete(key); });
		this.panels.set(key, { panel, binding });
	}
	updateLanguage(problem: ProblemRef, languages: readonly LanguageOption[], languageId: string): void {
		const selected = languages.find(option => option.id === languageId);
		if (!selected) { return; }
		this.actions.selectLanguage(problem.site, selected.family, languageId);
		for (const { panel, binding } of this.panels.values()) {
			if (panel.state.problem?.ref.site !== problem.site || binding.source.languageId !== selected.family) { continue; }
			const options = panel.state.problem.ref.url === problem.url ? languages : panel.state.languages ?? [];
			if (options.some(option => option.id === languageId)) { panel.update({ languages: options, languageId }); }
		}
	}
	dispose(): void { for (const value of this.panels.values()) { value.panel.dispose(); } this.panels.clear(); }
}

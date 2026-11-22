/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { type ProblemDocument, type ProblemRef, type LanguageOption, type LanguageCatalogue, type SiteId, validateProblem } from '../domain';
import { Panel, labels } from './webview';
import { SourceBinding } from '../sourceBinding';
import { defaultLanguage, type OjPreferences } from '../preferences';
import { compilerCatalogue, resolveCompiler, symbolicCompiler } from '../compilerCatalogue';

export interface ProblemActions {
	preferredLanguage(site: SiteId, family: 'c' | 'cpp'): string | undefined;
	selectLanguage(site: SiteId, family: 'c' | 'cpp', languageId: string): void | Promise<void>;
	submit(source: vscode.TextDocument, document: ProblemDocument): Promise<void>;
	importCph(sourceUri: string, document: ProblemDocument): Promise<void>;
	openLink(url: string): Promise<void>;
	loadLanguages?(problem: ProblemRef, signal: AbortSignal): Promise<LanguageCatalogue>;
}
interface ProblemPanelEntry {
	panel: Panel;
	binding: SourceBinding<vscode.TextDocument>;
	languageRead?: AbortController;
}
export class ProblemPanel implements vscode.Disposable {
	private readonly panels = new Map<string, ProblemPanelEntry>();
	constructor(private readonly context: vscode.ExtensionContext, private readonly actions: ProblemActions, private readonly preferences?: OjPreferences) { }
	async open(input: ProblemDocument, sourceUri: string, sourceDocument?: vscode.TextDocument): Promise<void> {
		const document = validateProblem(input), key = sourceUri + '\n' + document.ref.url;
		const source = sourceDocument ?? await vscode.workspace.openTextDocument(vscode.Uri.parse(sourceUri));
		const binding = new SourceBinding(source);
		const family = source.languageId === 'c' ? 'c' : 'cpp';
		const usingCompilerCatalogue = !document.languages?.length && compilerCatalogue(document.ref.site).length > 0;
		const languages = (usingCompilerCatalogue ? compilerCatalogue(document.ref.site) : document.languages ?? []).filter(option => option.family === family);
		if (binding.uri !== sourceUri) { throw new Error(vscode.l10n.t('The original source is unavailable. Reopen the problem from the source editor.')); }
		const languageId = this.catalogueSelection(document.ref, family, languages, usingCompilerCatalogue);
		const existing = this.panels.get(key);
		if (existing) {
			let current = false;
			try { existing.binding.assertCurrent(); current = existing.binding.source === source; } catch { /* Explicitly reopening binds the new source. */ }
			if (current) {
				this.cancelLanguageRead(existing);
				existing.panel.update({ problem: document, locale: this.statementLocale(document, existing.panel.state.locale), languages, languageId, languagesLoading: false, usingCompilerCatalogue });
				this.loadLanguages(key, existing);
				existing.panel.reveal(); return;
			}
			existing.panel.dispose();
		}
		const listeners: vscode.Disposable[] = [];
		const affects = (uri: vscode.Uri) => { const relative = path.relative(uri.fsPath, binding.filePath); return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)); };
		listeners.push(vscode.workspace.onDidCloseTextDocument(value => { if (value === source) { binding.invalidate(); } }),
			vscode.workspace.onDidSaveTextDocument(value => { if (value === source) { try { binding.refreshAfterSave(value); } catch { binding.invalidate(); } } }),
			vscode.workspace.onDidRenameFiles(event => { if (event.files.some(file => affects(file.oldUri))) { binding.invalidate(); } }),
			vscode.workspace.onDidDeleteFiles(event => { if (event.files.some(affects)) { binding.invalidate(); } }));
		const locale = this.statementLocale(document);
		const panel = new Panel(this.context, { kind: 'problem', labels: labels(), problem: document, languages, languageId, usingCompilerCatalogue, sourceName: path.basename(vscode.Uri.parse(sourceUri).fsPath), locale }, async value => {
			const document = panel.state.problem!;
			switch (value.action) {
				case 'selectLocale':
					if (document.bodies.some(body => body.locale === value.locale)) {
						if (document.ref.site === 'atcoder') { await this.preferences?.selectStatementLocale(value.locale); }
						if (panel.state.problem!.bodies.some(body => body.locale === value.locale)) { panel.update({ locale: value.locale }); }
					}
					break;
				case 'selectLanguage': await this.updateLanguage(document.ref, panel.state.languages ?? [], value.languageId); break;
				case 'submit': binding.assertCurrent(); await this.actions.submit(source, document); break;
				case 'importCph': binding.assertCurrent(); await this.actions.importCph(sourceUri, document); break;
				case 'openLink': await this.actions.openLink(value.url); break;
			}
		}, () => {
			listeners.splice(0).forEach(listener => listener.dispose());
			const entry = this.panels.get(key);
			if (entry?.panel === panel) { this.cancelLanguageRead(entry); this.panels.delete(key); }
		});
		const entry = { panel, binding };
		this.panels.set(key, entry);
		this.loadLanguages(key, entry);
	}
	private statementLocale(document: ProblemDocument, current?: string): string | undefined {
		const available = document.bodies.map(body => body.locale);
		if (document.ref.site === 'atcoder') { return this.preferences?.statementLocale(available) ?? available.find(value => value === 'en') ?? available[0]; }
		return current && available.includes(current) ? current : available.find(locale => locale.toLowerCase().startsWith(vscode.env.language.toLowerCase().split('-')[0])) ?? available[0];
	}
	private cancelLanguageRead(entry: ProblemPanelEntry): void {
		const request = entry.languageRead; entry.languageRead = undefined; request?.abort();
	}
	private loadLanguages(key: string, entry: ProblemPanelEntry, force = false): void {
		const problem = entry.panel.state.problem!;
		if (!this.actions.loadLanguages || (!force && problem.languages?.length) || (problem.ref.site !== 'atcoder' && problem.ref.site !== 'codeforces' && problem.ref.site !== 'lanqiao')) { return; }
		const request = new AbortController(); entry.languageRead = request;
		entry.panel.update({ languagesLoading: true });
		const current = () => this.panels.get(key) === entry && entry.languageRead === request && !request.signal.aborted;
		void (async () => {
			let catalogue: LanguageCatalogue;
			try { catalogue = await this.actions.loadLanguages!(problem.ref, request.signal); }
			catch { catalogue = { languages: [], languageError: 'unavailable' }; }
			if (!current()) { return; }
			entry.languageRead = undefined;
			const family = entry.binding.source.languageId === 'c' ? 'c' : 'cpp';
			const usingCompilerCatalogue = !!catalogue.languageError && catalogue.languages.length === 0;
			const languages = (usingCompilerCatalogue ? compilerCatalogue(problem.ref.site) : catalogue.languages).filter(option => option.family === family);
			const languageId = this.catalogueSelection(problem.ref, family, languages, usingCompilerCatalogue);
			entry.panel.update({ problem: { ...entry.panel.state.problem!, languages: catalogue.languages, languageError: catalogue.languageError }, languages, languageId, languagesLoading: false, usingCompilerCatalogue });
		})();
	}
	private catalogueSelection(problem: ProblemRef, family: 'c' | 'cpp', options: readonly LanguageOption[], usingCompilerCatalogue: boolean): string | undefined {
		const saved = this.actions.preferredLanguage(problem.site, family);
		const resolved = usingCompilerCatalogue ? options.find(option => option.id === saved)?.id : resolveCompiler(problem.site, family, saved, options);
		if (!usingCompilerCatalogue && saved && symbolicCompiler(problem.site, family, saved) && resolved) {
			void Promise.resolve(this.actions.selectLanguage(problem.site, family, resolved)).catch(error => { console.warn('[OJ Connect] Could not store the verified compiler choice', error); });
		}
		return resolved ?? (saved === undefined && !this.preferences?.hasLanguagePreference(problem.site, family) ? defaultLanguage(options, family, problem.site)?.id : undefined);
	}
	refreshLanguages(site: SiteId): void {
		for (const [key, entry] of this.panels) {
			if (entry.panel.state.problem?.ref.site !== site) { continue; }
			this.cancelLanguageRead(entry);
			this.loadLanguages(key, entry, true);
		}
	}
	updateLanguages(problem: ProblemRef, languages: readonly LanguageOption[]): void {
		for (const entry of this.panels.values()) {
			const { panel, binding } = entry;
			if (panel.state.problem?.ref.url !== problem.url) { continue; }
			this.cancelLanguageRead(entry);
			const family = binding.source.languageId === 'c' ? 'c' : 'cpp';
			const options = languages.filter(option => option.family === family);
			const languageId = this.catalogueSelection(problem, family, options, false);
			panel.update({ problem: { ...panel.state.problem, languages, languageError: undefined }, languages: options, languageId, languagesLoading: false, usingCompilerCatalogue: false });
		}
	}
	async updateLanguage(problem: ProblemRef, languages: readonly LanguageOption[], languageId: string): Promise<void> {
		const selected = languages.find(option => option.id === languageId);
		if (!selected) { return; }
		const panels = [...this.panels].map(([key, entry]) => ({ key, entry, document: entry.panel.state.problem, languages: entry.panel.state.languages }));
		await this.actions.selectLanguage(problem.site, selected.family, languageId);
		for (const current of panels) {
			const { panel, binding } = current.entry;
			if (this.panels.get(current.key) !== current.entry || panel.state.problem !== current.document || panel.state.languages !== current.languages) { continue; }
			if (panel.state.problem?.ref.site !== problem.site || binding.source.languageId !== selected.family) { continue; }
			const options = panel.state.problem.ref.url === problem.url ? languages : panel.state.languages ?? [];
			if (options.some(option => option.id === languageId)) { panel.update({ languages: options, languageId }); }
		}
	}
	refreshPreferences(): void {
		for (const { panel, binding } of this.panels.values()) {
			const problem = panel.state.problem!;
			const family = binding.source.languageId === 'c' ? 'c' : 'cpp';
			const saved = this.actions.preferredLanguage(problem.ref.site, family);
			const languageId = panel.state.languages?.find(option => option.id === saved)?.id ?? (saved === undefined && !this.preferences?.hasLanguagePreference(problem.ref.site, family) ? defaultLanguage(panel.state.languages ?? [], family, problem.ref.site)?.id : undefined);
			panel.update({ languageId, ...(problem.ref.site === 'atcoder' ? { locale: this.preferences?.statementLocale(problem.bodies.map(body => body.locale)) } : {}) });
		}
	}
	beaconProblems() {
		return [...this.panels.values()].flatMap(({ panel, binding }) => {
			if (!panel.state.problem) { return []; }
			let sourceUri: string | undefined;
			try { binding.assertCurrent(); sourceUri = binding.uri; } catch { /* The page remains usable without a source binding. */ }
			const identity: object = panel.panel;
			return [{ identity, document: panel.state.problem, locale: panel.state.locale, sourceUri, active: panel.panel.active }];
		});
	}
	dispose(): void { for (const value of this.panels.values()) { value.panel.dispose(); } this.panels.clear(); }
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ImportController } from './importController';
import { ImportResult, ProblemStore } from './problemStore';
import { JudgeView } from './judgeView';
import { fillTemplate, problemFileStem, problemDisplayName } from './importPreferences';

export const importProblemCommand = '_becoder.cph.importProblem';

/** Current-window entry point. No listener, protocol handler or external browser receiver. */
export function activate(context: vscode.ExtensionContext) {
	const imported = new vscode.EventEmitter<ImportResult>();
	context.subscriptions.push(imported);
	const judgeView = new JudgeView(context);
	context.subscriptions.push(judgeView, vscode.window.registerWebviewViewProvider(JudgeView.id, judgeView, { webviewOptions: { retainContextWhenHidden: vscode.workspace.getConfiguration('becoder.cph').get('general.retainWebviewContext', false) } }));
	const showAssociated = async (editor: vscode.TextEditor | undefined) => {
		if (!vscode.workspace.isTrusted || judgeView.isBusy || judgeView.hasUnsavedEdits) { return; }
		try {
			if (!editor || editor.document.uri.scheme !== 'file' || !['c', 'cpp'].includes(editor.document.languageId)) {
				await judgeView.clear();
				return;
			}
			await judgeView.openAssociated(editor.document.uri.fsPath);
		}
		catch (error) { await vscode.window.showErrorMessage(String(error)); }
	};
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => { void showAssociated(editor); }));
	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => {
		if (judgeView.source === document.uri.fsPath) { void judgeView.clear(); }
	}));
	void showAssociated(vscode.window.activeTextEditor);
	context.subscriptions.push(vscode.commands.registerCommand('becoder.cph.openCurrent', async () => {
		const document = vscode.window.activeTextEditor?.document;
		if (!document || document.uri.scheme !== 'file' || !['c', 'cpp'].includes(document.languageId)) {
			await vscode.window.showInformationMessage(vscode.l10n.t('Open a C or C++ source file first.'));
			return;
		}
		if (!vscode.workspace.isTrusted) { return; }
		await new ProblemStore(path.dirname(document.uri.fsPath)).createLocal(document.uri.fsPath);
		await judgeView.openSource(document.uri.fsPath);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('becoder.cph.runTestCases', async () => {
		const document = vscode.window.activeTextEditor?.document;
		if (!document || document.uri.scheme !== 'file' || !['c', 'cpp'].includes(document.languageId)) {
			await vscode.window.showInformationMessage(vscode.l10n.t('Open a C or C++ source file first.'));
			return;
		}
		if (!vscode.workspace.isTrusted) { throw new Error(vscode.l10n.t('Trust this workspace before running samples.')); }
		const store = new ProblemStore(path.dirname(document.uri.fsPath));
		if (!store.load(document.uri.fsPath)) { await store.createLocal(document.uri.fsPath); }
		await judgeView.runSource(document.uri.fsPath);
	}));
	const controller = new ImportController({
		sourcePreferences: async (problem, folder) => {
			const configuration = vscode.workspace.getConfiguration('becoder.cph', vscode.Uri.file(folder));
			let language = configuration.get<string>('general.defaultLanguage', 'cpp');
			const useTemplate = language !== 'none';
			if (language === 'none') {
				language = await vscode.window.showQuickPick(['cpp', 'c'], { placeHolder: vscode.l10n.t('Choose the source language') }) ?? '';
				if (!language) { return undefined; }
			}
			if (language !== 'cpp' && language !== 'c') { throw new Error(vscode.l10n.t('Only C and C++ are supported.')); }
			const template = configuration.get<string>('general.defaultLanguageTemplateFileLocation', '');
			return { language, contents: '', stem: problemFileStem(problem, (key, fallback) => configuration.get(key, fallback)),
				name: problemDisplayName(problem, configuration.get('general.includeProblemIndex', false)),
				initialize: stored => {
					if (!useTemplate || !template) { return ''; }
					const filename = path.resolve(folder, template);
					if (!fs.existsSync(filename)) {
						void vscode.window.showErrorMessage(vscode.l10n.t('Template file does not exist: {0}', filename));
						return '';
					}
					const stat = fs.statSync(filename);
					if (!stat.isFile() || stat.size > 8 * 1024 * 1024) { throw new Error(vscode.l10n.t('Invalid template file.')); }
					const contents = fs.readFileSync(filename, 'utf8');
					return configuration.get('general.doTemplateFileVariableReplacement', false) ? fillTemplate(contents, stored) : contents;
				} };
		},
		workspaceFolders: () => (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath),
		selectFolder: async folders => {
			const selected = await vscode.window.showQuickPick(folders.map(folder => ({ label: path.basename(folder), description: folder, folder })), {
				placeHolder: vscode.l10n.t('Choose a workspace folder for this problem')
			});
			return selected?.folder;
		},
		requestWorkspace: async () => {
			const open = vscode.l10n.t('Open Folder');
			if (await vscode.window.showInformationMessage(vscode.l10n.t('Open a folder before importing a problem.'), open) === open) {
				await vscode.commands.executeCommand('workbench.action.files.openFolder');
			}
		},
		confirmReplacement: async problem => {
			const replace = vscode.l10n.t('Replace Samples');
			return await vscode.window.showWarningMessage(
				vscode.l10n.t('This problem already exists. Replace its samples? Your source code will be kept.'),
				{ modal: true, detail: problem.srcPath }, replace
			) === replace;
		},
		showProblem: async result => {
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(result.problem.srcPath));
			const editor = await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside });
			const placeholder = '$CURSOR_PLACEHOLDER';
			const index = document.getText().indexOf(placeholder);
			if (index !== -1) {
				const start = document.positionAt(index);
				await editor.edit(edit => edit.delete(new vscode.Range(start, document.positionAt(index + placeholder.length))));
				editor.selection = new vscode.Selection(start, start);
				editor.revealRange(new vscode.Range(start, start), vscode.TextEditorRevealType.InCenter);
			}
			imported.fire(result);
			await judgeView.open(result.problem);
		}
	});
	context.subscriptions.push(controller);
	context.subscriptions.push(vscode.commands.registerCommand(importProblemCommand, async (json: unknown, pageUrl: unknown) => {
		if (judgeView.isBusy) { throw new Error(vscode.l10n.t('CPH is busy. Stop the current request first.')); }
		if (judgeView.hasUnsavedEdits) { throw new Error(vscode.l10n.t('Save the edited samples before opening another problem.')); }
		if (!vscode.workspace.isTrusted) {
			throw new Error(vscode.l10n.t('Trust this workspace before importing a problem.'));
		}
		if (typeof json !== 'string' || typeof pageUrl !== 'string') {
			throw new Error(vscode.l10n.t('Invalid problem import request.'));
		}
		return controller.import(json, pageUrl);
	}));
	return { onDidImportProblem: imported.event };
}

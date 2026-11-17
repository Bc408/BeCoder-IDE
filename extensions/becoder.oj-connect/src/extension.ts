/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { CommandBrowserHost, CommandLuoguHost, CommandNowcoderHost } from './browserHost';
import { AtCoderAdapter } from './adapters/atcoder/adapter';
import { NowcoderAdapter } from './adapters/nowcoder/adapter';
import { LuoguAdapter } from './adapters/luogu/adapter';
import { SubmissionController } from './workflowController';
import { ImportController } from './importController';
import { readDirectories, type SiteId } from './settings';
import { resolveProblem } from './problemResolver';
import { ProblemPanel } from './views/problemPanel';
import { RecordPanel } from './views/recordPanel';
import { LoginView } from './views/loginView';
import { LuoguCaptcha } from './views/luoguCaptcha';
import { cphSamples } from './cphHost';
import { OperationError } from './operationError';
import { userError } from './messages';
import { OjPreferences } from './preferences';
import type { ProblemRef, ProblemDocument, RecordRef, SubmissionOutcome, ISourceSnapshot } from './domain';

let controller: SubmissionController | undefined;
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const configuration = () => vscode.workspace.getConfiguration('becoder.ojConnect');
	const preferences = new OjPreferences({
		get: <T>(key: string) => configuration().get<T>(key),
		update: (key, value) => configuration().update(key, value, vscode.ConfigurationTarget.Global)
	});
	try {
		await preferences.migrate(context.globalState, key => configuration().inspect(key)?.globalValue !== undefined);
	} catch (error) {
		console.warn('[OJ Connect] Preference migration failed', error);
		void vscode.window.showWarningMessage(vscode.l10n.t('OJ Connect could not migrate saved preferences. Unmigrated choices are kept; check your user settings and reload to retry.'));
	}
	const execute = async (command: string, ...args: unknown[]) => vscode.commands.executeCommand(command, ...args);
	const captcha = new LuoguCaptcha(async requestId => vscode.commands.executeCommand<string>('_becoder.ojConnect.luogu.getCaptcha', requestId));
	context.subscriptions.push(captcha,
		vscode.commands.registerCommand('_becoder.ojConnect.luogu.askCaptcha', (image: string, requestId: string) => captcha.ask(image, requestId)),
		vscode.commands.registerCommand('_becoder.ojConnect.luogu.cancelCaptcha', (requestId: string) => captcha.cancel(requestId))
	);
	const adapters = [new LuoguAdapter(new CommandLuoguHost(execute)), new AtCoderAdapter(new CommandBrowserHost(execute)), new NowcoderAdapter(new CommandNowcoderHost(execute))];
	const directories = () => readDirectories(vscode.workspace.getConfiguration('becoder.ojConnect').get('directories'));
	const original = async (url: string) => { await vscode.commands.executeCommand('workbench.action.browser.open', { url, openToSide: true }); };
	const login = new LoginView(context, adapters, execute, original);
	context.subscriptions.push(login, vscode.window.registerWebviewViewProvider('becoder.ojConnect.accounts', login));
	const records = new RecordPanel(context, adapters, original, async record => { await execute('_becoder.ojConnect.releaseRecord', record); });
	const columns = new Map<string, vscode.ViewColumn>();
	const revealSource = async (sourceUri: string) => {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(sourceUri));
		await vscode.window.showTextDocument(document, { preview: false, viewColumn: columns.get(sourceUri) ?? vscode.ViewColumn.One });
		return document;
	};
	const openRecord = async (record: RecordRef, sourceUri: string) => {
		await revealSource(sourceUri); await records.open(record, sourceUri);
	};
	const requestProblem = async (fileName: string, site?: SiteId): Promise<ProblemRef | undefined> => {
		const candidates = adapters.filter(adapter => !site || adapter.site === site);
		const resolve = (value: string) => { const found = candidates.map(adapter => adapter.resolve(value)).filter((item): item is ProblemRef => !!item); return found.length === 1 ? found[0] : undefined; };
		const value = await vscode.window.showInputBox({ prompt: vscode.l10n.t('Problem number or official URL for {0}{1}', fileName, site ? ' (' + site + ')' : ''), validateInput: value => resolve(value) ? undefined : vscode.l10n.t('Enter a matching problem number or an official Luogu/AtCoder/Nowcoder URL.') });
		return value === undefined ? undefined : resolve(value);
	};
	controller = new SubmissionController({
		adapters, directories, requestProblem,
		chooseLanguage: async (options, fileName, site, problem) => {
			const selected = await vscode.window.showQuickPick(options, { title: vscode.l10n.t('Submit {0} to {1}', fileName, site) });
			if (selected) { await problems.updateLanguage(problem, options, selected.id); }
			return selected?.id;
		},
		confirmDraft: async fileName => {
			const replace = vscode.l10n.t('Replace Webpage Draft');
			return await vscode.window.showWarningMessage(vscode.l10n.t('Replace the code already in the webpage with {0}?', fileName), { modal: true }, replace) === replace;
		},
		// Status does not steal editor focus or promise to withdraw a sent solution.
		runWithProgress: async (fileName, operation) => {
			const status = vscode.window.createStatusBarItem();
			try {
				status.text = '$(sync~spin) ' + vscode.l10n.t('OJ Connect: submitting {0}', fileName);
				status.show();
				return await operation(value => { status.tooltip = value.phase === 'sending' || value.phase === 'interaction' ? vscode.l10n.t('Submitting code.') : value.message; });
			} finally { status.dispose(); }
		}, openRecord
	}, preferences);
	const snapshot = (document: vscode.TextDocument): ISourceSnapshot => {
		if (!vscode.workspace.isTrusted || document.uri.scheme !== 'file' || !['c', 'cpp'].includes(document.languageId)) { throw new Error(vscode.l10n.t('Focus a C/C++ source in a trusted local workspace.')); }
		return { uri: document.uri.toString(), fileName: path.basename(document.uri.fsPath), version: document.version, family: document.languageId as 'c' | 'cpp', source: document.getText() };
	};
	type Pending = { outcome: Extract<SubmissionOutcome, { kind: 'unconfirmed' }>; sourceUri: string; query?: Promise<void>; resolved?: boolean };
	let pending: Pending | undefined;
	const continueQuery = async (value = pending): Promise<void> => {
		if (!value || value.resolved) { return; }
		if (value.query) { return value.query; }
		value.query = (async () => {
			try {
				const adapter = adapters.find(item => item.site === value.outcome.problem.site)!;
				const outcome = await adapter.reconcile(value.outcome.attemptId, new AbortController().signal);
				if (outcome.kind === 'record') {
					value.resolved = true;
					if (pending === value) { pending = undefined; }
					await openRecord(outcome.record, value.sourceUri);
				} else { await vscode.window.showWarningMessage(vscode.l10n.t('The submission is still unconfirmed. Open its official record in the same browser and continue querying. No code was resent.')); }
			} finally { value.query = undefined; }
		})();
		return value.query;
	};
	const submitDocument = async (document: vscode.TextDocument, problem?: ProblemRef) => {
		const input = snapshot(document);
		if (vscode.window.activeTextEditor?.document === document && vscode.window.activeTextEditor.viewColumn) { columns.set(input.uri, vscode.window.activeTextEditor.viewColumn); }
		const outcome = await controller!.submit(input, problem);
		void login.refresh();
		if (outcome?.kind === 'not-sent') {
			if (outcome.reason === 'luogu-browser-verification-required' || outcome.reason === 'nowcoder-browser-verification-required') { await vscode.window.showWarningMessage(userError(outcome.reason)); }
			else { await vscode.window.showInformationMessage(vscode.l10n.t('No code was submitted: {0}', userError(outcome.reason))); }
		}
		else if (outcome?.kind === 'unconfirmed') {
			const value: Pending = { outcome, sourceUri: input.uri }; pending = value;
			const query = vscode.l10n.t('Continue Querying');
			if (await vscode.window.showWarningMessage(vscode.l10n.t('Submission receipt unconfirmed: {0}. Continue querying instead of submitting again.', userError(outcome.message)), query) === query) { await continueQuery(value); }
		}
	};
	const problems = new ProblemPanel(context, {
		preferredLanguage: (site, family) => controller!.preferredLanguage(site, family),
		selectLanguage: (site, family, languageId) => controller!.selectLanguage(site, family, languageId),
		submit: async (source, document) => submitDocument(source, document.ref),
		importCph: async (sourceUri, document) => { await vscode.commands.executeCommand('_becoder.cph.importSamplesForSource', { sourceUri, problem: cphSamples(document) }); },
		openOriginal: original
	}, preferences);
	const importer = new ImportController(adapters, {
		folders: () => (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath), directories,
		selectFolder: async folders => (await vscode.window.showQuickPick(folders.map(folder => ({ label: path.basename(folder), description: folder, folder })), { title: vscode.l10n.t('Choose an import folder') }))?.folder,
		open: async (sourceUri, document) => { const source = await revealSource(sourceUri); await problems.open(document, sourceUri, source); }
	});
	context.subscriptions.push(problems, records, importer,
		vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('becoder.ojConnect')) { problems.refreshPreferences(); } })
	);
	const guard = (action: () => Promise<unknown>) => async () => {
		try { await action(); }
		catch (error) {
			if (error instanceof OperationError && error.record) { await records.open(error.record); return; }
			await vscode.window.showErrorMessage(vscode.l10n.t('OJ Connect: {0}', userError(error)));
		}
	};
	const currentDocument = () => { const document = vscode.window.activeTextEditor?.document; if (!document) { throw new Error(vscode.l10n.t('Focus the C/C++ source editor before submitting.')); } return document; };
	context.subscriptions.push(
		vscode.commands.registerCommand('becoder.ojConnect.submit', guard(async () => submitDocument(currentDocument()))),
		vscode.commands.registerCommand('becoder.ojConnect.showProblem', guard(async () => {
			const source = currentDocument(), input = snapshot(source), column = vscode.window.activeTextEditor?.viewColumn;
			if (column) { columns.set(input.uri, column); }
			const resolution = resolveProblem(source.uri.fsPath, directories(), adapters);
			if (resolution.kind === 'unsupported') { throw new Error(vscode.l10n.t('The {0} adapter is not available yet. No code was submitted.', resolution.site)); }
			const ref = resolution.kind === 'problem' ? resolution.problem : await requestProblem(input.fileName, resolution.site);
			if (!ref) { return; }
			const document = await adapters.find(item => item.site === ref.site)!.readProblem(ref, new AbortController().signal);
			await revealSource(input.uri); await problems.open(document, input.uri, source);
		})),
		vscode.commands.registerCommand('_becoder.ojConnect.importFromBrowser', async (document: ProblemDocument) => { if (!vscode.workspace.isTrusted) { throw new Error(vscode.l10n.t('Trust this workspace before importing a problem.')); } return importer.import(document); }),
		vscode.commands.registerCommand('becoder.ojConnect.continueQuery', guard(continueQuery)),
		vscode.commands.registerCommand('becoder.ojConnect.refreshAccounts', () => login.refresh())
	);
}

export async function deactivate(): Promise<void> { await controller?.dispose(); controller = undefined; }

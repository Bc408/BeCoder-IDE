/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fileURLToPath } from 'url';
import * as path from 'path';
import { randomUUID, createHash } from 'crypto';
import * as vscode from 'vscode';
import type { IBeaconAcquisition, IBeaconCollectionScope, IBeaconOjCapture } from 'becoder-beacon';
import { toBeaconProblemRecord, toBeaconVerdictRecord } from './beaconRecords';
import { resolveBeaconProblemId } from './browserProblem';
import { CommandBrowserHost, CommandLuoguHost, CommandNowcoderHost, CommandCodeforcesHost, CommandLanqiaoHost } from './browserHost';
import { LanqiaoAdapter } from './adapters/lanqiao/adapter';
import { AtCoderAdapter } from './adapters/atcoder/adapter';
import { CodeforcesAdapter } from './adapters/codeforces/adapter';
import { NowcoderAdapter } from './adapters/nowcoder/adapter';
import { LuoguAdapter } from './adapters/luogu/adapter';
import { SubmissionController } from './workflowController';
import { ImportController, browserImportTarget } from './importController';
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
import { validateLanguageCatalogue, validateProblemRef, type LanguageCatalogue, type ProblemRef, type ProblemDocument, type RecordRef, type RecordSnapshot, type SubmissionOutcome, type ISourceSnapshot } from './domain';

export async function readProblemLanguages(problem: ProblemRef, signal: AbortSignal): Promise<LanguageCatalogue> {
	if (signal.aborted) { throw new Error('oj-connect-operation-cancelled'); }
	if (problem.site !== 'atcoder' && problem.site !== 'codeforces' && problem.site !== 'lanqiao') { return { languages: [], languageError: 'unavailable' }; }
	const command = '_becoder.ojConnect.' + problem.site;
	const requestId = randomUUID();
	let abort!: () => void;
	try {
		return await new Promise<LanguageCatalogue>((resolve, reject) => {
			abort = () => {
				void vscode.commands.executeCommand(command + '.cancelLanguageRead', requestId).then(undefined, () => undefined);
				reject(new Error('oj-connect-operation-cancelled'));
			};
			signal.addEventListener('abort', abort, { once: true });
			void vscode.commands.executeCommand(command + '.readLanguages', problem, requestId).then(raw => {
				if (signal.aborted) { return; }
				try { resolve(validateLanguageCatalogue(raw, problem.site)); } catch (error) { reject(error); }
			}, reject);
		});
	} finally { signal.removeEventListener('abort', abort); }
}

let controller: SubmissionController | undefined;
export async function activate(context: vscode.ExtensionContext) {
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
	const collectionScope = async (): Promise<IBeaconCollectionScope | undefined> => {
		try { return await vscode.commands.executeCommand<IBeaconCollectionScope>('_becoder.beacon.context', 'captureCollectionScope'); }
		catch { return undefined; }
	};
	const publishAcquiredProblem = async (document: ProblemDocument, sourceUri: string, viewedAt: number, _trigger: IBeaconAcquisition['trigger'], scope: IBeaconCollectionScope | undefined): Promise<void> => {
		if (!scope) { return; }
		try { await execute('_becoder.beacon.context', 'captureProblemRecord', { record: toBeaconProblemRecord(document, sourceUri, viewedAt), collectionScope: scope }); }
		catch { void vscode.window.showWarningMessage(vscode.l10n.t('The problem was opened, but Beacon could not save its context.')); }
	};
	const createOjCapture = (sourceUri: string, scope: IBeaconCollectionScope | undefined, _identity: { attemptId?: string; recordKey?: string }) => {
		// Repeated delivery within this observation is idempotent; a later read is new evidence.
		const publishedRecords = new Set<string>();
		let tail = Promise.resolve(), failed = false;
		const enqueue = (operation: () => Promise<unknown>) => {
			if (!scope) { return; }
			tail = tail.then(async () => { if (!failed) { await operation(); } }).catch(() => { failed = true; void vscode.window.showWarningMessage(vscode.l10n.t('The submission continues, but Beacon could not save its context.')); });
		};
		return {
			accept: (input: IBeaconOjCapture) => {
				if (!scope || !Object.hasOwn(input, 'record')) { return; }
				const observed = input as Extract<IBeaconOjCapture, { record: RecordSnapshot }>;
				const record = toBeaconVerdictRecord(observed.record, sourceUri || undefined); if (!record) { return; }
				const key = createHash('sha256').update(JSON.stringify([scope, observed.record])).digest('hex');
				enqueue(async () => {
					if (publishedRecords.has(key)) { return; }
					await execute('_becoder.beacon.context', 'captureVerdict', { record, collectionScope: scope });
					publishedRecords.add(key);
				});
			},
			finish: async () => { await tail; }
		};
	};
	const publishObservedRecord = async (record: RecordSnapshot, sourceUri: string, scope: IBeaconCollectionScope | undefined, attemptId: string) => {
		const capture = createOjCapture(sourceUri, scope, { attemptId, recordKey: JSON.stringify([record.ref.problem.site, record.ref.id, record.ref.url]) });
		capture.accept({ record, sourceUri, attemptId });
		await capture.finish();
	};
	const evaluationCaptures = new Map<string, ReturnType<typeof createOjCapture>>();
	const captcha = new LuoguCaptcha(async requestId => vscode.commands.executeCommand<string>('_becoder.ojConnect.luogu.getCaptcha', requestId));
	context.subscriptions.push(captcha,
		vscode.commands.registerCommand('_becoder.ojConnect.luogu.askCaptcha', (image: string, requestId: string) => captcha.ask(image, requestId)),
		vscode.commands.registerCommand('_becoder.ojConnect.luogu.cancelCaptcha', (requestId: string) => captcha.cancel(requestId))
	);
	const adapters = [new LuoguAdapter(new CommandLuoguHost(execute)), new AtCoderAdapter(new CommandBrowserHost(execute)), new NowcoderAdapter(new CommandNowcoderHost(execute)), new CodeforcesAdapter(new CommandCodeforcesHost(execute)), new LanqiaoAdapter(new CommandLanqiaoHost(execute))];
	const directories = () => readDirectories(vscode.workspace.getConfiguration('becoder.ojConnect').get('directories'));
	const openInBrowser = async (url: string) => { await vscode.commands.executeCommand('workbench.action.browser.open', { url, openToSide: true }); };
	const login = new LoginView(context, adapters, execute, openInBrowser, site => problems?.refreshLanguages(site));
	context.subscriptions.push(login, vscode.window.registerWebviewViewProvider('becoder.ojConnect.accounts', login));
	const records = new RecordPanel(context, adapters, openInBrowser, async record => { await execute('_becoder.ojConnect.releaseRecord', record); }, (outcome, sourceUri, onRecord, isOpen, scope) => {
		const value: Pending = { outcome, sourceUri, onRecord, isOpen, scope }; pending = value;
		return () => continueQuery(value);
	}, (ref, sourceUri, scope, attemptId) => {
		const capture = createOjCapture(sourceUri, scope, { attemptId, recordKey: JSON.stringify([ref.problem.site, ref.id, ref.url]) });
		return { accept: record => capture.accept({ record, sourceUri: sourceUri || undefined, attemptId }), finish: capture.finish };
	});
	const columns = new Map<string, vscode.ViewColumn>();
	const revealSource = async (sourceUri: string) => {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(sourceUri));
		await vscode.window.showTextDocument(document, { preview: false, viewColumn: columns.get(sourceUri) ?? vscode.ViewColumn.One });
		return document;
	};
	const openRecord = async (record: RecordRef, sourceUri: string, scope?: IBeaconCollectionScope, attemptId?: string) => {
		// The official receipt remains useful when its original local source was removed.
		await revealSource(sourceUri).catch(() => undefined);
		await records.open(record, sourceUri, scope, attemptId);
	};
	const requestProblem = async (fileName: string, site?: SiteId): Promise<ProblemRef | undefined> => {
		const candidates = adapters.filter(adapter => !site || adapter.site === site);
		const resolve = (value: string) => { const found = candidates.map(adapter => adapter.resolve(value)).filter((item): item is ProblemRef => !!item); return found.length === 1 ? found[0] : undefined; };
		const value = await vscode.window.showInputBox({ prompt: vscode.l10n.t('Problem number or official URL for {0}{1}', fileName, site ? ' (' + site + ')' : ''), validateInput: value => resolve(value) ? undefined : vscode.l10n.t('Enter a matching problem number or an official Luogu/AtCoder/Codeforces/Nowcoder/Lanqiao URL.') });
		return value === undefined ? undefined : resolve(value);
	};
	controller = new SubmissionController({
		adapters, directories, requestProblem,
		onLanguages: (problem, options) => problems.updateLanguages(problem, options),
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
				return await operation(value => { status.tooltip = value.phase === 'sending' || value.phase === 'interaction' ? vscode.l10n.t('Submitting code.') : value.evaluation ? vscode.l10n.t('Reading the current submission result…') : value.message; });
			} finally { status.dispose(); }
		}, openRecord, beginEvaluation: (value, sourceUri, scope) => records.beginEvaluation(value, sourceUri, scope),
		onRecord: publishObservedRecord,
		onEvaluation: (attemptId, evaluation, sourceUri, scope) => {
			let capture = evaluationCaptures.get(attemptId);
			if (!capture) { capture = createOjCapture(sourceUri, scope, { attemptId }); evaluationCaptures.set(attemptId, capture); }
			capture.accept({ attemptId, evaluation, sourceUri });
		},
		onEvaluationEnd: async attemptId => { const capture = evaluationCaptures.get(attemptId); evaluationCaptures.delete(attemptId); await capture?.finish(); }
	}, preferences);
	const snapshot = (document: vscode.TextDocument): ISourceSnapshot => {
		if (!vscode.workspace.isTrusted || document.uri.scheme !== 'file' || !['c', 'cpp'].includes(document.languageId)) { throw new Error(vscode.l10n.t('Focus a C/C++ source in a trusted local workspace.')); }
		return { uri: document.uri.toString(), fileName: path.basename(document.uri.fsPath), version: document.version, family: document.languageId as 'c' | 'cpp', source: document.getText() };
	};
	type Pending = { outcome: Extract<SubmissionOutcome, { kind: 'unconfirmed' }>; sourceUri: string; scope?: IBeaconCollectionScope; query?: Promise<void>; record?: RecordRef; resolved?: boolean; onRecord?: (record: RecordRef) => void; isOpen?: () => boolean };
	let pending: Pending | undefined;
	const continueQuery = async (value = pending): Promise<void> => {
		if (!value || value.resolved) { return; }
		if (value.query) { return value.query; }
		// A query begun from a visible preview stays owned by it, even if closed while awaiting.
		// A fresh explicit query after closure keeps the original command's open-record behavior.
		const onRecord = value.isOpen?.() ? value.onRecord : undefined;
		value.query = (async () => {
			try {
				const adapter = adapters.find(item => item.site === value.outcome.problem.site)!;
				const outcome: SubmissionOutcome = value.record ? { kind: 'record', record: value.record } : await adapter.reconcile(value.outcome.attemptId, new AbortController().signal);
				if (outcome.kind === 'record') {
					value.record = outcome.record;
					if (outcome.observed) { try { await publishObservedRecord(outcome.observed.snapshot, value.sourceUri, value.scope, outcome.observed.attemptId); } catch { /* Storage cannot undo a confirmed query. */ } }
					if (onRecord) { onRecord(outcome.record); }
					else { await openRecord(outcome.record, value.sourceUri, value.scope, value.outcome.attemptId); }
					value.resolved = true;
					if (pending === value) { pending = undefined; }
				} else { await vscode.window.showWarningMessage(vscode.l10n.t('The submission is still unconfirmed. Open its official record in the same browser and continue querying. No code was resent.')); }
			} finally { value.query = undefined; }
		})();
		return value.query;
	};
	const submitDocument = async (document: vscode.TextDocument, problem?: ProblemRef) => {
		const input = snapshot(document);
		const scope = await collectionScope();
		if (vscode.window.activeTextEditor?.document === document && vscode.window.activeTextEditor.viewColumn) { columns.set(input.uri, vscode.window.activeTextEditor.viewColumn); }
		const outcome = await controller!.submit(input, problem, scope);
		void login.refresh();
		if (outcome?.kind === 'not-sent') {
			if (outcome.reason === 'luogu-browser-verification-required' || outcome.reason === 'nowcoder-browser-verification-required') { await vscode.window.showWarningMessage(userError(outcome.reason)); }
			else { await vscode.window.showInformationMessage(vscode.l10n.t('No code was submitted: {0}', userError(outcome.reason))); }
		}
		else if (outcome?.kind === 'rejected') { await vscode.window.showWarningMessage(userError(outcome.reason)); }
		else if (outcome?.kind === 'unconfirmed') {
			const value: Pending = pending?.outcome.attemptId === outcome.attemptId && pending.outcome.problem.url === outcome.problem.url ? pending : { outcome, sourceUri: input.uri, scope }; pending = value;
			const query = vscode.l10n.t('Continue Querying');
			if (await vscode.window.showWarningMessage(vscode.l10n.t('Submission receipt unconfirmed: {0}. Continue querying instead of submitting again.', userError(outcome.message)), query) === query) { await continueQuery(value); }
		}
	};
	const problems = new ProblemPanel(context, {
		loadLanguages: readProblemLanguages,
		preferredLanguage: (site, family) => controller!.preferredLanguage(site, family),
		selectLanguage: (site, family, languageId) => controller!.selectLanguage(site, family, languageId),
		submit: async (source, document) => submitDocument(source, document.ref),
		importCph: async (sourceUri, document) => {
			const scope = await collectionScope();
			const imported = await vscode.commands.executeCommand('_becoder.cph.importSamplesForSource', { sourceUri, problem: cphSamples(document) });
			if (imported) { await publishAcquiredProblem(document, sourceUri, Date.now(), 'import-cph', scope); }
		},
		openLink: openInBrowser
	}, preferences);
	const importer = new ImportController(adapters, {
		folders: () => (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath), directories,
		selectFolder: async folders => (await vscode.window.showQuickPick(folders.map(folder => ({ label: path.basename(folder), description: folder, folder })), { title: vscode.l10n.t('Choose an import folder') }))?.folder,
		open: async (sourceUri, document) => { const source = await revealSource(sourceUri); await problems.open(document, source.uri.toString(), source); },
		acquired: async (document, sourceUri, acquisition) => { if (acquisition) { await publishAcquiredProblem(document, sourceUri, Date.now(), acquisition.trigger, acquisition.scope); } }
	});
	context.subscriptions.push(problems, records, importer,
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('becoder.ojConnect')) { problems.refreshPreferences(); }
			if (event.affectsConfiguration('workbench.browser.dataStorage')) { void login.refresh(true); }
		}),
		vscode.workspace.onDidGrantWorkspaceTrust(() => { void login.refresh(true); })
	);
	const guard = (action: () => Promise<unknown>) => async () => {
		try { await action(); }
		catch (error) {
			if (error instanceof OperationError && error.record) { await records.open(error.record); return; }
			await vscode.window.showErrorMessage(vscode.l10n.t('OJ Connect: {0}', userError(error)));
		}
	};
	const currentDocument = () => { const document = vscode.window.activeTextEditor?.document; if (!document) { throw new Error(vscode.l10n.t('Focus the C/C++ source editor.')); } return document; };
	const problemReads = new Map<string, AbortController>();
	context.subscriptions.push({ dispose: () => { for (const read of problemReads.values()) { read.abort(); } problemReads.clear(); } });
	context.subscriptions.push(
		vscode.commands.registerCommand('becoder.ojConnect.submit', guard(async () => submitDocument(currentDocument()))),
		vscode.commands.registerCommand('becoder.ojConnect.showProblem', guard(async () => {
			const source = currentDocument(), input = snapshot(source), column = vscode.window.activeTextEditor?.viewColumn;
			const scope = await collectionScope();
			if (column) { columns.set(input.uri, column); }
			problemReads.get(input.uri)?.abort();
			const read = new AbortController(); problemReads.set(input.uri, read);
			try {
				const resolution = resolveProblem(source.uri.fsPath, directories(), adapters);
				if (resolution.kind === 'unsupported') { throw new Error(vscode.l10n.t('The {0} adapter is not available yet.', resolution.site)); }
				const ref = resolution.kind === 'problem' ? resolution.problem : await requestProblem(input.fileName, resolution.site);
				if (!ref || read.signal.aborted) { return; }
				const document = await adapters.find(item => item.site === ref.site)!.readProblem(ref, read.signal, { family: input.family });
				if (read.signal.aborted) { return; }
				await revealSource(input.uri);
				if (!read.signal.aborted) { await problems.open(document, input.uri, source); await publishAcquiredProblem(document, input.uri, Date.now(), 'get-problem', scope); }
			} catch (error) { if (!read.signal.aborted) { throw error; } }
			finally { if (problemReads.get(input.uri) === read) { problemReads.delete(input.uri); } }
		})),
		vscode.commands.registerCommand('_becoder.ojConnect.importTarget', (url: string) => typeof url === 'string' ? browserImportTarget(url, directories, adapters) : undefined),
		vscode.commands.registerCommand('_becoder.ojConnect.cancelBrowserImport', (requestId: string) => importer.cancel(requestId)),
		vscode.commands.registerCommand('_becoder.ojConnect.importFromBrowser', async (document: ProblemDocument, requestId?: string, acquisition?: IBeaconAcquisition) => {
			if (!vscode.workspace.isTrusted) { throw new Error(vscode.l10n.t('Trust this workspace before importing a problem.')); }
			return importer.import(document, requestId, acquisition ?? { scope: await collectionScope(), trigger: 'get-problem' });
		}),
		vscode.commands.registerCommand('_becoder.ojConnect.captureImportedProblem', async (sourcePath: string, pageUrl: string, acquisition: IBeaconAcquisition) => {
			if (!acquisition?.scope || !vscode.workspace.isTrusted) { return; }
			const problem = adapters.map(adapter => adapter.resolve(pageUrl)).find(ref => !!ref);
			if (!problem) { return; }
			try {
				const document = await adapters.find(adapter => adapter.site === problem.site)!.readProblem(problem, new AbortController().signal, { family: path.extname(sourcePath).toLowerCase() === '.c' ? 'c' : 'cpp' });
				await publishAcquiredProblem(document, vscode.Uri.file(sourcePath).toString(), Date.now(), acquisition.trigger, acquisition.scope);
			} catch { void vscode.window.showWarningMessage(vscode.l10n.t('Samples were imported, but Beacon could not acquire the full problem statement.')); }
		}),
		vscode.commands.registerCommand('becoder.ojConnect.continueQuery', guard(continueQuery)),
		vscode.commands.registerCommand('becoder.ojConnect.refreshAccounts', () => login.refresh())
	);
	return {
		resolveBeaconProblemId,
		resolveBeaconUrl: (url: string) => adapters.map(adapter => adapter.resolve(url)).find(ref => !!ref),
		resolveBeaconProblem: (sourceUri: string) => {
			if (!sourceUri.startsWith('file:')) { return { kind: 'inputRequired' as const }; }
			return resolveProblem(fileURLToPath(sourceUri), directories(), adapters);
		},
		readBeaconProblem: async (input: ProblemRef, signal: AbortSignal, options?: { family?: 'c' | 'cpp' }) => {
			const ref = validateProblemRef(input);
			return adapters.find(adapter => adapter.site === ref.site)!.readProblem(ref, signal, { family: options?.family ?? 'cpp' });
		}
	};
}

export async function deactivate(): Promise<void> { await controller?.dispose(); controller = undefined; }

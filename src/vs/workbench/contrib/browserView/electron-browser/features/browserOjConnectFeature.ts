/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns -- BeCoder's internal type-only extension bridge contract.
import type { IAtCoderPageRef, IAtCoderSourcePayload, RecordRef, RecordSnapshot, ProblemRef, ILuoguSourcePayload, LoginSummary, SubmissionOutcome } from 'becoder-oj-connect';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { timeout } from '../../../../../base/common/async.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { BrowserViewStorageScope, IBrowserViewService, ipcBrowserViewChannelName } from '../../../../../platform/browserView/common/browserView.js';
import { AtCoderBridgeController, AtCoderPageGeneration } from '../../../../../platform/browserView/common/atcoderBridge.js';
import { LuoguBridgeController, assertLuoguProblem } from '../../../../../platform/browserView/common/luoguBridge.js';
import type { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { type IBrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { atCoderTask } from '../../../../../platform/browserView/common/atcoderWorkflow.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';

/** Fixed operations only. The command service supplies this window, never an extension-supplied window ID. */
export class BrowserOjConnectContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.ojConnect';
	private bridge: AtCoderBridgeController;
	private luoguBridge: LuoguBridgeController;
	constructor(
		@IEditorService editors: IEditorService,
		@IBrowserViewWorkbenchService browsers: IBrowserViewWorkbenchService,
		@ICommandService _commands: ICommandService,
		@IMainProcessService mainProcess: IMainProcessService,
		@IExtensionService extensions: IExtensionService,
	) {
		super();
		const service = ProxyChannel.toService<IBrowserViewService>(mainProcess.getChannel(ipcBrowserViewChannelName));
		const owner = mainWindow.vscodeWindowId;
		const find = (viewId: string) => [...browsers.getKnownBrowserViews().values()].find(input => input.model?.id === viewId && !input.isDisposed());
		const generations = new AtCoderPageGeneration();
		const watched = new Set<string>();
		let accountRefresh: ReturnType<typeof setTimeout> | undefined;
		const refreshAccounts = () => {
			if (accountRefresh) { clearTimeout(accountRefresh); }
			accountRefresh = setTimeout(() => { accountRefresh = undefined; if (active()) { void _commands.executeCommand('becoder.ojConnect.refreshAccounts').catch(() => undefined); } }, 250);
		};
		this._register(toDisposable(() => { if (accountRefresh) { clearTimeout(accountRefresh); } }));
		const pageListeners = this._register(new DisposableStore());
		const siteViews = new Map<string, BrowserEditorInput>();
		const ownedInputs = new Set<BrowserEditorInput>();
		const revealing = new Map<BrowserEditorInput, Promise<unknown>>();
		const reveal = async (input: BrowserEditorInput) => {
			const pending = revealing.get(input) ?? editors.openEditor(input, { pinned: true }, SIDE_GROUP);
			revealing.set(input, pending);
			try { await pending; } finally { if (revealing.get(input) === pending) { revealing.delete(input); } }
		};
		const closeInteraction = async (input: BrowserEditorInput | undefined) => {
			if (!input || !ownedInputs.has(input)) { return; }
			// The native receipt can arrive while openEditor is still opening the verification tab.
			await revealing.get(input);
			if (!input.isDisposed() && editors.editors.includes(input)) {
				await editors.closeEditors(editors.findEditors(input.resource).filter(item => item.editor === input));
			}
		};
		let preparationEpoch = 0;
		let lifecycleEpoch = 0;
		const assertLifecycle = (epoch: number) => { if (epoch !== lifecycleEpoch) { throw new Error('oj-connect-stopped'); } };
		let preparationController = new AbortController();
		const cancelPreparation = () => {
			preparationEpoch++; preparationController.abort(); preparationController = new AbortController();
			void service.cancelOjPreparations(owner).catch(() => undefined);
		};
		const recordViews = new Map<string, string>();
		const recordScopes = new Map<string, BrowserViewStorageScope>();
		const recordLifetimes = new Map<string, AbortController>();
		const recordLifetime = (record: RecordRef) => {
			let controller = recordLifetimes.get(record.url);
			if (!controller) { controller = new AbortController(); recordLifetimes.set(record.url, controller); }
			return controller.signal;
		};
		const stopRecord = (record: RecordRef) => { recordLifetimes.get(record.url)?.abort(new Error('oj-connect-stopped')); recordLifetimes.delete(record.url); finishedRecords.delete(record.url); };
		const stopRecords = () => { for (const controller of recordLifetimes.values()) { controller.abort(new Error('oj-connect-stopped')); } recordLifetimes.clear(); };
		const assertRecord = (epoch: number, signal: AbortSignal) => { assertLifecycle(epoch); signal.throwIfAborted(); };
		const recordCancellations = new Map<string, Promise<void>>();
		const attemptViews = new Map<string, string>();
		const attemptScopes = new Map<string, BrowserViewStorageScope>();
		const attemptTimers = new Set<ReturnType<typeof setTimeout>>();
		this._register(toDisposable(() => { for (const timer of attemptTimers) { clearTimeout(timer); } attemptTimers.clear(); }));
		const busyViews = new Map<string, number>();
		const openingInputs = new Map<BrowserEditorInput, number>();
		const finishedRecords = new Map<string, RecordSnapshot>();
		const closeIdle = () => {
			for (const input of ownedInputs) {
				const id = input.model?.id;
				if (openingInputs.has(input)) { continue; }
				if (id && (busyViews.has(id) || [...siteViews.values()].includes(input) || [...recordViews.values(), ...attemptViews.values()].includes(id))) { continue; }
				if (!editors.editors.includes(input)) { input.dispose(); ownedInputs.delete(input); }
			}
		};
		const retain = (id: string) => { busyViews.set(id, (busyViews.get(id) ?? 0) + 1); };
		const release = (page: { viewId: string }) => {
			const count = (busyViews.get(page.viewId) ?? 0) - 1;
			if (count > 0) { busyViews.set(page.viewId, count); } else { busyViews.delete(page.viewId); }
			closeIdle();
		};
		const finishRead = (snapshot: RecordSnapshot, epoch: number) => {
			assertLifecycle(epoch);
			if (snapshot.phase === 'finished') { finishedRecords.set(snapshot.ref.url, snapshot); recordViews.delete(snapshot.ref.url); closeIdle(); }
			return snapshot;
		};
		const remember = (outcome: SubmissionOutcome, viewId: string, scope: BrowserViewStorageScope): SubmissionOutcome => {
			if (outcome.kind === 'record') { recordViews.set(outcome.record.url, viewId); recordScopes.set(outcome.record.url, scope); }
			else if (outcome.kind === 'unconfirmed' && !attemptViews.has(outcome.attemptId)) {
				attemptViews.set(outcome.attemptId, viewId);
				attemptScopes.set(outcome.attemptId, scope);
				const timer = setTimeout(() => { attemptTimers.delete(timer); attemptViews.delete(outcome.attemptId); attemptScopes.delete(outcome.attemptId); closeIdle(); }, 600000);
				attemptTimers.add(timer);
			}
			return outcome;
		};
		const reconciled = (outcome: SubmissionOutcome, attemptId: string) => {
			const scope = attemptScopes.get(attemptId);
			if (scope === undefined) { throw new Error('oj-connect-session-scope-changed'); }
			remember(outcome, attemptViews.get(attemptId) ?? '', scope);
			if (outcome.kind !== 'unconfirmed') { attemptViews.delete(attemptId); attemptScopes.delete(attemptId); closeIdle(); }
			return outcome;
		};
		const canonical = (value: string) => { const url = new URL(value); url.hash = ''; return url.href; };
		const originOf = (value: string) => { try { return new URL(value).origin; } catch { return ''; } };
		const active = () => !!extensions.getExtensionsStatus()['becoder.oj-connect']?.activationStarted;
		this._register(service.onDidRequireOjInteraction(event => {
			const input = event.windowId === owner && active() ? find(event.id) : undefined;
			if (input) { void reveal(input).catch(() => undefined); }
		}));
		this._register(service.onDidChangeOjSession(event => {
			if (event.windowId === owner) {
				if (event.site === 'luogu') { for (const [url, record] of finishedRecords) { if (record.ref.problem.site === 'luogu') { finishedRecords.delete(url); } } }
				refreshAccounts();
			}
		}));
		const watchModel = (model: IBrowserViewModel, url = model.url) => {
			if (!watched.has(model.id)) {
				watched.add(model.id);
				pageListeners.add(model.onDidNavigate(() => { generations.didNavigate(model.id); refreshAccounts(); }));
				if (model.onDidChangeLoadingState) { pageListeners.add(model.onDidChangeLoadingState(() => { if (!model.loading) { refreshAccounts(); } })); }
				pageListeners.add(model.onDidClose(() => generations.didNavigate(model.id)));
			}
			return generations.capture({ viewId: model.id, url });
		};
		const watchBrowsers = () => {
			for (const input of browsers.getKnownBrowserViews().values()) {
				const model = input.model;
				if (input.isDisposed() || !model || model.storageScope === BrowserViewStorageScope.Ephemeral) { continue; }
				watchModel(model);
				const origin = originOf(model.url);
				if (origin === 'https://www.luogu.com.cn' || origin === 'https://atcoder.jp') { void service.watchOjSession(model.id, owner).catch(() => undefined); }
			}
		};
		if (browsers.onDidChangeBrowserViews) { this._register(browsers.onDidChangeBrowserViews(watchBrowsers)); }
		watchBrowsers();
		const openPage = async (url: string, signal?: AbortSignal, scope?: BrowserViewStorageScope, taskOwned = false): Promise<BrowserEditorInput> => {
			const epoch = lifecycleEpoch;
			if (!active()) { throw new Error('oj-connect-extension-unavailable'); }
			const origin = new URL(url).origin;
			const all = [...browsers.getKnownBrowserViews().values()].filter(item => !item.isDisposed() && item.model?.storageScope !== BrowserViewStorageScope.Ephemeral && (scope === undefined || item.model?.storageScope === scope));
			const exact = all.filter(item => item.url && canonical(item.url) === canonical(url));
			const candidates = taskOwned ? [] : exact.length || scope === undefined ? exact : all.filter(item => item.url && originOf(item.url) === origin);
			const preferred = siteViews.get(origin);
			if (candidates.length > 1 && !candidates.includes(preferred!)) { throw new Error('oj-connect-browser-ambiguous'); }
			let input = candidates.includes(preferred!) ? preferred : candidates[0];
			if (!input) {
				if (scope !== undefined && await browsers.resolveStorageScope() !== scope) { throw new Error('oj-connect-session-scope-changed'); }
				assertLifecycle(epoch);
				signal?.throwIfAborted();
				// Ephemeral tabs have intentionally isolated sessions. Never silently open a fresh account.
				if (preferred?.model && !preferred.isDisposed() && preferred.model.storageScope === BrowserViewStorageScope.Ephemeral) { throw new Error('Open the target problem in the existing temporary browser session first.'); }
				input = browsers.getOrCreateLazy(generateUuid(), { url }); ownedInputs.add(input);
			}
			openingInputs.set(input, (openingInputs.get(input) ?? 0) + 1);
			try {
				let abort: (() => void) | undefined;
				try {
					signal?.throwIfAborted();
					await Promise.race([input.resolve(), new Promise<never>((_resolve, reject) => { abort = () => reject(signal?.reason); signal?.addEventListener('abort', abort, { once: true }); })]);
				} finally { if (abort) { signal?.removeEventListener('abort', abort); } }
				const started = Date.now();
				while (Date.now() - started < 20000) {
					assertLifecycle(epoch);
					signal?.throwIfAborted();
					if (!active() || input.isDisposed()) { throw new Error('oj-connect-stopped'); }
					if (input.model && !input.model.loading && originOf(input.model.url) === origin) {
						if (input.model.storageScope === BrowserViewStorageScope.Ephemeral) { throw new Error('OJ Connect requires a persistent browser session.'); }
						if (scope !== undefined && input.model.storageScope !== scope) { throw new Error('oj-connect-session-scope-changed'); }
						watchModel(input.model); await service.watchOjSession(input.model.id, owner); assertLifecycle(epoch); signal?.throwIfAborted();
						if (!taskOwned) { siteViews.set(origin, input); }
						retain(input.model.id); return input;
					}
					await timeout(100);
				}
				throw new Error('oj-connect-page-not-ready');
			} finally {
				const count = openingInputs.get(input)! - 1;
				if (count) { openingInputs.set(input, count); } else { openingInputs.delete(input); }
				closeIdle();
			}
		};
		const waitForForm = async <T>(input: BrowserEditorInput, url: string, prepare: (model: IBrowserViewModel) => Promise<T>, epoch: number): Promise<{ page: { viewId: string; url: string; generation?: number }; form: T }> => {
			const started = Date.now(), expected = new URL(url);
			let shown = false;
			while (Date.now() - started < 120000) {
				if (epoch !== preparationEpoch || !active() || input.isDisposed() || !input.model) { throw new Error('oj-connect-stopped'); }
				const model = input.model;
				const current = new URL(model.url);
				if (current.origin !== expected.origin || (canonical(model.url) !== canonical(url) && !/^\/(?:auth\/|login(?:$|\/))/.test(current.pathname))) { throw new Error('oj-connect-page-changed'); }
				if (canonical(model.url) !== canonical(url) && !shown) { shown = true; await reveal(input); }
				if (!model.loading && canonical(model.url) === canonical(url)) {
					try {
						const form = await prepare(model);
						if (epoch !== preparationEpoch || input.isDisposed() || input.model !== model || model.loading || canonical(model.url) !== canonical(url)) { throw new Error('oj-connect-page-changed'); }
						return { page: watchModel(model, url), form };
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						if (message !== 'atcoder-login-required') { throw error; }
						const login = new URL('/login', expected.origin); login.searchParams.set('continue', url);
						await model.loadURL(login.href);
						if (!shown) { shown = true; await reveal(input); }
					}
				}
				await timeout(500);
			}
			throw new Error('oj-connect-login-timeout');
		};
		const luoguSessionId = async () => {
			if (!active()) { throw new Error('oj-connect-extension-unavailable'); }
			return service.openLuoguSession(owner, await browsers.resolveStorageScope());
		};
		this._register(service.onDidRequireLuoguCaptcha(event => {
			if (event.windowId !== owner || !active()) { return; }
			void _commands.executeCommand<string | undefined>('_becoder.ojConnect.luogu.askCaptcha', event.image, event.requestId)
				.then(answer => service.answerLuoguCaptcha(owner, event.requestId, answer), () => service.answerLuoguCaptcha(owner, event.requestId, undefined)).catch(() => undefined);
		}));
		this._register(service.onDidCancelLuoguCaptcha(event => {
			if (event.windowId === owner) { void _commands.executeCommand('_becoder.ojConnect.luogu.cancelCaptcha', event.requestId).catch(() => undefined); }
		}));
		this._register(CommandsRegistry.registerCommand('_becoder.ojConnect.luogu.getCaptcha', (_accessor, requestId: string) => service.getLuoguCaptcha(owner, requestId)));
		const readProblem = async (problem: ProblemRef, site: 'luogu' | 'atcoder') => {
			if (problem?.site !== site) { throw new Error('oj-connect-problem-route'); }
			if (site === 'luogu') { assertLuoguProblem(problem); }
			else { const task = atCoderTask(problem.url); if (!task || problem.nativeId !== task.contestId + '/' + task.taskId) { throw new Error('oj-connect-problem-route'); } }
			if (site === 'luogu') { return service.readOjProblem(await luoguSessionId(), owner, problem); }
			const input = await openPage(problem.url);
			if (!input.model) { throw new Error('oj-connect-page-not-ready'); }
			const page = { viewId: input.model.id };
			try { return await service.readOjProblem(input.model.id, owner, problem); }
			finally { release(page); }
		};
		const loginSummary = async (site: 'luogu' | 'atcoder'): Promise<LoginSummary> => {
			if (site === 'luogu') { return service.readOjLogin(await luoguSessionId(), owner, site); }
			const origin = 'https://atcoder.jp';
			let input = siteViews.get(origin);
			if (!input || input.isDisposed()) {
				const candidates = [...browsers.getKnownBrowserViews().values()].filter(item => !item.isDisposed() && item.model && item.model.storageScope !== BrowserViewStorageScope.Ephemeral && originOf(item.model.url) === origin);
				if (candidates.length && candidates.every(item => item.model!.storageScope === candidates[0].model!.storageScope)) { input = candidates[0]; }
			}
			if (!active() || !input?.model || input.model.loading || originOf(input.model.url) !== origin) { return { site, state: 'unknown' }; }
			try { watchModel(input.model); await service.watchOjSession(input.model.id, owner); return await service.readOjLogin(input.model.id, owner, site); }
			catch { return { site, state: 'unknown' }; }
		};
		const createBridge = () => new AtCoderBridgeController({
			newHandle: generateUuid,
			isPageCurrent: page => { const model = find(page.viewId)?.model; return !!model && !model.loading && model.url === page.url && generations.isCurrent(page); },
			openTask: async url => {
				const epoch = preparationEpoch;
				const input = await openPage(url, preparationController.signal, await browsers.resolveStorageScope(), true);
				const page = { viewId: input.model!.id };
				try { return (await waitForForm(input, url, model => service.prepareAtCoderTask(model.id, owner, url), epoch)).page; }
				catch (error) { release(page); throw error; }
			},
			inspectTask: page => service.prepareAtCoderTask(page.viewId, owner, page.url),
			sendAndConfirm: async (page, payload) => {
				const epoch = lifecycleEpoch, input = find(page.viewId), scope = input?.model?.storageScope;
				if (scope === undefined || scope === BrowserViewStorageScope.Ephemeral) { throw new Error('oj-connect-session-scope-changed'); }
				const outcome = await service.sendAndConfirmAtCoderTask(page.viewId, owner, page.url, payload);
				assertLifecycle(epoch);
				remember(outcome, page.viewId, scope);
				// UI cleanup must never turn an accepted receipt into an uncertain submission.
				if (outcome.kind === 'record') { await closeInteraction(input).catch(() => undefined); }
				return outcome;
			},
			readRecord: async record => {
				const epoch = lifecycleEpoch;
				const cached = finishedRecords.get(record.url); if (cached) { return cached; }
				const scope = recordScopes.get(record.url);
				if (scope === undefined) { throw new Error('oj-connect-session-scope-changed'); }
				const signal = recordLifetime(record);
				const existing = find(recordViews.get(record.url) ?? '');
				const input = existing?.model?.storageScope === scope ? existing : await openPage(record.url, signal, scope, true);
				const page = { viewId: input.model!.id };
				try {
					assertRecord(epoch, signal);
					recordViews.set(record.url, page.viewId);
					if (canonical(input.model!.url) !== record.url) { await input.model!.loadURL(record.url); }
					assertRecord(epoch, signal);
					const snapshot = await service.readAtCoderRecord(page.viewId, owner, record);
					assertRecord(epoch, signal);
					return finishRead(snapshot, epoch);
				} finally { if (input !== existing && epoch === lifecycleEpoch) { release(page); } }
			},
			reconcile: async attemptId => {
				const input = find(attemptViews.get(attemptId) ?? '');
				const epoch = lifecycleEpoch, outcome = await service.reconcileAtCoderAttempt(attemptId, owner);
				assertLifecycle(epoch); reconciled(outcome, attemptId);
				if (outcome.kind === 'record') { await closeInteraction(input).catch(() => undefined); }
				return outcome;
			},
			cancel: page => service.cancelAtCoderTask(page.viewId, owner),
			release
		});
		const createLuoguBridge = () => new LuoguBridgeController({
			newHandle: generateUuid,
			isCurrent: () => active(),
			open: async problem => {
				const epoch = preparationEpoch, id = await luoguSessionId();
				const form = await service.prepareLuoguTask(id, owner, problem);
				if (epoch !== preparationEpoch || !active()) { throw new Error('oj-connect-stopped'); }
				return { viewId: id, url: 'https://www.luogu.com.cn/', ownerKey: form.ownerKey, languages: form.languages };
			},
			send: (page, problem, payload, requestId) => service.submitLuoguTask(page.viewId, owner, problem, payload, page.ownerKey, requestId),
			cancel: (page, requestId) => service.cancelLuoguTask(page.viewId, owner, requestId),
			readRecord: async record => {
				const epoch = lifecycleEpoch;
				const cached = finishedRecords.get(record.url); if (cached) { return cached; }
				const signal = recordLifetime(record);
				await recordCancellations.get(record.url);
				assertRecord(epoch, signal);
				const id = await luoguSessionId(); assertRecord(epoch, signal);
				const snapshot = await service.readLuoguRecord(id, owner, record);
				assertRecord(epoch, signal);
				return finishRead(snapshot, epoch);
			},
			reconcile: attemptId => service.reconcileLuoguAttempt(attemptId, owner)
		});
		this.luoguBridge = createLuoguBridge();
		this.bridge = createBridge();
		const closeBackground = () => { for (const input of ownedInputs) { if (!editors.editors.includes(input)) { input.dispose(); } } ownedInputs.clear(); };
		const reset = () => { lifecycleEpoch++; preparationEpoch++; stopRecords(); recordViews.clear(); recordScopes.clear(); attemptViews.clear(); attemptScopes.clear(); finishedRecords.clear(); busyViews.clear(); const previous = this.bridge, luogu = this.luoguBridge; this.bridge = createBridge(); this.luoguBridge = createLuoguBridge(); void previous.dispose(); void luogu.dispose(); void service.cancelOjOperations(owner).catch(() => undefined); closeBackground(); };
		this._register(extensions.onWillStop(reset));
		this._register(extensions.onDidChangeExtensions(event => { if (event.removed.some(item => item.identifier.value.toLowerCase() === 'becoder.oj-connect')) { reset(); } }));
		this._register(extensions.onDidChangeExtensionsStatus(ids => {
			if (ids.some(id => id.value.toLowerCase() === 'becoder.oj-connect') && !extensions.getExtensionsStatus()['becoder.oj-connect']?.activationStarted) { reset(); }
		}));
		this._register(toDisposable(() => { lifecycleEpoch++; stopRecords(); recordScopes.clear(); attemptScopes.clear(); void this.bridge.dispose(); void this.luoguBridge.dispose(); void service.cancelOjOperations(owner).catch(() => undefined); closeBackground(); }));
		const luoguPrefix = '_becoder.ojConnect.luogu.';
		const releaseLuoguRecord = (record: RecordRef): Promise<void> => {
			stopRecord(record);
			const previous = recordCancellations.get(record.url);
			const pending = (async () => {
				await previous;
				await service.updateLuoguSession(await luoguSessionId(), owner, 'releaseLuoguRecord', record);
			})();
			recordCancellations.set(record.url, pending);
			return pending.finally(() => { if (recordCancellations.get(record.url) === pending) { recordCancellations.delete(record.url); } });
		};
		this._register(CommandsRegistry.registerCommand(luoguPrefix + 'cancelRecord', (_accessor, record: RecordRef) => releaseLuoguRecord(record)));
		this._register(CommandsRegistry.registerCommand('_becoder.ojConnect.releaseRecord', async (_accessor, record: RecordRef) => {
			if (record?.problem.site === 'luogu') { await releaseLuoguRecord(record); }
			else if (record) { stopRecord(record); recordViews.delete(record.url); closeIdle(); }
		}));
		for (const site of ['luogu', 'atcoder'] as const) {
			const origin = site === 'luogu' ? 'https://www.luogu.com.cn' : 'https://atcoder.jp';
			this._register(CommandsRegistry.registerCommand('_becoder.ojConnect.' + site + '.login', async () => {
				const input = await openPage(origin + (site === 'luogu' ? '/auth/login' : '/login'));
				try { await reveal(input); } finally { release({ viewId: input.model!.id }); }
			}));
			this._register(CommandsRegistry.registerCommand('_becoder.ojConnect.' + site + '.logout', async () => {
				if (site === 'luogu') { await service.logoutOjSite(await luoguSessionId(), owner, site); refreshAccounts(); return; }
				const input = await openPage(origin + '/');
				try { await service.logoutOjSite(input.model!.id, owner, site); refreshAccounts(); }
				finally { release({ viewId: input.model!.id }); }
			}));
		}
		this._register(CommandsRegistry.registerCommand(luoguPrefix + 'cancelPreparation', cancelPreparation));
		this._register(CommandsRegistry.registerCommand('_becoder.ojConnect.atcoder.cancelPreparation', cancelPreparation));
		this._register(CommandsRegistry.registerCommand(luoguPrefix + 'prepare', (_accessor, problem: ProblemRef, sourceUri: string) => this.luoguBridge.prepare(problem, sourceUri)));
		this._register(CommandsRegistry.registerCommand(luoguPrefix + 'send', (_accessor, handle: string, payload: ILuoguSourcePayload) => this.luoguBridge.send(handle, payload)));
		this._register(CommandsRegistry.registerCommand(luoguPrefix + 'cancel', (_accessor, handle: string) => this.luoguBridge.cancel(handle)));
		this._register(CommandsRegistry.registerCommand(luoguPrefix + 'release', (_accessor, handle: string) => this.luoguBridge.release(handle)));
		this._register(CommandsRegistry.registerCommand(luoguPrefix + 'readRecord', (_accessor, record: RecordRef) => this.luoguBridge.readRecord(record)));
		this._register(CommandsRegistry.registerCommand(luoguPrefix + 'reconcile', (_accessor, attemptId: string) => this.luoguBridge.reconcile(attemptId)));
		this._register(CommandsRegistry.registerCommand(luoguPrefix + 'readProblem', (_accessor, problem: ProblemRef) => readProblem(problem, 'luogu')));
		this._register(CommandsRegistry.registerCommand(luoguPrefix + 'loginSummary', () => loginSummary('luogu')));
		this._register(CommandsRegistry.registerCommand('_becoder.ojConnect.atcoder.readProblem', (_accessor, problem: ProblemRef) => readProblem(problem, 'atcoder')));
		this._register(CommandsRegistry.registerCommand('_becoder.ojConnect.atcoder.loginSummary', () => loginSummary('atcoder')));
		const prefix = '_becoder.ojConnect.atcoder.';
		this._register(CommandsRegistry.registerCommand(prefix + 'openTask', (_accessor, url: string, uri: string) => this.bridge.openTask(url, uri)));
		this._register(CommandsRegistry.registerCommand(prefix + 'inspectTask', (_accessor, page: IAtCoderPageRef) => this.bridge.inspectTask(page)));
		this._register(CommandsRegistry.registerCommand(prefix + 'sendAndConfirm', (_accessor, page: IAtCoderPageRef, payload: IAtCoderSourcePayload) => this.bridge.sendAndConfirm(page, payload)));
		this._register(CommandsRegistry.registerCommand(prefix + 'readRecord', (_accessor, record: RecordRef) => this.bridge.readRecord(record)));
		this._register(CommandsRegistry.registerCommand(prefix + 'reconcile', (_accessor, attemptId: string) => this.bridge.reconcile(attemptId)));
		this._register(CommandsRegistry.registerCommand(prefix + 'cancel', (_accessor, page: IAtCoderPageRef) => this.bridge.cancel(page)));
		this._register(CommandsRegistry.registerCommand(prefix + 'release', (_accessor, page: IAtCoderPageRef) => this.bridge.release(page)));
	}
}

registerWorkbenchContribution2(BrowserOjConnectContribution.ID, BrowserOjConnectContribution, WorkbenchPhase.BlockRestore);

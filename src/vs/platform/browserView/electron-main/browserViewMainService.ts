/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableMap, toDisposable } from '../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IBrowserViewBounds, IBrowserViewState, IBrowserViewService, IBrowserViewCaptureScreenshotOptions, IBrowserViewFindInPageOptions, BrowserViewCommandId, IBrowserViewOwner, IBrowserViewInfo, IBrowserViewCreatedEvent, IBrowserViewOpenOptions, IBrowserViewCreateOptions, BrowserViewStorageScope, IBrowserViewWindowConfiguration, IBrowserDeviceProfile } from '../common/browserView.js';
import { clipboard, Menu, MenuItem } from 'electron';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { BrowserView } from './browserView.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { BrowserSession } from './browserSession.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { IPermissionCategoryState } from '../common/browserPermissions.js';
import { IntegratedBrowserOpenSource, logBrowserOpen } from '../common/browserViewTelemetry.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { localize } from '../../../nls.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { htmlAttributeEncodeValue } from '../../../base/common/strings.js';
import { promises as fs } from 'fs';
import { join } from '../../../base/common/path.js';
import { readBeaconBrowserPage } from '../../beacon/common/beaconBrowserPage.js';
import { checkAtCoderSourceResponse, parseAtCoderRecordHTML, decodeAtCoderHTML, parseAtCoderLanguages } from '../common/atcoderSubmission.js';
import { atCoderFormScript, atCoderTask, atCoderSubmitURL, IAtCoderSourcePayload, IAtCoderTaskForm } from '../common/atcoderWorkflow.js';
import { runAtCoderTransaction, reconcileAtCoderTransaction, type AtCoderAttempt } from './atcoderTransaction.js';
import { assertLuoguProblem } from '../common/luoguBridge.js';
import { createOjStatementRead, assertOjStatementTarget } from './ojStatementTransport.js';
import { parseOjStatement } from './ojStatementParser.js';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { NowcoderSessionClient } from './nowcoderSessionClient.js';
import { assertNowcoderProblem } from '../common/nowcoderBridge.js';
import { CodeforcesSessionClient } from './codeforcesSessionClient.js';
import { createCodeforcesPost } from './codeforcesTransport.js';
import { createOjLanguageRead } from './ojLanguageTransport.js';
import { LanqiaoSessionClient } from './lanqiaoSessionClient.js';
import { createLanqiaoTransport } from './lanqiaoTransport.js';
import { assertLanqiaoProblem } from './lanqiaoProtocol.js';
import { assertCodeforcesProblem } from '../common/codeforcesBridge.js';
import { LuoguSessionClient } from './luoguSessionClient.js';
import { fetchLuoguDirect } from './luoguSessionTransport.js';
import { ILogService } from '../../log/common/log.js';
// eslint-disable-next-line local/code-import-patterns -- Internal type-only DTOs for the bundled OJ extension.
import type { SubmissionOutcome, ProblemRef, ProblemDocument, ProblemReadOptions, RecordRef, RecordSnapshot, LoginSummary, LanguageOption, LanguageCatalogue, ILuoguSourcePayload, INowcoderSourcePayload, ICodeforcesSourcePayload, ILanqiaoSourcePayload } from 'becoder-oj-connect';

export const IBrowserViewMainService = createDecorator<IBrowserViewMainService>('browserViewMainService');

export interface IBrowserViewMainService extends IBrowserViewService {
	readonly _serviceBrand: undefined;

	tryGetBrowserView(id: string): BrowserView | undefined;
}

export class BrowserViewMainService extends Disposable implements IBrowserViewMainService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Check if a webContents belongs to an integrated browser view.
	 * Delegates to {@link BrowserSession.isBrowserViewWebContents}.
	 */
	static isBrowserViewWebContents(contents: Electron.WebContents): boolean {
		return BrowserSession.isBrowserViewWebContents(contents);
	}

	private readonly browserViews = this._register(new DisposableMap<string, BrowserView>());
	private readonly atCoderRequests = new Map<string, AbortController>();
	private readonly cancelledOjLanguageReads = new Set<string>();
	private readonly atCoderAccountReads = new Map<string, { windowId: number; controller: AbortController; result: Promise<LoginSummary> }>();
	private readonly atCoderAccounts = new Map<string, { windowIds: Set<number>; identity?: string }>();
	private readonly ojReads = new Map<string, { windowId: number; operation?: string; cancel(): void }>();
	private readonly cancelledOjStatementReads = new Set<string>();
	private readonly atCoderRecords = new Map<string, { windowId: number; snapshot: RecordSnapshot; initial: boolean }>();
	private readonly atCoderRecordRequests = new Map<string, { controller: AbortController; done: Promise<void> }>();
	private readonly atCoderAttempts = new Map<string, { context: AtCoderAttempt; session: BrowserSession; windowId: number; timer: ReturnType<typeof setTimeout> }>();
	private readonly luoguRequests = new Map<string, { requestId: string; windowId: number; controller: AbortController; cancel(): Promise<void> }>();
	private readonly nowcoderClients = new Map<string, { windowId: number; client: NowcoderSessionClient }>();
	private readonly lanqiaoClients = new Map<string, { windowId: number; session: BrowserSession; client: LanqiaoSessionClient }>();
	private readonly lanqiaoRequests = new Map<number, { id: string; requestId: string; controller: AbortController }>();
	private readonly nowcoderRequests = new Map<string, { windowId: number; requestId: string; controller: AbortController }>();
	private readonly nowcoderAttempts = new Map<string, { sessionId: string; windowId: number; outcome: SubmissionOutcome; expires: number }>();
	private readonly codeforcesClients = new Map<string, { windowId: number; session: BrowserSession; client: CodeforcesSessionClient }>();
	private readonly codeforcesRequests = new Map<string, { windowId: number; requestId: string; controller: AbortController }>();
	private readonly luoguClients = new Map<string, { windowId: number; session: BrowserSession; client: LuoguSessionClient }>();
	private readonly luoguCaptchas = new Map<string, { windowId: number; client: LuoguSessionClient; signal: AbortSignal; resolve(answer: string | undefined): void }>();
	private readonly _onDidRequireLuoguCaptcha = this._register(new Emitter<{ windowId: number; requestId: string; image: string }>());
	readonly onDidRequireLuoguCaptcha = this._onDidRequireLuoguCaptcha.event;
	private readonly _onDidCancelLuoguCaptcha = this._register(new Emitter<{ windowId: number; requestId: string }>());
	readonly onDidCancelLuoguCaptcha = this._onDidCancelLuoguCaptcha.event;
	private readonly ojSessionWatchers = this._register(new DisposableMap<string>());
	private readonly _onDidChangeOjSession = this._register(new Emitter<{ windowId: number; site: 'luogu' | 'atcoder' | 'nowcoder' | 'codeforces' | 'lanqiao' }>());
	readonly onDidChangeOjSession = this._onDidChangeOjSession.event;
	private readonly luoguAttempts = new Map<string, { problem: ProblemRef; viewId: string; windowId: number; ownerKey: string; sourceHash: string; startedAt: number; timer: ReturnType<typeof setTimeout> }>();

	/**
	 * Per-window configuration applied to the browser views that window owns.
	 * Entries are dropped when the window is destroyed.
	 */
	private readonly _windowConfigurations = new Map<number, IBrowserViewWindowConfiguration>();
	private readonly _windowCloseSubscriptions = this._register(new DisposableMap<number>());

	private readonly _onDidCreateBrowserView = this._register(new Emitter<IBrowserViewCreatedEvent>());
	readonly onDidCreateBrowserView: Event<IBrowserViewCreatedEvent> = this._onDidCreateBrowserView.event;

	constructor(
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IApplicationStorageMainService private readonly applicationStorageMainService: IApplicationStorageMainService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._register(toDisposable(() => { for (const { client } of this.lanqiaoClients.values()) { client.dispose(); } this.lanqiaoClients.clear(); }));
		this._register(toDisposable(() => { for (const request of this.codeforcesRequests.values()) { request.controller.abort(); } for (const { client } of this.codeforcesClients.values()) { client.dispose(); } this.codeforcesRequests.clear(); this.codeforcesClients.clear(); }));
		this._register(toDisposable(() => { for (const request of this.atCoderRecordRequests.values()) { request.controller.abort(); } this.atCoderRecords.clear(); }));
		this._register(toDisposable(() => { for (const request of this.atCoderRequests.values()) { request.abort(); } for (const request of this.atCoderAccountReads.values()) { request.controller.abort(); } this.atCoderAccounts.clear(); for (const request of this.luoguRequests.values()) { request.controller.abort(); } for (const { client } of this.luoguClients.values()) { client.dispose(); } this.luoguClients.clear(); for (const { client } of this.nowcoderClients.values()) { client.dispose(); } this.nowcoderClients.clear(); for (const request of this.nowcoderRequests.values()) { request.controller.abort(); } }));
	}

	async getOrCreateBrowserView(id: string, options: IBrowserViewCreateOptions): Promise<IBrowserViewState> {
		if (this.browserViews.has(id)) {
			// Note: options will be ignored if the view already exists.
			const view = this.browserViews.get(id)!;
			return view.getState();
		}

		const ownerWindow = this.windowsMainService.getWindowById(options.owner.mainWindowId);
		if (!ownerWindow) {
			throw new Error(`Owner window with ID ${options.owner.mainWindowId} not found`);
		}

		const browserSession = BrowserSession.getOrCreate(
			this.instantiationService,
			id,
			options.sessionOptions,
			this.environmentMainService.workspaceStorageHome,
			ownerWindow.openedWorkspace?.id
		);

		const view = this.createBrowserView(id, options.owner, browserSession);

		if (options.initialState?.url) {
			void view.loadURL(options.initialState.url).catch(() => undefined); // The view publishes did-fail-load.
		}

		return {
			...view.getState(),
			...options.initialState
		};
	}

	tryGetBrowserView(id: string): BrowserView | undefined {
		return this.browserViews.get(id);
	}

	/**
	 * Get a browser view or throw if not found
	 */
	private _getBrowserView(id: string): BrowserView {
		const view = this.browserViews.get(id);
		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}
		return view;
	}

	private _getViewInfo(view: BrowserView): IBrowserViewInfo {
		return {
			id: view.id,
			owner: view.owner,
			state: view.getState()
		};
	}

	async getBrowserViews(windowId?: number): Promise<IBrowserViewInfo[]> {
		const result: IBrowserViewInfo[] = [];
		for (const [, view] of this.browserViews) {
			if (windowId !== undefined && view.owner.mainWindowId !== windowId) {
				continue;
			}
			result.push(this._getViewInfo(view));
		}
		return result;
	}

	onDynamicDidNavigate(id: string) {
		return this._getBrowserView(id).onDidNavigate;
	}

	onDynamicDidChangeLoadingState(id: string) {
		return this._getBrowserView(id).onDidChangeLoadingState;
	}

	onDynamicDidChangeFocus(id: string) {
		return this._getBrowserView(id).onDidChangeFocus;
	}

	onDynamicDidChangeVisibility(id: string) {
		return this._getBrowserView(id).onDidChangeVisibility;
	}

	onDynamicDidChangeDevToolsState(id: string) {
		return this._getBrowserView(id).onDidChangeDevToolsState;
	}

	onDynamicDidKeyCommand(id: string) {
		return this._getBrowserView(id).onDidKeyCommand;
	}

	onDynamicDidChangeTitle(id: string) {
		return this._getBrowserView(id).onDidChangeTitle;
	}

	onDynamicDidChangeFavicon(id: string) {
		return this._getBrowserView(id).onDidChangeFavicon;
	}

	onDynamicDidFindInPage(id: string) {
		return this._getBrowserView(id).onDidFindInPage;
	}

	onDynamicDidClose(id: string) {
		return this._getBrowserView(id).onDidClose;
	}

	onDynamicDidChangeDeviceEmulation(id: string) {
		return this._getBrowserView(id).emulator.onDidChange;
	}

	onDynamicDidRequestPermission(id: string) {
		return this._getBrowserView(id).onDidRequestPermission;
	}

	onDynamicDidChangePermissions(id: string) {
		return this._getBrowserView(id).onDidChangePermissions;
	}

	async getState(id: string): Promise<IBrowserViewState> {
		return this._getBrowserView(id).getState();
	}

	async destroyBrowserView(id: string): Promise<void> {
		return this.browserViews.deleteAndDispose(id);
	}

	async layout(id: string, bounds: IBrowserViewBounds): Promise<void> {
		return this._getBrowserView(id).layout(bounds);
	}

	async setVisible(id: string, visible: boolean): Promise<void> {
		return this._getBrowserView(id).setVisible(visible);
	}

	async loadURL(id: string, url: string): Promise<void> {
		return this._getBrowserView(id).loadURL(url);
	}

	async getURL(id: string): Promise<string> {
		return this._getBrowserView(id).getURL();
	}

	async goBack(id: string): Promise<void> {
		return this._getBrowserView(id).goBack();
	}

	async goForward(id: string): Promise<void> {
		return this._getBrowserView(id).goForward();
	}

	async reload(id: string, hard?: boolean): Promise<void> {
		return this._getBrowserView(id).reload(hard);
	}

	async toggleDevTools(id: string): Promise<void> {
		return this._getBrowserView(id).toggleDevTools();
	}

	async canGoBack(id: string): Promise<boolean> {
		return this._getBrowserView(id).canGoBack();
	}

	async canGoForward(id: string): Promise<boolean> {
		return this._getBrowserView(id).canGoForward();
	}

	async captureScreenshot(id: string, options?: IBrowserViewCaptureScreenshotOptions): Promise<VSBuffer> {
		return this._getBrowserView(id).captureScreenshot(options);
	}

	async focus(id: string, force?: boolean): Promise<void> {
		return this._getBrowserView(id).focus(force);
	}

	async findInPage(id: string, text: string, options?: IBrowserViewFindInPageOptions): Promise<void> {
		return this._getBrowserView(id).findInPage(text, options);
	}

	async stopFindInPage(id: string, keepSelection?: boolean): Promise<void> {
		return this._getBrowserView(id).stopFindInPage(keepSelection);
	}

	async getSelectedText(id: string): Promise<string> {
		return this._getBrowserView(id).getSelectedText();
	}

	async getProblemParserPatterns(): Promise<readonly string[]> {
		const text = await fs.readFile(join(this.environmentMainService.appRoot, 'extensions', 'becoder.cph', 'dist', 'problem-parser-patterns.json'), 'utf8');
		if (text.length > 65536) { throw new Error('Invalid problem parser patterns.'); }
		const patterns: unknown = JSON.parse(text);
		if (!Array.isArray(patterns) || patterns.length > 256 || patterns.some(pattern => typeof pattern !== 'string' || pattern.length > 2048 || !/^https?:\/\//.test(pattern))) { throw new Error('Invalid problem parser patterns.'); }
		return patterns;
	}

	async resolveBrowserProblem(url: string): Promise<ProblemRef | undefined> {
		// Fixed bundled pure module: reuse adapter identities without activating account views.
		const { browserProblem } = createRequire(import.meta.url)(join(this.environmentMainService.appRoot, 'extensions', 'becoder.oj-connect', 'out', 'browserProblem.js'));
		return browserProblem(url);
	}

	async parseProblem(id: string, windowId: number): Promise<{ url: string; json: string }> {
		const view = this._getBrowserView(id);
		if (view.owner.mainWindowId !== windowId) {
			throw new Error(localize('browser.problem.wrongWindow', 'The problem belongs to another window.'));
		}
		const contents = view.getWebContentsView().webContents;
		if (contents.isDestroyed() || contents.isLoading()) {
			throw new Error(localize('browser.problem.loading', 'Wait for the problem page to finish loading.'));
		}
		const url = contents.getURL();
		if (!/^https?:\/\//.test(url)) {
			throw new Error(localize('browser.problem.url', 'Open an online problem page before importing.'));
		}
		let changed = false;
		const navigation = view.onDidNavigate(() => { changed = true; });
		const closed = view.onDidClose(() => { changed = true; });
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const script = await fs.readFile(join(this.environmentMainService.appRoot, 'extensions', 'becoder.cph', 'dist', 'problem-parser.js'), 'utf8');
			if (changed || contents.isDestroyed()) { throw new Error(localize('browser.problem.changed', 'The problem page changed during import.')); }
			const json: unknown = await Promise.race([
				contents.executeJavaScriptInIsolatedWorld(1002, [{ code: `${script}\nBeCoderCompanion.parseCurrentProblem()` }]),
				new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(localize('browser.problem.timeout', 'Problem parsing timed out.'))), 15000); })
			]);
			if (changed || contents.isDestroyed() || contents.getURL() !== url) { throw new Error(localize('browser.problem.changed', 'The problem page changed during import.')); }
			if (typeof json !== 'string' || Buffer.byteLength(json) > 8 * 1024 * 1024) {
				throw new Error(localize('browser.problem.invalid', 'The parser returned invalid or oversized problem data.'));
			}
			return { url, json };
		} finally {
			if (timer) { clearTimeout(timer); }
			navigation.dispose();
			closed.dispose();
		}
	}

	async cancelOjOperations(windowId: number): Promise<void> {
		this.lanqiaoRequests.get(windowId)?.controller.abort();
		for (const [key, entry] of this.lanqiaoClients) { if (entry.windowId === windowId) { entry.client.dispose(); this.lanqiaoClients.delete(key); } }
		for (const request of this.codeforcesRequests.values()) { if (request.windowId === windowId) { request.controller.abort(); } }
		for (const [key, entry] of this.codeforcesClients) { if (entry.windowId === windowId) { entry.client.dispose(); this.codeforcesClients.delete(key); } }
		for (const request of this.nowcoderRequests.values()) { if (request.windowId === windowId) { request.controller.abort(); } }
		for (const [key, entry] of this.nowcoderClients) { if (entry.windowId === windowId) { entry.client.dispose(); this.nowcoderClients.delete(key); } }
		for (const [key, entry] of this.nowcoderAttempts) { if (entry.windowId === windowId) { this.nowcoderAttempts.delete(key); } }
		for (const request of this.atCoderAccountReads.values()) { if (request.windowId === windowId) { request.controller.abort(); } }
		for (const [sessionId, account] of this.atCoderAccounts) { account.windowIds.delete(windowId); if (!account.windowIds.size) { this.atCoderAccounts.delete(sessionId); } }
		for (const request of this.luoguRequests.values()) { if (request.windowId === windowId) { await request.cancel(); } }
		for (const [key, entry] of this.luoguClients) { if (entry.windowId === windowId) { entry.client.dispose(); this.luoguClients.delete(key); } }
		for (const request of this.ojReads.values()) { if (request.windowId === windowId) { request.cancel(); } }
		for (const [id, request] of this.atCoderRequests) {
			try { if (this._getBrowserView(id).owner.mainWindowId === windowId) { request.abort(); } }
			catch { request.abort(); }
		}
		for (const [key, record] of this.atCoderRecords) { if (record.windowId === windowId) { this.atCoderRecords.delete(key); } }
		for (const [key, attempt] of this.atCoderAttempts) { if (attempt.windowId === windowId) { clearTimeout(attempt.timer); this.atCoderAttempts.delete(key); } }
		for (const [key, attempt] of this.luoguAttempts) { if (attempt.windowId === windowId) { clearTimeout(attempt.timer); this.luoguAttempts.delete(key); } }
	}

	async cancelOjPreparations(windowId: number): Promise<void> {
		for (const request of this.ojReads.values()) { if (request.windowId === windowId && (request.operation === 'prepareLuogu' || request.operation === 'prepareAtCoder' || request.operation === 'prepareNowcoder' || request.operation === 'prepareCodeforces' || request.operation === 'prepareLanqiao')) { request.cancel(); } }
	}

	async readOjProblem(id: string, windowId: number, problem: ProblemRef, options?: ProblemReadOptions): Promise<ProblemDocument> {
		if (problem.site === 'lanqiao') {
			assertLanqiaoProblem(problem);
			const view = this._getBrowserView(id), actual = view.getWebContentsView().webContents.getURL();
			if (view.owner.mainWindowId !== windowId || (await this.resolveBrowserProblem(actual))?.url !== problem.url) { throw new Error('oj-connect-page-changed'); }
			const client = this.ensureLanqiaoClient(view.session, windowId), controller = new AbortController();
			const watchers = combinedDisposable(view.onDidClose(() => controller.abort()), view.onDidNavigate(() => controller.abort()));
			try {
				const result = await client.readProblem(problem, options ?? { family: 'cpp' }, controller.signal);
				controller.signal.throwIfAborted();
				if (this._getBrowserView(id) !== view || view.getWebContentsView().webContents.getURL() !== actual) { throw new Error('oj-connect-page-changed'); }
				return result;
			} finally { watchers.dispose(); if (view.session.storageScope === BrowserViewStorageScope.Ephemeral) { client.dispose(); const key = windowId + ':' + view.session.id; if (this.lanqiaoClients.get(key)?.client === client) { this.lanqiaoClients.delete(key); } } }
		}
		if (problem.site === 'nowcoder') { return this.nowcoderClient(id, windowId).readProblem(problem, new AbortController().signal); }
		if (problem.site === 'luogu') { assertLuoguProblem(problem); return this.luoguClient(id, windowId).readProblem(problem, new AbortController().signal); }
		assertOjStatementTarget(problem);
		const view = this._getBrowserView(id);
		if (view.owner.mainWindowId !== windowId) { throw new Error('oj-connect-owner'); }
		const actual = view.getWebContentsView().webContents.getURL();
		if (problem.site === 'atcoder') {
			const task = atCoderTask(actual); if (!task || task.contestId + '/' + task.taskId !== problem.nativeId) { throw new Error('oj-connect-page-changed'); }
		} else {
			const url = new URL(actual), match = /^\/(?:contest\/([1-9]\d*)\/problem\/([A-Z][A-Z0-9]*)|problemset\/problem\/([1-9]\d*)\/([A-Z][A-Z0-9]*))\/?$/.exec(url.pathname);
			if (url.origin !== 'https://codeforces.com' || url.username || url.password || !match || (match[1] ?? match[3]) + '/' + (match[2] ?? match[4]) !== problem.nativeId || [...url.searchParams.keys()].some(key => key !== 'locale')) { throw new Error('oj-connect-page-changed'); }
		}
		const requestId = generateUuid(), cancel = () => { void this.cancelOjStatementRead(windowId, requestId); };
		const watchers = combinedDisposable(view.onDidClose(cancel), view.onDidNavigate(cancel));
		try {
			return await this.readStatementDocument(view.session, windowId, problem, requestId, () => {
				if (this._getBrowserView(id) !== view || view.owner.mainWindowId !== windowId || view.getWebContentsView().webContents.getURL() !== actual) { throw new Error('oj-connect-page-changed'); }
			});
		} finally { watchers.dispose(); }
	}

	async cancelOjLanguageRead(windowId: number, requestId: string): Promise<void> {
		if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) { throw new Error('oj-language-request-id'); }
		const key = 'language:' + windowId + ':' + requestId;
		const request = this.ojReads.get(key);
		if (request) { request.cancel(); }
		else { this.cancelledOjLanguageReads.add(key); if (this.cancelledOjLanguageReads.size > 128) { this.cancelledOjLanguageReads.delete(this.cancelledOjLanguageReads.values().next().value!); } }
	}
	async cancelOjStatementRead(windowId: number, requestId: string): Promise<void> {
		if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) { throw new Error('oj-statement-request-id'); }
		const key = 'statement:' + windowId + ':' + requestId, request = this.ojReads.get(key);
		if (request) { request.cancel(); }
		else { this.cancelledOjStatementReads.add(key); if (this.cancelledOjStatementReads.size > 128) { this.cancelledOjStatementReads.delete(this.cancelledOjStatementReads.values().next().value!); } }
	}
	async readOjStatement(windowId: number, scope: BrowserViewStorageScope, problem: ProblemRef, requestId: string, options?: ProblemReadOptions): Promise<ProblemDocument> {
		if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) { throw new Error('oj-statement-request-id'); }
		if (problem.site === 'lanqiao') {
			const session = this.ojSession(windowId, scope), key = 'statement:' + windowId + ':' + requestId;
			if (this.cancelledOjStatementReads.delete(key)) { throw new Error('oj-statement-cancelled'); }
			if (this.ojReads.has(key)) { throw new Error('oj-statement-request-busy'); }
			const controller = new AbortController(), entry = { windowId, operation: 'readStatement', cancel: () => controller.abort() };
			this.ojReads.set(key, entry);
			try {
				const result = await this.ensureLanqiaoClient(session, windowId).readProblem(problem, options ?? { family: 'cpp' }, controller.signal);
				controller.signal.throwIfAborted(); if (this.ojSession(windowId, scope) !== session) { throw new Error('oj-connect-session-scope-changed'); } return result;
			} finally { if (this.ojReads.get(key) === entry) { this.ojReads.delete(key); } }
		}
		assertOjStatementTarget(problem);
		if (this.cancelledOjStatementReads.delete('statement:' + windowId + ':' + requestId)) { throw new Error('oj-statement-cancelled'); }
		const session = this.ojSession(windowId, scope);
		return this.readStatementDocument(session, windowId, problem, requestId, () => {
			if (this.ojSession(windowId, scope) !== session) { throw new Error('oj-connect-session-scope-changed'); }
		});
	}
	private async readStatementDocument(session: BrowserSession, windowId: number, problem: ProblemRef, requestId: string, assertCurrent: () => void): Promise<ProblemDocument> {
		if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) { throw new Error('oj-statement-request-id'); }
		assertOjStatementTarget(problem);
		const key = 'statement:' + windowId + ':' + requestId;
		if (this.cancelledOjStatementReads.delete(key)) { throw new Error('oj-statement-cancelled'); }
		if (this.ojReads.has(key)) { throw new Error('oj-statement-request-busy'); }
		const controller = new AbortController();
		const current = () => { controller.signal.throwIfAborted(); assertCurrent(); };
		this.ojReads.set(key, { windowId, operation: 'readStatement', cancel: () => controller.abort(new Error('oj-statement-cancelled')) });
		try {
			current();
			const html = await createOjStatementRead(session.electronSession)(problem, controller.signal); current();
			const oj = await fs.readFile(join(this.environmentMainService.appRoot, 'extensions/becoder.oj-connect/dist/site-scripts.js'), 'utf8'); current();
			const companion = problem.site === 'codeforces' ? await fs.readFile(join(this.environmentMainService.appRoot, 'extensions/becoder.cph/dist/problem-parser.js'), 'utf8') : undefined; current();
			const document = await parseOjStatement(problem, html, { oj, companion }, controller.signal); current();
			return document;
		} finally { this.ojReads.delete(key); }
	}
	async readOjLanguages(windowId: number, scope: BrowserViewStorageScope, problem: ProblemRef, requestId: string): Promise<LanguageCatalogue> {
		if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) { throw new Error('oj-language-request-id'); }
		if (problem.site === 'lanqiao') {
			assertLanqiaoProblem(problem); const session = this.ojSession(windowId, scope), key = 'language:' + windowId + ':' + requestId;
			if (this.cancelledOjLanguageReads.delete(key)) { throw new Error('oj-language-cancelled'); }
			if (this.ojReads.has(key)) { throw new Error('oj-language-request-busy'); }
			const controller = new AbortController(), entry = { windowId, operation: 'readLanguages:lanqiao:' + session.id, cancel: () => controller.abort() };
			this.ojReads.set(key, entry);
			try { const languages = await this.ensureLanqiaoClient(session, windowId).readLanguages(problem, controller.signal); controller.signal.throwIfAborted(); if (this.ojSession(windowId, scope) !== session) { throw new Error('oj-connect-session-scope-changed'); } return { languages }; }
			catch { controller.signal.throwIfAborted(); if (this.ojSession(windowId, scope) !== session) { throw new Error('oj-connect-session-scope-changed'); } return { languages: [], languageError: 'unavailable' }; }
			finally { if (this.ojReads.get(key) === entry) { this.ojReads.delete(key); } }
		}
		if (problem.site === 'codeforces') { assertCodeforcesProblem(problem); }
		else if (problem.site !== 'atcoder' || !atCoderTask(problem.url) || problem.nativeId !== atCoderTask(problem.url)!.contestId + '/' + atCoderTask(problem.url)!.taskId) { throw new Error('oj-connect-problem-route'); }
		const key = 'language:' + windowId + ':' + requestId;
		if (this.cancelledOjLanguageReads.delete(key)) { throw new Error('oj-language-cancelled'); }
		if (this.ojReads.has(key)) { throw new Error('oj-language-request-busy'); }
		const session = this.ojSession(windowId, scope), controller = new AbortController(), started = Date.now();
		const current = () => { controller.signal.throwIfAborted(); if (this.ojSession(windowId, scope) !== session) { throw new Error('oj-connect-session-scope-changed'); } };
		this.ojReads.set(key, { windowId, operation: 'readLanguages:' + problem.site + ':' + session.id, cancel: () => controller.abort(new Error('oj-language-cancelled')) });
		try {
			let languages: readonly LanguageOption[];
			const read = createOjLanguageRead(session.electronSession);
			if (problem.site === 'codeforces') {
				const id = await this.openCodeforcesSession(windowId, scope); current();
				const [contest, index] = problem.nativeId.split('/');
				languages = await this.codeforcesClient(id, windowId).readLanguages(problem, controller.signal, signal => read('https://codeforces.com/contest/' + contest + '/submit?problemIndex=' + index, signal));
			} else {
				languages = parseAtCoderLanguages(problem, await read(atCoderSubmitURL(problem.url), controller.signal));
			}
			current();
			this.logService?.info('[OJ Connect languages]', { site: problem.site, elapsedMs: Date.now() - started, options: languages.length });
			return { languages };
		} catch (error) {
			current();
			const reason = error instanceof Error && /^(?:oj-language|codeforces|atcoder)-[a-z-]+$/.test(error.message) ? error.message : 'oj-language-unavailable';
			if (/session-(?:changed|stopped|owner)|operation-cancelled/.test(reason)) { throw error; }
			this.logService?.info('[OJ Connect languages]', { site: problem.site, elapsedMs: Date.now() - started, reason });
			return { languages: [], languageError: reason.endsWith('login-required') ? 'login-required' : 'unavailable' };
		} finally { this.ojReads.delete(key); }
	}

	async watchOjSession(id: string, windowId: number): Promise<void> {
		const view = this._getBrowserView(id);
		if (view.owner.mainWindowId !== windowId) { throw new Error('oj-connect-owner'); }
		if (this.ojSessionWatchers.has(id)) { return; }
		const contents = view.getWebContentsView().webContents;
		const cookies = contents.session.cookies;
		const observed = new Map<string, string>();
		const changed = (_event: Electron.Event, cookie: Electron.Cookie, cause: string, removed: boolean) => {
			const domain = cookie.domain?.replace(/^\./, '');
			const site = domain === 'luogu.com.cn' || domain === 'www.luogu.com.cn' ? 'luogu' : domain === 'atcoder.jp' ? 'atcoder' : undefined;
			if (site && (site === 'luogu' ? ['_uid', '__client_id'].includes(cookie.name) : cookie.name === 'REVEL_SESSION')) {
				// AtCoder rewrites REVEL_SESSION on ordinary GETs, including login checks.
				// Login navigation and explicit logout refresh identity; rotation is not logout.
				if (site === 'atcoder' && (!removed || cause === 'overwrite')) { return; }
				if (site === 'atcoder') { this.invalidateAtCoderAccount(windowId, view.session.id); return; }
				const key = domain + ':' + cookie.name, digest = String(removed) + ':' + createHash('sha256').update(cookie.value).digest('hex');
				if (observed.get(key) === digest) { return; }
				observed.set(key, digest); this._onDidChangeOjSession.fire({ windowId, site });
			}
		};
		cookies.on('changed', changed);
		const closed = view.onDidClose(() => this.ojSessionWatchers.deleteAndDispose(id));
		let loginPage = /^https:\/\/atcoder\.jp\/login(?:[/?#]|$)/.test(contents.getURL());
		let codeforcesAccountPage = /^https:\/\/codeforces\.com\/(?:enter|logout)(?:[/?#]|$)/.test(contents.getURL());
		const navigation = view.onDidNavigate(event => {
			const nextLogin = /^https:\/\/atcoder\.jp\/login(?:[/?#]|$)/.test(event.url);
			if (loginPage || nextLogin) { this.invalidateAtCoderAccount(windowId, view.session.id); }
			loginPage = nextLogin;
			const nextCodeforcesAccountPage = /^https:\/\/codeforces\.com\/(?:enter|logout)(?:[/?#]|$)/.test(event.url);
			if (codeforcesAccountPage || nextCodeforcesAccountPage) {
				this.invalidateCodeforcesSession(view.session.id, windowId);
			}
			codeforcesAccountPage = nextCodeforcesAccountPage;
		});
		this.ojSessionWatchers.set(id, combinedDisposable(closed, navigation, toDisposable(() => cookies.removeListener('changed', changed))));
	}

	private invalidateAtCoderAccount(windowId: number, sessionId: string, source?: AbortController): void {
		const windows = new Set([windowId, ...(this.atCoderAccounts.get(sessionId)?.windowIds ?? [])]);
		for (const owner of windows) {
			const key = owner + ':' + sessionId, pending = this.atCoderAccountReads.get(key);
			if (pending && pending.controller !== source) { this.atCoderAccountReads.delete(key); pending.controller.abort(); }
		}
		for (const request of this.ojReads.values()) { if (windows.has(request.windowId) && request.operation === 'readLanguages:atcoder:' + sessionId) { request.cancel(); } }
		for (const owner of windows) { this._onDidChangeOjSession.fire({ windowId: owner, site: 'atcoder' }); }
	}

	private invalidateCodeforcesSession(sessionId: string, windowId: number, source?: CodeforcesSessionClient): void {
		const windows = new Set([windowId]);
		for (const entry of this.codeforcesClients.values()) {
			if (entry.session.id !== sessionId) { continue; }
			windows.add(entry.windowId);
			// observe() already invalidated the source and accepted its new identity.
			// Peer invalidation clears their old identity before the notified refresh.
			if (entry.client !== source) { entry.client.invalidate(source ? 'identity-change' : 'account-navigation'); }
		}
		for (const owner of windows) { this._onDidChangeOjSession.fire({ windowId: owner, site: 'codeforces' }); }
	}

	private ojSession(windowId: number, scope: BrowserViewStorageScope): BrowserSession {
		const window = this.windowsMainService.getWindowById(windowId);
		if (!window) { throw new Error('oj-connect-owner'); }
		this._ensureWindowCloseSubscription(windowId);
		if (scope !== BrowserViewStorageScope.Global && scope !== BrowserViewStorageScope.Workspace) { throw new Error('OJ Connect requires a persistent browser session.'); }
		if (scope === BrowserViewStorageScope.Workspace && !window.openedWorkspace?.id) { throw new Error('oj-connect-workspace-session-required'); }
		const session = BrowserSession.getOrCreate(this.instantiationService, '', { scope }, this.environmentMainService.workspaceStorageHome, window.openedWorkspace?.id);
		session.connectStorage(this.applicationStorageMainService);
		return session;
	}

	async readAtCoderLogin(windowId: number, scope: BrowserViewStorageScope): Promise<LoginSummary> {
		const session = this.ojSession(windowId, scope);
		let account = this.atCoderAccounts.get(session.id);
		if (!account) { account = { windowIds: new Set() }; this.atCoderAccounts.set(session.id, account); }
		account.windowIds.add(windowId);
		const key = windowId + ':' + session.id;
		const pending = this.atCoderAccountReads.get(key);
		if (pending) { return pending.result; }
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 10000);
		const result = (async (): Promise<LoginSummary> => {
			const response = await session.electronSession.fetch('https://atcoder.jp/', { redirect: 'error', cache: 'no-store', signal: controller.signal, headers: { Accept: 'text/html' } });
			checkAtCoderSourceResponse(response);
			const reader = response.body!.getReader(), chunks: Uint8Array[] = [];
			let size = 0;
			try {
				while (true) {
					const part = await reader.read(); if (part.done) { break; }
					size += part.value.byteLength; if (size > 4 * 1024 * 1024) { throw new Error('atcoder-response-too-large'); }
					chunks.push(part.value);
				}
			} finally { void reader.cancel().catch(() => undefined); }
			controller.signal.throwIfAborted();
			const html = Buffer.concat(chunks).toString('utf8');
			for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
				const match = /\buserScreenName\s*=\s*(["'])([a-zA-Z0-9_]*)\1/.exec(script[1]);
				if (match) {
					const changed = account.identity !== undefined && account.identity !== match[2]; account.identity = match[2];
					if (changed) { this.invalidateAtCoderAccount(windowId, session.id, controller); }
					return match[2] ? { site: 'atcoder', state: 'signed-in', label: match[2], profileUrl: 'https://atcoder.jp/users/' + match[2] } : { site: 'atcoder', state: 'signed-out' };
				}
			}
			return { site: 'atcoder', state: 'unknown' };
		})();
		this.atCoderAccountReads.set(key, { windowId, controller, result });
		try { return await result; }
		finally { clearTimeout(timer); if (this.atCoderAccountReads.get(key)?.controller === controller) { this.atCoderAccountReads.delete(key); } }
	}

	async openCodeforcesSession(windowId: number, scope: BrowserViewStorageScope): Promise<string> {
		const session = this.ojSession(windowId, scope), key = windowId + ':' + session.id;
		if (!this.codeforcesClients.has(key)) {
			const client = new CodeforcesSessionClient({
				trace: (event, details) => this.logService.info('[OJ Connect CF]', event, { windowId, ...details }),
				fetch: (url, init) => session.electronSession.fetch(url, init),
				post: createCodeforcesPost(session.electronSession),
				getSigningCookie: async () => {
					const cookies = await session.electronSession.cookies.get({ url: 'https://codeforces.com/', name: '39ce7' });
					return cookies.length === 1 ? cookies[0].value : undefined;
				},
				// The verified account reader owns identity. Cookie rotation is not logout.
				onSessionChange: () => toDisposable(() => { }),
				onIdentityChange: () => { if (this.codeforcesClients.get(key)?.client === client) { this.invalidateCodeforcesSession(session.id, windowId, client); } }
			});
			this.codeforcesClients.set(key, { windowId, session, client });
		}
		return session.id;
	}
	private codeforcesClient(id: string, windowId: number): CodeforcesSessionClient {
		const entry = this.codeforcesClients.get(windowId + ':' + id), window = this.windowsMainService.getWindowById(windowId);
		if (!entry || !window || entry.session.storageScope === BrowserViewStorageScope.Workspace && entry.session.id !== 'workspace:' + window.openedWorkspace?.id) { throw new Error('codeforces-session-owner'); }
		return entry.client;
	}
	async prepareCodeforcesTask(id: string, windowId: number, problem: ProblemRef) {
		assertCodeforcesProblem(problem); const key = generateUuid(), controller = new AbortController();
		this.ojReads.set(key, { windowId, operation: 'prepareCodeforces', cancel: () => controller.abort() });
		try { return await this.codeforcesClient(id, windowId).prepare(problem, controller.signal); }
		finally { this.ojReads.delete(key); }
	}
	async submitCodeforcesTask(id: string, windowId: number, problem: ProblemRef, payload: ICodeforcesSourcePayload, ownerKey: string, requestId: string): Promise<SubmissionOutcome> {
		assertCodeforcesProblem(problem); const client = this.codeforcesClient(id, windowId), key = windowId + ':' + id;
		if (this.codeforcesRequests.has(key)) { throw new Error('codeforces-submission-busy'); }
		if (typeof requestId !== 'string' || !requestId || requestId.length > 200) { throw new Error('codeforces-invalid-request'); }
		const request = { windowId, requestId, controller: new AbortController() }; this.codeforcesRequests.set(key, request);
		try { return await client.submit(problem, payload, ownerKey, requestId, request.controller.signal); }
		finally { if (this.codeforcesRequests.get(key) === request) { this.codeforcesRequests.delete(key); } }
	}
	async cancelCodeforcesTask(id: string, windowId: number, requestId: string): Promise<void> {
		this.codeforcesClient(id, windowId); const pending = this.codeforcesRequests.get(windowId + ':' + id);
		if (pending?.requestId === requestId) { pending.controller.abort(); }
	}
	async readCodeforcesRecord(id: string, windowId: number, record: RecordRef): Promise<RecordSnapshot> { return this.codeforcesClient(id, windowId).readRecord(record, new AbortController().signal); }
	async releaseCodeforcesRecord(id: string, windowId: number, record: RecordRef): Promise<void> { this.codeforcesClient(id, windowId).releaseRecord(record); }
	async reconcileCodeforcesAttempt(id: string, windowId: number, attemptId: string): Promise<SubmissionOutcome> { return this.codeforcesClient(id, windowId).reconcile(attemptId, new AbortController().signal); }

	async openLanqiaoSession(windowId: number, scope: BrowserViewStorageScope): Promise<string> {
		const session = this.ojSession(windowId, scope); this.ensureLanqiaoClient(session, windowId); return session.id;
	}
	async cancelLanqiaoOperations(windowId: number): Promise<void> {
		this.lanqiaoRequests.get(windowId)?.controller.abort(new Error('lanqiao-session-changed'));
		for (const [key, entry] of this.lanqiaoClients) { if (entry.windowId === windowId) { entry.client.dispose(); this.lanqiaoClients.delete(key); } }
		for (const request of this.ojReads.values()) { if (request.windowId === windowId && request.operation?.includes('Lanqiao')) { request.cancel(); } }
	}
	private ensureLanqiaoClient(session: BrowserSession, windowId: number): LanqiaoSessionClient {
		if (!this.windowsMainService.getWindowById(windowId)) { throw new Error('oj-connect-owner'); }
		const key = windowId + ':' + session.id;
		let entry = this.lanqiaoClients.get(key);
		if (!entry) {
			const client = new LanqiaoSessionClient({
				transport: createLanqiaoTransport(session.electronSession),
				assertCurrent: () => {
					const window = this.windowsMainService.getWindowById(windowId);
					if (!window || this.lanqiaoClients.get(key)?.client !== client || session.storageScope === BrowserViewStorageScope.Workspace && session.id !== 'workspace:' + window.openedWorkspace?.id) { throw new Error('lanqiao-session-owner'); }
				},
				onIdentityChange: () => { if (this.lanqiaoClients.get(key)?.client === client) { this._onDidChangeOjSession.fire({ windowId, site: 'lanqiao' }); } },
				onSessionChange: listener => {
					const changed = (_event: Electron.Event, cookie: Electron.Cookie, cause: string, removed: boolean) => {
						if (cookie.name === 'lqtoken' && ['lanqiao.cn', 'www.lanqiao.cn', 'passport.lanqiao.cn'].includes(cookie.domain?.replace(/^\./, '') ?? '') && !(removed && cause === 'overwrite')) { listener(); }
					};
					session.electronSession.cookies.on('changed', changed);
					return toDisposable(() => session.electronSession.cookies.removeListener('changed', changed));
				}
			});
			entry = { windowId, session, client }; this.lanqiaoClients.set(key, entry);
		}
		if (entry.session !== session) { throw new Error('lanqiao-session-owner'); }
		return entry.client;
	}
	private lanqiaoClient(id: string, windowId: number): LanqiaoSessionClient {
		const entry = this.lanqiaoClients.get(windowId + ':' + id), window = this.windowsMainService.getWindowById(windowId);
		if (!entry || !window || entry.session.storageScope === BrowserViewStorageScope.Ephemeral || entry.session.storageScope === BrowserViewStorageScope.Workspace && entry.session.id !== 'workspace:' + window.openedWorkspace?.id) { throw new Error('lanqiao-session-owner'); }
		return entry.client;
	}
	async prepareLanqiaoTask(id: string, windowId: number, problem: ProblemRef) {
		assertLanqiaoProblem(problem); const controller = new AbortController(), key = generateUuid();
		this.ojReads.set(key, { windowId, operation: 'prepareLanqiao', cancel: () => controller.abort() });
		try { return await this.lanqiaoClient(id, windowId).prepare(problem, controller.signal); }
		finally { this.ojReads.delete(key); }
	}
	async submitLanqiaoTask(id: string, windowId: number, problem: ProblemRef, payload: ILanqiaoSourcePayload, ownerKey: string, requestId: string): Promise<SubmissionOutcome> {
		const client = this.lanqiaoClient(id, windowId); assertLanqiaoProblem(problem);
		if (this.lanqiaoRequests.has(windowId) || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) { throw new Error('lanqiao-submission-busy'); }
		const pending = { id, requestId, controller: new AbortController() }; this.lanqiaoRequests.set(windowId, pending);
		try { return await client.send(problem, payload, ownerKey, requestId, pending.controller.signal); }
		finally { if (this.lanqiaoRequests.get(windowId) === pending) { this.lanqiaoRequests.delete(windowId); } }
	}
	async cancelLanqiaoTask(id: string, windowId: number, requestId: string): Promise<void> { this.lanqiaoClient(id, windowId); const pending = this.lanqiaoRequests.get(windowId); if (pending?.id === id && pending.requestId === requestId) { pending.controller.abort(); } }
	async readLanqiaoProgress(id: string, windowId: number, requestId: string) {
		const client = this.lanqiaoClient(id, windowId), pending = this.lanqiaoRequests.get(windowId);
		return pending?.id === id && pending.requestId === requestId && !pending.controller.signal.aborted ? client.readProgress(requestId) : undefined;
	}
	async releaseLanqiaoPreparation(id: string, windowId: number, ownerKey: string): Promise<void> { this.lanqiaoClient(id, windowId).releasePreparation(ownerKey); }
	async readLanqiaoRecord(id: string, windowId: number, record: RecordRef): Promise<RecordSnapshot> { return this.lanqiaoClient(id, windowId).readRecord(record, new AbortController().signal); }
	async releaseLanqiaoRecord(id: string, windowId: number, record: RecordRef): Promise<void> { this.lanqiaoClient(id, windowId).releaseRecord(record); }
	async reconcileLanqiaoAttempt(id: string, windowId: number, attemptId: string): Promise<SubmissionOutcome> { return this.lanqiaoClient(id, windowId).reconcile(attemptId, new AbortController().signal); }

	async openNowcoderSession(windowId: number, scope: BrowserViewStorageScope): Promise<string> {
		const session = this.ojSession(windowId, scope), key = windowId + ':' + session.id;
		if (!this.nowcoderClients.has(key)) {
			const fingerprint = async () => createHash('sha256').update((await session.electronSession.cookies.get({ url: 'https://ac.nowcoder.com/' })).filter(cookie => ['t', 'NOWCODERUID'].includes(cookie.name)).map(cookie => [cookie.domain, cookie.path, cookie.name, cookie.value].join(':')).sort().join('\n')).digest('hex');
			let cookieState = await fingerprint();
			if (!this.windowsMainService.getWindowById(windowId)) { throw new Error('oj-connect-owner'); }
			if (this.nowcoderClients.has(key)) { return session.id; }
			const synchronize = async () => { const next = await fingerprint(); if (next !== cookieState) { cookieState = next; await client.refreshIdentity(); } };
			const client = new NowcoderSessionClient({
				fetch: (url, init) => session.electronSession.fetch(url, init),
				synchronizeSession: synchronize,
				onIdentityChange: () => { if (this.nowcoderClients.get(key)?.client === client) { this._onDidChangeOjSession.fire({ windowId, site: 'nowcoder' }); } },
				onSessionChange: () => {
					let disposed = false;
					const changed = (_event: Electron.Event, cookie: Electron.Cookie, cause: string, removed: boolean) => {
						if (!['nowcoder.com', 'ac.nowcoder.com', 'www.nowcoder.com'].includes(cookie.domain?.replace(/^\./, '') ?? '') || !['t', 'NOWCODERUID'].includes(cookie.name) || removed && cause === 'overwrite') { return; }
						if (!disposed) { void synchronize().catch(() => undefined); }
					};
					session.electronSession.cookies.on('changed', changed);
					return toDisposable(() => { disposed = true; session.electronSession.cookies.removeListener('changed', changed); });
				}
			});
			this.nowcoderClients.set(key, { windowId, client });
		}
		return session.id;
	}
	private nowcoderClient(id: string, windowId: number): NowcoderSessionClient {
		const entry = this.nowcoderClients.get(windowId + ':' + id);
		if (!entry) { throw new Error('nowcoder-session-owner'); } return entry.client;
	}
	async prepareNowcoderTask(id: string, windowId: number, problem: ProblemRef) {
		assertNowcoderProblem(problem); const key = generateUuid(), controller = new AbortController();
		this.ojReads.set(key, { windowId, operation: 'prepareNowcoder', cancel: () => controller.abort() });
		try { return await this.nowcoderClient(id, windowId).prepare(problem, controller.signal); }
		finally { this.ojReads.delete(key); }
	}
	async submitNowcoderTask(id: string, windowId: number, problem: ProblemRef, payload: INowcoderSourcePayload, ownerKey: string, requestId: string): Promise<SubmissionOutcome> {
		assertNowcoderProblem(problem); const client = this.nowcoderClient(id, windowId), key = windowId + ':' + id;
		if (this.nowcoderRequests.has(key)) { throw new Error('nowcoder-submission-busy'); }
		if (typeof requestId !== 'string' || !requestId || requestId.length > 200) { throw new Error('nowcoder-invalid-request'); }
		const request = { windowId, requestId, controller: new AbortController() }; this.nowcoderRequests.set(key, request);
		try {
			const outcome = await client.submit(problem, payload, ownerKey, requestId, request.controller.signal);
			for (const [key, attempt] of this.nowcoderAttempts) { if (attempt.expires < Date.now()) { this.nowcoderAttempts.delete(key); } }
			if (outcome.kind === 'unconfirmed' && this.nowcoderClients.get(key)?.client === client) { this.nowcoderAttempts.set(requestId, { windowId, sessionId: id, outcome, expires: Date.now() + 600000 }); }
			return outcome;
		} finally { if (this.nowcoderRequests.get(key) === request) { this.nowcoderRequests.delete(key); } }
	}
	async cancelNowcoderTask(id: string, windowId: number, requestId: string): Promise<void> {
		this.nowcoderClient(id, windowId); const pending = this.nowcoderRequests.get(windowId + ':' + id); if (pending?.requestId === requestId) { pending.controller.abort(); }
	}
	async readNowcoderRecord(id: string, windowId: number, record: RecordRef): Promise<RecordSnapshot> { return this.nowcoderClient(id, windowId).readRecord(record, new AbortController().signal); }
	async releaseNowcoderRecord(id: string, windowId: number, record: RecordRef): Promise<void> { this.nowcoderClient(id, windowId).releaseRecord(record); }
	async reconcileNowcoderAttempt(id: string, windowId: number, attemptId: string): Promise<SubmissionOutcome> {
		this.nowcoderClient(id, windowId); const attempt = this.nowcoderAttempts.get(attemptId);
		if (!attempt || attempt.windowId !== windowId || attempt.sessionId !== id || attempt.expires < Date.now()) { throw new Error('nowcoder-attempt-unavailable'); }
		// No unique receipt evidence: retain uncertainty; never infer the most recent record or resend.
		return attempt.outcome;
	}

	async openLuoguSession(windowId: number, scope: BrowserViewStorageScope): Promise<string> {
		const session = this.ojSession(windowId, scope);
		const key = windowId + ':' + session.id;
		if (!this.luoguClients.has(key)) {
			const relevantCookies = async () => (await session.electronSession.cookies.get({ url: 'https://www.luogu.com.cn/' })).filter(cookie => ['_uid', '__client_id'].includes(cookie.name)).map(cookie => [cookie.domain, cookie.path, cookie.name, cookie.value].join(':')).sort().join('\n');
			let cookieState = createHash('sha256').update(await relevantCookies()).digest('hex');
			if (!this.windowsMainService.getWindowById(windowId)) { throw new Error('oj-connect-owner'); }
			if (this.luoguClients.has(key)) { return session.id; }
			const client = new LuoguSessionClient({
				trace: (event, details) => this.logService.info('[OJ Connect Luogu]', event, { windowId, ...details }),
				synchronizeSession: async () => {
					const next = createHash('sha256').update(await relevantCookies()).digest('hex');
					this.logService.info('[OJ Connect Luogu]', 'pre-submit-session', { windowId, credentialsChanged: next !== cookieState });
					if (next !== cookieState) { cookieState = next; client.invalidate(); this._onDidChangeOjSession.fire({ windowId, site: 'luogu' }); }
				},
				createSocket: async () => {
					// Upstream websocket.ts uses _uid/__client_id on the fixed record channel.
					// Credentials remain in main; the extension receives semantic records only.
					const cookies = await session.electronSession.cookies.get({ url: 'https://www.luogu.com.cn/' });
					const cookie = cookies.filter(value => ['_uid', '__client_id'].includes(value.name)).map(value => value.name + '=' + value.value).join('; ');
					const { default: WebSocket } = await import('ws');
					const socket = new WebSocket('wss://ws.luogu.com.cn/ws', { headers: { cookie }, handshakeTimeout: 6000 });
					socket.on('error', () => undefined); // Closing a connecting ws must never crash main.
					return socket as unknown as globalThis.WebSocket;
				},
				fetch: (url, init) => this.fetchLuogu(session.electronSession, url, init),
				onSessionChange: listener => {
					let timer: ReturnType<typeof setTimeout> | undefined, disposed = false;
					const changed = (_event: Electron.Event, cookie: Electron.Cookie) => {
						const domain = cookie.domain?.replace(/^\./, '');
						if ((domain !== 'luogu.com.cn' && domain !== 'www.luogu.com.cn') || !['_uid', '__client_id'].includes(cookie.name)) { return; }
						if (timer) { clearTimeout(timer); }
						timer = setTimeout(() => {
							timer = undefined; void relevantCookies().then(value => {
								const next = createHash('sha256').update(value).digest('hex');
								if (!disposed && next !== cookieState) { cookieState = next; listener(); this._onDidChangeOjSession.fire({ windowId, site: 'luogu' }); }
							}).catch(() => undefined);
						}, 0);
					};
					session.electronSession.cookies.on('changed', changed);
					return toDisposable(() => { disposed = true; if (timer) { clearTimeout(timer); } session.electronSession.cookies.removeListener('changed', changed); });
				},
				askCaptcha: async (requestId, signal) => {
					this.logService.info('[OJ Connect Luogu]', 'captcha-prompt-start', { windowId, requestId });
					const image = await client.captcha(signal); signal.throwIfAborted();
					return new Promise<string | undefined>(resolve => {
						let settled = false;
						const done = (answer: string | undefined) => {
							if (settled) { return; }
							settled = true;
							signal.removeEventListener('abort', cancel); this.luoguCaptchas.delete(requestId);
							// Normal answers already dispose their own panel, as upstream does.
							// A delayed cross-process cancel must not close the next captcha round.
							if (answer === undefined) { this._onDidCancelLuoguCaptcha.fire({ windowId, requestId }); }
							resolve(answer);
						};
						const cancel = () => done(undefined);
						this.luoguCaptchas.set(requestId, { windowId, client, signal, resolve: done });
						signal.addEventListener('abort', cancel, { once: true });
						if (signal.aborted) { cancel(); } else { this._onDidRequireLuoguCaptcha.fire({ windowId, requestId, image }); }
					});
				}
			});
			this.luoguClients.set(key, { windowId, session, client });
		}
		return session.id;
	}
	private luoguClient(id: string, windowId: number): LuoguSessionClient {
		const entry = this.luoguClients.get(windowId + ':' + id);
		if (!entry || !this.windowsMainService.getWindowById(windowId)) { throw new Error('oj-connect-owner'); }
		return entry.client;
	}
	private fetchLuogu(session: Electron.Session, url: string, init: RequestInit): Promise<Response> {
		if (url === 'https://www.luogu.com.cn/auth/logout') {
			// Explicit session mutation keeps Chromium's Set-Cookie handling so the
			// integrated browser signs out too. Never fall back here after a failed POST.
			return session.fetch(url, init);
		}
		// Match upstream proxy:false only for fixed Luogu operations. The browser
		// Session remains the credential authority; its proxy settings are untouched.
		return fetchLuoguDirect(session, url, init);
	}
	async getLuoguCaptcha(windowId: number, requestId: string): Promise<string> {
		const pending = this.luoguCaptchas.get(requestId);
		if (!pending || pending.windowId !== windowId) { throw new Error('luogu-captcha-expired'); }
		return pending.client.captcha(pending.signal);
	}
	async answerLuoguCaptcha(windowId: number, requestId: string, answer: string | undefined): Promise<void> {
		const pending = this.luoguCaptchas.get(requestId);
		if (!pending || pending.windowId !== windowId) { return; }
		if (answer !== undefined && (typeof answer !== 'string' || answer.length > 256)) { throw new Error('luogu-invalid-captcha'); }
		this.logService.info('[OJ Connect Luogu]', 'captcha-answer', { windowId, requestId, cancelled: answer === undefined, length: answer?.length ?? 0 });
		pending.resolve(answer);
	}
	async updateLuoguSession(id: string, windowId: number, operation: 'invalidateLuoguSession' | 'releaseLuoguRecord', record?: RecordRef): Promise<void> {
		const client = this.luoguClient(id, windowId);
		if (operation === 'invalidateLuoguSession') { client.invalidate(); }
		else if (operation === 'releaseLuoguRecord' && record) { assertLuoguProblem(record.problem); client.releaseRecord(record); }
		else { throw new Error('oj-connect-operation'); }
	}
	async readOjLogin(id: string, windowId: number, site: 'luogu' | 'atcoder' | 'nowcoder' | 'codeforces' | 'lanqiao'): Promise<LoginSummary> {
		if (site === 'lanqiao') { return this.lanqiaoClient(id, windowId).loginSummary(new AbortController().signal); }
		if (site === 'codeforces') { return this.codeforcesClient(id, windowId).login(new AbortController().signal); }
		if (site === 'nowcoder') { return this.nowcoderClient(id, windowId).login(new AbortController().signal); }
		if (site === 'luogu') { return this.luoguClient(id, windowId).login(new AbortController().signal); }
		const view = this._getBrowserView(id);
		if (view.owner.mainWindowId !== windowId) { throw new Error('oj-connect-owner'); }
		const url = view.getURL();
		if (site !== 'atcoder' || new URL(url).origin !== 'https://atcoder.jp') { throw new Error('oj-connect-origin'); }
		return this.readAtCoderLogin(windowId, view.session.storageScope);
	}
	async prepareLuoguTask(id: string, windowId: number, problem: ProblemRef): Promise<{ languages: readonly LanguageOption[]; hasDraft: boolean; ownerKey: string }> {
		assertLuoguProblem(problem);
		const key = generateUuid(), controller = new AbortController();
		this.ojReads.set(key, { windowId, operation: 'prepareLuogu', cancel: () => controller.abort() });
		try { return await this.luoguClient(id, windowId).prepare(problem, controller.signal); }
		finally { this.ojReads.delete(key); }
	}
	async submitLuoguTask(id: string, windowId: number, problem: ProblemRef, payload: ILuoguSourcePayload, ownerKey: string, requestId: string): Promise<SubmissionOutcome> {
		assertLuoguProblem(problem); const client = this.luoguClient(id, windowId), key = windowId + ':' + id;
		if (this.luoguRequests.has(key)) { throw new Error('luogu-submission-busy'); }
		if (!/^[1-9]\d*$/.test(ownerKey) || !requestId || requestId.length > 200 || !payload || typeof payload.source !== 'string' || !payload.source.trim() || new TextEncoder().encode(payload.source).length > 1024 * 1024 || !/^\d+(?::o2)?$/.test(payload.languageId)) { throw new Error('luogu-invalid-payload'); }
		const controller = new AbortController(), startedAt = Date.now();
		this.luoguRequests.set(key, { windowId, requestId, controller, cancel: async () => controller.abort(new Error('luogu-submission-cancelled')) });
		try {
			const outcome = await client.submit(problem, { ...payload }, ownerKey, requestId, controller.signal);
			if (outcome.kind === 'unconfirmed') {
				const timer = setTimeout(() => this.luoguAttempts.delete(requestId), 600000);
				this.luoguAttempts.set(requestId, { problem, viewId: id, windowId, ownerKey, startedAt, timer, sourceHash: createHash('sha256').update(payload.source.replace(/\r\n/g, '\n')).digest('hex') });
			}
			return outcome;
		} finally { this.luoguRequests.delete(key); }
	}
	async cancelLuoguTask(id: string, windowId: number, requestId: string): Promise<void> {
		this.luoguClient(id, windowId); const request = this.luoguRequests.get(windowId + ':' + id);
		if (request?.requestId === requestId) { await request.cancel(); }
	}
	async readLuoguRecord(id: string, windowId: number, record: RecordRef): Promise<RecordSnapshot> {
		assertLuoguProblem(record.problem);
		if (!/^[1-9]\d*$/.test(record.id) || record.url !== 'https://www.luogu.com.cn/record/' + record.id) { throw new Error('luogu-invalid-record'); }
		return this.luoguClient(id, windowId).readRecord(record, new AbortController().signal);
	}
	async reconcileLuoguAttempt(attemptId: string, windowId: number): Promise<SubmissionOutcome> {
		const entry = this.luoguAttempts.get(attemptId);
		if (!entry || entry.windowId !== windowId) { throw new Error('luogu-attempt-unavailable'); }
		for (const view of this.browserViews.values()) {
			if (view.owner.mainWindowId !== windowId || view.session.id !== entry.viewId || !/^https:\/\/www\.luogu\.com\.cn\/record\/[1-9]\d*$/.test(view.getURL())) { continue; }
			const checked = await this.luoguClient(entry.viewId, windowId).inspectReceipt(entry.problem, view.getURL(), new AbortController().signal);
			if (checked.ownerKey === entry.ownerKey && checked.sourceHash === entry.sourceHash && checked.submitTime * 1000 >= entry.startedAt - 5000) { clearTimeout(entry.timer); this.luoguAttempts.delete(attemptId); return { kind: 'record', record: checked.record }; }
		}
		return { kind: 'unconfirmed', problem: entry.problem, attemptId, message: 'Open the new official record to continue verification.' };
	}

	async readCurrentPage(id: string, windowId: number, expectedURL: string): Promise<string> {
		const view = this._getBrowserView(id);
		const contents = view.getWebContentsView().webContents;
		return readBeaconBrowserPage({
			ownerWindowId: view.owner.mainWindowId,
			url: () => contents.getURL(), loading: () => contents.isLoading(), closed: () => contents.isDestroyed(),
			watchChange: listener => {
				const requestId = generateUuid();
				this.ojReads.set(requestId, { windowId, cancel: listener });
				return combinedDisposable(view.onDidNavigate(listener), view.onDidClose(listener), toDisposable(() => this.ojReads.delete(requestId)));
			},
			read: code => contents.executeJavaScriptInIsolatedWorld(1003, [{ code }])
		}, windowId, expectedURL);
	}

	async clearStorage(id: string): Promise<void> {
		return this._getBrowserView(id).clearStorage();
	}

	private atCoderRecordKey(session: BrowserSession, windowId: number, record: RecordRef): string {
		const task = atCoderTask(record?.problem?.url ?? '');
		if (!task || record.problem.site !== 'atcoder' || record.problem.nativeId !== task.contestId + '/' + task.taskId || !/^[1-9]\d*$/.test(record.id) || record.url !== `https://atcoder.jp/contests/${task.contestId}/submissions/${record.id}`) { throw new Error('atcoder-invalid-record'); }
		return windowId + ':' + session.id + ':' + record.url;
	}

	async releaseAtCoderRecord(scope: BrowserViewStorageScope, windowId: number, record: RecordRef): Promise<void> {
		const key = this.atCoderRecordKey(this.ojSession(windowId, scope), windowId, record);
		const request = this.atCoderRecordRequests.get(key);
		request?.controller.abort();
		if (request) { await request.done; }
		this.atCoderRecords.delete(key);
	}

	async readAtCoderRecord(scope: BrowserViewStorageScope, windowId: number, record: RecordRef): Promise<RecordSnapshot> {
		const session = this.ojSession(windowId, scope), key = this.atCoderRecordKey(session, windowId, record);
		const previous = this.atCoderRecords.get(key);
		if (previous?.initial) { previous.initial = false; return previous.snapshot; }
		if (this.atCoderRecordRequests.has(key)) { throw new Error('atcoder-record-read-busy'); }
		const controller = new AbortController(), requestId = generateUuid();
		const timer = setTimeout(() => controller.abort(), 10000);
		let settled!: () => void;
		const done = new Promise<void>(resolve => { settled = resolve; });
		this.atCoderRecordRequests.set(key, { controller, done });
		this.ojReads.set(requestId, { windowId, cancel: () => controller.abort() });
		const get = async (url: string, json = false) => {
			const response = await session.electronSession.fetch(url, { redirect: 'error', cache: 'no-store', signal: controller.signal, headers: { Accept: json ? 'application/json' : 'text/html' } });
			if (response.status !== 200 || !response.body || !response.headers.get('content-type')?.includes(json ? 'application/json' : 'text/html')) { throw new Error('atcoder-record-response'); }
			const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
			try { while (true) { const part = await reader.read(); if (part.done) { break; } size += part.value.byteLength; if (size > 4 * 1024 * 1024) { throw new Error('atcoder-response-too-large'); } chunks.push(part.value); } }
			finally { void reader.cancel().catch(() => undefined); }
			controller.signal.throwIfAborted();
			return Buffer.concat(chunks).toString('utf8');
		};
		try {
			if (previous && (previous.snapshot.phase === 'queued' || previous.snapshot.phase === 'judging')) {
				const task = atCoderTask(record.problem.url)!;
				const data = JSON.parse(await get(`https://atcoder.jp/contests/${task.contestId}/submissions/me/status/json?reload=true&sids%5B%5D=${record.id}`, true));
				const value = data.Result?.[record.id];
				if (!value || typeof value.Html !== 'string' || value.Html.length > 65536) { throw new Error('atcoder-status-incomplete'); }
				const label = /<[^>]+class=["'][^"']*\blabel\b[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(value.Html)?.[1];
				const rawStatus = decodeAtCoderHTML((label ?? '').replace(/<[^>]*>/g, '')).trim();
				if (/^(WJ|WR|Judging|\d+\s*\/\s*\d+.*)$/.test(rawStatus)) {
					const snapshot: RecordSnapshot = { ...previous.snapshot, rawStatus, phase: rawStatus === 'WJ' ? 'queued' : 'judging', pollAfterMs: Number.isFinite(data.Interval) && data.Interval >= 100 && data.Interval <= 60000 ? data.Interval : undefined };
					this.atCoderRecords.set(key, { windowId, snapshot, initial: false }); return snapshot;
				}
				if (!/^(AC|WA|CE|RE|TLE|MLE|OLE|IE|QLE)$/.test(rawStatus)) { throw new Error('atcoder-status-incomplete'); }
			}
			const snapshot = parseAtCoderRecordHTML(record, await get(record.url));
			controller.signal.throwIfAborted();
			this.atCoderRecords.set(key, { windowId, snapshot, initial: false });
			return snapshot;
		} finally { clearTimeout(timer); this.atCoderRecordRequests.delete(key); this.ojReads.delete(requestId); settled(); }
	}

	async reconcileAtCoderAttempt(attemptId: string, windowId: number): Promise<SubmissionOutcome> {
		const entry = this.atCoderAttempts.get(attemptId);
		if (!entry || entry.windowId !== windowId) { throw new Error('atcoder-attempt-unavailable'); }
		const task = atCoderTask(entry.context.taskURL)!;
		const problem: ProblemRef = { site: 'atcoder', nativeId: task.contestId + '/' + task.taskId, url: entry.context.taskURL };
		if (this.ojSession(windowId, entry.session.storageScope) !== entry.session) { throw new Error('oj-connect-session-scope-changed'); }
		const controller = new AbortController(), requestId = generateUuid();
		this.ojReads.set(requestId, { windowId, cancel: () => controller.abort() });
		let result;
		try { result = await reconcileAtCoderTransaction({ session: entry.session.electronSession, signal: controller.signal }, entry.context); }
		finally { this.ojReads.delete(requestId); }
		if (result.verified && result.id && result.url) {
			clearTimeout(entry.timer); this.atCoderAttempts.delete(attemptId);
			return { kind: 'record', record: { problem, id: result.id, url: result.url } };
		}
		return { kind: 'unconfirmed', problem, attemptId, message: result.status };
	}

	async setBrowserZoomIndex(id: string, zoomIndex: number): Promise<void> {
		return this._getBrowserView(id).setBrowserZoomIndex(zoomIndex);
	}

	async prepareAtCoderTask(id: string, windowId: number, expectedURL: string, payload?: IAtCoderSourcePayload): Promise<IAtCoderTaskForm> {
		const view = this._getBrowserView(id);
		if (view.owner.mainWindowId !== windowId) { throw new Error('atcoder-owner'); }
		const code = atCoderFormScript(expectedURL, payload);
		const contents = view.getWebContentsView().webContents;
		const available = () => !contents.isDestroyed() && contents.getURL() === atCoderSubmitURL(expectedURL);
		const deadline = Date.now() + 20000;
		const controller = new AbortController();
		const watch = view.onDidClose(() => controller.abort());
		const timer = setTimeout(() => controller.abort(), 20000);
		let stop!: () => void;
		const stopped = new Promise<never>((_, reject) => { stop = () => reject(new Error('atcoder-form-timeout')); controller.signal.addEventListener('abort', stop, { once: true }); });
		void stopped.catch(() => undefined);
		this.ojReads.set(id, { windowId, operation: 'prepareAtCoder', cancel: () => controller.abort() });
		try {
			while (Date.now() < deadline) {
				controller.signal.throwIfAborted();
				if (contents.isDestroyed()) { throw new Error('atcoder-page-changed'); }
				if (/^https:\/\/atcoder\.jp\/login(?:[/?#]|$)/.test(contents.getURL())) { throw new Error('atcoder-login-required'); }
				if (!available()) { await new Promise(resolve => setTimeout(resolve, 50)); continue; }
				const result: unknown = await Promise.race([
					contents.executeJavaScriptInIsolatedWorld(1005, [{ code }]),
					stopped
				]);
				controller.signal.throwIfAborted();
				if (!available()) { throw new Error('atcoder-page-changed'); }
				if (result === 'atcoder-form-missing') { await new Promise(resolve => setTimeout(resolve, 50)); continue; }
				if (typeof result === 'string') { throw new Error(result); }
				if (!result || typeof result !== 'object') { throw new Error('atcoder-form-invalid'); }
				const data = result as IAtCoderTaskForm;
				if (typeof data.hasDraft !== 'boolean' || !Array.isArray(data.languages) || data.languages.length > 100 || data.languages.some(option => !/^\d+$/.test(option.id) || typeof option.label !== 'string' || option.label.length > 200)) { throw new Error('atcoder-form-invalid'); }
				return data;
			}
			throw new Error('atcoder-form-timeout');
		} finally { clearTimeout(timer); controller.signal.removeEventListener('abort', stop); watch.dispose(); this.ojReads.delete(id); }
	}

	async setDeviceEmulation(id: string, device: IBrowserDeviceProfile | undefined): Promise<void> {
		return this._getBrowserView(id).emulator.setDevice(device);
	}

	async cancelAtCoderTask(id: string, windowId: number): Promise<void> {
		if (this._getBrowserView(id).owner.mainWindowId !== windowId) { throw new Error('atcoder-owner'); }
		this.atCoderRequests.get(id)?.abort();
	}

	async sendAndConfirmAtCoderTask(id: string, windowId: number, expectedURL: string, payload: IAtCoderSourcePayload): Promise<SubmissionOutcome> {
		let attempt: AtCoderAttempt | undefined;
		let detail: { url: string; html: string; source: string } | undefined;
		const session = this._getBrowserView(id).session;
		const result = await runAtCoderTransaction({
			view: this._getBrowserView(id), requests: this.atCoderRequests,
			prepare: value => this.prepareAtCoderTask(id, windowId, expectedURL, value),
			trace: (phase, elapsedMs) => this.logService.info('[OJ Connect AtCoder]', phase, { windowId, elapsedMs }),
			onAttempt: value => { attempt = value; },
			onConfirmedDetail: (url, html, source) => { detail = { url, html, source }; }
		}, id, windowId, expectedURL, payload);
		const task = atCoderTask(expectedURL)!;
		const problem: ProblemRef = { site: 'atcoder', nativeId: task.contestId + '/' + task.taskId, url: expectedURL };
		if (result.verified && result.id && result.url) {
			const record = { problem, id: result.id, url: result.url };
			if (detail) {
				try { const snapshot = { ...parseAtCoderRecordHTML(record, detail.html), sourceVerification: 'matched' as const }; this.atCoderRecords.set(this.atCoderRecordKey(session, windowId, record), { windowId, snapshot, initial: true }); } catch { /* A confirmed receipt survives incomplete result metadata. */ }
			}
			return { kind: 'record', record };
		}
		if (!attempt) { return { kind: 'not-sent', reason: result.status }; }
		const context = attempt as AtCoderAttempt;
		const timer = setTimeout(() => this.atCoderAttempts.delete(context.id), 600000);
		this.atCoderAttempts.set(context.id, { context, session, windowId, timer });
		return { kind: 'unconfirmed', problem, attemptId: context.id, message: result.status };
	}

	async trustCertificate(id: string, host: string, fingerprint: string): Promise<void> {
		return this._getBrowserView(id).trustCertificate(host, fingerprint);
	}

	async untrustCertificate(id: string, host: string, fingerprint: string): Promise<void> {
		return this._getBrowserView(id).untrustCertificate(host, fingerprint);
	}

	async deleteBrowserHistory(id: string, entryIds?: readonly number[]): Promise<void> {
		this._getBrowserView(id).session.history.delete(entryIds);
	}

	async setPermissions(id: string, origin: string, grants: readonly IPermissionCategoryState[]): Promise<void> {
		this._getBrowserView(id).session.permissions.set(origin, grants);
	}

	async selectDevice(id: string, requestId: string, deviceId: string | null): Promise<void> {
		this._getBrowserView(id).selectDevice(requestId, deviceId);
	}

	async clearGlobalStorage(): Promise<void> {
		const browserSession = BrowserSession.getOrCreateGlobal(this.instantiationService);
		browserSession.connectStorage(this.applicationStorageMainService);
		await browserSession.clearData();
	}

	async clearWorkspaceStorage(workspaceId: string): Promise<void> {
		const browserSession = BrowserSession.getOrCreateWorkspace(
			this.instantiationService,
			workspaceId,
			this.environmentMainService.workspaceStorageHome
		);
		browserSession.connectStorage(this.applicationStorageMainService);
		await browserSession.clearData();
	}

	async getConsoleLogs(id: string): Promise<string> {
		return this._getBrowserView(id).getConsoleLogs();
	}

	async updateWindowConfiguration(windowId: number, config: IBrowserViewWindowConfiguration): Promise<void> {
		this._windowConfigurations.set(windowId, config);
		this._ensureWindowCloseSubscription(windowId);

		for (const [, view] of this.browserViews) {
			if (view.owner.mainWindowId === windowId) {
				if (config.appearance) {
					view.setAppearance(config.appearance);
				}
				if (typeof config.maxHistoryEntries === 'number') {
					view.session.history.setMaxEntries(config.maxHistoryEntries);
				}
			}
		}

		this._recomputeTrustedFileRoots();
	}

	private _ensureWindowCloseSubscription(windowId: number): void {
		if (this._windowCloseSubscriptions.has(windowId)) {
			return;
		}
		const window = this.windowsMainService.getWindowById(windowId);
		if (!window) {
			return;
		}
		const onWindowGone = Event.any(window.onDidClose, window.onDidDestroy);
		this._windowCloseSubscriptions.set(windowId, Event.once(onWindowGone)(() => {
			void this.cancelOjOperations(windowId).catch(() => undefined);
			for (const [key, attempt] of this.atCoderAttempts) {
				if (attempt.windowId === windowId) { clearTimeout(attempt.timer); this.atCoderAttempts.delete(key); }
			}
			this._windowCloseSubscriptions.deleteAndDispose(windowId);
			if (this._windowConfigurations.delete(windowId)) {
				this._recomputeTrustedFileRoots();
			}
		}));
	}

	private _recomputeTrustedFileRoots(): void {
		const roots = new Set<string>();
		let trustAllFiles = false;
		for (const configuration of this._windowConfigurations.values()) {
			for (const root of configuration.trustedFileRoots) {
				roots.add(root);
			}
			trustAllFiles ||= configuration.trustAllFiles;
		}
		BrowserSession.setTrustedFileRoots([...roots], trustAllFiles);
	}

	/**
	 * Create a browser view backed by the given {@link BrowserSession}.
	 */
	private createBrowserView(id: string, owner: IBrowserViewOwner, browserSession: BrowserSession, options?: Electron.WebContentsViewConstructorOptions): BrowserView {
		if (this.browserViews.has(id)) {
			throw new Error(`Browser view with id ${id} already exists`);
		}

		browserSession.connectStorage(this.applicationStorageMainService);
		const windowConfiguration = this._windowConfigurations.get(owner.mainWindowId);
		if (typeof windowConfiguration?.maxHistoryEntries === 'number') {
			browserSession.history.setMaxEntries(windowConfiguration.maxHistoryEntries);
		}

		const view = this.instantiationService.createInstance(
			BrowserView,
			id,
			owner,
			browserSession,
			// Recursive factory for nested windows (child views share the same session and owner).
			(url, electronOptions, openOptions) => {
				const child = this.createBrowserView(generateUuid(), owner, browserSession, electronOptions);

				// Electron creates the initial blank document. Loading it again can cancel
				// a navigation the opener starts on the returned window.
				if (url && url !== 'about:blank') {
					void child.loadURL(url).catch(() => { });
				}

				const info = this._getViewInfo(child);
				this._onDidCreateBrowserView.fire({
					info: url ? { ...info, state: { ...info.state, url } } : info,
					openOptions
				});

				return child;
			},
			(v, params) => this.showContextMenu(v, params),
			options
		);
		this.browserViews.set(id, view);
		if (windowConfiguration?.appearance) {
			view.setAppearance(windowConfiguration.appearance);
		}
		Event.once(view.onDidClose)(() => {
			this.browserViews.deleteAndDispose(id);
		});

		return view;
	}

	private async openNew(
		url: string,
		{
			owner,
			session,
			openOptions,
			source
		}: {
			owner: IBrowserViewOwner;
			session: BrowserSession | undefined;
			openOptions: IBrowserViewOpenOptions | undefined;
			source: IntegratedBrowserOpenSource;
		}
	): Promise<BrowserView> {
		const targetId = generateUuid();
		const view = this.createBrowserView(targetId, owner, session || BrowserSession.getOrCreateEphemeral(this.instantiationService, targetId));

		if (url) {
			void view.loadURL(url).catch(() => { });
		}

		logBrowserOpen(this.telemetryService, source);

		// Fire creation event so the workbench can open an editor tab
		const info = this._getViewInfo(view);
		this._onDidCreateBrowserView.fire({
			info: url ? { ...info, state: { ...info.state, url } } : info,
			openOptions
		});

		return view;
	}

	private async showContextMenu(view: BrowserView, params: Electron.ContextMenuParams): Promise<void> {
		const win = view.getElectronWindow();
		if (!win) {
			return;
		}
		const webContents = view.webContents;
		if (webContents.isDestroyed()) {
			return;
		}

		const windowConfiguration = this._windowConfigurations.get(view.owner.mainWindowId);
		const menu = new Menu();

		if (params.linkURL) {
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.openLinkInNewTab', 'Open Link in New Tab'),
				click: () => {
					void this.openNew(params.linkURL, {
						owner: view.owner,
						session: view.session,
						openOptions: { preserveFocus: true, background: true },
						source: 'browserLinkBackground'
					});
				}
			}));
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.openLinkInExternalBrowser', 'Open Link in External Browser'),
				click: () => { void this.nativeHostMainService.openExternal(undefined, params.linkURL); }
			}));
			menu.append(new MenuItem({ type: 'separator' }));
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.copyLink', 'Copy Link'),
				click: () => {
					clipboard.write({
						text: params.linkURL,
						html: `<a href="${encodeURI(params.linkURL)}">${htmlAttributeEncodeValue(params.linkText || params.linkURL)}</a>`
					});
				}
			}));
		}

		if (params.hasImageContents && params.srcURL) {
			if (menu.items.length > 0) {
				menu.append(new MenuItem({ type: 'separator' }));
			}
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.openImageInNewTab', 'Open Image in New Tab'),
				click: () => {
					void this.openNew(params.srcURL!, {
						owner: view.owner,
						session: view.session,
						openOptions: { preserveFocus: true, background: true },
						source: 'browserLinkBackground'
					});
				}
			}));
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.copyImage', 'Copy Image'),
				click: () => { view.webContents.copyImageAt(params.x, params.y); }
			}));
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.copyImageUrl', 'Copy Image URL'),
				click: () => { clipboard.writeText(params.srcURL!); }
			}));
		}

		if (params.isEditable) {
			menu.append(new MenuItem({ role: 'cut', enabled: params.editFlags.canCut }));
			menu.append(new MenuItem({ role: 'copy', enabled: params.editFlags.canCopy }));
			menu.append(new MenuItem({ role: 'paste', enabled: params.editFlags.canPaste }));
			menu.append(new MenuItem({ role: 'pasteAndMatchStyle', enabled: params.editFlags.canPaste }));
			menu.append(new MenuItem({ role: 'selectAll', enabled: params.editFlags.canSelectAll }));
		} else if (params.selectionText) {
			menu.append(new MenuItem({ role: 'copy' }));
		}

		// Add navigation items as defaults
		if (menu.items.length === 0) {
			if (webContents.navigationHistory.canGoBack()) {
				menu.append(new MenuItem({
					label: localize('browser.contextMenu.back', 'Back'),
					accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.GoBack],
					click: () => webContents.navigationHistory.goBack()
				}));
			}
			if (webContents.navigationHistory.canGoForward()) {
				menu.append(new MenuItem({
					label: localize('browser.contextMenu.forward', 'Forward'),
					accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.GoForward],
					click: () => webContents.navigationHistory.goForward()
				}));
			}
			menu.append(new MenuItem({
				label: localize('browser.contextMenu.reload', 'Reload'),
				accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.Reload],
				click: () => webContents.reload()
			}));
		}

		menu.append(new MenuItem({ type: 'separator' }));
		menu.append(new MenuItem({
			label: localize('browser.contextMenu.inspect', 'Inspect'),
			click: () => webContents.inspectElement(params.x, params.y)
		}));

		const viewBounds = view.getWebContentsView().getBounds();
		menu.popup({
			window: win,
			x: viewBounds.x + params.x,
			y: viewBounds.y + params.y,
			sourceType: params.menuSourceType
		});
	}
}

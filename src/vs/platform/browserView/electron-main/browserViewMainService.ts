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
import { checkAtCoderSourceResponse, extractAtCoderSourceHTML, readAtCoderSubmission } from '../common/atcoderSubmission.js';
import { atCoderFormScript, atCoderTask, IAtCoderSourcePayload, IAtCoderTaskForm } from '../common/atcoderWorkflow.js';
import { runAtCoderTransaction, reconcileAtCoderTransaction, type AtCoderAttempt } from './atcoderTransaction.js';
import { assertLuoguProblem } from '../common/luoguBridge.js';
import { runOjScript, type OjScriptTask } from './ojScriptTask.js';
import { createHash } from 'crypto';
import { LuoguSessionClient } from './luoguSessionClient.js';
import { fetchLuoguDirect } from './luoguSessionTransport.js';
import { ILogService } from '../../log/common/log.js';
// eslint-disable-next-line local/code-import-patterns -- Internal type-only DTOs for the bundled OJ extension.
import type { SubmissionOutcome, ProblemRef, ProblemDocument, RecordRef, RecordSnapshot, LoginSummary, LanguageOption, ILuoguSourcePayload } from 'becoder-oj-connect';

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
	private readonly ojReads = new Map<string, { windowId: number; operation?: string; cancel(): void }>();
	private readonly atCoderAttempts = new Map<string, { context: AtCoderAttempt; viewId: string; windowId: number; timer: ReturnType<typeof setTimeout> }>();
	private readonly luoguRequests = new Map<string, { requestId: string; windowId: number; controller: AbortController; cancel(): Promise<void> }>();
	private readonly luoguClients = new Map<string, { windowId: number; session: BrowserSession; client: LuoguSessionClient }>();
	private readonly luoguCaptchas = new Map<string, { windowId: number; client: LuoguSessionClient; signal: AbortSignal; resolve(answer: string | undefined): void }>();
	private readonly _onDidRequireLuoguCaptcha = this._register(new Emitter<{ windowId: number; requestId: string; image: string }>());
	readonly onDidRequireLuoguCaptcha = this._onDidRequireLuoguCaptcha.event;
	private readonly _onDidCancelLuoguCaptcha = this._register(new Emitter<{ windowId: number; requestId: string }>());
	readonly onDidCancelLuoguCaptcha = this._onDidCancelLuoguCaptcha.event;
	private readonly ojSessionWatchers = this._register(new DisposableMap<string>());
	private readonly _onDidChangeOjSession = this._register(new Emitter<{ windowId: number; site: 'luogu' | 'atcoder' }>());
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
	private readonly _onDidRequireOjInteraction = this._register(new Emitter<{ id: string; windowId: number }>());
	readonly onDidRequireOjInteraction = this._onDidRequireOjInteraction.event;

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
		this._register(toDisposable(() => { for (const request of this.atCoderRequests.values()) { request.abort(); } for (const request of this.luoguRequests.values()) { request.controller.abort(); } for (const { client } of this.luoguClients.values()) { client.dispose(); } this.luoguClients.clear(); }));
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
			void view.loadURL(options.initialState.url);
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

	/** Fixed owned script resources only. No operation name or script is exposed through the service API. */
	private async _runOjRead(id: string, windowId: number, expectedURL: string, operation: 'readAtCoderProblem' | 'readAtCoderLogin' | 'logoutAtCoder', input: unknown, timeoutMs = 10000, requestId = generateUuid(), task: OjScriptTask = { controller: new AbortController(), dispatched: false }): Promise<unknown> {
		const view = this._getBrowserView(id);
		if (view.owner.mainWindowId !== windowId) { throw new Error('oj-connect-owner'); }
		const contents = view.getWebContentsView().webContents;
		const canonical = (value: string) => { const url = new URL(value); url.hash = ''; return url.href; };
		const available = () => !contents.isDestroyed() && !contents.isLoading() && canonical(contents.getURL()) === canonical(expectedURL);
		if (!available()) { throw new Error('oj-connect-page-changed'); }
		const origin = new URL(expectedURL).origin;
		if (origin !== 'https://www.luogu.com.cn' && origin !== 'https://atcoder.jp') { throw new Error('oj-connect-origin'); }
		let changed = false;
		const stop = () => { changed = true; task.controller.abort(new Error('oj-connect-page-changed')); };
		const watcher = combinedDisposable(view.onDidClose(stop), view.onDidNavigate(stop));
		this.ojReads.set(requestId, { windowId, operation, cancel: stop });
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const result = await runOjScript(task, async () => {
				const script = await fs.readFile(join(this.environmentMainService.appRoot, 'extensions', 'becoder.oj-connect', 'dist', 'site-scripts.js'), 'utf8');
				if (changed || !available()) { throw new Error('oj-connect-page-changed'); }
				return script;
			}, script => {
				const code = `if (!globalThis.BeCoderOj) { ${script} }\nBeCoderOj.${operation}(${JSON.stringify(input)},${JSON.stringify(requestId)})`;
				timer = setTimeout(() => task.controller.abort(new Error('oj-connect-operation-timeout')), timeoutMs);
				return contents.executeJavaScriptInIsolatedWorld(1006, [{ code }]);
			});
			if (changed || !available()) { throw new Error('oj-connect-page-changed'); }
			if (new TextEncoder().encode(JSON.stringify(result)).length > 8 * 1024 * 1024) { throw new Error('oj-connect-response-too-large'); }
			return result;
		} finally {
			this.ojReads.delete(requestId);
			if (timer) { clearTimeout(timer); } watcher.dispose();
			if (task.dispatched && !contents.isDestroyed()) {
				const cancel = 'cancelOjRead';
				await contents.executeJavaScriptInIsolatedWorld(1006, [{ code: `globalThis.BeCoderOj?.${cancel}(${JSON.stringify(requestId)})` }]).catch(() => undefined);
			}
		}
	}

	async cancelOjOperations(windowId: number): Promise<void> {
		for (const request of this.luoguRequests.values()) { if (request.windowId === windowId) { await request.cancel(); } }
		for (const [key, entry] of this.luoguClients) { if (entry.windowId === windowId) { entry.client.dispose(); this.luoguClients.delete(key); } }
		for (const request of this.ojReads.values()) { if (request.windowId === windowId) { request.cancel(); } }
		for (const [id, request] of this.atCoderRequests) {
			try { if (this._getBrowserView(id).owner.mainWindowId === windowId) { request.abort(); } }
			catch { request.abort(); }
		}
		for (const [key, attempt] of this.atCoderAttempts) { if (attempt.windowId === windowId) { clearTimeout(attempt.timer); this.atCoderAttempts.delete(key); } }
		for (const [key, attempt] of this.luoguAttempts) { if (attempt.windowId === windowId) { clearTimeout(attempt.timer); this.luoguAttempts.delete(key); } }
	}

	async cancelOjPreparations(windowId: number): Promise<void> {
		for (const request of this.ojReads.values()) { if (request.windowId === windowId && request.operation === 'prepareLuogu') { request.cancel(); } }
	}

	async readOjProblem(id: string, windowId: number, problem: ProblemRef): Promise<ProblemDocument> {
		if (problem.site === 'luogu') { assertLuoguProblem(problem); return this.luoguClient(id, windowId).readProblem(problem, new AbortController().signal); }
		if (problem.site !== 'atcoder' || !atCoderTask(problem.url) || problem.nativeId !== atCoderTask(problem.url)!.contestId + '/' + atCoderTask(problem.url)!.taskId) { throw new Error('oj-connect-problem-route'); }
		const actualURL = this._getBrowserView(id).getWebContentsView().webContents.getURL();
		if (problem.site === 'atcoder') {
			const current = atCoderTask(actualURL);
			if (!current || current.contestId + '/' + current.taskId !== problem.nativeId) { throw new Error('oj-connect-page-changed'); }
		}
		// Canonical problem identity and the exact document being observed are separate.
		return await this._runOjRead(id, windowId, actualURL, 'readAtCoderProblem', problem) as ProblemDocument;
	}

	async watchOjSession(id: string, windowId: number): Promise<void> {
		const view = this._getBrowserView(id);
		if (view.owner.mainWindowId !== windowId) { throw new Error('oj-connect-owner'); }
		if (this.ojSessionWatchers.has(id)) { return; }
		const cookies = view.getWebContentsView().webContents.session.cookies;
		const observed = new Map<string, string>();
		const changed = (_event: Electron.Event, cookie: Electron.Cookie, _cause: string, removed: boolean) => {
			const domain = cookie.domain?.replace(/^\./, '');
			const site = domain === 'luogu.com.cn' || domain === 'www.luogu.com.cn' ? 'luogu' : domain === 'atcoder.jp' ? 'atcoder' : undefined;
			if (site && (site === 'luogu' ? ['_uid', '__client_id'].includes(cookie.name) : cookie.name === 'REVEL_SESSION')) {
				const key = domain + ':' + cookie.name, digest = String(removed) + ':' + createHash('sha256').update(cookie.value).digest('hex');
				if (observed.get(key) === digest) { return; }
				observed.set(key, digest); this._onDidChangeOjSession.fire({ windowId, site });
			}
		};
		cookies.on('changed', changed);
		const closed = view.onDidClose(() => this.ojSessionWatchers.deleteAndDispose(id));
		this.ojSessionWatchers.set(id, combinedDisposable(closed, toDisposable(() => cookies.removeListener('changed', changed))));
	}

	async openLuoguSession(windowId: number, scope: BrowserViewStorageScope): Promise<string> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (!window) { throw new Error('oj-connect-owner'); }
		this._ensureWindowCloseSubscription(windowId);
		if (scope !== BrowserViewStorageScope.Global && scope !== BrowserViewStorageScope.Workspace) { throw new Error('OJ Connect requires a persistent browser session.'); }
		if (scope === BrowserViewStorageScope.Workspace && !window.openedWorkspace?.id) { throw new Error('oj-connect-workspace-session-required'); }
		const session = BrowserSession.getOrCreate(this.instantiationService, '', { scope }, this.environmentMainService.workspaceStorageHome, window.openedWorkspace?.id);
		session.connectStorage(this.applicationStorageMainService);
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
	async updateLuoguSession(id: string, windowId: number, operation: 'logoutLuogu' | 'invalidateLuoguSession' | 'releaseLuoguRecord', record?: RecordRef): Promise<void> {
		const client = this.luoguClient(id, windowId);
		if (operation === 'logoutLuogu') { await client.logout(new AbortController().signal); }
		else if (operation === 'invalidateLuoguSession') { client.invalidate(); }
		else if (operation === 'releaseLuoguRecord' && record) { assertLuoguProblem(record.problem); client.releaseRecord(record); }
		else { throw new Error('oj-connect-operation'); }
	}
	async logoutOjSite(id: string, windowId: number, site: 'luogu' | 'atcoder'): Promise<void> {
		if (site === 'luogu') { await this.luoguClient(id, windowId).logout(new AbortController().signal); return; }
		if (site !== 'atcoder') { throw new Error('oj-connect-site'); }
		const url = this._getBrowserView(id).getURL();
		if (new URL(url).origin !== 'https://atcoder.jp') { throw new Error('oj-connect-origin'); }
		await this._runOjRead(id, windowId, url, 'logoutAtCoder', null);
	}
	async readOjLogin(id: string, windowId: number, site: 'luogu' | 'atcoder'): Promise<LoginSummary> {
		if (site === 'luogu') { return this.luoguClient(id, windowId).login(new AbortController().signal); }
		const url = this._getBrowserView(id).getURL();
		if (site !== 'atcoder' || new URL(url).origin !== 'https://atcoder.jp') { throw new Error('oj-connect-origin'); }
		return await this._runOjRead(id, windowId, url, 'readAtCoderLogin', null) as LoginSummary;
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

	async readAtCoderSubmission(id: string, windowId: number, expectedURL: string, allowMissingSource = false): Promise<string> {
		const view = this._getBrowserView(id);
		const contents = view.getWebContentsView().webContents;
		const snapshot = await readAtCoderSubmission({
			ownerWindowId: view.owner.mainWindowId,
			url: () => contents.getURL(), loading: () => contents.isLoading(), closed: () => contents.isDestroyed(),
			watchChange: listener => combinedDisposable(view.onDidNavigate(listener), view.onDidClose(listener)),
			read: async (code, signal) => {
				// Only the current official detail, using its actual session. Never follow a login redirect.
				const url = new URL(expectedURL);
				url.search = '';
				url.hash = '';
				// Electron 43 Response.url is documented as incorrect. Reject redirects in the transport instead.
				const response = await contents.session.fetch(url.href, { method: 'GET', redirect: 'error', cache: 'no-store', signal, headers: { Accept: 'text/html' } });
				checkAtCoderSourceResponse(response);
				const reader = response.body?.getReader();
				if (!reader) { throw new Error('atcoder-source-response'); }
				const chunks: Uint8Array[] = [];
				let size = 0;
				try {
					while (true) {
						const part = await reader.read();
						if (part.done) { break; }
						size += part.value.byteLength;
						if (size > 4 * 1024 * 1024) { throw new Error('atcoder-source-too-large'); }
						chunks.push(part.value);
					}
				} finally {
					await reader.cancel().catch(() => undefined);
				}
				const detailHTML = Buffer.concat(chunks).toString('utf8');
				let sourceHTML: string;
				try { sourceHTML = extractAtCoderSourceHTML(detailHTML); }
				catch (error) { if (!allowMissingSource) { throw error; } sourceHTML = ''; }
				if (signal?.aborted || contents.isDestroyed() || contents.isLoading() || contents.getURL() !== expectedURL) { throw new Error('atcoder-changed'); }
				return contents.executeJavaScriptInIsolatedWorld(1004, [{ code: code.replace(/const (sourceHTML|detailHTML) = null;/g, (_match, name: string) => `const ${name} = ${JSON.stringify(name === 'sourceHTML' ? sourceHTML : detailHTML)};`) }]);
			}
		}, windowId, expectedURL, 10000, allowMissingSource);
		return JSON.stringify({ ...snapshot, sessionScope: view.session.storageScope }, null, '\t');
	}

	async readAtCoderRecord(id: string, windowId: number, record: RecordRef): Promise<RecordSnapshot> {
		const task = atCoderTask(record?.problem?.url ?? '');
		if (!task || record.problem.site !== 'atcoder' || record.problem.nativeId !== task.contestId + '/' + task.taskId || !/^[1-9]\d*$/.test(record.id) || record.url !== `https://atcoder.jp/contests/${task.contestId}/submissions/${record.id}`) { throw new Error('atcoder-invalid-record'); }
		const snapshot = JSON.parse(await this.readAtCoderSubmission(id, windowId, record.url, true));
		if (snapshot.taskUrl !== record.problem.url) { throw new Error('atcoder-record-task-mismatch'); }
		const info = (labels: string[]) => snapshot.info.find((row: string[]) => labels.includes(row[0]))?.[1] as string | undefined;
		const rawStatus = snapshot.status;
		const phase = /^(AC|WA|CE|RE|TLE|MLE|OLE|IE|QLE)$/.test(rawStatus) ? 'finished' : /^(WJ|Waiting)$/.test(rawStatus) ? 'queued' : /^(WR|Judging|\d+\s*\/\s*\d+.*)$/.test(rawStatus) ? 'judging' : 'unknown';
		return {
			ref: record, phase, rawStatus, owner: snapshot.owner, language: info(['Language', '\u8a00\u8a9e']), score: info(['Score', '\u5f97\u70b9']), time: info(['Exec Time', '\u5b9f\u884c\u6642\u9593']), memory: info(['Memory', '\u30e1\u30e2\u30ea']),
			...(snapshot.compileMessage !== undefined ? { compileMessage: snapshot.compileMessage } : {}), ...(rawStatus === 'CE' ? { compileSucceeded: false } : {}),
			submittedAt: info(['Submission Time', '\u63d0\u51fa\u65e5\u6642']), codeLength: info(['Code Size', '\u30b3\u30fc\u30c9\u9577']), ...(snapshot.sourceRepresentation !== 'unavailable' ? { source: snapshot.source } : {}),
			groups: snapshot.tests.length ? [{ name: 'Test Cases', rows: snapshot.tests }] : [], sourceVerification: snapshot.sourceRepresentation === 'unavailable' ? 'unavailable' : 'not-checked'
		};
	}

	async reconcileAtCoderAttempt(attemptId: string, windowId: number): Promise<SubmissionOutcome> {
		const entry = this.atCoderAttempts.get(attemptId);
		if (!entry || entry.windowId !== windowId) { throw new Error('atcoder-attempt-unavailable'); }
		const task = atCoderTask(entry.context.taskURL)!;
		const problem: ProblemRef = { site: 'atcoder', nativeId: task.contestId + '/' + task.taskId, url: entry.context.taskURL };
		const view = this._getBrowserView(entry.viewId);
		if (view.owner.mainWindowId !== windowId) { throw new Error('atcoder-owner'); }
		const result = await reconcileAtCoderTransaction({ view }, entry.context);
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
		const available = () => !contents.isDestroyed() && !contents.isLoading() && contents.getURL() === expectedURL;
		if (!available()) { throw new Error('atcoder-page-changed'); }
		let changed = false;
		const watch = combinedDisposable(view.onDidNavigate(() => { changed = true; }), view.onDidClose(() => { changed = true; }));
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const result: unknown = await Promise.race([
				contents.executeJavaScriptInIsolatedWorld(1005, [{ code }]),
				new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('atcoder-form-timeout')), 6000); })
			]);
			if (changed || !available()) { throw new Error('atcoder-page-changed'); }
			if (result === 'atcoder-login-required' || result === 'atcoder-form-missing') { throw new Error(result); }
			if (!result || typeof result !== 'object') { throw new Error('atcoder-form-invalid'); }
			const data = result as IAtCoderTaskForm;
			if (typeof data.hasDraft !== 'boolean' || !Array.isArray(data.languages) || data.languages.length > 100 || data.languages.some(option => !/^\d+$/.test(option.id) || typeof option.label !== 'string' || option.label.length > 200)) { throw new Error('atcoder-form-invalid'); }
			return data;
		} finally {
			if (timer) { clearTimeout(timer); }
			watch.dispose();
		}
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
		const result = await runAtCoderTransaction({
			view: this._getBrowserView(id), requests: this.atCoderRequests,
			prepare: value => this.prepareAtCoderTask(id, windowId, expectedURL, value),
			onAttempt: value => { attempt = value; },
			onInteraction: () => this._onDidRequireOjInteraction.fire({ id, windowId })
		}, id, windowId, expectedURL, payload);
		const task = atCoderTask(expectedURL)!;
		const problem: ProblemRef = { site: 'atcoder', nativeId: task.contestId + '/' + task.taskId, url: expectedURL };
		if (result.verified && result.id && result.url) { return { kind: 'record', record: { problem, id: result.id, url: result.url } }; }
		if (!attempt) { return { kind: 'not-sent', reason: result.status }; }
		const context = attempt as AtCoderAttempt;
		const timer = setTimeout(() => this.atCoderAttempts.delete(context.id), 600000);
		this.atCoderAttempts.set(context.id, { context, viewId: id, windowId, timer });
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

				if (url) {
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { createStyleSheet } from '../../../../../base/browser/domStylesheets.js';
import { asCSSUrl } from '../../../../../base/browser/cssValue.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileAccess, builtinExtensionsPath } from '../../../../../base/common/network.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { Action2, registerAction2, MenuId, MenuRegistry, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { DropdownWithDefaultActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { BrowserViewCommandId, IBrowserViewService, ipcBrowserViewChannelName } from '../../../../../platform/browserView/common/browserView.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { GroupDirection, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditor, BrowserEditorContribution, BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from '../browserEditor.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';

export const browserProblemMenu = new MenuId('BrowserProblemActions');
const canGet = new RawContextKey('browserCanGetProblem', false);
const canImport = new RawContextKey('browserCanImportCph', false);
const importBusy = new RawContextKey('browserProblemImportBusy', false);
const ojIconUri = URI.joinPath(FileAccess.asFileUri(builtinExtensionsPath), 'becoder.oj-connect', 'resources', 'oj-connect.svg');
const cphIconUri = URI.joinPath(FileAccess.asFileUri(builtinExtensionsPath), 'becoder.cph', 'resources', 'judge.svg');
const ojIcon = { dark: ojIconUri, light: ojIconUri };
const cphIcon = { dark: cphIconUri, light: cphIconUri };

// Keep native menu rows and keyboard handling; URI icons use their existing check slot.
export class BrowserProblemActionViewContribution extends Disposable {
	static readonly ID = 'workbench.contrib.browserProblemActionView';
	constructor(@IActionViewItemService items: IActionViewItemService) {
		super();
		createStyleSheet(undefined, style => {
			style.textContent = [ojIconUri, cphIconUri].map((uri, index) => `
				.browser-problem-actions-menu .monaco-action-bar.vertical .action-item:nth-child(${index + 1}) .menu-item-check {
					visibility: visible;
					mask: ${asCSSUrl(uri)} center / 16px 16px no-repeat;
					background-color: currentColor;
				}
				.browser-problem-actions-menu .action-item:nth-child(${index + 1}) .menu-item-check::before { content: none; }
			`).join('') + '.browser-problem-actions-menu .action-item.disabled .menu-item-check { color: var(--vscode-disabledForeground); }';
		}, this._store);
		this._register(items.register(MenuId.BrowserActionsToolbar, browserProblemMenu, (action, options, instantiation) => {
			if (action instanceof SubmenuItemAction) {
				return instantiation.createInstance(DropdownWithDefaultActionViewItem, action, { ...options, togglePrimaryAction: false, menuAsChild: false, menuClassName: 'browser-problem-actions-menu' });
			}
			return undefined;
		}));
	}
}

registerWorkbenchContribution2(BrowserProblemActionViewContribution.ID, BrowserProblemActionViewContribution, WorkbenchPhase.BlockRestore);

export class BrowserProblemContribution extends BrowserEditorContribution {
	private readonly getKey: IContextKey<boolean>;
	private readonly cphKey: IContextKey<boolean>;
	private readonly busyKey: IContextKey<boolean>;
	private readonly service: IBrowserViewService;
	private readonly patterns: Promise<readonly string[]>;
	private active: AbortController | undefined;

	constructor(editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMainProcessService mainProcess: IMainProcessService,
		@ICommandService private readonly commands: ICommandService,
		@INotificationService private readonly notifications: INotificationService,
		@IEditorGroupsService private readonly groups: IEditorGroupsService
	) {
		super(editor);
		this.getKey = canGet.bindTo(contextKeyService); this.cphKey = canImport.bindTo(contextKeyService); this.busyKey = importBusy.bindTo(contextKeyService);
		this.service = ProxyChannel.toService<IBrowserViewService>(mainProcess.getChannel(ipcBrowserViewChannelName));
		this.patterns = this.service.getProblemParserPatterns().catch(error => { console.warn('[CPH] Could not read parser capabilities', error); return []; });
		this._register(toDisposable(() => { this.active?.abort(); this.getKey.reset(); this.cphKey.reset(); this.busyKey.reset(); }));
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		let live = true, revision = 0;
		const refresh = async () => {
			const version = ++revision, url = model.url;
			this.getKey.set(false); this.cphKey.set(false);
			if (model.loading) { return; }
			const [problem, patterns] = await Promise.all([
				this.service.resolveBrowserProblem(url).catch(error => { console.warn('[OJ Connect] Could not resolve browser problem', error); return undefined; }), this.patterns
			]);
			if (!live || revision !== version || model.loading || model.url !== url) { return; }
			this.getKey.set(!!problem);
			this.cphKey.set(patterns.some(pattern => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(url)));
		};
		store.add(toDisposable(() => { live = false; this.active?.abort(); }));
		store.add(model.onWillNavigate(() => { revision++; this.active?.abort(); this.getKey.set(false); this.cphKey.set(false); }));
		store.add(model.onDidNavigate(() => { void refresh(); }));
		store.add(model.onDidChangeLoadingState(() => { void refresh(); }));
		void refresh();
	}

	override onModelDetached(): void { this.active?.abort(); this.getKey.set(false); this.cphKey.set(false); }

	async run(kind: 'get' | 'cph'): Promise<void> {
		const editor = this.editor, model = editor.model;
		if (!model || model.loading) { return; }
		if (this.active) { this.notifications.info(localize('browser.problem.busy', 'A problem import is already in progress.')); return; }
		const controller = new AbortController(), requestId = generateUuid(), url = model.url;
		this.active = controller; this.busyKey.set(true);
		const check = () => { controller.signal.throwIfAborted(); if (editor.model !== model || model.loading || model.url !== url) { throw new Error(localize('browser.problem.changed', 'The problem page changed during import.')); } };
		let importCommand: 'cph' | 'ojConnect' | undefined;
		const cancel = () => { if (importCommand) { void this.commands.executeCommand(`_becoder.${importCommand}.cancelBrowserImport`, requestId).catch(() => undefined); } };
		controller.signal.addEventListener('abort', cancel, { once: true });
		try {
			if (kind === 'get') {
				const problem = await this.service.resolveBrowserProblem(url);
				check();
				if (!problem) { this.notifications.info(localize('browser.problem.unsupported', 'This page does not support OJ Connect statements.')); return; }
				const sessionId = problem.site === 'luogu'
					? await this.service.openLuoguSession(mainWindow.vscodeWindowId, model.storageScope)
					: problem.site === 'nowcoder' ? await this.service.openNowcoderSession(mainWindow.vscodeWindowId, model.storageScope) : model.id;
				check();
				const document = await this.service.readOjProblem(sessionId, mainWindow.vscodeWindowId, problem);
				check();
				importCommand = 'ojConnect';
				await this.commands.executeCommand('_becoder.ojConnect.importFromBrowser', document, requestId);
			} else {
				const browserGroup = editor.group, browserInput = editor.input;
				const existingGroups = new Set(this.groups.groups.map(group => group.id));
				const result = await this.service.parseProblem(model.id, mainWindow.vscodeWindowId);
				check();
				const target = await this.commands.executeCommand('_becoder.ojConnect.importTarget', result.url);
				check();
				importCommand = 'cph';
				const imported = await this.commands.executeCommand<{ problem: { srcPath: string } } | undefined>('_becoder.cph.importProblem', result.json, result.url, target, requestId);
				check();
				if (imported && browserInput && this.groups.getGroup(browserGroup.id) === browserGroup && browserGroup.contains(browserInput)) {
					const source = URI.file(imported.problem.srcPath);
					const sourceGroup = this.groups.groups.find(group => !existingGroups.has(group.id) && group.count === 1 && group.contains({ resource: source }));
					if (sourceGroup && sourceGroup !== browserGroup) { this.groups.moveGroup(sourceGroup, browserGroup, GroupDirection.LEFT); }
				}
			}
		} catch (error) {
			if (!controller.signal.aborted) { this.notifications.error(localize('browser.problem.failed', 'Could not import the problem: {0}', error instanceof Error ? error.message : String(error))); }
		} finally {
			controller.signal.removeEventListener('abort', cancel);
			this.active = undefined; this.busyKey.set(false);
		}
	}
}

BrowserEditor.registerContribution(BrowserProblemContribution);

MenuRegistry.appendMenuItem(MenuId.BrowserActionsToolbar, { submenu: browserProblemMenu, title: localize2('browser.problem.actions', 'Problem Actions'), icon: ojIcon, isSplitButton: true, when: BROWSER_EDITOR_ACTIVE, group: BrowserActionGroup.Tools, order: 1 });

class GetProblemAction extends Action2 {
	constructor() {
		super({
			id: BrowserViewCommandId.GetProblem, title: localize2('browser.getProblem', 'Get Problem'), tooltip: localize('browser.problem.getTooltip', 'Get Problem — OJ Connect (supported problem pages only)'), icon: ojIcon, category: BrowserActionCategory, f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, canGet, importBusy.negate()), menu: { id: browserProblemMenu, order: 1 }
		});
	}
	async run(accessor: ServicesAccessor, editor = accessor.get(IEditorService).activeEditorPane): Promise<void> { if (editor instanceof BrowserEditor) { await editor.getContribution(BrowserProblemContribution)?.run('get'); } }
}

class ImportProblemAction extends Action2 {
	constructor() {
		super({
			id: BrowserViewCommandId.ImportProblem, title: localize2('browser.importCph', 'Import to CPH'), icon: cphIcon, category: BrowserActionCategory, f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, canImport, importBusy.negate()), menu: { id: browserProblemMenu, order: 2 }
		});
	}
	async run(accessor: ServicesAccessor, editor = accessor.get(IEditorService).activeEditorPane): Promise<void> { if (editor instanceof BrowserEditor) { await editor.getContribution(BrowserProblemContribution)?.run('cph'); } }
}

registerAction2(GetProblemAction);
registerAction2(ImportProblemAction);

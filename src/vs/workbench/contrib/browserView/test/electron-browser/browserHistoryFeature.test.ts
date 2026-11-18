/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Action } from '../../../../../base/common/actions.js';
import { ToolBar } from '../../../../../base/browser/ui/toolbar/toolbar.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserHistoryStore } from '../../../../../platform/browserView/common/browserHistory.js';
import { BrowserViewCommandId, BrowserViewStorageScope } from '../../../../../platform/browserView/common/browserView.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IQuickInputButton, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IRecentFile, IRecentlyOpened } from '../../../../../platform/workspaces/common/workspaces.js';
import { BrowserHistoryFeature } from '../../electron-browser/features/browserHistoryFeature.js';
import { BrowserNavigationFeatures } from '../../electron-browser/features/browserNavigationFeatures.js';
import { BrowserUrlBarWidget } from '../../electron-browser/widgets/browserUrlBarWidget.js';
import { CONTEXT_BROWSER_STORAGE_SCOPE } from '../../electron-browser/features/browserDataStorageFeatures.js';

function fixture(store: Pick<DisposableStore, 'add'>) {
	const hidden = new Emitter<void>();
	// Close the picker while its onDidHide emitter is still alive.
	store.add({ dispose: () => hidden.fire() });
	store.add(hidden);
	const attached = store.add(new Emitter<unknown>());
	const changed = store.add(new Emitter<void>());
	const accepted = store.add(new Emitter<void>());
	const itemButton = store.add(new Emitter<{ item: IQuickPickItem; button: IQuickInputButton }>());
	const separatorButton = store.add(new Emitter<{ separator: IQuickPickSeparator; button: IQuickInputButton }>());
	const titleButton = store.add(new Emitter<IQuickInputButton>());
	const history = store.add(new BrowserHistoryStore());
	history.add('https://atcoder.jp/', 'AtCoder');
	const files: IRecentFile[] = [
		{ fileUri: URI.file('C:/practice/z.cpp'), label: 'z.cpp' },
		{ fileUri: URI.file('D:/other/a.cpp') }
	];
	const deletedFiles: URI[][] = [], openedFiles: unknown[][] = [], openedUrls: string[] = [];
	let reads = async (): Promise<IRecentlyOpened> => ({ workspaces: [], files });
	const picker = {
		items: [] as readonly (IQuickPickItem | IQuickPickSeparator)[], selectedItems: [] as IQuickPickItem[], buttons: [] as IQuickInputButton[],
		busy: false, sortByLabel: true, matchOnDescription: false, matchOnDetail: false,
		onDidAccept: accepted.event, onDidHide: hidden.event, onDidTriggerItemButton: itemButton.event,
		onDidTriggerSeparatorButton: separatorButton.event, onDidTriggerButton: titleButton.event,
		show: () => { }, hide: () => hidden.fire(), dispose: () => { }
	};
	const model = {
		history, loadURL: async (url: string) => { openedUrls.push(url); },
		deleteHistory: async (ids?: readonly number[]) => {
			if (ids) { for (const id of ids) { history.entries.delete(id); } } else { history.clear(); }
		}
	};
	const contribution = store.add(new BrowserHistoryFeature(
		{ model, onDidChangeModel: attached.event } as never,
		{ createQuickPick: () => picker } as never,
		{ onDidChangeRecentlyOpened: changed.event, getRecentlyOpened: () => reads(), removeRecentlyOpened: async (uris: URI[]) => { deletedFiles.push(uris); files.splice(files.findIndex(file => file.fileUri.toString() === uris[0].toString()), 1); changed.fire(); } } as never,
		{ openEditor: async (...args: unknown[]) => { openedFiles.push(args); } } as never,
		{ getUriLabel: (uri: URI) => uri.fsPath, getUriBasenameLabel: (uri: URI) => uri.path.split('/').pop() } as never,
	));
	attached.fire({ model });
	const settled = async () => { for (let index = 0; index < 8; index++) { await Promise.resolve(); } };
	return {
		contribution, picker, files, history, deletedFiles, openedFiles, openedUrls, settled, changed,
		setReads: (value: typeof reads) => { reads = value; },
		accept: (item: IQuickPickItem) => { picker.selectedItems = [item]; accepted.fire(); },
		remove: (item: IQuickPickItem) => itemButton.fire({ item, button: item.buttons![0] }),
		clearWeb: () => titleButton.fire(picker.buttons[0]),
	};
}

suite('Browser unified history', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	test('history remains available in every browser storage scope', () => {
		const item = MenuRegistry.getMenuItems(MenuId.BrowserActionsToolbar).filter(isIMenuItem).find(item => item.command.id === BrowserViewCommandId.ShowHistory)!;
		assert.ok(item);
		for (const scope of [BrowserViewStorageScope.Global, BrowserViewStorageScope.Workspace, BrowserViewStorageScope.Ephemeral]) {
			const context = new MockContextKeyService();
			context.createKey('activeEditor', 'workbench.editor.browser');
			context.createKey(CONTEXT_BROWSER_STORAGE_SCOPE.key, scope);
			assert.notStrictEqual(item.when?.evaluate({ getValue: key => context.getContextKeyValue(key) }), false, `History menu hidden in ${scope}`);
			assert.notStrictEqual(item.command.precondition?.evaluate({ getValue: key => context.getContextKeyValue(key) }), false, `History command disabled in ${scope}`);
		}
	});
	test('narrow navigation keeps history inline while other actions overflow, then restores them', () => {
		let actionsToolbar: ToolBar | undefined;
		const instantiation = {
			createChild: () => instantiation,
			createInstance: (ctor: unknown, ...args: unknown[]) => {
				if (ctor === MenuWorkbenchToolBar) {
					const toolbar = new ToolBar(args[0] as HTMLElement, { showContextMenu: () => { } }, args[2] as ConstructorParameters<typeof ToolBar>[2]);
					if (args[1] === MenuId.BrowserActionsToolbar) { actionsToolbar = toolbar; }
					return toolbar;
				}
				if (ctor === BrowserUrlBarWidget) {
					return { element: document.createElement('div'), dispose: () => { } };
				}
				return { dispose: () => { } };
			},
		};
		const feature = store.add(new BrowserNavigationFeatures(
			{ onDidChangeModel: Event.None } as never, instantiation as never, new MockContextKeyService(),
			{ getValue: () => undefined, onDidChangeConfiguration: Event.None } as never, {} as never,
		));
		const navbar = feature.widgets[0].element;
		document.body.appendChild(navbar);
		store.add({ dispose: () => navbar.remove() });
		let width = 340;
		navbar.getBoundingClientRect = () => new DOMRect(0, 0, width, 32);
		navbar.children[1].getBoundingClientRect = () => new DOMRect(140, 0, width - 140, 32);
		const items = MenuRegistry.getMenuItems(MenuId.BrowserActionsToolbar).filter(isIMenuItem)
			.filter(item => item.command.id === BrowserViewCommandId.ShowHistory || item.command.id === BrowserViewCommandId.OpenExternal)
			.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || (a.order ?? 0) - (b.order ?? 0));
		assert.strictEqual(items.length, 2);
		const toolbar = actionsToolbar!;
		toolbar.setActions(items.map(item => store.add(new Action(item.command.id, item.command.id))));
		const visibleIds = () => Array.from({ length: toolbar.getItemsLength() }, (_, index) => toolbar.getItemAction(index)?.id);
		assert.ok(visibleIds().includes(BrowserViewCommandId.ShowHistory), 'History must stay inline at narrow widths');
		assert.ok(!visibleIds().includes(BrowserViewCommandId.OpenExternal));
		assert.strictEqual(toolbar.hasOverflow(), true);
		width = 1400;
		toolbar.relayout();
		assert.ok(visibleIds().includes(BrowserViewCommandId.ShowHistory));
		assert.ok(visibleIds().includes(BrowserViewCommandId.OpenExternal));
		assert.strictEqual(toolbar.hasOverflow(), false);
	});
	test('groups native recent files before website history and preserves recency order', async () => {
		const f = fixture(store);
		f.contribution.showManagementPicker(); await f.settled();
		assert.deepStrictEqual(f.picker.items.filter(item => item.type !== 'separator').map(item => item.label), ['z.cpp', 'a.cpp', 'AtCoder']);
		assert.strictEqual(f.picker.items.filter(item => item.type === 'separator').length, 2);
		assert.strictEqual(f.picker.sortByLabel, false);
		assert.strictEqual(f.picker.matchOnDescription, true);
	});
	test('opens a recent file with native group selection and never navigates the webpage', async () => {
		const f = fixture(store);
		f.contribution.showManagementPicker(); await f.settled();
		f.accept(f.picker.items.find(item => item.type !== 'separator') as IQuickPickItem);
		assert.deepStrictEqual(f.openedFiles, [[{ resource: f.files[0].fileUri, options: { pinned: true } }]]);
		assert.deepStrictEqual(f.openedUrls, []);
	});
	test('removes files through native recents and clears only website history', async () => {
		const f = fixture(store);
		f.contribution.showManagementPicker(); await f.settled();
		const removed = f.files[0].fileUri;
		f.remove(f.picker.items.find(item => item.type !== 'separator') as IQuickPickItem); await f.settled();
		assert.deepStrictEqual(f.deletedFiles, [[removed]]);
		assert.strictEqual(f.history.entries.items.length, 1);
		f.clearWeb(); await f.settled();
		assert.strictEqual(f.history.entries.items.length, 0);
		assert.deepStrictEqual(f.picker.items.filter(item => item.type !== 'separator').map(item => item.label), ['a.cpp']);
	});
	test('opens website records in the captured browser model', async () => {
		const f = fixture(store);
		f.contribution.showManagementPicker(); await f.settled();
		f.accept(f.picker.items.find(item => item.label === 'AtCoder') as IQuickPickItem);
		assert.deepStrictEqual(f.openedUrls, ['https://atcoder.jp/']);
		assert.deepStrictEqual(f.openedFiles, []);
	});
	test('address-bar history suggestions remain web-only', async () => {
		const f = fixture(store);
		f.contribution.showManagementPicker(); await f.settled();
		const suggestions = await f.contribution.urlSuggestionProviders[1].getSuggestions({ input: { url: '' } as never, text: 'atcoder' }, CancellationToken.None);
		assert.deepStrictEqual(suggestions.map(item => item.label), ['AtCoder']);
	});
	test('ignores a stale async recent-file read after a newer refresh', async () => {
		const f = fixture(store), pending = new DeferredPromise<IRecentlyOpened>();
		f.setReads(() => pending.p);
		f.contribution.showManagementPicker();
		f.setReads(async () => ({ workspaces: [], files: [{ fileUri: URI.file('C:/new.cpp') }] }));
		f.changed.fire(); await f.settled();
		await pending.complete({ workspaces: [], files: f.files }); await f.settled();
		assert.deepStrictEqual(f.picker.items.filter(item => item.type !== 'separator').map(item => item.label), ['new.cpp', 'AtCoder']);
	});
});

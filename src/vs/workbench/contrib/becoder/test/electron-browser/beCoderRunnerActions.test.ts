/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
// eslint-disable-next-line local/code-import-patterns -- Isolated Electron test reads the real contribution manifest and labels.
import fs from 'fs';
// eslint-disable-next-line local/code-import-patterns -- Resolve the Runner extension fixture from the source checkout.
import path from 'path';
import { FileAccess } from '../../../../../base/common/network.js';
import { IAction } from '../../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { DropdownWithDefaultActionViewItem, IDropdownWithDefaultActionViewItemOptions, IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { EditorTabsControl } from '../../../../browser/parts/editor/editorTabsControl.js';
import { BrowserTitlebarPart } from '../../../../browser/parts/titlebar/titlebarPart.js';
import { BeCoderRunnerActionViewContribution, beCoderRunnerMenu } from '../../electron-browser/beCoderRunner.contribution.js';

suite('BeCoder native Run menu', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const locale of ['en', 'zh-cn']) {
		for (const route of ['factory', 'editor', 'titlebar']) {
			test(`${locale} ${route} renders one native split button, orders both commands and keeps Run as the primary`, async () => {
				const root = path.resolve(FileAccess.asFileUri('vs/base/common/network.js').fsPath, '../../../../..');
				const directory = path.join(root, 'extensions/danielpinto8zz6.c-cpp-compile-run');
				const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')) as { contributes: { commands: { command: string; title: string; icon: string }[]; menus: Record<string, { command: string }[]> } };
				const labels = JSON.parse(fs.readFileSync(path.join(directory, locale === 'en' ? 'package.nls.json' : 'package.nls.zh-cn.json'), 'utf8')) as Record<string, string>;
				const calls: string[] = [];
				const commands = { executeCommand: async (id: string) => { calls.push(id); } };
				const context = new MockContextKeyService();
				const keybindings = new MockKeybindingService();
				keybindings.appendKeybinding = (label, id) => `${label} (${id.endsWith('runWithInput') ? 'Shift+F5' : 'F5'})`;
				const actions = manifest.contributes.menus['becoder.runner.runMenu'].map(entry => {
					const command = manifest.contributes.commands.find(command => command.command === entry.command)!;
					return new MenuItemAction({ id: command.command, title: labels[command.title.slice(1, -1)], icon: ThemeIcon.fromString(command.icon) }, undefined, undefined, undefined, undefined, context, commands as never);
				});
				const submenu = new SubmenuItemAction({ submenu: beCoderRunnerMenu, title: labels['command.run'] }, undefined, actions);
				let factory: IActionViewItemFactory | undefined;
				store.add(new BeCoderRunnerActionViewContribution({
					register: (menu: MenuId, item: MenuId, provider: IActionViewItemFactory) => {
						assert.strictEqual(menu, MenuId.EditorTitle); assert.strictEqual(item, beCoderRunnerMenu); factory = provider; return { dispose() { } };
					}
				} as never));
				const viewItems = {
					lookUp: (menu: MenuId, id: MenuId | string) => menu === MenuId.EditorTitle && (id instanceof MenuId ? id.id : id) === beCoderRunnerMenu.id ? factory : undefined,
				};
				let menuActions: readonly IAction[] = [];
				const contextMenu = { showContextMenu: (delegate: IContextMenuDelegate) => { menuActions = delegate.getActions(); } };
				const storage = store.add(new InMemoryStorageService());
				const instantiation = {
					invokeFunction: (fn: (accessor: ServicesAccessor) => unknown) => fn({ get: (service: unknown) => { assert.strictEqual(service, IActionViewItemService); return viewItems; } } as unknown as ServicesAccessor),
					createInstance: (ctor: unknown, action: MenuItemAction | SubmenuItemAction, options: IMenuEntryActionViewItemOptions | IDropdownWithDefaultActionViewItemOptions) => {
						if (ctor === DropdownWithDefaultActionViewItem) { return new DropdownWithDefaultActionViewItem(action as SubmenuItemAction, options, keybindings, {} as never, contextMenu as never, {} as never, instantiation, storage, commands as never); }
						assert.strictEqual(ctor, MenuEntryActionViewItem);
						return new MenuEntryActionViewItem(action as MenuItemAction, options, keybindings, {} as never, context, new TestThemeService(), contextMenu as never, {} as never);
					}
				} as unknown as IInstantiationService;
				const options = { icon: true, label: false };
				const item = store.add(route === 'factory' ? factory!(submenu, options, instantiation, 1)!
					: route === 'editor' ? Reflect.get(EditorTabsControl.prototype, 'actionViewItemProvider').call({
						instantiationService: instantiation, parent: document.body, groupView: {},
					}, submenu, options)
						: Reflect.get(BrowserTitlebarPart.prototype, 'actionViewItemProvider').call({
							actionViewItemService: viewItems, instantiationService: instantiation, element: document.body, isAuxiliary: true, editorGroupsContainer: {},
						}, submenu, options));
				assert.ok(item instanceof DropdownWithDefaultActionViewItem);
				const host = document.createElement('div'); document.body.appendChild(host); store.add({ dispose: () => host.remove() }); item.render(host);
				assert.ok(host.classList.contains('monaco-dropdown-with-default'));
				assert.strictEqual(host.querySelectorAll('.action-container').length, 1);
				const primary = host.querySelector<HTMLElement>('.action-container .action-label')!;
				assert.strictEqual(primary.getAttribute('aria-label'), labels['command.run'] + ' (F5)');
				primary.click(); await Promise.resolve(); await Promise.resolve();
				assert.deepStrictEqual(calls, ['becoder.runner.run']);
				host.querySelector<HTMLElement>('.dropdown-action-container .action-label')!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
				assert.deepStrictEqual(menuActions.map(action => action.id), ['becoder.runner.run', 'becoder.runner.runWithInput']);
				assert.deepStrictEqual(menuActions.map(action => action.label), [labels['command.run'], labels['command.runWithInput']]);
				await menuActions[1].run();
				primary.click(); await Promise.resolve(); await Promise.resolve();
				assert.deepStrictEqual(calls, ['becoder.runner.run', 'becoder.runner.runWithInput', 'becoder.runner.run']);
				item.focus();
				assert.ok(host.querySelector('.action-container')?.contains(document.activeElement));
				host.querySelector('.action-container')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
				assert.ok(host.querySelector('.dropdown-action-container')?.contains(document.activeElement));
				host.querySelector('.dropdown-action-container')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', keyCode: 37, bubbles: true }));
				assert.ok(host.querySelector('.action-container')?.contains(document.activeElement));
			});
		}
	}
});

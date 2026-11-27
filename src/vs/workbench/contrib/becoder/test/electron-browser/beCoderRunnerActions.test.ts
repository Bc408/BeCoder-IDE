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
import { IActionViewItemFactory } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { DropdownWithDefaultActionViewItem, IDropdownWithDefaultActionViewItemOptions, IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { BeCoderRunnerActionViewContribution, beCoderRunnerMenu } from '../../electron-browser/beCoderRunner.contribution.js';

suite('BeCoder native Run menu', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const locale of ['en', 'zh-cn']) {
		test(`${locale} renders one native split button, orders both commands and keeps Run as the primary`, async () => {
			const root = path.resolve(FileAccess.asFileUri('vs/base/common/network.js').fsPath, '../../../../..');
			const directory = path.join(root, 'extensions/danielpinto8zz6.c-cpp-compile-run');
			const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')) as { contributes: { commands: { command: string; title: string; icon: string }[]; menus: Record<string, { command: string }[]> } };
			const labels = JSON.parse(fs.readFileSync(path.join(directory, locale === 'en' ? 'package.nls.json' : 'package.nls.zh-cn.json'), 'utf8')) as Record<string, string>;
			const calls: string[] = [];
			const commands = { executeCommand: async (id: string) => { calls.push(id); } };
			const context = new MockContextKeyService();
			const keybindings = new MockKeybindingService();
			keybindings.appendKeybinding = (label, id) => `${label} (${id.endsWith('runWithInput') ? 'Shift+F6' : 'F6'})`;
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
			let menuActions: readonly IAction[] = [];
			const contextMenu = { showContextMenu: (delegate: IContextMenuDelegate) => { menuActions = delegate.getActions(); } };
			const storage = store.add(new InMemoryStorageService());
			const instantiation = {
				createInstance: (ctor: unknown, action: MenuItemAction | SubmenuItemAction, options: IMenuEntryActionViewItemOptions | IDropdownWithDefaultActionViewItemOptions) => {
					if (ctor === DropdownWithDefaultActionViewItem) { return new DropdownWithDefaultActionViewItem(action as SubmenuItemAction, options, keybindings, {} as never, contextMenu as never, {} as never, instantiation, storage, commands as never); }
					assert.strictEqual(ctor, MenuEntryActionViewItem);
					return new MenuEntryActionViewItem(action as MenuItemAction, options, keybindings, {} as never, context, new TestThemeService(), contextMenu as never, {} as never);
				}
			} as unknown as IInstantiationService;
			const item = store.add(factory!(submenu, { icon: true, label: false }, instantiation, 1)!);
			assert.ok(item instanceof DropdownWithDefaultActionViewItem);
			const host = document.createElement('div'); document.body.appendChild(host); store.add({ dispose: () => host.remove() }); item.render(host);
			assert.ok(host.classList.contains('monaco-dropdown-with-default'));
			assert.strictEqual(host.querySelectorAll('.action-container').length, 1);
			const primary = host.querySelector<HTMLElement>('.action-container .action-label')!;
			assert.strictEqual(primary.getAttribute('aria-label'), labels['command.run'] + ' (F6)');
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
});

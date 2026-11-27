/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
// eslint-disable-next-line local/code-import-patterns -- This Electron-only test reads the source contribution manifests.
import fs from 'fs';
// eslint-disable-next-line local/code-import-patterns -- Resolve source fixture paths from the Electron test output root.
import path from 'path';
import { FileAccess } from '../../../../../base/common/network.js';
import { getBaseLayerHoverDelegate, setBaseLayerHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';

suite('Built-in toolbar tooltip text', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Explorer and Runner hover text is localized, unbranded and retains shortcut hints', () => {
		const root = path.resolve(FileAccess.asFileUri('vs/base/common/network.js').fsPath, '../../../../..');
		const previous = getBaseLayerHoverDelegate();
		const contents = new Map<HTMLElement, unknown>();
		setBaseLayerHoverDelegate({
			...previous, setupManagedHover: (_delegate, element, content) => {
				contents.set(element, content);
				return { dispose() { contents.delete(element); }, show() { }, hide() { }, update(value) { contents.set(element, value); } };
			}
		});
		try {
			for (const [folder, cases] of [
				['becoder.setup', [['becoder.showAllFiles', 'Show All Files', '显示所有文件', ''], ['becoder.hideSetupFiles', 'Hide Configuration and Executable Files', '隐藏配置和可执行文件', '']]],
				['danielpinto8zz6.c-cpp-compile-run', [['becoder.runner.run', 'Run', '运行', 'F6'], ['becoder.runner.runWithInput', 'Run With Input', '使用输入文件运行', 'Shift+F6']]],
			] as const) {
				const directory = path.join(root, 'extensions', folder);
				const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')) as { contributes: { commands: { command: string; title: string; category: string }[] } };
				for (const [locale, languageIndex] of [['package.nls.json', 1], ['package.nls.zh-cn.json', 2]] as const) {
					const labels = JSON.parse(fs.readFileSync(path.join(directory, locale), 'utf8')) as Record<string, string>;
					for (const entry of cases) {
						const command = manifest.contributes.commands.find(command => command.command === entry[0])!;
						const title = labels[command.title.slice(1, -1)];
						const binding = entry[3];
						const keybindings = new MockKeybindingService();
						keybindings.appendKeybinding = label => binding ? `${label} (${binding})` : label;
						const action = new MenuItemAction({ id: command.command, title, tooltip: title, category: command.category }, undefined, undefined, undefined, undefined, new MockContextKeyService(), {} as never);
						const item = store.add(new MenuEntryActionViewItem(action, undefined, keybindings, {} as never, new MockContextKeyService(), {} as never, {} as never, {} as never));
						const host = document.createElement('div'); document.body.appendChild(host); store.add({ dispose: () => host.remove() });
						item.render(host);
						const expected = entry[languageIndex] + (binding ? ` (${binding})` : '');
						assert.strictEqual(contents.get(host), expected, `${command.command} ${locale}: managed hover text`);
						assert.strictEqual(host.querySelector('.action-label')?.getAttribute('aria-label'), expected);
						assert.ok(!String(contents.get(host)).includes('BeCoder'));
					}
				}
			}
		} finally { setBaseLayerHoverDelegate(previous); }
	});
});

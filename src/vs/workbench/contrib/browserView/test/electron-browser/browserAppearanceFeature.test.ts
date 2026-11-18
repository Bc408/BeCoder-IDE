/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { TestColorTheme } from '../../../../../platform/theme/test/common/testThemeService.js';
import { BrowserColorTheme, BrowserColorThemeSettingId, resolveBrowserAppearance } from '../../common/browserAppearance.js';
import { BrowserAppearanceFeature } from '../../electron-browser/features/browserAppearanceFeature.js';
import { BrowserProblemActionViewContribution } from '../../electron-browser/features/browserProblemFeature.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';

suite('Browser appearance', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('default follows the editor background and all editor color schemes', () => {
		for (const type of Object.values(ColorScheme)) {
			const expected = type === ColorScheme.DARK || type === ColorScheme.HIGH_CONTRAST_DARK ? 'dark' : 'light';
			assert.deepStrictEqual(resolveBrowserAppearance(undefined, new TestColorTheme({ 'editor.background': '#123456' }, type)), { colorScheme: expected, backgroundColor: '#123456' });
		}
	});

	test('explicit preferences override an opposite editor theme', () => {
		assert.deepStrictEqual(resolveBrowserAppearance('light', new TestColorTheme({}, ColorScheme.DARK)), { colorScheme: 'light', backgroundColor: '#ffffff' });
		assert.deepStrictEqual(resolveBrowserAppearance('dark', new TestColorTheme({}, ColorScheme.LIGHT)), { colorScheme: 'dark', backgroundColor: '#1f1f1f' });
	});

	test('native setting defaults to following BeCoder', () => {
		const property = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[BrowserColorThemeSettingId];
		assert.strictEqual(property.default, 'auto');
		assert.deepStrictEqual(property.enum, ['auto', 'light', 'dark']);
	});

	test('live changes apply to browser chrome and homepage without changing surrounding editor colors', () => {
		let setting: BrowserColorTheme = 'auto';
		let theme = new TestColorTheme({ 'editor.background': '#202020' }, ColorScheme.DARK);
		const configurationChanged = store.add(new Emitter<IConfigurationChangeEvent>());
		const themeChanged = store.add(new Emitter<TestColorTheme>());
		const host = document.createElement('div');
		host.style.setProperty('--vscode-editor-background', '#202020');
		host.innerHTML = '<div class="browser-root"><div class="browser-navbar"></div><div class="browser-container"><div class="browser-welcome-container"></div></div></div>';
		document.body.appendChild(host);
		store.add({ dispose: () => host.remove() });
		const root = host.querySelector<HTMLElement>('.browser-root')!;
		const feature = store.add(new BrowserAppearanceFeature({ onDidChangeModel: Event.None } as never, {
			getValue: () => setting, onDidChangeConfiguration: configurationChanged.event,
		} as never, {
			getColorTheme: () => theme, onDidColorThemeChange: themeChanged.event,
		} as never));
		feature.onContainerCreated(root.querySelector<HTMLElement>('.browser-container')!);
		const colors = () => ['.browser-navbar', '.browser-welcome-container'].map(selector => getWindow(root).getComputedStyle(root.querySelector(selector)!).backgroundColor);
		assert.strictEqual(root.style.colorScheme, 'dark');
		assert.deepStrictEqual(colors(), ['rgb(32, 32, 32)', 'rgb(32, 32, 32)']);

		setting = 'light';
		configurationChanged.fire({ affectsConfiguration: (key): boolean => key === BrowserColorThemeSettingId } as IConfigurationChangeEvent);
		assert.strictEqual(root.style.colorScheme, 'light');
		assert.deepStrictEqual(colors(), ['rgb(255, 255, 255)', 'rgb(255, 255, 255)']);
		assert.strictEqual(host.style.getPropertyValue('--vscode-editor-background'), '#202020');

		setting = 'dark';
		configurationChanged.fire({ affectsConfiguration: (key): boolean => key === BrowserColorThemeSettingId } as IConfigurationChangeEvent);
		assert.deepStrictEqual(colors(), ['rgb(31, 31, 31)', 'rgb(31, 31, 31)']);

		setting = 'auto';
		configurationChanged.fire({ affectsConfiguration: (key): boolean => key === BrowserColorThemeSettingId } as IConfigurationChangeEvent);
		theme = new TestColorTheme({}, ColorScheme.LIGHT);
		host.style.setProperty('--vscode-editor-background', '#ffffff');
		themeChanged.fire(theme);
		assert.strictEqual(root.style.colorScheme, 'light');
		assert.deepStrictEqual(colors(), ['rgb(255, 255, 255)', 'rgb(255, 255, 255)']);
	});

	test('problem toolbar icon follows the browser palette instead of its SVG color', () => {
		store.add(new BrowserProblemActionViewContribution({ register: () => ({ dispose() { } }) } as never));
		const root = document.createElement('div');
		root.className = 'browser-root';
		root.innerHTML = '<div class="browser-actions-toolbar"><div class="menu-entry"><a class="action-label icon"></a></div></div>';
		root.querySelector<HTMLElement>('.menu-entry')!.dataset.commandId = BrowserViewCommandId.GetProblem;
		const icon = root.querySelector<HTMLElement>('.action-label')!;
		icon.style.backgroundImage = 'url("fixture.svg")';
		document.body.appendChild(root);
		store.add({ dispose: () => root.remove() });
		for (const [theme, color] of [['light', 'rgb(66, 66, 66)'], ['dark', 'rgb(204, 204, 204)']]) {
			root.dataset.browserTheme = theme;
			const style = getWindow(root).getComputedStyle(icon);
			assert.strictEqual(style.backgroundImage, 'none');
			assert.ok(style.maskImage.includes('oj-connect.svg'));
			assert.strictEqual(style.backgroundColor, color);
		}
	});
});

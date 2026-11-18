/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { BrowserWindow, nativeImage } from 'electron';
import { generateUuid } from '../../../../base/common/uuid.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { BrowserView } from '../../electron-main/browserView.js';
import { BrowserViewDebugger } from '../../electron-main/browserViewDebugger.js';
import { BrowserViewEmulator } from '../../electron-main/browserViewEmulator.js';

// Run in Electron's main process: this fixture captures real Chromium rendering.
suite('Browser automatic dark appearance', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let window: BrowserWindow;
	let emulator: BrowserViewEmulator;
	let debuggerConnection: BrowserViewDebugger;

	setup(() => {
		window = new BrowserWindow({
			show: false,
			width: 480,
			height: 320,
			webPreferences: { offscreen: true, backgroundThrottling: false, partition: generateUuid() }
		});
		const browser = upcastPartial<BrowserView>({ webContents: window.webContents });
		debuggerConnection = store.add(new BrowserViewDebugger(browser, new NullLogService()));
		Object.assign(browser, { debugger: debuggerConnection });
		emulator = store.add(new BrowserViewEmulator(browser, new NullLogService()));
	});

	teardown(() => {
		emulator.dispose();
		debuggerConnection.dispose();
		window.destroy();
	});

	async function loadPage(style = ''): Promise<void> {
		await window.loadURL(`data:text/html,${encodeURIComponent(`<!doctype html><style>html { background: white; color: black; } ${style}</style><p>Browser theme fixture</p>`)}`);
	}

	async function background(): Promise<number[]> {
		const screenshot = await debuggerConnection.sendCommandRaw('Page.captureScreenshot', {
			format: 'png', clip: { x: 8, y: 80, width: 1, height: 1, scale: 1 }
		}) as { data: string };
		const pixel = nativeImage.createFromBuffer(Buffer.from(screenshot.data, 'base64')).toBitmap();
		return [...pixel.subarray(0, 3)];
	}

	test('darkens a light page without changing its CSS and restores light rendering', async () => {
		await loadPage();
		await emulator.setColorScheme('light');
		assert.deepStrictEqual(await background(), [255, 255, 255]);
		await emulator.setColorScheme('dark');
		assert.ok((await background()).every(channel => channel < 100), 'light content should render dark');
		assert.deepStrictEqual(await window.webContents.executeJavaScript(`({
			background: getComputedStyle(document.documentElement).backgroundColor,
			dark: matchMedia('(prefers-color-scheme: dark)').matches
		})`), { background: 'rgb(255, 255, 255)', dark: true });
		await emulator.setColorScheme('light');
		assert.deepStrictEqual(await background(), [255, 255, 255]);
	});

	test('respects a page explicitly opting out with color-scheme only light', async () => {
		await loadPage('html { color-scheme: only light; }');
		await emulator.setColorScheme('dark');
		assert.deepStrictEqual(await background(), [255, 255, 255]);
	});

	test('preserves a page declaring its own dark color scheme', async () => {
		await loadPage('html { color-scheme: dark; background: #121212; color: #eeeeee; }');
		await emulator.setColorScheme('dark');
		assert.deepStrictEqual(await background(), [18, 18, 18]);
	});

	test('applies the current theme to a newly navigated page', async () => {
		await loadPage();
		await emulator.setColorScheme('dark');
		await loadPage('body { margin: 12px; }');
		assert.ok((await background()).every(channel => channel < 100));
	});
});

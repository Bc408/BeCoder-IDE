/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { BrowserViewEmulator } from '../../electron-main/browserViewEmulator.js';
import type { BrowserView } from '../../electron-main/browserView.js';

suite('Browser appearance and device media', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture() {
		const commands: { method: string; params: unknown }[] = [];
		const contents = Object.assign(new EventEmitter(), {
			getUserAgent: () => 'fixture', getURL: () => 'https://example.com/', isDestroyed: () => false,
			setUserAgent: () => { }, enableDeviceEmulation: () => { }, disableDeviceEmulation: () => { }
		});
		const browser = {
			webContents: contents, debugger: {
				registerCommandInterceptor: () => ({ dispose() { } }),
				sendCommandRaw: async (method: string, params: unknown) => { commands.push({ method, params }); }
			}
		} as unknown as BrowserView;
		const emulator = store.add(new BrowserViewEmulator(browser, new NullLogService()));
		const media = () => commands.filter(command => command.method === 'Emulation.setEmulatedMedia').at(-1)?.params;
		const autoDark = () => commands.filter(command => command.method === 'Emulation.setAutoDarkModeOverride');
		const settled = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); } };
		return { emulator, contents, media, autoDark, settled };
	}

	test('dark theme enables automatic page darkening and light theme disables it', async () => {
		const f = fixture();
		await f.emulator.setColorScheme('dark');
		await f.emulator.setColorScheme('light');
		assert.deepStrictEqual(f.autoDark().map(command => command.params), [{ enabled: true }, { enabled: false }]);
	});

	test('navigation restores automatic darkening after device emulation changes', async () => {
		const f = fixture();
		await f.emulator.setColorScheme('dark');
		await f.emulator.setDevice({ mobile: true });
		await f.settled();
		await f.emulator.setDevice(undefined);
		await f.settled();
		const beforeNavigation = f.autoDark().length;
		f.contents.emit('did-navigate');
		await f.settled();
		assert.strictEqual(f.autoDark().length, beforeNavigation + 1);
		assert.deepStrictEqual(f.autoDark().at(-1)?.params, { enabled: true });
	});

	test('rapid theme changes leave both media and automatic darkening on the latest theme', async () => {
		const f = fixture();
		await Promise.all([f.emulator.setColorScheme('dark'), f.emulator.setColorScheme('light')]);
		assert.deepStrictEqual(f.media(), { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
		assert.deepStrictEqual(f.autoDark().at(-1)?.params, { enabled: false });
	});

	test('color preference survives enabling and disabling mobile emulation', async () => {
		const f = fixture();
		await f.emulator.setColorScheme('dark');
		assert.deepStrictEqual(f.media(), { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
		await f.emulator.setDevice({ mobile: true });
		await f.settled();
		assert.deepStrictEqual(f.media(), { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'pointer', value: 'coarse' }] });
		await f.emulator.setDevice(undefined);
		await f.settled();
		assert.deepStrictEqual(f.media(), { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
	});

	test('navigation restores the latest preference without a device profile', async () => {
		const f = fixture();
		await f.emulator.setColorScheme('dark');
		await f.emulator.setColorScheme('light');
		f.contents.emit('did-navigate');
		await f.settled();
		assert.deepStrictEqual(f.media(), { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
	});

	test('dispose removes the navigation listener', () => {
		const f = fixture();
		assert.strictEqual(f.contents.listenerCount('did-navigate'), 1);
		f.emulator.dispose();
		assert.strictEqual(f.contents.listenerCount('did-navigate'), 0);
	});
});

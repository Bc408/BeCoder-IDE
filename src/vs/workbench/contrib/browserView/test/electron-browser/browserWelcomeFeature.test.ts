/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserWelcomeFeature } from '../../electron-browser/features/browserWelcomeFeature.js';
import { BrowserEditor } from '../../electron-browser/browserEditor.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { IConfigurationService, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';

suite('Browser navigation homepage', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture() {
		const navigations: string[] = [];
		const errors: unknown[] = [];
		const commands: { id: string; args: unknown[] }[] = [];
		const change = disposables.add(new Emitter<IConfigurationChangeEvent>());
		const values: Record<string, unknown> = {
			'workbench.browser.searchEngine': 'bing',
			'becoder.welcome.onlineJudgeSites': { AtCoder: 'https://atcoder.jp/' },
			'becoder.welcome.onlineJudges': ['AtCoder']
		};
		const input = { url: '', model: {} as IBrowserViewModel | undefined, resolve: async () => input.model!, isDisposed: () => false, navigate: (url: string) => navigations.push(url) };
		const modelChange = disposables.add(new Emitter<{ model: IBrowserViewModel; isNew: boolean }>());
		const browserContainer = document.createElement('div');
		browserContainer.tabIndex = 0;
		document.body.appendChild(browserContainer);
		disposables.add({ dispose: () => browserContainer.remove() });
		const editor = { input, browserContainer, onDidChangeModel: modelChange.event } as unknown as BrowserEditor;
		const feature = disposables.add(new BrowserWelcomeFeature(editor,
			{ getValue: (key: string) => values[key], onDidChangeConfiguration: change.event } as unknown as IConfigurationService,
			{ executeCommand: async (id: string, ...args: unknown[]) => { commands.push({ id, args }); } } as unknown as ICommandService,
			{ error: (error: unknown) => errors.push(error) } as unknown as INotificationService));
		const container = feature.widgets[0].element;
		browserContainer.appendChild(container);
		return { feature, container, input, editor, values, navigations, errors, commands, change, modelChange, browserContainer };
	}

	for (const action of ['search', 'site']) {
		test(`${action} waits for the first browser model before navigating`, async () => {
			const f = fixture();
			const ready = new DeferredPromise<IBrowserViewModel>();
			f.input.model = undefined;
			f.input.resolve = () => ready.p;
			if (action === 'search') {
				f.container.querySelector<HTMLInputElement>('input')!.value = 'first search';
				f.container.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
			} else {
				f.container.querySelector<HTMLButtonElement>('.browser-home-site')!.click();
			}
			assert.deepStrictEqual(f.navigations, []);
			f.input.model = {} as IBrowserViewModel;
			await ready.complete(f.input.model);
			assert.deepStrictEqual(f.navigations, [action === 'search' ? 'https://www.bing.com/search?q=first+search' : 'https://atcoder.jp/']);
		});
	}

	test('pending homepage navigation does not target a replacement tab', async () => {
		const f = fixture();
		const ready = new DeferredPromise<IBrowserViewModel>();
		f.input.model = undefined;
		f.input.resolve = () => ready.p;
		f.container.querySelector<HTMLButtonElement>('.browser-home-site')!.click();
		Object.assign(f.editor, { input: undefined });
		await ready.complete({} as IBrowserViewModel);
		assert.deepStrictEqual(f.navigations, []);
	});

	test('failed model creation reports the error without navigating', async () => {
		const f = fixture();
		const error = new Error('Browser model creation failed');
		const ready = new DeferredPromise<IBrowserViewModel>();
		f.input.model = undefined;
		f.input.resolve = () => ready.p;
		f.container.querySelector<HTMLButtonElement>('.browser-home-site')!.click();
		await ready.error(error);
		assert.deepStrictEqual(f.errors, [error]);
		assert.deepStrictEqual(f.navigations, []);
	});

	test('homepage search and website links navigate the same tab', () => {
		const f = fixture();
		const search = f.container.querySelector<HTMLInputElement>('input[type="search"]');
		assert.ok(search, 'Homepage needs its own search input');
		search.value = 'dynamic programming';
		search.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
		assert.deepStrictEqual(f.navigations, ['https://www.bing.com/search?q=dynamic+programming']);
		f.container.querySelector<HTMLButtonElement>('.browser-home-site')!.click();
		assert.strictEqual(f.navigations[1], 'https://atcoder.jp/');
	});

	test('custom engines are read live and URLs bypass search', () => {
		const f = fixture();
		f.values['workbench.browser.searchEngine'] = 'Practice';
		f.values['workbench.browser.customSearchEngines'] = { Practice: 'https://example.com/?q={query}' };
		const search = f.container.querySelector<HTMLInputElement>('input[type="search"]')!;
		assert.ok(search);
		search.value = 'a & b';
		search.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
		search.value = 'atcoder.jp';
		search.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
		assert.deepStrictEqual(f.navigations, ['https://example.com/?q=a%20%26%20b', 'atcoder.jp']);
	});

	test('creation uses language-aware native commands and existing notebook command', () => {
		const f = fixture();
		for (const button of f.container.querySelectorAll<HTMLButtonElement>('.browser-home-create button')) {
			button.click();
		}
		assert.deepStrictEqual(f.commands, [
			{ id: 'workbench.action.files.newUntitledFile', args: [{ languageId: 'c' }] },
			{ id: 'workbench.action.files.newUntitledFile', args: [{ languageId: 'cpp' }] },
			{ id: 'becoder.notebook.new', args: [] }
		]);
	});

	test('returning to blank displays homepage; websites hide it', () => {
		const f = fixture();
		f.feature.prerenderInput({ url: 'https://atcoder.jp/' } as BrowserEditorInput);
		assert.strictEqual(f.container.style.display, 'none');
		f.feature.prerenderInput({ url: 'about:blank' } as BrowserEditorInput);
		assert.notStrictEqual(f.container.style.display, 'none');
	});

	test('returning home focuses search only when this browser container has focus', () => {
		const f = fixture();
		const navigation = disposables.add(new Emitter<{ url: string }>());
		f.modelChange.fire({ model: { url: 'https://example.com/', onDidNavigate: navigation.event } as unknown as IBrowserViewModel, isNew: false });
		f.browserContainer.focus();
		navigation.fire({ url: 'about:blank' });
		assert.strictEqual(document.activeElement, f.container.querySelector('input'));
		const other = document.createElement('input');
		document.body.appendChild(other);
		disposables.add({ dispose: () => other.remove() });
		other.focus();
		navigation.fire({ url: 'about:blank' });
		assert.strictEqual(document.activeElement, other);
	});

	test('returning home clears the previous query without clearing ordinary input focus', () => {
		const f = fixture();
		const navigation = disposables.add(new Emitter<{ url: string }>());
		f.modelChange.fire({ model: { url: 'about:blank', onDidNavigate: navigation.event } as unknown as IBrowserViewModel, isNew: false });
		const search = f.container.querySelector<HTMLInputElement>('input')!;
		search.value = 'previous query';
		search.dispatchEvent(new Event('input'));
		f.feature.tryFocus();
		assert.strictEqual(search.value, 'previous query');
		navigation.fire({ url: 'https://example.com/search?q=previous' });
		navigation.fire({ url: 'about:blank' });
		assert.strictEqual(search.value, '');
		assert.ok(f.container.querySelector<HTMLButtonElement>('.browser-home-search-clear')!.hidden);
		search.value = 'another tab draft';
		f.feature.onModelDetached();
		assert.strictEqual(search.value, '');
	});

	test('search clear button appears only for content and clears without navigating', () => {
		const f = fixture();
		const search = f.container.querySelector<HTMLInputElement>('input')!;
		const clear = f.container.querySelector<HTMLButtonElement>('.browser-home-search-clear');
		assert.ok(clear);
		assert.ok(clear.hidden);
		search.value = 'test';
		search.dispatchEvent(new Event('input'));
		assert.strictEqual(clear.hidden, false);
		clear.click();
		assert.strictEqual(search.value, '');
		assert.ok(clear.hidden);
		assert.strictEqual(document.activeElement, search);
		assert.deepStrictEqual(f.navigations, []);
	});

	test('homepage uses a short placeholder and a working search icon button', () => {
		const f = fixture();
		const search = f.container.querySelector<HTMLInputElement>('input')!;
		assert.strictEqual(search.placeholder, 'Search the web');
		f.values['workbench.browser.searchEngine'] = 'Practice';
		f.values['workbench.browser.customSearchEngines'] = { Practice: 'https://example.com/?q={query}' };
		f.change.fire({ affectsConfiguration: () => true } as unknown as IConfigurationChangeEvent);
		assert.strictEqual(search.placeholder, 'Search the web');
		search.value = 'test';
		const submit = f.container.querySelector<HTMLButtonElement>('button[type="submit"]');
		assert.ok(submit);
		submit.click();
		assert.deepStrictEqual(f.navigations, ['https://example.com/?q=test']);
		f.values['workbench.browser.searchEngine'] = '';
		f.change.fire({ affectsConfiguration: () => true } as unknown as IConfigurationChangeEvent);
		assert.strictEqual(search.placeholder, 'Enter a URL');
	});

	test('empty engine disables homepage search just like the address bar', () => {
		const f = fixture();
		f.values['workbench.browser.searchEngine'] = '';
		const search = f.container.querySelector<HTMLInputElement>('input')!;
		search.value = 'example';
		search.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
		assert.deepStrictEqual(f.navigations, ['example']);
	});

	test('search setting changes preserve website buttons', () => {
		const f = fixture();
		const site = f.container.querySelector('.browser-home-site');
		f.values['workbench.browser.searchEngine'] = 'google';
		f.change.fire({ affectsConfiguration: (key: string) => key === 'workbench.browser.searchEngine' } as unknown as IConfigurationChangeEvent);
		assert.strictEqual(f.container.querySelector('.browser-home-site'), site);
	});

	test('site settings update without accumulating click listeners', () => {
		const f = fixture();
		f.values['becoder.welcome.onlineJudgeSites'] = { Luogu: 'https://www.luogu.com.cn/' };
		f.values['becoder.welcome.onlineJudges'] = ['Luogu'];
		for (let i = 0; i < 3; i++) {
			f.change.fire({ affectsConfiguration: () => true } as unknown as IConfigurationChangeEvent);
		}
		assert.deepStrictEqual([...f.container.querySelectorAll('.browser-home-site')].map(node => node.textContent), ['Luogu']);
		f.container.querySelector<HTMLButtonElement>('.browser-home-site')!.click();
		assert.deepStrictEqual(f.navigations, ['https://www.luogu.com.cn/']);
	});
});


/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserHistoryStore } from '../../../../../platform/browserView/common/browserHistory.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../../platform/actions/common/actions.js';
import { BrowserHistoryFeature } from '../../electron-browser/features/browserHistoryFeature.js';

function fixture(store: Pick<DisposableStore, 'add'>) {
	const attached = store.add(new Emitter<{ model: unknown }>());
	const history = store.add(new BrowserHistoryStore());
	const deleted: number[][] = [];
	const model = { history, deleteHistory: async (ids: number[]) => { deleted.push(ids); for (const id of ids) { history.entries.delete(id); } } };
	const editor = { model, onDidChangeModel: attached.event };
	const contribution = store.add(new BrowserHistoryFeature(editor as never));
	attached.fire({ model });
	return {
		contribution, history, deleted,
		suggestions: (index: number, text: string, url = '') => contribution.urlSuggestionProviders[index].getSuggestions({ input: { url } as never, text }, CancellationToken.None),
		detach: () => attached.fire({ model: undefined }),
	};
}

suite('Browser address-bar history', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the duplicate history action is absent from the toolbar and command palette', () => {
		const id = 'workbench.action.browser.showHistory';
		assert.strictEqual(MenuRegistry.getCommand(id), undefined);
		for (const menu of [MenuId.BrowserActionsToolbar, MenuId.CommandPalette]) {
			assert.ok(!MenuRegistry.getMenuItems(menu).filter(isIMenuItem).some(item => item.command.id === id));
		}
	});

	test('empty input suggests explicit visits only, newest first and excluding the current page', async () => {
		const f = fixture(store);
		f.history.add('https://atcoder.jp/', 'AtCoder', undefined, true);
		f.history.add('https://codeforces.com/', 'Codeforces', undefined, false);
		f.history.add('https://www.luogu.com.cn/', 'Luogu', undefined, true);
		assert.deepStrictEqual((await f.suggestions(0, '')).map(item => item.label), ['Luogu', 'AtCoder']);
		assert.deepStrictEqual((await f.suggestions(0, '', 'https://www.luogu.com.cn/')).map(item => item.label), ['AtCoder']);
		assert.deepStrictEqual(await f.suggestions(0, 'atcoder'), []);
	});

	test('typed history searches titles and URLs, retains latest query variants and opens the selected visit', async () => {
		const f = fixture(store);
		f.history.add('https://atcoder.jp/search?q=old', 'Old AtCoder');
		f.history.add('https://atcoder.jp/search?q=new', 'New AtCoder');
		f.history.add('https://codeforces.com/', 'Codeforces');
		const suggestions = await f.suggestions(1, 'ATCODER');
		assert.deepStrictEqual(suggestions.map(item => item.label), ['New AtCoder']);
		const urls: string[] = [];
		await suggestions[0].apply({ navigate: (url: string) => urls.push(url) } as never);
		assert.deepStrictEqual(urls, ['https://atcoder.jp/search?q=new']);
		assert.deepStrictEqual(await f.suggestions(1, ''), []);
	});

	test('history suggestions retain deletion and change notifications without a management picker', async () => {
		const f = fixture(store);
		f.history.add('https://atcoder.jp/', 'AtCoder');
		let changed = 0;
		store.add(f.contribution.urlSuggestionProviders[1].onDidChange!(() => changed++));
		const suggestions = await f.suggestions(1, 'atcoder');
		await suggestions[0].actions![0].run({} as never);
		assert.deepStrictEqual(f.deleted, [[1]]);
		assert.strictEqual(changed, 1);
		assert.deepStrictEqual(await f.suggestions(1, 'atcoder'), []);
	});

	test('detaching retires old model notifications and clears suggestions', async () => {
		const f = fixture(store);
		f.history.add('https://atcoder.jp/', 'AtCoder');
		let changed = 0;
		store.add(f.contribution.urlSuggestionProviders[1].onDidChange!(() => changed++));
		f.detach();
		f.history.add('https://codeforces.com/', 'Codeforces');
		assert.strictEqual(changed, 1);
		assert.deepStrictEqual(await f.suggestions(0, ''), []);
		assert.deepStrictEqual(await f.suggestions(1, 'atcoder'), []);
	});
});

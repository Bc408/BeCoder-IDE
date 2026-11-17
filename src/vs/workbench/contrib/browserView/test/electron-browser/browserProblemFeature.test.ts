/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuId, MenuRegistry, isIMenuItem, isISubmenuItem, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { browserProblemMenu, BrowserProblemContribution } from '../../electron-browser/features/browserProblemFeature.js';

const taskUrl = 'https://atcoder.jp/contests/abc086/tasks/abc086_a';

function fixture(store: Pick<DisposableStore, 'add'>) {
	const attached = store.add(new Emitter<unknown>()), navigating = store.add(new Emitter<void>()), navigated = store.add(new Emitter<void>()), loading = store.add(new Emitter<void>());
	const context = new MockContextKeyService();
	context.createKey('activeEditor', 'workbench.editor.browser');
	context.contextMatchesRules = (rule: ContextKeyExpression) => rule.evaluate({ getValue: key => context.getContextKeyValue(key) });
	const model = { id: 'browser-fixture', url: taskUrl, loading: false, onWillNavigate: navigating.event, onDidNavigate: navigated.event, onDidChangeLoadingState: loading.event };
	const editor = { model, onDidChangeModel: attached.event, group: { id: 1 }, input: undefined };
	const commands: { id: string; args: unknown[] }[] = [];
	const errors: unknown[] = [];
	const serviceCalls: { name: string; args: unknown[] }[] = [];
	let resolve = async (_url: string): Promise<unknown> => ({ site: 'atcoder', nativeId: 'abc086/abc086_a', url: taskUrl });
	let parse = async () => ({ url: taskUrl, json: '{}' });
	let execute = async (_id: string, _args: unknown[]): Promise<unknown> => undefined;
	const service = {
		getChannel: () => ({
			call: async (name: string, args: unknown[]) => {
				serviceCalls.push({ name, args });
				if (name === 'getProblemParserPatterns') { return ['https://atcoder.jp/contests/*/tasks/*', 'https://codeforces.com/problemset/problem/*/*']; }
				if (name === 'resolveBrowserProblem') { return resolve(args[0] as string); }
				if (name === 'openLuoguSession') { return 'luogu-session'; }
				if (name === 'openNowcoderSession') { return 'nowcoder-session'; }
				if (name === 'readOjProblem') {
					const ref = await resolve(model.url) as { site: string };
					if (ref.site !== 'atcoder' && args[0] !== ref.site + '-session') { throw new Error('oj-connect-owner'); }
					return { ref };
				}
				if (name === 'parseProblem') { return parse(); }
				throw new Error(name);
			}
		})
	};
	const contribution = store.add(new BrowserProblemContribution(editor as never, context, service as never,
		{ executeCommand: async (id: string, ...args: unknown[]) => { commands.push({ id, args }); return execute(id, args); } } as never,
		{ info: () => undefined, error: (error: unknown) => errors.push(error) } as never, { groups: [] } as never));
	attached.fire({ model });
	const settled = async () => { for (let index = 0; index < 10; index++) { await Promise.resolve(); } };
	return {
		context, model, contribution, commands, errors, serviceCalls, settled,
		setResolve: (value: typeof resolve) => { resolve = value; }, setParse: (value: typeof parse) => { parse = value; }, setExecute: (value: typeof execute) => { execute = value; },
		navigate: (url: string) => { navigating.fire(); model.url = url; navigated.fire(); }, startNavigation: () => navigating.fire(), loading: () => loading.fire()
	};
}

suite('Browser problem actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	for (const [site, url, session] of [
		['luogu', 'https://www.luogu.com.cn/problem/P1001', 'luogu-session'],
		['nowcoder', 'https://ac.nowcoder.com/acm/problem/18204', 'nowcoder-session'],
		['atcoder', taskUrl, 'browser-fixture']
	]) {
		test(`${site} Get Problem reads through its owned session and imports the document`, async () => {
			const f = fixture(store); await f.settled();
			f.setResolve(async () => ({ site, nativeId: 'fixture', url })); f.navigate(url); await f.settled();
			await f.contribution.run('get');
			assert.deepStrictEqual(f.errors, []);
			assert.strictEqual(f.serviceCalls.find(call => call.name === 'readOjProblem')?.args[0], session);
			assert.strictEqual(f.commands[0]?.id, '_becoder.ojConnect.importFromBrowser');
		});
	}
	test('fixed split menu retains disabled Get and independent CPH action', async () => {
		const f = fixture(store); await f.settled();
		const item = MenuRegistry.getMenuItems(MenuId.BrowserActionsToolbar).find(item => isISubmenuItem(item) && item.submenu === browserProblemMenu)!;
		assert.ok(isISubmenuItem(item)); assert.strictEqual(item.isSplitButton, true);
		const entries = MenuRegistry.getMenuItems(browserProblemMenu).filter(isIMenuItem).sort((a, b) => a.order! - b.order!);
		assert.deepStrictEqual(entries.map(entry => entry.command.id), [BrowserViewCommandId.GetProblem, BrowserViewCommandId.ImportProblem]);
		const actions = () => entries.map(entry => new MenuItemAction(entry.command, undefined, undefined, undefined, undefined, f.context, {} as never));
		assert.deepStrictEqual(actions().map(action => action.enabled), [true, true]);
		f.setResolve(async () => undefined); f.navigate('https://codeforces.com/problemset/problem/1/A'); await f.settled();
		const submenu = new SubmenuItemAction(item, undefined, actions());
		assert.strictEqual(submenu.enabled, true); assert.deepStrictEqual(submenu.actions.map(action => action.enabled), [false, true]);
		f.navigate('https://example.com/'); await f.settled();
		assert.deepStrictEqual(actions().map(action => action.enabled), [false, false]);
		assert.deepStrictEqual(f.commands, [], 'URL capability must not activate an extension or request account data');
	});
	test('late capability cannot reenable actions during navigation or loading', async () => {
		const f = fixture(store); await f.settled();
		const pending = new DeferredPromise<unknown>(); f.setResolve(() => pending.p);
		f.loading(); f.startNavigation(); await pending.complete({ site: 'atcoder' }); await f.settled();
		assert.strictEqual(f.context.getContextKeyValue('browserCanGetProblem'), false);
		f.model.loading = true; f.loading(); await f.settled();
		assert.strictEqual(f.context.getContextKeyValue('browserCanImportCph'), false);
	});
	test('navigation during parsing prevents destination resolution and file import', async () => {
		const f = fixture(store); await f.settled();
		const parsed = new DeferredPromise<{ url: string; json: string }>(); f.setParse(() => parsed.p);
		const run = f.contribution.run('cph'); f.navigate('https://example.com/'); await parsed.complete({ url: taskUrl, json: '{}' }); await run;
		assert.deepStrictEqual(f.commands, []); assert.deepStrictEqual(f.errors, []);
	});
	test('navigation cancels only the matching pending extension command; concurrent imports are rejected', async () => {
		const f = fixture(store); await f.settled();
		const pending = new DeferredPromise<void>(), started = new DeferredPromise<void>();
		f.setExecute(async id => { if (id === '_becoder.ojConnect.importFromBrowser') { await started.complete(); await pending.p; } });
		const run = f.contribution.run('get'); await started.p;
		await f.contribution.run('cph');
		f.navigate('https://example.com/'); await pending.complete(); await run;
		assert.deepStrictEqual(f.commands.map(command => command.id), ['_becoder.ojConnect.importFromBrowser', '_becoder.ojConnect.cancelBrowserImport']);
		assert.strictEqual(f.commands[0].args[1], f.commands[1].args[0]);
		assert.strictEqual(f.context.getContextKeyValue('browserProblemImportBusy'), false);
		assert.deepStrictEqual(f.errors, []);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import '../../electron-browser/features/browserTabManagementFeatures.js';
import { GettingStartedInputSerializer } from '../../../welcomeGettingStarted/browser/gettingStarted.js';
import { BrowserEditor } from '../../electron-browser/browserEditor.js';
import { StartupPageEditorResolverContribution } from '../../../welcomeGettingStarted/browser/startupPage.js';
import { gettingStartedResource } from '../../../welcomeGettingStarted/browser/gettingStartedInput.js';

suite('Browser homepage actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(openComplete?: Promise<void>) {
		const opened: { input: unknown; options: unknown; group: unknown }[] = [];
		const groups = [{ id: 1, editors: [] as BrowserEditorInput[] }, { id: 2, editors: [] as BrowserEditorInput[] }];
		let preferredCalls = 0;
		let preferredGroup: number | undefined = 9;
		const services = new ServiceCollection();
		services.set(IEditorService, { openEditor: async (input: unknown, options: unknown, group: unknown) => { opened.push({ input, options, group }); await openComplete; } } as unknown as IEditorService);
		services.set(IEditorGroupsService, { getGroups: () => groups, getGroup: (id: number) => groups.find(group => group.id === id) } as unknown as IEditorGroupsService);
		services.set(IBrowserViewWorkbenchService, { getPreferredGroup: async () => { preferredCalls++; return preferredGroup; }, getKnownBrowserViews: () => new Map() } as unknown as IBrowserViewWorkbenchService);
		services.set(ITelemetryService, { publicLog2: () => undefined } as unknown as ITelemetryService);
		const accessor = { get: (id: Parameters<ServiceCollection['get']>[0]) => services.get(id) } as ServicesAccessor;
		services.set(ICommandService, { executeCommand: (id: string, ...args: unknown[]) => CommandsRegistry.getCommand(id)!.handler(accessor, ...args) } as ICommandService);
		const input = (id: string, url: string) => disposables.add(new BrowserEditorInput({ id, url }, async () => { throw new Error('Home action must not resolve a page'); }, {} as IThemeService, {} as IInstantiationService, {} as ITelemetryService));
		return {
			opened, groups, input,
			get preferredCalls() { return preferredCalls; },
			set preferredGroup(value: number | undefined) { preferredGroup = value; },
			run: async (id: string, ...args: unknown[]) => {
				const command = CommandsRegistry.getCommand(id);
				assert.ok(command, `Missing homepage command ${id}`);
				await command.handler(accessor, ...args);
			}
		};
	}

	test('application home focuses an open homepage in its existing group', async () => {
		const f = fixture();
		const page = f.input('home', 'about:blank');
		f.groups[1].editors.push(page);
		await f.run('workbench.action.browser.home');
		assert.deepStrictEqual(f.opened, [{ input: page, options: { pinned: true }, group: 2 }]);
		assert.strictEqual(f.preferredCalls, 0);
	});

	test('application home creates a fresh browser instead of navigating a website', async () => {
		const f = fixture();
		const website = f.input('site', 'https://atcoder.jp/login');
		f.groups[0].editors.push(website);
		await f.run('workbench.action.browser.home');
		assert.strictEqual(website.url, 'https://atcoder.jp/login');
		assert.strictEqual(f.opened.length, 1);
		assert.strictEqual(f.preferredCalls, 1);
	});

	test('application home does not reuse a homepage with a pending website navigation', async () => {
		const f = fixture();
		const page = f.input('leaving-home', 'about:blank');
		const willNavigate = disposables.add(new Emitter<string>());
		page.model = {
			dispose: () => undefined,
			url: 'about:blank', loading: false,
			onWillNavigate: willNavigate.event,
			onWillDispose: Event.None, onDidClose: Event.None,
			onDidChangeTitle: Event.None, onDidChangeFavicon: Event.None,
			onDidChangeLoadingState: Event.None, onDidNavigate: Event.None,
		} as unknown as IBrowserViewModel;
		f.groups[0].editors.push(page);
		willNavigate.fire('https://example.com/slow');
		await f.run('workbench.action.browser.home');
		assert.notStrictEqual(f.opened[0].input, page);
		assert.strictEqual(f.preferredCalls, 1);
	});

	test('homepage title and description do not retain website metadata', () => {
		const f = fixture();
		const page = f.input('home-label', 'about:blank');
		assert.strictEqual(page.getTitle(), page.getName());
		assert.strictEqual(page.getDescription(), undefined);
	});

	test('new tab always creates distinct browser resources in a requested current group', async () => {
		const f = fixture();
		await f.run(BrowserViewCommandId.NewTab, undefined, 2);
		await f.run(BrowserViewCommandId.NewTab, undefined, 2);
		const resources = f.opened.map(entry => (entry.input as { resource: { toString(): string } }).resource.toString());
		assert.notStrictEqual(resources[0], resources[1]);
		assert.deepStrictEqual(f.opened.map(entry => entry.options), [2, 2]);
		assert.strictEqual(f.preferredCalls, 0);
	});

	test('repeated application-home clicks share only the current opening operation', async () => {
		const complete = new DeferredPromise<void>();
		const f = fixture(complete.p);
		const opening = f.run('workbench.action.browser.home');
		const repeated = f.run('workbench.action.browser.home');
		await Promise.resolve();
		assert.strictEqual(f.opened.length, 1);
		complete.complete();
		await Promise.all([opening, repeated]);
		await f.run('workbench.action.browser.home');
		assert.strictEqual(f.opened.length, 2);
	});

	test('new tab does not reroute a removed originating group', async () => {
		const f = fixture();
		await f.run(BrowserViewCommandId.NewTab, undefined, 42);
		assert.strictEqual(f.opened.length, 0);
		assert.strictEqual(f.preferredCalls, 0);
	});

	test('new tab preserves the native default placement when no group is preferred', async () => {
		const f = fixture();
		f.preferredGroup = undefined;
		await f.run(BrowserViewCommandId.NewTab);
		assert.strictEqual(f.opened.length, 1);
		assert.strictEqual(f.opened[0].options, undefined);
	});

	test('legacy New Tab command creates a native browser in its originating group', async () => {
		const f = fixture();
		await f.run('becoder.action.openNewTab', 2);
		assert.strictEqual(f.opened.length, 1);
		assert.strictEqual(f.opened[0].options, 2);
	});

	test('legacy welcome and new-tab serializers restore native homepages lazily', async () => {
		// The production tab-management entry must register the legacy command;
		// do not import its compatibility module before checking that dependency.
		assert.ok(CommandsRegistry.getCommand('becoder.action.openNewTab'));
		const { BeCoderNewTabInputSerializer } = await import('../../../becoder/browser/beCoderNewTab.contribution.js');
		const f = fixture();
		const restored: BrowserEditorInput[] = [];
		const instantiationService = {
			invokeFunction: (fn: (accessor: ServicesAccessor) => BrowserEditorInput) => fn({
				get: () => ({ getOrCreateLazy: (id: string) => { const input = f.input(id, 'about:blank'); restored.push(input); return input; } })
			} as unknown as ServicesAccessor)
		} as IInstantiationService;
		for (const serializer of [new GettingStartedInputSerializer(), new BeCoderNewTabInputSerializer()]) {
			assert.strictEqual(serializer.canSerialize(), false);
			assert.strictEqual(serializer.serialize(), undefined);
			assert.ok(serializer.deserialize(instantiationService) instanceof BrowserEditorInput);
		}
		assert.strictEqual(restored.length, 2);
		assert.notStrictEqual(restored[0].id, restored[1].id);
	});

	test('browser toolbar home navigates the current model without opening another editor', async () => {
		const f = fixture();
		const navigated: string[] = [];
		const browser = Object.create(BrowserEditor.prototype) as BrowserEditor;
		Object.defineProperty(browser, 'model', { value: { url: 'https://www.luogu.com.cn/', loadURL: async (url: string) => { navigated.push(url); } } });
		await f.run('workbench.action.browser.goHome', browser);
		assert.deepStrictEqual(navigated, ['about:blank']);
		assert.strictEqual(f.opened.length, 0);
	});

	test('legacy welcome resource resolves to a native home without claiming unrelated walkthroughs', async () => {
		const f = fixture();
		const registrations: Parameters<IEditorResolverService['registerEditor']>[] = [];
		const browserService = { getOrCreateLazy: (id: string) => f.input(id, 'about:blank') } as IBrowserViewWorkbenchService;
		const resolverService = {
			registerEditor: (...args: Parameters<IEditorResolverService['registerEditor']>) => { registrations.push(args); return Disposable.None; }
		} as IEditorResolverService;
		disposables.add(new StartupPageEditorResolverContribution(browserService, resolverService));
		const registration = registrations[0];
		assert.ok(registration);
		assert.strictEqual(registration[2].canSupportResource!(gettingStartedResource), true);
		assert.strictEqual(registration[2].canSupportResource!(gettingStartedResource.with({ authority: 'other-walkthrough' })), false);
		const resolved = await registration[3].createEditorInput!({ resource: gettingStartedResource }, {} as IEditorGroup);
		assert.ok(resolved.editor instanceof BrowserEditorInput);
	});
});

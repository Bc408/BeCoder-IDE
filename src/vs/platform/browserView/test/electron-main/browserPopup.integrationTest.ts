/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { BrowserWindow } from 'electron';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { raceTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { IAuxiliaryWindowsMainService } from '../../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { INativeHostMainService } from '../../../native/electron-main/nativeHostMainService.js';
import { IApplicationStorageMainService } from '../../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import type { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { BrowserViewStorageScope } from '../../common/browserView.js';
import type { BrowserView } from '../../electron-main/browserView.js';
import { BrowserViewMainService } from '../../electron-main/browserViewMainService.js';

suite('Browser popup navigation', () => {
	let disposables: DisposableStore;
	let window: BrowserWindow;
	let service: BrowserViewMainService;
	let parent: BrowserView;
	let origin: string;
	let server: Server;

	setup(async () => {
		disposables = new DisposableStore();
		const { createServer } = await import('http');
		server = createServer((_request, response) => {
			response.writeHead(200, { 'Content-Type': 'text/html' });
			response.end('<!doctype html><title>Contest popup fixture</title>');
		});
		await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		window = new BrowserWindow({ show: false });
		const owner = upcastPartial<ICodeWindow>({ win: window, onDidClose: Event.None, onWillLoad: Event.None });
		const instantiation = disposables.add(new InstantiationService(new ServiceCollection(
			[IWindowsMainService, upcastPartial<IWindowsMainService>({ getWindowById: id => id === window.id ? owner : undefined })],
			[IAuxiliaryWindowsMainService, upcastPartial<IAuxiliaryWindowsMainService>({})],
			[IEnvironmentMainService, upcastPartial<IEnvironmentMainService>({ workspaceStorageHome: URI.file('.') })],
			[IApplicationStorageMainService, upcastPartial<IApplicationStorageMainService>({ get: (_key, _scope, fallbackValue?: string) => fallbackValue! })],
			[INativeHostMainService, upcastPartial<INativeHostMainService>({})],
			[ITelemetryService, NullTelemetryService],
			[ILogService, new NullLogService()],
		), true));
		service = disposables.add(instantiation.createInstance(BrowserViewMainService));
		const id = generateUuid();
		await service.getOrCreateBrowserView(id, { owner: { mainWindowId: window.id }, sessionOptions: { scope: BrowserViewStorageScope.Ephemeral } });
		parent = service.tryGetBrowserView(id)!;
		await parent.loadURL(`${origin}/contest`);
	});

	teardown(async () => {
		disposables.dispose();
		window?.destroy();
		server?.closeAllConnections();
		await new Promise<void>(resolve => server.close(() => resolve()));
	});

	async function openProblem(script: string): Promise<BrowserView> {
		const created = Event.toPromise(service.onDidCreateBrowserView, disposables);
		await parent.webContents.executeJavaScript(`setTimeout(() => { ${script} }, 0)`, true);
		const { info, openOptions } = await created;
		assert.strictEqual(openOptions?.parentViewId, parent.id);
		const child = service.tryGetBrowserView(info.id)!;
		assert.strictEqual(child.session, parent.session);
		const target = `${origin}/problem`;
		if (child.getURL() !== target) {
			await raceTimeout(Event.toPromise(Event.filter(child.onDidNavigate, event => event.url === target), disposables), 2000);
		}
		assert.strictEqual(child.getURL(), target);
		assert.strictEqual(parent.getURL(), `${origin}/contest`);
		return child;
	}

	test('lets a blank popup navigate after the opener sets its session storage', async () => {
		const child = await openProblem(`
			const tab = window.open('about:blank', '_blank');
			tab.sessionStorage.setItem('fixture', 'preserved');
			tab.opener = null;
			tab.location.replace('/problem');
		`);
		assert.strictEqual(await child.webContents.executeJavaScript(`sessionStorage.getItem('fixture')`), 'preserved');
	});

	test('opens a direct problem URL in a child tab', async () => {
		await openProblem(`window.open('/problem', '_blank', 'noopener,noreferrer');`);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import * as path from '../../../../base/common/path.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import type { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import type { ILifecycleMainService } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import type { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { IProblemStatementCacheService } from '../../common/ojStatementCache.js';
import { OjStatementCacheService } from '../../electron-main/ojStatementCacheService.js';

suite('OJ statement application cache service', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('real IPC shares statements across windows and reload retires only the owner ticket', async () => {
		const root = await fs.mkdtemp(path.join(tmpdir(), 'statement-ipc-'));
		const disposables = new DisposableStore(), reload = disposables.add(new Emitter<void>());
		const windows = [{ id: 1, onWillLoad: reload.event, onDidClose: Event.None }, { id: 2, onWillLoad: Event.None, onDidClose: Event.None }];
		try {
			const service = disposables.add(new OjStatementCacheService({ userDataPath: root } as IEnvironmentMainService,
				{ getWindows: () => windows, getWindowById: (id: number) => windows.find(window => window.id === id), onDidOpenWindow: Event.None, onDidDestroyWindow: Event.None } as unknown as IWindowsMainService,
				{ onWillShutdown: Event.None } as ILifecycleMainService));
			const channel = ProxyChannel.fromService(service, disposables), client = ProxyChannel.toService<IProblemStatementCacheService>({
				call: (command, args) => channel.call(undefined, command, args),
				listen: (event, args) => channel.listen(undefined, event, args)
			});
			const ref = { site: 'luogu' as const, nativeId: 'P1001', url: 'https://www.luogu.com.cn/problem/P1001' };
			await client.publishAcquired(1, { ref, title: 'A+B', bodies: [{ locale: 'en', sections: [{ format: 'markdown', content: 'Add integers.' }] }], samples: [], limits: [], interactive: false });
			const source = (await client.read(2, ref, 'en'))!;
			assert.strictEqual(source.version.sections[0].content, 'Add integers.');
			const ticket = await client.acquireTranslation(1, source, 'zh-CN');
			await assert.rejects(client.acquireTranslation(2, source, 'zh-CN'), /statement-translation-busy/);
			reload.fire();
			await assert.rejects(client.publishTranslation(1, ticket.id, { ...source.version, language: 'zh-CN', origin: 'translation' }), /statement-translation-owner/);
			const second = await client.acquireTranslation(2, source, 'zh-CN');
			await client.publishTranslation(2, second.id, { ...source.version, language: 'zh-CN', origin: 'translation' });
			assert.strictEqual((await client.read(1, ref, 'zh-CN'))?.version.origin, 'translation');
			const merged = await client.merge(2, { ...source, title: source.version.title, bodies: [{ locale: 'en', ...source.version }] });
			assert.deepStrictEqual(merged.bodies.map(body => body.locale), ['en', 'zh-CN']);
		} finally { disposables.dispose(); await fs.rm(root, { recursive: true, force: true }); }
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as path from 'path';
import { spawn } from 'child_process';
import { once } from 'events';
import { randomUUID } from 'crypto';
import { test } from 'node:test';
import { acquireWorkspaceLease } from '../src/workspaceLease';

test('workspace occupancy rejects concurrent acquisition and releases idempotently', async () => {
	const root = `C:\\lease-${randomUUID()}`;
	const release = await acquireWorkspaceLease(root);
	try { await assert.rejects(acquireWorkspaceLease(root.toUpperCase()), { code: 'busy' }); }
	finally { await release(); }
	await release();
	await (await acquireWorkspaceLease(root))();
});

test('kernel releases workspace occupancy after owner termination without deleting a file', { timeout: 10000 }, async t => {
	const root = `C:\\lease-${randomUUID()}`;
	const modulePath = path.resolve(__dirname, '../src/workspaceLease.js');
	const child = spawn(process.execPath, ['-e', 'require(process.argv[1]).acquireWorkspaceLease(process.argv[2]).then(()=>process.send("ready"))', modulePath, root], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
	t.after(() => { child.kill(); });
	const exit = once(child, 'exit');
	await once(child, 'message');
	await assert.rejects(acquireWorkspaceLease(root), { code: 'busy' });
	child.kill();
	await exit;
	await (await acquireWorkspaceLease(root))();
});

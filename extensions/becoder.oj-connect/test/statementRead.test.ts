/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';

test('statement host cancellation is immediate and never accepts a late document', async () => {
	const { CommandBrowserHost, CommandCodeforcesHost } = await import('../src/browserHost');
	for (const site of ['atcoder', 'codeforces'] as const) {
		const problem = site === 'atcoder' ? { site, nativeId: 'abc086/abc086_a', url: 'https://atcoder.jp/contests/abc086/tasks/abc086_a' } : { site, nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
		let release!: (value: unknown) => void; const calls: { command: string; args: unknown[] }[] = [];
		const execute = async (command: string, ...args: unknown[]) => { calls.push({ command, args }); return command.endsWith('.readProblem') ? new Promise(resolve => { release = resolve; }) : undefined; };
		const host = site === 'atcoder' ? new CommandBrowserHost(execute) : new CommandCodeforcesHost(execute), controller = new AbortController();
		const reading = host.readProblem(problem, controller.signal); const rejected = assert.rejects(reading, /oj-statement-cancelled/); controller.abort(); await rejected;
		assert.strictEqual(calls.length, 2); assert.ok(calls[1].command.endsWith('.cancelStatementRead')); assert.strictEqual(calls[1].args[0], calls[0].args[1]);
		release({ ref: problem, title: 'Late', bodies: [], samples: [], limits: [], interactive: false }); await Promise.resolve();
	}
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { runOjScript, type OjScriptTask } from '../../electron-main/ojScriptTask.js';

// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('OJ script cancellation', () => {
	test('cancellation during bundle read releases the task and prevents late execution', async () => {
		const task: OjScriptTask = { controller: new AbortController(), dispatched: false };
		let finishRead!: (value: string) => void;
		const reading = new Promise<string>(resolve => { finishRead = resolve; });
		let executions = 0;
		const running = runOjScript(task, () => reading, async () => { executions++; return 'sent'; });
		task.controller.abort(new Error('cancelled'));
		const result = await Promise.race([running.catch(error => error.message), new Promise(resolve => setTimeout(() => resolve('still waiting'), 25))]);
		assert.strictEqual(result, 'cancelled');
		assert.strictEqual(task.dispatched, false);
		finishRead('script');
		await Promise.resolve();
		assert.strictEqual(executions, 0);
	});
	test('cancellation already recorded prevents even reading the bundle', async () => {
		const task: OjScriptTask = { controller: new AbortController(), dispatched: false };
		task.controller.abort(new Error('cancelled'));
		let reads = 0;
		await assert.rejects(runOjScript(task, async () => { reads++; return 'script'; }, async () => 'sent'), /cancelled/);
		assert.strictEqual(reads, 0);
	});
	test('interruption after dispatch retains the uncertain send boundary', async () => {
		const task: OjScriptTask = { controller: new AbortController(), dispatched: false };
		let started!: () => void;
		const dispatched = new Promise<void>(resolve => { started = resolve; });
		const running = runOjScript(task, async () => 'script', () => { started(); return new Promise(() => { }); });
		await dispatched;
		task.controller.abort(new Error('page changed'));
		await assert.rejects(running, /page changed/);
		assert.strictEqual(task.dispatched, true);
	});
});

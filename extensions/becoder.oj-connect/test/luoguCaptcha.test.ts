/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';

function harness() {
	const panels: { webview: { html: string }; closed: boolean; dispose(): void; onDidDispose(callback: () => void): { dispose(): void } }[] = [];
	const pending: { token: { isCancellationRequested: boolean }; answer(value: string | undefined): void }[] = [];
	const mock = {
		l10n: { t: (value: string) => value }, ViewColumn: { Active: -1 },
		CancellationTokenSource: class {
			private readonly listeners = new Set<() => void>();
			token = { isCancellationRequested: false, onCancellationRequested: (fn: () => void) => { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; } };
			cancel() { this.token.isCancellationRequested = true; for (const fn of this.listeners) { fn(); } }
			dispose() { this.listeners.clear(); }
		},
		window: {
			createWebviewPanel: () => {
				const listeners = new Set<() => void>();
				const panel = {
					webview: { html: '' }, closed: false,
					dispose() { if (!this.closed) { this.closed = true; for (const fn of listeners) { fn(); } } },
					onDidDispose(callback: () => void) { listeners.add(callback); return { dispose: () => listeners.delete(callback) }; }
				};
				panels.push(panel); return panel;
			},
			showInputBox: (_options: unknown, token: { isCancellationRequested: boolean; onCancellationRequested(fn: () => void): unknown }) => new Promise<string | undefined>(resolve => {
				pending.push({ token, answer: resolve }); token.onCancellationRequested(() => resolve(undefined));
			})
		}
	};
	const Module = require('module'), original = Module._load;
	Module._load = function (id: string, ...args: unknown[]) { return id === 'vscode' ? mock : original.call(this, id, ...args); };
	try {
		delete require.cache[require.resolve('../src/views/luoguCaptcha')];
		const { LuoguCaptcha } = require('../src/views/luoguCaptcha');
		return { LuoguCaptcha, panels, pending };
	} finally { Module._load = original; }
}

test('captcha returns entered code and closes its image panel', async () => {
	const { LuoguCaptcha, panels, pending } = harness();
	const prompt = new LuoguCaptcha(async () => { throw new Error('unexpected refresh'); });
	const result = prompt.ask('aW1hZ2U=', 'submission-1');
	assert.match(panels[0].webview.html, /data:image\/png;base64,aW1hZ2U=/);
	pending[0].answer('1234');
	assert.strictEqual(await result, '1234'); assert.strictEqual(panels[0].closed, true);
});

test('empty captcha input refreshes the same request before asking again', async () => {
	const { LuoguCaptcha, panels, pending } = harness();
	const refreshed: string[] = [];
	const prompt = new LuoguCaptcha(async (id: string) => { refreshed.push(id); return 'bmV3'; });
	const result = prompt.ask('b2xk', 'submission-2');
	pending[0].answer('');
	await new Promise(resolve => setImmediate(resolve));
	assert.deepStrictEqual(refreshed, ['submission-2']);
	assert.match(panels[0].webview.html, /base64,bmV3/);
	pending[1].answer('5678'); assert.strictEqual(await result, '5678');
});

test('input cancellation returns undefined without refreshing or submitting', async () => {
	const { LuoguCaptcha, panels, pending } = harness();
	const prompt = new LuoguCaptcha(async () => { throw new Error('unexpected refresh'); });
	const result = prompt.ask('aW1hZ2U=', 'submission-3');
	pending[0].answer(undefined);
	assert.strictEqual(await result, undefined); assert.strictEqual(panels[0].closed, true);
});

test('host cancellation only closes the matching captcha and settles its input', async () => {
	const { LuoguCaptcha, panels, pending } = harness();
	const prompt = new LuoguCaptcha(async () => { throw new Error('unexpected refresh'); });
	const result = prompt.ask('aW1hZ2U=', 'submission-4');
	prompt.cancel('old-submission'); assert.strictEqual(panels[0].closed, false);
	prompt.cancel('submission-4');
	assert.strictEqual(await result, undefined); assert.strictEqual(pending[0].token.isCancellationRequested, true); assert.strictEqual(panels[0].closed, true);
});

test('closing the captcha image cancels the pending input', async () => {
	const { LuoguCaptcha, panels } = harness();
	const prompt = new LuoguCaptcha(async () => { throw new Error('unexpected refresh'); });
	const result = prompt.ask('aW1hZ2U=', 'submission-5');
	panels[0].dispose(); assert.strictEqual(await result, undefined);
});

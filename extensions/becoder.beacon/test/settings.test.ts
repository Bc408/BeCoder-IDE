/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import type * as vscode from 'vscode';
import { Connections } from '../src/connections';
import { secretName } from '../src/connection';
import { emptyConfiguration, parseConfiguration, parseModel, parameterPolicy, validateModel, type SettingsCommand } from '../src/modelConfiguration';
import { resolveCapabilities } from '../src/models';
import * as mock from './vscodeMock';

async function fixture(run: (connections: Connections, context: ReturnType<typeof mock.reset>) => Promise<void>) {
	const context = mock.reset('.');
	const connections = new Connections(context as unknown as vscode.ExtensionContext, () => {});
	try { await connections.refresh(); await run(connections, context); } finally { connections.dispose(); }
}
function apply(connections: Connections, command: Omit<SettingsCommand, 'revision' | 'requestId' | 'provider'>) {
	return connections.apply({ provider: 'deepseek', revision: connections.settings.revision, requestId: 1, ...command });
}

suite('Beacon settings', () => {
	test('fresh configuration ignores all old keys and never picks the first model', async () => fixture(async connections => {
		mock.values.delete('modelConfiguration'); mock.values.set('provider', 'deepseek'); mock.values.set('deepseek.model', 'deepseek-chat');
		await connections.refresh();
		assert.deepStrictEqual(connections.settings.providers, emptyConfiguration().providers);
		assert.equal(connections.configured, false); assert.equal(connections.settings.selection, undefined);
		await apply(connections, { type: 'saveModel', model: { id: 'new', name: 'New', enabled: true, parameters: {}, settings: {} } });
		assert.equal(connections.settings.selection, undefined);
	}));
	test('duplicates, invalid parameter values and unsupported adapter options are rejected', () => {
		const data = emptyConfiguration();
		const model = parseModel({ id: 'one', name: 'One', enabled: true, parameters: { temperature: 0.3 }, settings: { overrides: { vision: 'supported' } } });
		data.providers.deepseek.models = [model, model];
		assert.throws(() => parseConfiguration(data), /duplicate-model/);
		assert.throws(() => parseModel({ ...model, parameters: { topP: NaN } }), /invalid-model-parameter/);
		assert.throws(() => parseModel({ ...model, settings: { overrides: { tools: 'yes' } } }), /invalid-model-capability/);
		assert.throws(() => validateModel('moonshot', 'https://api.moonshot.cn/v1', { ...model, settings: { effort: 'max' } }), /invalid-effort/);
		const reasoning = resolveCapabilities('deepseek', 'https://api.deepseek.com', 'deepseek-reasoner');
		assert.equal(parameterPolicy('deepseek', 'deepseek-reasoner', reasoning, {}).fixedThinking, true);
		assert.throws(() => validateModel('deepseek', 'https://api.deepseek.com', { ...model, id: 'deepseek-reasoner', settings: {}, parameters: { temperature: 1 } }), /unsupported-sampling/);
		assert.throws(() => validateModel('deepseek', 'https://other.example/v1', { ...model, id: 'deepseek-flash', settings: {}, parameters: { temperature: 0.4 } }), /unsupported-sampling/);
		validateModel('deepseek', 'https://other.example/v1', { ...model, id: 'deepseek-flash', settings: { thinking: 'disabled', overrides: { reasoning: 'supported' } }, parameters: { temperature: 0.4 } });
	});
	test('a save persists the whole model; disabling/removing the active model never selects another', async () => fixture(async connections => {
		await apply(connections, { type: 'saveModel', originalId: 'deepseek-flash', model: { id: 'deepseek-flash', name: 'My Flash', enabled: true, parameters: { temperature: 0.5, topP: 0.8, maxOutputTokens: 2048 }, settings: { thinking: 'disabled', overrides: { contextWindow: 128000 } } } });
		assert.equal(connections.snapshot.displayName, 'My Flash');
		assert.deepStrictEqual(connections.snapshot.parameters, { temperature: 0.5, topP: 0.8, maxOutputTokens: 2048 });
		await assert.rejects(apply(connections, { type: 'saveModel', model: { id: 'deepseek-flash', name: 'Duplicate', enabled: true, parameters: {}, settings: {} } }), /duplicate-model/);
		await apply(connections, { type: 'toggleModel', id: 'deepseek-flash', enabled: false });
		assert.equal(connections.configured, false); assert.equal(connections.snapshot.model, 'deepseek-flash');
		await apply(connections, { type: 'removeModel', id: 'deepseek-flash' });
		assert.equal(connections.settings.selection, undefined); assert.equal(connections.snapshot.model, '');
		assert.deepStrictEqual(connections.snapshot.choices?.map(model => model.id), ['deepseek-chat']);
	}));
	test('failed connection save rolls back credentials; stale forms cannot overwrite newer settings', async () => fixture(async (connections, context) => {
		const before = connections.settings;
		mock.controls.updateError = new Error('disk');
		await assert.rejects(apply(connections, { type: 'saveConnection', baseURL: 'https://other.example/v1', key: 'replacement' }), /disk/);
		delete mock.controls.updateError;
		assert.equal(await context.secrets.get(secretName('deepseek')), 'mock-secret');
		assert.equal(connections.settings.providers.deepseek.baseURL, before.providers.deepseek.baseURL);
		await apply(connections, { type: 'toggleModel', id: 'deepseek-chat', enabled: false });
		await assert.rejects(connections.apply({ type: 'removeModel', provider: 'deepseek', id: 'deepseek-flash', revision: before.revision, requestId: 2 }), /settings-stale/);
		assert.ok(!JSON.stringify(connections.settings).includes('mock-secret'));
		assert.ok(!JSON.stringify(connections.snapshot).includes('replacement'));
	}));
	test('fetch merges discovery without replacing saved names/parameters or silently selecting a model', async () => fixture(async connections => {
		await apply(connections, { type: 'saveModel', originalId: 'deepseek-chat', model: { id: 'deepseek-chat', name: 'My chat', enabled: false, parameters: { temperature: 0.4 }, settings: {} } });
		const original = globalThis.fetch;
		try {
			globalThis.fetch = async () => Response.json({ data: [{ id: 'deepseek-chat' }, { id: 'future', capabilities: ['completion', 'vision'] }] });
			await apply(connections, { type: 'fetchModels' });
			const models = connections.settings.providers.deepseek.models;
			assert.equal(models.find(model => model.id === 'deepseek-chat')?.name, 'My chat');
			assert.equal(models.find(model => model.id === 'deepseek-chat')?.enabled, false);
			assert.equal(models.find(model => model.id === 'deepseek-chat')?.parameters.temperature, 0.4);
			assert.equal(models.find(model => model.id === 'future')?.discovered?.vision, 'supported');
			assert.equal(connections.settings.selection?.model, 'deepseek-flash');
		} finally { globalThis.fetch = original; }
	}));
	test('each response freezes endpoint, parameters and key before settings change; next response uses new values', async () => fixture(async connections => {
		const original = globalThis.fetch;
		const requests: { url: string; key: string | null; temperature: number | undefined }[] = [];
		try {
			globalThis.fetch = async (url, options) => {
				requests.push({ url: String(url), key: new Headers(options?.headers).get('authorization'), temperature: JSON.parse(String(options?.body)).temperature });
				return new Response('data: {"id":"settings","choices":[{"index":0,"delta":{"content":"answer"},"finish_reason":null}]}\n\ndata: {"id":"settings","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
			};
			const files = async (input: { path: string }) => ({ ok: false as const, path: input.path });
			const active = connections.request(files, 'none', [], false);
			await apply(connections, { type: 'saveConnection', baseURL: 'https://other.example/v1', key: 'new-key' });
			await apply(connections, { type: 'saveModel', originalId: 'deepseek-flash', model: { id: 'deepseek-flash', name: 'Flash', enabled: true, parameters: { temperature: 0.4 }, settings: { thinking: 'disabled', overrides: { reasoning: 'supported' } } } });
			for await (const part of active.generate([{ role: 'user', content: 'test' }], new AbortController().signal, files)) { assert.ok(part); }
			const next = connections.request(files, 'none', [], false);
			for await (const part of next.generate([{ role: 'user', content: 'next' }], new AbortController().signal, files)) { assert.ok(part); }
			assert.deepStrictEqual(requests, [{ url: 'https://api.deepseek.com/chat/completions', key: 'Bearer mock-secret', temperature: undefined }, { url: 'https://other.example/v1/chat/completions', key: 'Bearer new-key', temperature: 0.4 }]);
		} finally { globalThis.fetch = original; }
	}));
	test('credential changes during model discovery are observed when the operation finishes', async () => fixture(async (connections, context) => {
		const original = globalThis.fetch;
		let release!: () => void;
		let started!: () => void;
		const ready = new Promise<void>(resolve => { started = resolve; });
		const waiting = new Promise<void>(resolve => { release = resolve; });
		try {
			globalThis.fetch = async () => { started(); await waiting; return Response.json({ data: [{ id: 'deepseek-chat' }] }); };
			const discovery = apply(connections, { type: 'fetchModels' });
			await ready;
			await context.secrets.delete(secretName('deepseek'));
			release(); await discovery;
			assert.equal(connections.settings.keyConfigured.deepseek, false);
			assert.equal(connections.configured, false);
		} finally { release(); globalThis.fetch = original; }
	}));
});

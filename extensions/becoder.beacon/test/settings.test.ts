/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import type * as vscode from 'vscode';
import { Connections, connectionError } from '../src/connections';
import { RequestRecovery } from '../src/requestRecovery';
import { secretName, type ProviderId } from '../src/connection';
import { emptyConfiguration, replaceDiscoveredModels, modelParameterIssues, parseConfiguration, parseModel, validateModel, type SettingsCommand } from '../src/modelConfiguration';
import * as mock from './vscodeMock';

async function fixture(run: (connections: Connections, context: ReturnType<typeof mock.reset>) => Promise<void>) {
	const context = mock.reset('.');
	const connections = new Connections(context as unknown as vscode.ExtensionContext, () => {});
	try { await connections.refresh(); await run(connections, context); } finally { connections.dispose(); }
}
function apply(connections: Connections, command: Omit<SettingsCommand, 'revision' | 'requestId' | 'provider'> & { provider?: ProviderId }) {
	return connections.apply({ provider: 'deepseek', revision: connections.settings.revision, requestId: 1, ...command });
}

suite('Beacon settings', () => {
	test('provider state, keys and equal model IDs retain their provider identity', async () => fixture(async (connections, context) => {
		const data = emptyConfiguration();
		for (const provider of ['deepseek', 'bailian', 'moonshot', 'ollama'] as const) {
			data.providers[provider].enabled = true;
			data.providers[provider].models = [parseModel({ id: 'same-id', name: provider, parameters: {}, settings: {} })];
			if (provider !== 'ollama') { await context.secrets.store(secretName(provider), provider + '-private-credential'); }
		}
		data.selection = { provider: 'deepseek', model: 'same-id' };
		mock.values.set('modelConfiguration', data); await connections.refresh();
		assert.deepStrictEqual(connections.snapshot.choices?.map(model => [model.provider, model.id]), ['deepseek', 'bailian', 'moonshot', 'ollama'].map(provider => [provider, 'same-id']));
		for (const provider of ['bailian', 'moonshot', 'ollama'] as const) {
			await apply(connections, { type: 'selectModel', provider, id: 'same-id' });
			assert.equal(connections.configured, true);
			assert.deepStrictEqual(connections.settings.selection, { provider, model: 'same-id' });
			assert.equal(connections.request(async input => ({ ok: false, path: input.path }), 'none', [], false).source.provider, provider);
		}
		assert.equal(connections.snapshot.keyConfigured, false, 'Local Ollama requires no API key');
		await apply(connections, { type: 'toggleProvider', provider: 'bailian', enabled: false });
		assert.deepStrictEqual(connections.settings.selection, { provider: 'ollama', model: 'same-id' });
		assert.equal(connections.settings.providers.bailian.enabled, false);
		assert.equal(connections.settings.providers.moonshot.enabled, true);
		await apply(connections, { type: 'removeModel', provider: 'moonshot', id: 'same-id' });
		assert.equal(connections.settings.selection?.provider, 'ollama');
		await apply(connections, { type: 'toggleProvider', provider: 'ollama', enabled: false });
		assert.equal(connections.settings.selection, undefined);
		await apply(connections, { type: 'toggleProvider', provider: 'ollama', enabled: true });
		assert.equal(connections.settings.selection, undefined);
		assert.equal(await connections.accessKey('reveal', connections.settings.revision, 'moonshot'), 'moonshot-private-credential');
		assert.ok(!JSON.stringify(connections.settings).includes('private-credential'));
	}));
	test('model discovery confirmation cannot cross provider ownership', async () => fixture(async connections => {
		const original = globalThis.fetch;
		try {
			globalThis.fetch = async () => Response.json({ data: [{ id: 'same-id' }] });
			await apply(connections, { type: 'fetchModels' });
			const candidate = connections.settings.discovery!;
			await assert.rejects(apply(connections, { type: 'confirmModels', provider: 'bailian', discoveryId: candidate.id, ids: ['same-id'] }), /settings-stale/);
			assert.equal(connections.settings.providers.bailian.models.length, 0);
			assert.equal(connections.settings.discovery?.id, candidate.id);
		} finally { globalThis.fetch = original; }
	}));
	test('switching providers preserves the previous legacy provider enabled state', async () => fixture(async (connections, context) => {
		const data = parseConfiguration(mock.values.get('modelConfiguration'));
		data.providers.bailian = { ...data.providers.bailian, enabled: true, models: [parseModel({ id: 'qwen', name: 'Qwen', parameters: {}, settings: {} })] };
		mock.values.set('modelConfiguration', data); await connections.refresh();
		await assert.rejects(apply(connections, { type: 'selectModel', provider: 'bailian', id: 'qwen' }), /model-unavailable/);
		await context.secrets.store(secretName('bailian'), 'bailian-key'); await connections.refresh();
		await apply(connections, { type: 'selectModel', provider: 'bailian', id: 'qwen' });
		assert.equal(connections.settings.providers.deepseek.enabled, true);
		assert.ok(connections.snapshot.choices?.some(model => model.provider === 'deepseek'));
		await apply(connections, { type: 'toggleProvider', provider: 'bailian', enabled: false });
		assert.equal(connections.settings.selection, undefined);
		assert.equal(connections.settings.providers.deepseek.enabled, true);
	}));
	test('parameter conflicts and saved edits are isolated by provider even with equal IDs', async () => fixture(async (connections, context) => {
		const data = emptyConfiguration();
		for (const provider of ['bailian', 'moonshot'] as const) {
			data.providers[provider].enabled = true;
			data.providers[provider].models = [parseModel({ id: 'same-id', name: provider, parameters: { maxOutputTokens: 10000 }, settings: { overrides: { maxOutputTokens: provider === 'bailian' ? 5000 : 20000 } } })];
		}
		data.selection = { provider: 'moonshot', model: 'same-id' };
		mock.values.set('modelConfiguration', data); await context.secrets.store(secretName('moonshot'), 'moonshot-key'); await connections.refresh();
		assert.deepStrictEqual(connections.settings.parameterIssues?.bailian?.['same-id'], [{ field: 'maxOutputTokens', code: 'exceeds-limit' }]);
		assert.deepStrictEqual(connections.settings.parameterIssues?.moonshot?.['same-id'], []);
		const before = connections.settings.providers.moonshot;
		await apply(connections, { type: 'saveConnection', provider: 'bailian', baseURL: 'https://bailian.example/v1', key: 'bailian-key' });
		assert.deepStrictEqual(connections.settings.providers.moonshot, before);
		assert.deepStrictEqual(connections.settings.selection, { provider: 'moonshot', model: 'same-id' });
		assert.equal(await connections.accessKey('reveal', connections.settings.revision, 'bailian'), 'bailian-key');
		assert.equal(await connections.accessKey('reveal', connections.settings.revision, 'moonshot'), 'moonshot-key');
	}));
	test('Ollama discovery and batch testing use the saved local endpoint without a key', async () => fixture(async connections => {
		const original = globalThis.fetch;
		const calls: string[] = [];
		try {
			globalThis.fetch = async (url, options) => {
				calls.push(String(url));
				if (!options?.method || options.method === 'GET') { return String(url).endsWith('/api/tags') ? Response.json({ models: [{ name: 'local-model' }] }) : Response.json({ data: [{ id: 'local-model' }] }); }
				return new Response('data: ' + JSON.stringify({ id: 'test', choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
			};
			await apply(connections, { type: 'fetchModels', provider: 'ollama' });
			assert.equal(connections.settings.discovery?.provider, 'ollama');
			await apply(connections, { type: 'confirmModels', provider: 'ollama', discoveryId: connections.settings.discovery!.id, ids: ['local-model'] });
			await apply(connections, { type: 'testProvider', provider: 'ollama' });
			assert.deepStrictEqual(connections.settings.providerTest?.models.map(model => model.status), ['success']);
			assert.ok(calls.every(url => url.startsWith('http://localhost:11434/')));
		} finally { globalThis.fetch = original; }
	}));
	test('legacy capability overrides persist as booleans', () => {
		const model = parseModel({ id: 'legacy', name: 'Legacy', parameters: {}, settings: { overrides: { vision: 'unknown', reasoning: 'supported', tools: 'unsupported' } }, discovered: { vision: 'unsupported', tools: 'unknown' } });
		assert.deepStrictEqual(model.settings.overrides, { vision: true, reasoning: true, tools: false });
		assert.equal(model.discovered?.vision, false); assert.equal(model.discovered?.tools, true);
	});
	test('reading disabled reasoning preserves conflicting settings for explicit resolution', () => {
		const model = parseModel({ id: 'opaque', name: 'Mine', parameters: { temperature: 0.3, topP: 0.8 }, settings: { thinking: 'enabled', effort: 'high', overrides: { reasoning: false, maxInputTokens: 12000 } } });
		assert.deepStrictEqual(model.settings, { thinking: 'enabled', effort: 'high', overrides: { reasoning: false, maxInputTokens: 12000 } });
		assert.deepStrictEqual(model.parameters, { temperature: 0.3, topP: 0.8 });
		assert.deepStrictEqual(modelParameterIssues('deepseek', 'https://api.deepseek.com', model), [{ field: 'thinking', code: 'unsupported' }, { field: 'effort', code: 'unsupported' }]);
	});
	test('saving or deleting only the key preserves address, model settings and selection', async () => fixture(async (connections, context) => {
		const before = connections.settings.providers;
		const selection = connections.settings.selection;
		await connections.apply({ type: 'saveKey', provider: 'deepseek', requestId: 1, revision: connections.settings.revision, key: ' replacement ' });
		assert.equal(await context.secrets.get(secretName('deepseek')), 'replacement');
		assert.deepStrictEqual(connections.settings.providers, before);
		assert.deepStrictEqual(connections.settings.selection, selection);
		mock.controls.secretError = new Error('secret-storage');
		await assert.rejects(connections.apply({ type: 'saveKey', provider: 'deepseek', requestId: 2, revision: connections.settings.revision, clearKey: true }), /secret-storage/);
		assert.equal(connections.settings.keyConfigured.deepseek, true);
		delete mock.controls.secretError;
		await connections.apply({ type: 'saveKey', provider: 'deepseek', requestId: 3, revision: connections.settings.revision, clearKey: true });
		assert.equal(await context.secrets.get(secretName('deepseek')), undefined);
		assert.equal(connections.settings.keyConfigured.deepseek, false);
		assert.deepStrictEqual(connections.settings.providers, before);
		assert.deepStrictEqual(connections.settings.selection, selection);
	}));

	test('explicit settings key access checks revision without publishing credentials in snapshots', async () => fixture(async connections => {
		const revision = connections.settings.revision;
		assert.equal(await connections.accessKey('reveal', revision, 'deepseek'), 'mock-secret');
		assert.equal(await connections.accessKey('copy', revision, 'deepseek'), undefined);
		assert.ok(!JSON.stringify(connections.settings).includes('mock-secret'));
		await apply(connections, { type: 'toggleProvider', enabled: false });
		await assert.rejects(connections.accessKey('reveal', revision, 'deepseek'), /settings-stale/);
	}));

	test('removing a legacy selected model does not implicitly disable its supplier', async () => fixture(async connections => {
		assert.equal(connections.enabled('deepseek'), true);
		await apply(connections, { type: 'removeModel', id: 'deepseek-flash' });
		assert.equal(connections.settings.selection, undefined);
		assert.equal(connections.enabled('deepseek'), true);
		assert.deepStrictEqual(connections.snapshot.choices?.map(model => model.id), ['deepseek-chat']);
	}));

	test('failed confirmation is atomic and stale candidates cannot overwrite changed endpoints', async () => fixture(async connections => {
		const original = globalThis.fetch;
		try {
			globalThis.fetch = async () => Response.json({ data: [{ id: 'deepseek-flash', input_modalities: ['text'], max_output_tokens: 1000 }] });
			await apply(connections, { type: 'fetchModels' });
			const candidate = connections.settings.discovery!;
			const before = connections.settings.providers;
			mock.controls.updateError = new Error('disk-full');
			await assert.rejects(apply(connections, { type: 'confirmModels', discoveryId: candidate.id, ids: ['deepseek-flash'] }), /disk-full/);
			delete mock.controls.updateError;
			assert.deepStrictEqual(connections.settings.providers, before);
			assert.equal(connections.settings.discovery?.id, candidate.id);
			await assert.rejects(apply(connections, { type: 'confirmModels', discoveryId: candidate.id, ids: ['forged'] }), /invalid-model/);
			await apply(connections, { type: 'saveConnection', baseURL: 'https://another.example/v1' });
			await assert.rejects(apply(connections, { type: 'confirmModels', discoveryId: candidate.id, ids: [] }), /settings-stale/);
		} finally { delete mock.controls.updateError; globalThis.fetch = original; }
	}));
	test('legacy provider data survives and explicitly disabled models remain unavailable', async () => fixture(async connections => {
		const data = emptyConfiguration();
		data.providers.bailian.models = [parseModel({ id: 'private-model', name: 'Keep me', enabled: false, parameters: { topP: 0.7 }, settings: {} })];
		data.selection = { provider: 'bailian', model: 'private-model' };
		mock.values.set('modelConfiguration', data); await connections.refresh();
		assert.deepStrictEqual(connections.settings.providers.bailian, { ...data.providers.bailian, enabled: true });
		assert.deepStrictEqual(connections.settings.selection, data.selection);
		assert.equal(connections.configured, false); assert.deepStrictEqual(connections.snapshot.choices, []);
	}));
	test('refreshing capabilities preserves conflicting parameters and blocks the next request', async () => fixture(async connections => {
		const original = globalThis.fetch;
		try {
			await apply(connections, { type: 'saveModel', originalId: 'deepseek-flash', model: { id: 'deepseek-flash', name: 'Mine', parameters: { maxOutputTokens: 300000 }, settings: { overrides: { maxOutputTokens: 400000 } } } });
			globalThis.fetch = async () => Response.json({ data: [{ id: 'deepseek-flash', max_output_tokens: 1000 }] });
			await apply(connections, { type: 'fetchModels' });
			await apply(connections, { type: 'confirmModels', discoveryId: connections.settings.discovery!.id, ids: ['deepseek-flash'] });
			assert.equal(connections.settings.providers.deepseek.models[0].parameters.maxOutputTokens, 300000);
			assert.deepStrictEqual(connections.settings.parameterIssues?.deepseek?.['deepseek-flash'], [{ field: 'maxOutputTokens', code: 'exceeds-limit' }]);
			assert.throws(() => connections.request(async input => ({ ok: false, path: input.path }), 'none', [], false), /output-limit/);
		} finally { globalThis.fetch = original; }
	}));
	test('refreshed reasoning conflicts survive configuration reload until explicitly resolved', async () => fixture(async connections => {
		const original = globalThis.fetch;
		try {
			await apply(connections, { type: 'saveModel', originalId: 'deepseek-flash', model: { id: 'deepseek-flash', name: 'Mine', parameters: {}, settings: { thinking: 'enabled', effort: 'high' } } });
			globalThis.fetch = async () => Response.json({ data: [{ id: 'deepseek-flash', reasoning: false }] });
			await apply(connections, { type: 'fetchModels' });
			await apply(connections, { type: 'confirmModels', discoveryId: connections.settings.discovery!.id, ids: ['deepseek-flash'] });
			await connections.refresh();
			assert.deepStrictEqual(connections.settings.providers.deepseek.models[0].settings, { thinking: 'enabled', effort: 'high' });
			assert.deepStrictEqual(connections.settings.parameterIssues?.deepseek?.['deepseek-flash'], [{ field: 'thinking', code: 'unsupported' }, { field: 'effort', code: 'unsupported' }]);
			assert.throws(() => connections.request(async input => ({ ok: false, path: input.path }), 'none', [], false), /invalid-thinking/);
			const model = connections.settings.providers.deepseek.models[0];
			await apply(connections, { type: 'saveModel', originalId: model.id, model: { ...model, settings: { overrides: { reasoning: false } } } });
			await connections.refresh();
			assert.deepStrictEqual(connections.settings.parameterIssues?.deepseek?.[model.id], []);
		} finally { globalThis.fetch = original; }
	}));

	test('discovery cancellation and stale confirmation preserve the saved document', async () => fixture(async connections => {
		const before = connections.settings.providers;
		const original = globalThis.fetch;
		try {
			globalThis.fetch = async () => Response.json({ data: [{ id: 'A' }] });
			await apply(connections, { type: 'fetchModels' });
			assert.deepStrictEqual(connections.settings.providers, before);
			const discovery = connections.settings.discovery!;
			await apply(connections, { type: 'cancelDiscovery', discoveryId: discovery.id });
			await assert.rejects(apply(connections, { type: 'confirmModels', discoveryId: discovery.id, ids: ['A'] }), /settings-stale/);
			await apply(connections, { type: 'fetchModels' });
			await apply(connections, { type: 'confirmModels', discoveryId: connections.settings.discovery!.id, ids: [] });
			assert.equal(connections.settings.providers.deepseek.models.length, 0);
			assert.equal(connections.settings.selection, undefined);
			assert.equal(connections.settings.keyConfigured.deepseek, true);
		} finally { globalThis.fetch = original; }
	}));

	test('confirmation replaces capabilities and membership while preserving generation parameters', () => {
		const current = { baseURL: 'https://api.deepseek.com', models: [parseModel({ id: 'A', name: 'Mine', enabled: false, parameters: { temperature: 0.4, maxOutputTokens: 300000 }, settings: { thinking: 'disabled', overrides: { vision: true } } }), parseModel({ id: 'Pro', name: 'Pro', parameters: {}, settings: {} })] };
		const next = replaceDiscoveredModels(current, [{ provider: 'deepseek', id: 'A', capabilities: { purpose: 'chat', vision: true, tools: true, reasoning: true, source: 'service', maxOutputTokens: 200000 } }], ['A']);
		assert.equal(next.enabled, true); assert.equal(next.models.length, 1); assert.equal(next.models[0].name, 'Mine');
		assert.deepStrictEqual(next.models[0].parameters, { temperature: 0.4, maxOutputTokens: 300000 });
		assert.equal(next.models[0].settings.overrides, undefined);
		assert.ok(modelParameterIssues('deepseek', current.baseURL, next.models[0]).some(issue => issue.field === 'maxOutputTokens'));
		assert.equal(replaceDiscoveredModels({ ...current, enabled: false }, [], []).enabled, false);
		assert.throws(() => replaceDiscoveredModels(current, [], ['forged']), /invalid-model/);
	});

	test('structured quota and authentication failures reuse existing safe account messages', async () => {
		for (const [code, expected] of [['insufficient_quota', 'The provider account has insufficient balance.'], ['invalid_api_key', 'The provider rejected the API key or access to this model.']] as const) {
			let requests = 0;
			const recovery = new RequestRecovery(async () => { requests++; return new Response(JSON.stringify({ error: { code, message: 'private provider response' } }), { status: 429 }); }, new AbortController().signal, { wait: async () => { assert.fail('Account failure was retried'); } });
			try { await recovery.fetch('https://provider.invalid', { method: 'POST', body: '{}' }); assert.fail('Account failure was accepted'); }
			catch (error) { assert.equal(connectionError(error), expected); }
			assert.equal(requests, 1);
		}
	});
	test('fresh configuration ignores all old keys and never picks the first model', async () => fixture(async connections => {
		mock.values.delete('modelConfiguration'); mock.values.set('provider', 'deepseek'); mock.values.set('deepseek.model', 'deepseek-chat');
		await connections.refresh();
		assert.ok(Object.values(connections.settings.providers).every(profile => profile.models.length === 0 && profile.enabled === false));
		assert.equal(connections.configured, false); assert.equal(connections.settings.selection, undefined);
		await apply(connections, { type: 'saveModel', model: { id: 'new', name: 'New', enabled: true, parameters: {}, settings: {} } });
		assert.equal(connections.settings.selection, undefined);
	}));
	test('duplicates, invalid parameter values and unsupported adapter options are rejected', () => {
		const data = emptyConfiguration();
		const model = parseModel({ id: 'one', name: 'One', enabled: true, parameters: { temperature: 0.3 }, settings: { overrides: { vision: true } } });
		data.providers.deepseek.models = [model, model];
		assert.throws(() => parseConfiguration(data), /duplicate-model/);
		assert.throws(() => parseModel({ ...model, parameters: { topP: NaN } }), /invalid-model-parameter/);
		assert.throws(() => parseModel({ ...model, settings: { overrides: { tools: 'yes' } } }), /invalid-model-capability/);
		assert.throws(() => validateModel('moonshot', 'https://api.moonshot.cn/v1', { ...model, settings: { effort: 'max' } }), /invalid-effort/);
		assert.throws(() => validateModel('deepseek', 'https://api.deepseek.com', { ...model, id: 'deepseek-reasoner', settings: {}, parameters: { temperature: 1 } }), /unsupported-sampling/);
		assert.throws(() => validateModel('deepseek', 'https://other.example/v1', { ...model, id: 'deepseek-flash', settings: {}, parameters: { temperature: 0.4 } }), /unsupported-sampling/);
		validateModel('deepseek', 'https://other.example/v1', { ...model, id: 'deepseek-flash', settings: { thinking: 'disabled', overrides: { reasoning: true } }, parameters: { temperature: 0.4 } });
	});
	test('a save persists the whole model; disabling/removing the active model never selects another', async () => fixture(async connections => {
		await apply(connections, { type: 'saveModel', originalId: 'deepseek-flash', model: { id: 'deepseek-flash', name: 'My Flash', enabled: true, parameters: { temperature: 0.5, topP: 0.8, maxOutputTokens: 2048 }, settings: { thinking: 'disabled', overrides: { contextWindow: 128000 } } } });
		assert.equal(connections.snapshot.displayName, 'My Flash');
		assert.deepStrictEqual(connections.snapshot.parameters, { temperature: 0.5, topP: 0.8, maxOutputTokens: 2048 });
		await assert.rejects(apply(connections, { type: 'saveModel', model: { id: 'deepseek-flash', name: 'Duplicate', enabled: true, parameters: {}, settings: {} } }), /duplicate-model/);
		await apply(connections, { type: 'toggleProvider', enabled: false });
		assert.equal(connections.configured, false); assert.equal(connections.snapshot.model, '');
		await apply(connections, { type: 'removeModel', id: 'deepseek-flash' });
		assert.equal(connections.settings.selection, undefined); assert.equal(connections.snapshot.model, '');
		assert.deepStrictEqual(connections.snapshot.choices, []);
	}));
	test('failed connection save rolls back credentials; stale forms cannot overwrite newer settings', async () => fixture(async (connections, context) => {
		const before = connections.settings;
		mock.controls.updateError = new Error('disk');
		await assert.rejects(apply(connections, { type: 'saveConnection', baseURL: 'https://other.example/v1', key: 'replacement' }), /disk/);
		delete mock.controls.updateError;
		assert.equal(await context.secrets.get(secretName('deepseek')), 'mock-secret');
		assert.equal(connections.settings.providers.deepseek.baseURL, before.providers.deepseek.baseURL);
		await apply(connections, { type: 'toggleProvider', enabled: false });
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
			await apply(connections, { type: 'confirmModels', discoveryId: connections.settings.discovery!.id, ids: ['deepseek-chat', 'future'] });
			const models = connections.settings.providers.deepseek.models;
			assert.equal(models.find(model => model.id === 'deepseek-chat')?.name, 'My chat');
			assert.equal(models.find(model => model.id === 'deepseek-chat')?.enabled, undefined);
			assert.equal(models.find(model => model.id === 'deepseek-chat')?.parameters.temperature, 0.4);
			assert.equal(models.find(model => model.id === 'future')?.discovered?.vision, true);
			assert.equal(connections.settings.selection, undefined);
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
			await apply(connections, { type: 'saveModel', originalId: 'deepseek-flash', model: { id: 'deepseek-flash', name: 'Flash', enabled: true, parameters: { temperature: 0.4 }, settings: { thinking: 'disabled', overrides: { reasoning: true } } } });
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
			release(); await assert.rejects(discovery, /settings-stale/);
			assert.equal(connections.settings.keyConfigured.deepseek, false);
			assert.equal(connections.configured, false);
		} finally { release(); globalThis.fetch = original; }
	}));
});

/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBeCoderInfoReader, beCoderInfoTopics } from '../src/productInfo';
import { BeaconContextClient } from '../src/context';
import { ContextTools } from '../src/contextTools';
import { contextInputValid } from '../src/contextToolContract';

const signal = new AbortController().signal;
const state = { slot: 'info', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, collectionPending: false, recent: [] };
test('topic_reads_one_complete_resource', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'becoder-info-'));
	try {
		for (const topic of beCoderInfoTopics) { await writeFile(path.join(root, topic + '.md'), '# ' + topic + '\n' + '事实。'.repeat(50000)); }
		const read = createBeCoderInfoReader(root, async () => '2.1.1');
		for (const topic of beCoderInfoTopics) { assert.deepEqual(await read(topic, signal), { version: '2.1.1', topic, content: '# ' + topic + '\n' + '事实。'.repeat(50000) }); }
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid_topic_has_no_reads', async () => {
	let reads = 0;
	const client = new BeaconContextClient(async operation => { if (operation === 'context') { return state; } throw new Error('unexpected-host-read'); });
	await client.refresh();
	const tools = new ContextTools(client, client.captureScope(), [], { readBeCoderInfo: async topic => { reads++; return { version: '2.1.1', topic, content: 'facts' }; } });
	for (const input of [{ topic: null }, { topic: '' }, { topic: '../runner' }, { topic: 'other' }, { topic: 'cph', path: 'C:/private' }]) {
		assert.equal(contextInputValid('readBeCoderInfo' as never, input), false);
		assert.ok((await tools.execute('readBeCoderInfo' as never, input, signal)).error);
	}
	assert.equal(reads, 0);
	assert.deepEqual(await tools.execute('readBeCoderInfo' as never, {}, signal), { version: '2.1.1', topic: 'overview', content: 'facts' });
});

test('missing_resource_or_version_is_read_failed', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'becoder-info-failure-'));
	try {
		await writeFile(path.join(root, 'cph.md'), '');
		for (const read of [createBeCoderInfoReader(root, async () => '2.1.1'), createBeCoderInfoReader(root, async () => ''), createBeCoderInfoReader(root, async () => { throw new Error('host-unavailable'); })]) {
			const client = new BeaconContextClient(async () => state); await client.refresh();
			const tools = new ContextTools(client, client.captureScope(), [], { readBeCoderInfo: read });
			const result = await tools.execute('readBeCoderInfo' as never, { topic: 'cph' }, signal);
			assert.equal(typeof result.error === 'object' ? result.error.code : '', 'read_failed');
		}
		const client = new BeaconContextClient(async () => state); await client.refresh();
		const tools = new ContextTools(client, client.captureScope(), [], { readBeCoderInfo: createBeCoderInfoReader(root, async () => '2.1.1') });
		const missing = await tools.execute('readBeCoderInfo' as never, { topic: 'runner' }, signal);
		assert.equal(typeof missing.error === 'object' ? missing.error.code : '', 'read_failed');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('cancelled_read_never_delivers_body', async () => {
	const controller = new AbortController(); let release: (value: string) => void = () => {};
	const read = createBeCoderInfoReader('not-read', async () => new Promise<string>(resolve => { release = resolve; }));
	const pending = read('overview', controller.signal); controller.abort(); release('2.1.1');
	await assert.rejects(pending, { name: 'AbortError' });
	await assert.rejects(read('overview', controller.signal), { name: 'AbortError' });
});

test('product_version_ignores_workspace_and_compatibility_version', async () => {
	const operations: string[] = [];
	const client = new BeaconContextClient(async operation => { operations.push(operation); if (operation === 'productVersion') { return '2.1.1'; } throw new Error('workspace-service-not-allowed'); });
	assert.equal(await client.productVersion(signal), '2.1.1');
	assert.deepEqual(operations, ['productVersion']);
});

test('all_modes_and_no_workspace_keep_info_but_compaction_cannot_read_it', async () => {
	for (const mode of ['blackout', 'spot', 'flood'] as const) {
		const current = mode === 'blackout' ? state : { ...state, mode, usable: true, root: 'C:/practice', workspaceState: 'ready' };
		const client = new BeaconContextClient(async () => current); await client.refresh();
		const tools = new ContextTools(client, client.captureScope(), [], { readBeCoderInfo: async topic => ({ version: '2.1.1', topic, content: 'facts' }) });
		assert.ok(tools.names.includes('readBeCoderInfo' as never));
		assert.equal((await tools.execute('readBeCoderInfo' as never, {}, signal)).error, undefined);
		assert.ok(!tools.compactionView().names!.includes('readBeCoderInfo' as never));
		assert.ok((await tools.compactionView().execute('readBeCoderInfo' as never, {}, signal)).error);
	}
});

test('product_info_stage_rejects_missing_empty_or_changed_topics', async () => {
	const { verifyProductInfo } = await import(pathToFileURL(path.join(__dirname, '../test/verify-product-info.mts')).href);
	const root = await mkdtemp(path.join(tmpdir(), 'becoder-info-stage-'));
	const source = path.resolve(__dirname, '..');
	const info = path.join(root, 'resources/app/extensions/becoder.beacon/resources/product-info');
	try {
		await mkdir(info, { recursive: true });
		await mkdir(path.join(root, 'resources/app/extensions/becoder.beacon/dist'));
		await writeFile(path.join(root, 'resources/app/package.json'), '{"version":"2.1.1"}');
		await writeFile(path.join(root, 'resources/app/extensions/becoder.beacon/dist/extension.cjs'), await readFile(path.join(source, 'dist/extension.cjs')));
		await assert.rejects(verifyProductInfo(root, source));
		for (const topic of beCoderInfoTopics) { await writeFile(path.join(info, topic + '.md'), await readFile(path.join(source, 'resources/product-info', topic + '.md'))); }
		assert.equal((await verifyProductInfo(root, source)).version, '2.1.1');
		await writeFile(path.join(info, 'cph.md'), ''); await assert.rejects(verifyProductInfo(root, source));
		await writeFile(path.join(info, 'cph.md'), 'different'); await assert.rejects(verifyProductInfo(root, source));
	} finally { await rm(root, { recursive: true, force: true }); }
});

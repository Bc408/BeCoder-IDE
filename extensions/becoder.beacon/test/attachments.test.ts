/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import type * as vscode from 'vscode';
import { AttachmentError, attachmentBudget, readAttachments, validAttachments, type Attachment } from '../src/attachments';
import { FileTools } from '../src/fileTools';
import { ChatSession, type Generate, type Snapshot } from '../src/session';
import { ChatHistory, readHistory, type HistoryData } from '../src/history';
import { createGenerator } from '../src/provider';
import { providers } from '../src/connection';
import { unknownCapabilities } from '../src/models';
import { WebviewResourceDrag } from '../../../src/vs/workbench/contrib/webview/common/webviewResourceDrag';
import { activate, deactivate } from '../src/extension';
import * as mock from './vscodeMock';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6dwAAAABJRU5ErkJggg==';
const signal = new AbortController().signal;
async function fixture(run: (directory: string) => Promise<void>) {
	const root = path.resolve('../../tmp');
	await fs.mkdir(root, { recursive: true });
	const directory = await fs.mkdtemp(path.join(root, 'beacon-attachments-'));
	try { await run(directory); } finally { assert.ok(directory.startsWith(root + path.sep)); await fs.rm(directory, { recursive: true, force: true }); }
}
function response(text = 'answer') {
	return new Response('data: ' + JSON.stringify({ id: 'attachments', choices: [{ index: 0, delta: { content: text }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'attachments', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}
async function until(condition: () => boolean) {
	for (let i = 0; i < 200; i++) { if (condition()) { return; } await new Promise(resolve => setTimeout(resolve, 10)); }
	assert.fail('Expected state did not arrive');
}

suite('Beacon attachments', () => {
	test('native origin cannot be claimed by a synthetic gesture or an unrelated/mixed drop', () => {
		const drag = new WebviewResourceDrag();
		drag.start(false, ['file:///same.cpp']); assert.equal(drag.source(true, ['file:///same.cpp']), 'external');
		drag.start(true, ['file:///same.cpp']); assert.equal(drag.source(true, ['file:///same.cpp']), 'internal');
		assert.equal(drag.source(false, ['file:///same.cpp']), 'external');
		assert.equal(drag.source(true, ['file:///same.cpp', 'file:///other.cpp']), 'external');
		drag.end(); assert.equal(drag.source(true, ['file:///same.cpp']), 'external');
	});
	test('none rejects all sources before reading; workspace refuses Explorer and picker even for the same file', async () => {
		const never = async () => { assert.fail('Unauthorized file was read'); };
		for (const source of ['internal', 'external', 'picker'] as const) { await assert.rejects(readAttachments([{ path: 'same.cpp', source }], 'none', never, signal), AttachmentError); }
		for (const source of ['external', 'picker'] as const) { await assert.rejects(readAttachments([{ path: 'same.cpp', source }], 'workspace', never, signal), AttachmentError); }
		await assert.rejects(readAttachments([{ path: 'same.cpp', source: 'internal' }, { path: 'same.cpp', source: 'external' }], 'workspace', never, signal), AttachmentError);
	});
	test('real targets, private files, editor buffers, binary excerpts and malformed images use the authorized reader', async () => fixture(async directory => {
		const root = path.join(directory, 'workspace'); await fs.mkdir(root);
		const file = path.join(root, 'main.cpp'); await fs.writeFile(file, 'disk');
		await fs.writeFile(path.join(root, 'pixel.png'), Buffer.from(png, 'base64'));
		await fs.writeFile(path.join(root, 'bad.png'), 'not an image');
		await fs.writeFile(path.join(root, 'data.bin'), Buffer.from([0, 255, 1]));
		await fs.writeFile(path.join(root, '.env'), 'private');
		await fs.writeFile(path.join(directory, 'outside.txt'), 'outside');
		await fs.symlink(directory, path.join(root, 'escape'), 'junction');
		const files = new FileTools('workspace', [{ name: 'root', path: root }], async target => target === file ? 'unsaved editor' : undefined);
		const captured = await readAttachments([{ path: file, source: 'internal' }, { path: path.join(root, 'pixel.png'), source: 'internal' }, { path: path.join(root, 'data.bin'), source: 'internal' }], 'workspace', files.execute, signal);
		assert.equal(captured[0].contents, 'unsaved editor'); assert.equal(captured[1].contents, png); assert.equal(captured[2].contents, '00ff01'); assert.ok(validAttachments(captured));
		for (const target of ['escape/outside.txt', '.env', 'bad.png']) { await assert.rejects(readAttachments([{ path: path.join(root, target), source: 'internal' }], 'workspace', files.execute, signal), AttachmentError); }
		await assert.rejects(readAttachments([{ path: path.join(root, '.env'), source: 'picker' }], 'computer', new FileTools('computer', []).execute, signal), AttachmentError);
		for (const source of ['external', 'picker'] as const) { assert.equal((await readAttachments([{ path: file, source }], 'computer', new FileTools('computer', []).execute, signal))[0].contents, 'disk'); }
	}));
	test('cancellation and total bytes are enforced; persisted attachments cannot inject unbounded or invalid payloads', async () => {
		const controller = new AbortController();
		await assert.rejects(readAttachments([{ path: 'file', source: 'internal' }], 'workspace', async () => { controller.abort(); return { ok: true, kind: 'text', path: 'file', contents: 'late' }; }, controller.signal), { name: 'AbortError' });
		await assert.rejects(readAttachments([{ path: 'file', source: 'internal' }], 'workspace', async () => ({ ok: true, kind: 'text', path: 'file', contents: 'x'.repeat(attachmentBudget + 1) }), signal), AttachmentError);
		assert.equal(validAttachments([{ id: 'a', path: 'file', name: 'file', source: 'internal', kind: 'image', mediaType: 'image/png', contents: 'not-base64', truncated: false }]), false);
	});
	test('images and text reach all four installed adapters as actual image_url and text parts', async () => {
		const captured = await readAttachments([{ path: 'image.png', source: 'internal' }], 'workspace', async () => ({ ok: true, path: 'image.png', kind: 'image', contents: png, mediaType: 'image/png' }), signal);
		for (const provider of ['deepseek', 'bailian', 'moonshot', 'ollama'] as const) {
			let calls = 0;
			const generate = createGenerator(async () => ({ provider, ...providers[provider], model: 'vision', parameters: {}, apiKey: 'test', capabilities: { ...unknownCapabilities, purpose: 'chat', vision: 'supported' } }), async (_url, options) => {
				calls++;
				const content = JSON.parse(String(options?.body)).messages.find((item: { role: string }) => item.role === 'user').content;
				assert.ok(content.some((part: { type: string; image_url?: { url: string } }) => part.type === 'image_url' && part.image_url?.url === 'data:image/png;base64,' + png));
				assert.ok(content.some((part: { type: string; text?: string }) => part.type === 'text' && part.text === 'look'));
				return response();
			}, 'none', [], false);
			const session = new ChatSession(() => {}, String);
			await session.send('look', generate, undefined, undefined, captured);
			assert.equal(session.snapshot.messages.at(-1)?.status, 'complete'); assert.equal(calls, 1);
		}
	});
	test('image-only history, pause/resume, regeneration, edit and new messages retain captured context without disk rereads', async () => {
		const captured = await readAttachments([{ path: 'image.png', source: 'internal' }], 'workspace', async () => ({ ok: true, path: 'image.png', kind: 'image', contents: png, mediaType: 'image/png' }), signal);
		let saved: HistoryData | undefined;
		const history = new ChatHistory(undefined, async data => { saved = data; }, () => {}, String);
		const generate: Generate = async function* (messages) { assert.ok(JSON.stringify(messages).includes(png)); yield { type: 'text', text: 'half' }; history.session.stop(); };
		await history.session.send('', generate, undefined, undefined, captured); await history.flush();
		assert.equal(history.snapshot.history[0].title, 'image.png'); assert.equal(history.snapshot.messages.at(-1)?.status, 'stopped');
		const restored = new ChatHistory(readHistory(saved), async () => {}, () => {}, String);
		const next: Generate = async function* (messages) { assert.ok(JSON.stringify(messages).includes(png)); yield { type: 'text', text: 'next' }; };
		await restored.session.resume(2, next); assert.equal(restored.snapshot.messages.at(-1)?.text, 'halfnext');
		await restored.session.regenerate(2, next); assert.equal(restored.snapshot.messages.at(-1)?.text, 'next');
		await restored.session.edit(1, '', next); assert.equal(restored.snapshot.messages[0].attachments?.[0].contents, png);
		await restored.session.send('followup', next); assert.equal(restored.snapshot.messages.at(-1)?.status, 'complete');
		await history.dispose(); await restored.dispose();
	});
	test('actual host rejects forged drop messages, checks picker downgrades, preserves failed drafts and captures latest editor data', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView();
		const file = path.join(directory, 'main.cpp'); await fs.writeFile(file, 'disk');
		const image = path.join(directory, 'image.png'); await fs.writeFile(image, Buffer.from(png, 'base64'));
		const originalFetch = globalThis.fetch; const originalPicker = mock.window.showOpenDialog;
		const bodies: unknown[] = [];
		globalThis.fetch = async (_url, options) => { bodies.push(JSON.parse(String(options?.body))); return response(); };
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { configured: boolean; attachments: Attachment[]; connection: { model: string } };
		try {
			await activate(context as unknown as vscode.ExtensionContext);
			mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured === true);
			view.receive({ type: 'drop', source: 'internal', paths: [file] }); assert.equal(snapshot().attachments.length, 0);
			view.drop({ uris: [mock.Uri.file(file)], source: 'external' }); await until(() => !snapshot().busy); assert.equal(snapshot().attachments.length, 0);
			view.drop({ uris: [mock.Uri.file(file)], source: 'internal' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
			mock.workspace.textDocuments = [{ uri: mock.Uri.file(file), isClosed: false, getText: () => 'latest unsaved editor' }];
			await mock.workspace.getConfiguration().update('filePermission', 'none'); await until(() => snapshot().configured);
			view.receive({ type: 'send', text: 'keep draft' }); await until(() => !snapshot().busy);
			assert.equal(snapshot().attachments.length, 1); assert.equal(snapshot().messages.length, 0); assert.equal(bodies.length, 0);
			await mock.workspace.getConfiguration().update('filePermission', 'workspace'); await until(() => snapshot().configured);
			view.receive({ type: 'send', text: 'look' }); await until(() => snapshot().messages.at(-1)?.status === 'complete' && !snapshot().busy);
			assert.ok(JSON.stringify(bodies).includes('latest unsaved editor')); assert.equal(snapshot().attachments.length, 0);
			assert.equal(snapshot().messages[0].attachments?.[0].contents, '', 'Streaming snapshots do not repeatedly transfer attachment bytes');
			view.drop({ uris: [mock.Uri.file(image)], source: 'internal' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
			await mock.workspace.getConfiguration().update('deepseek.model', 'deepseek-chat'); await until(() => snapshot().configured && snapshot().connection.model === 'deepseek-chat');
			view.receive({ type: 'send', text: 'image' }); await until(() => !snapshot().busy); assert.equal(bodies.length, 1); assert.equal(snapshot().attachments.length, 1);
			view.receive({ type: 'removeAttachment', id: snapshot().attachments[0].id }); assert.equal(snapshot().attachments.length, 0);
			await mock.workspace.getConfiguration().update('filePermission', 'computer'); await until(() => snapshot().configured);
			let choose: (uris: ReturnType<typeof mock.Uri.file>[]) => void = () => {};
			mock.window.showOpenDialog = () => new Promise(resolve => { choose = resolve; });
			view.receive({ type: 'addFiles' }); assert.equal(snapshot().busy, true);
			await mock.workspace.getConfiguration().update('filePermission', 'workspace');
			choose([mock.Uri.file(file)]); await until(() => !snapshot().busy);
			assert.equal(snapshot().attachments.length, 0, 'Picker cannot retain a revoked grant');
			view.drop({ uris: [mock.Uri.file(file)], source: 'internal' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
			const previousMessages = JSON.stringify(snapshot().messages);
			view.receive({ type: 'send', text: 'cancel before model' });
			view.receive({ type: 'clear' }); view.receive({ type: 'stop' }); await until(() => !snapshot().busy);
			assert.equal(JSON.stringify(snapshot().messages), previousMessages); assert.equal(snapshot().attachments.length, 1); assert.equal(bodies.length, 1);
			view.receive({ type: 'removeAttachment', id: snapshot().attachments[0].id });
			await mock.workspace.getConfiguration().update('deepseek.model', 'deepseek-flash'); await until(() => snapshot().configured && snapshot().connection.model === 'deepseek-flash');
			view.drop({ uris: [mock.Uri.file(image)], source: 'internal' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
			view.receive({ type: 'send', text: '' }); await until(() => snapshot().messages.length === 4 && !snapshot().busy);
			const imageHistory = JSON.stringify(snapshot().messages);
			await mock.workspace.getConfiguration().update('deepseek.model', 'deepseek-chat'); await until(() => snapshot().configured && snapshot().connection.model === 'deepseek-chat');
			view.receive({ type: 'regenerate', id: snapshot().messages.at(-1)!.id });
			view.receive({ type: 'send', text: 'blocked followup' }); await until(() => !snapshot().busy);
			assert.equal(JSON.stringify(snapshot().messages), imageHistory, 'Vision rejection occurs before truncating or adding a message'); assert.equal(bodies.length, 2);
			view.receive({ type: 'regenerate', id: 2 }); await until(() => snapshot().messages.length === 2 && !snapshot().busy);
			assert.equal(snapshot().messages.at(-1)?.status, 'complete'); assert.equal(bodies.length, 3, 'Regenerating an earlier text answer excludes the later image branch');
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } globalThis.fetch = originalFetch; mock.window.showOpenDialog = originalPicker; }
	}));
});

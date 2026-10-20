/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import type * as vscode from 'vscode';
import { AttachmentError, attachmentBudget, captureClipboardImages, readAttachments, validAttachments, type Attachment } from '../src/attachments';
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
async function until(condition: () => boolean, label = '') {
	for (let i = 0; i < 200; i++) { if (condition()) { return; } await new Promise(resolve => setTimeout(resolve, 10)); }
	assert.fail('Expected state did not arrive' + (label ? ': ' + label : ''));
}

suite('Beacon attachments', () => {
	test('typing during mode IPC and a failed return preserve the latest pending input', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView(); const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => response();
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { draftText: string; viewKey: string; screen: string; activeId: string; configured: boolean; permission: string; requestNotice?: unknown };
		let finish!: () => void;
		const originalTransport = mock.commandHandlers.get('_becoder.beacon.context')!;
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured);
			view.receive({ type: 'selectWorkspace', root: directory }); await until(() => mock.beaconContext.usable && !snapshot().busy);
			view.receive({ type: 'send', text: 'source' }); await until(() => snapshot().messages.length === 2 && !snapshot().busy);
			const sourceId = snapshot().activeId;
			view.receive({ type: 'draft', text: 'before switching', viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === 'before switching');
			const native = mock.commandHandlers.get('_becoder.beacon.context')!;
			let enter!: () => void; const entered = new Promise<void>(resolve => { enter = resolve; }); const barrier = new Promise<void>(resolve => { finish = resolve; });
			mock.commandHandlers.set('_becoder.beacon.context', async (operation, input) => { if (operation === 'mode') { enter(); await barrier; } return native(operation, input); });
			view.receive({ type: 'setPermission', permission: 'none' }); await entered;
			view.receive({ type: 'draft', text: 'typed during switch', viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === 'typed during switch'); finish();
			await until(() => snapshot().permission === 'none' && !snapshot().busy);
			assert.equal(snapshot().draftText, 'typed during switch');
			mock.commandHandlers.set('_becoder.beacon.context', (operation, input) => { if (operation === 'release') { throw new Error('beacon-write-busy'); } return native(operation, input); });
			view.receive({ type: 'back' }); await until(() => !!snapshot().requestNotice && !snapshot().busy);
			assert.equal(snapshot().screen, 'conversation'); assert.equal(snapshot().activeId, sourceId); assert.equal(snapshot().draftText, 'typed during switch');
		} finally { finish?.(); mock.commandHandlers.set('_becoder.beacon.context', originalTransport); await deactivate(); for (const item of context.subscriptions) { item.dispose(); } globalThis.fetch = originalFetch; }
	}));
	test('opening history after a mode switch saves the pending home draft separately', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView(); const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => response();
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { draftText: string; viewKey: string; screen: string; activeId: string; configured: boolean; history: { id: string }[] };
		const navigate = async (message: unknown) => { view.receive(message); await until(() => snapshot().busy); await until(() => !snapshot().busy); };
		const write = async (text: string) => { view.receive({ type: 'draft', text, viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === text); };
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured); await navigate({ type: 'selectWorkspace', root: directory });
			view.receive({ type: 'send', text: 'saved source' }); await until(() => snapshot().messages.length === 2 && !snapshot().busy);
			const sourceId = snapshot().activeId; await write('detail input');
			await navigate({ type: 'setPermission', permission: 'none' });
			view.receive({ type: 'send', text: 'temporary fork' }); await until(() => snapshot().messages.length === 4 && !snapshot().busy);
			await navigate({ type: 'back' }); await write('carried home');
			await navigate({ type: 'setPermission', permission: 'workspace' });
			assert.deepStrictEqual(snapshot().history.map(item => item.id), [sourceId]);
			await navigate({ type: 'openHistory', conversationId: sourceId });
			assert.equal(snapshot().activeId, sourceId); assert.equal(snapshot().draftText, ''); assert.equal(snapshot().messages.length, 2);
			await navigate({ type: 'back' }); assert.equal(snapshot().draftText, 'carried home');
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } globalThis.fetch = originalFetch; }
	}));
	test('mode changes keep the composer and fork independent context only on accepted sends', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView(); const originalFetch = globalThis.fetch;
		let requests = 0;
		globalThis.fetch = async () => {
			if (requests++ === 0) {
				return new Response('data: ' + JSON.stringify({ id: 'capture', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'page-capture', type: 'function', function: { name: 'inspectContext', arguments: JSON.stringify({ operation: 'page', id: 'page-one', version: 'v1', limit: 3 }) } }] }, finish_reason: 'tool_calls' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
			}
			return response();
		};
		const transport = mock.commandHandlers.get('_becoder.beacon.context')!;
		mock.commandHandlers.set('_becoder.beacon.context', (operation, input) => {
			if (operation === 'pages') { return [{ id: 'page-one', kind: 'text', title: 'capture', version: 'v1', dirty: true }]; }
			if (operation === 'page') { return { id: 'page-one', kind: 'text', title: 'capture', version: 'v1', dirty: true, contents: 'complete captured page beyond the requested excerpt', totalCharacters: 51 }; }
			if (operation === 'runtimeList') { return []; }
			return transport(operation, input);
		});
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { draftText: string; viewKey: string; screen: string; activeId: string; configured: boolean };
		const navigate = async (message: unknown) => { view.receive(message); await until(() => snapshot().busy); await until(() => !snapshot().busy); };
		const write = async (text: string) => { view.receive({ type: 'draft', text, viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === text); };
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured);
			await navigate({ type: 'selectWorkspace', root: directory });
			view.receive({ type: 'send', text: 'original question' }); await until(() => snapshot().messages.length === 2 && !snapshot().busy);
			const originalId = snapshot().activeId;
			await mock.commands.executeCommand('_becoder.beacon.flush');
			assert.equal((mock.beaconConversations.get(`${directory}:${originalId}`)!.data.contextSnapshots as { raw: string }[])[0].raw, 'complete captured page beyond the requested excerpt');
			await write('question B');
			await navigate({ type: 'setPermission', permission: 'computer' });
			assert.equal(snapshot().activeId, originalId); assert.equal(snapshot().draftText, 'question B');
			await navigate({ type: 'setPermission', permission: 'workspace' });
			await navigate({ type: 'setPermission', permission: 'none' });
			assert.equal(snapshot().screen, 'conversation'); assert.equal(snapshot().activeId, originalId);
			assert.equal(snapshot().draftText, 'question B'); assert.equal(snapshot().messages.length, 2);
			await navigate({ type: 'setPermission', permission: 'none' });
			assert.equal(snapshot().activeId, originalId); assert.equal(snapshot().messages.length, 2);
			await navigate({ type: 'setPermission', permission: 'workspace' });
			assert.equal(snapshot().activeId, originalId); assert.equal(snapshot().draftText, 'question B');
			await navigate({ type: 'setPermission', permission: 'none' });
			view.receive({ type: 'send', text: 'question B' }); await until(() => snapshot().messages.length === 4 && !snapshot().busy);
			assert.notEqual(snapshot().activeId, originalId);
			assert.equal(snapshot().messages[2].transition, 'temporary');
			const source = mock.beaconConversations.get(`${directory}:${originalId}`)!;
			assert.equal(source.data.messages.length, 2); assert.deepStrictEqual(source.data.draft, { text: '', attachments: [] });
			const temporaryId = snapshot().activeId;
			await write('question D'); await navigate({ type: 'setPermission', permission: 'workspace' });
			assert.equal(snapshot().activeId, temporaryId); assert.equal(snapshot().draftText, 'question D');
			view.receive({ type: 'send', text: 'question D' }); await until(() => snapshot().messages.length === 6 && !snapshot().busy);
			const savedId = snapshot().activeId; assert.notEqual(savedId, originalId); assert.notEqual(savedId, temporaryId);
			assert.equal(snapshot().messages[4].transition, 'persistent');
			await mock.commands.executeCommand('_becoder.beacon.flush');
			assert.equal(mock.beaconConversations.get(`${directory}:${savedId}`)!.data.messages.length, 6);
			assert.equal((mock.beaconConversations.get(`${directory}:${savedId}`)!.data.contextSnapshots as { raw: string }[])[0].raw, 'complete captured page beyond the requested excerpt');
			await navigate({ type: 'back' }); await navigate({ type: 'deleteHistory', conversationId: originalId });
			await navigate({ type: 'openHistory', conversationId: savedId });
			assert.equal(snapshot().messages.length, 6); assert.equal(snapshot().messages[0].text, 'original question');
			assert.equal(snapshot().messages[2].transition, 'temporary'); assert.equal(snapshot().messages[4].transition, 'persistent');
			await deactivate(); await activate(context as unknown as vscode.ExtensionContext);
			const reopened = mock.makeView(); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(reopened); reopened.receive({ type: 'ready' });
			const restored = () => reopened.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as ReturnType<typeof snapshot>;
			await until(() => restored()?.activeId === savedId && restored().messages.length === 6);
			assert.equal(restored().messages[2].transition, 'temporary'); assert.equal(restored().messages[4].transition, 'persistent');
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } globalThis.fetch = originalFetch; }
	}));
	for (const newerText of ['unsent question', 'edited while preparing']) {
	test('a run starting during final draft persistence preserves ' + newerText, async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView(); const originalFetch = globalThis.fetch;
		let requests = 0; globalThis.fetch = async () => { requests++; return response(); };
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { configured: boolean; viewKey: string; draftText: string; attachments: Attachment[] };
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured);
			view.receive({ type: 'selectWorkspace', root: directory }); await until(() => mock.beaconContext.usable && !snapshot().busy);
			const file = path.join(directory, 'main.cpp'); await fs.writeFile(file, 'int main() {}');
			view.drop({ uris: [mock.Uri.file(file)], source: 'external' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
			view.receive({ type: 'draft', text: 'unsent question', viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === 'unsent question');
			const native = mock.commandHandlers.get('_becoder.beacon.context')!;
			let started = false;
			mock.commandHandlers.set('_becoder.beacon.context', (...args: unknown[]) => {
				if (args[0] === 'view' && !started && snapshot().draftText === newerText) { started = true; mock.beaconContext.runtimeBusy = true; }
				return native(...args);
			});
			view.receive({ type: 'send', text: 'unsent question' });
			if (newerText !== 'unsent question') { view.receive({ type: 'draft', text: newerText, viewKey: snapshot().viewKey }); }
			await until(() => started && !snapshot().busy);
			assert.equal(requests, 0, 'A runtime starting at the final persistence boundary still blocks generation');
			assert.equal(snapshot().messages.length, 0);
			assert.equal(snapshot().draftText, newerText);
			assert.equal(snapshot().attachments.length, 1);
		} finally { globalThis.fetch = originalFetch; await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
	}));
	}
	for (const target of ['none', 'workspace'] as const) {
		test('a rejected mode fork keeps the source page, input and attachment for ' + target, async () => fixture(async directory => {
			const context = mock.reset(directory); const view = mock.makeView(); const originalFetch = globalThis.fetch;
			let requests = 0; globalThis.fetch = async () => { requests++; return response(); };
			const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { draftText: string; viewKey: string; screen: string; activeId: string; configured: boolean; attachments: Attachment[] };
			const navigate = async (message: unknown) => { view.receive(message); await until(() => snapshot().busy); await until(() => !snapshot().busy); };
			try {
				await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
				view.receive({ type: 'ready' }); await until(() => snapshot()?.configured);
				await navigate({ type: 'selectWorkspace', root: directory });
				if (target === 'workspace') { await navigate({ type: 'setPermission', permission: 'none' }); }
				view.receive({ type: 'send', text: 'source' }); await until(() => snapshot().messages.length === 2 && !snapshot().busy);
				const sourceId = snapshot().activeId;
				const file = path.join(directory, 'main.cpp'); await fs.writeFile(file, 'captured version');
				view.drop({ uris: [mock.Uri.file(file)], source: 'external' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
				view.receive({ type: 'draft', text: 'pending', viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === 'pending');
				await navigate({ type: 'setPermission', permission: target });
				const native = mock.commandHandlers.get('_becoder.beacon.context')!;
				let held!: () => void; let entered!: () => void;
				const barrier = new Promise<void>(resolve => { held = resolve; }); const started = new Promise<void>(resolve => { entered = resolve; });
				let checks = 0;
				mock.commandHandlers.set('_becoder.beacon.context', async (operation, input) => {
					if (operation === 'context' && ++checks === 4) { entered(); await barrier; mock.beaconContext.runtimeBusy = true; }
					return native(operation, input);
				});
				view.receive({ type: 'send', text: 'pending' }); await started;
				view.receive({ type: 'draft', text: 'newer pending', viewKey: snapshot().viewKey }); held();
				await until(() => !snapshot().busy);
				assert.equal(snapshot().activeId, sourceId); assert.equal(snapshot().screen, 'conversation');
				assert.equal(snapshot().draftText, 'newer pending'); assert.equal(snapshot().attachments.length, 1);
				assert.equal(snapshot().messages.length, 2); assert.equal(requests, 1);
				assert.equal(mock.beaconConversations.size, target === 'none' ? 1 : 0, 'Rejected staging leaves no durable inherited chat');
			} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } globalThis.fetch = originalFetch; }
		}));
	}
	for (const clearFails of [false, true]) {
		test('accepted fork keeps captured attachments and newer input; source cleanup fails=' + clearFails, async () => fixture(async directory => {
			const context = mock.reset(directory); const view = mock.makeView(); const originalFetch = globalThis.fetch;
			const bodies: unknown[] = []; globalThis.fetch = async (_url, input) => { bodies.push(JSON.parse(String(input?.body))); return response(); };
			const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { draftText: string; viewKey: string; activeId: string; configured: boolean; attachments: Attachment[]; requestNotice?: { text: string } };
			const native = mock.commandHandlers.get('_becoder.beacon.context')!;
			let finish!: () => void;
			try {
				await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
				view.receive({ type: 'ready' }); await until(() => snapshot()?.configured);
				view.receive({ type: 'selectWorkspace', root: directory }); await until(() => mock.beaconContext.usable && !snapshot().busy);
				view.receive({ type: 'send', text: 'source' }); await until(() => snapshot().messages.length === 2 && !snapshot().busy);
				const sourceId = snapshot().activeId;
				const file = path.join(directory, 'snapshot.txt'); await fs.writeFile(file, 'captured attachment bytes');
				view.drop({ uris: [mock.Uri.file(file)], source: 'external' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
				await fs.writeFile(file, 'changed original file');
				view.receive({ type: 'draft', text: 'fork question', viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === 'fork question');
				view.receive({ type: 'setPermission', permission: 'none' }); await until(() => snapshot().busy); await until(() => !snapshot().busy);
				let enter!: () => void; const entered = new Promise<void>(resolve => { enter = resolve; }); const barrier = new Promise<void>(resolve => { finish = resolve; });
				mock.commandHandlers.set('_becoder.beacon.context', async (operation, input) => {
					if (operation === 'consumeDraft') { enter(); await barrier; if (clearFails) { throw new Error('beacon-write-busy'); } }
					return native(operation, input);
				});
				view.receive({ type: 'send', text: 'fork question' }); await entered;
				view.receive({ type: 'draft', text: 'fork question', viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === 'fork question'); finish();
				await until(() => !snapshot().busy);
				assert.notEqual(snapshot().activeId, sourceId); assert.equal(snapshot().messages.length, 4); assert.equal(snapshot().draftText, 'fork question');
				assert.ok(JSON.stringify(bodies.at(-1)).includes('captured attachment bytes')); assert.ok(!JSON.stringify(bodies.at(-1)).includes('changed original file'));
				assert.equal(mock.beaconConversations.get(`${directory}:${sourceId}`)!.data.draft?.text, clearFails ? 'fork question' : '');
				if (clearFails) { assert.ok(snapshot().requestNotice?.text.includes('original draft could not be cleared')); }
			} finally { finish?.(); mock.commandHandlers.set('_becoder.beacon.context', native); await deactivate(); for (const item of context.subscriptions) { item.dispose(); } globalThis.fetch = originalFetch; }
		}));
	}
	test('actual host rejects stale runtime sends and response actions without replaying them after release', async () => fixture(async directory => {
		for (const persistent of [false, true]) {
			const context = mock.reset(directory); const view = mock.makeView(); const originalFetch = globalThis.fetch;
			let requests = 0;
			globalThis.fetch = async () => { requests++; return response(); };
			const snapshots = () => view.messages.filter(message => message.type === 'snapshot');
			const snapshot = () => snapshots().at(-1) as unknown as Snapshot & { configured: boolean; viewKey: string; draftText: string; responseBusy: boolean; context: { runtimeBusy: boolean } };
			try {
				await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
				view.receive({ type: 'ready' }); await until(() => snapshot()?.configured);
				if (persistent) { view.receive({ type: 'selectWorkspace', root: directory }); await until(() => mock.beaconContext.usable && !snapshot().busy); }
				view.receive({ type: 'send', text: 'first question' }); await until(() => snapshot().messages.at(-1)?.status === 'complete' && !snapshot().busy);
				const before = structuredClone(snapshot().messages);
				view.receive({ type: 'draft', text: 'keep this draft', viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === 'keep this draft');
				// No contextChanged notification: the displayed snapshot is deliberately stale.
				mock.beaconContext.runtimeBusy = true;
				for (const action of [{ type: 'send', text: 'keep this draft' }, { type: 'regenerate', id: before[1].id }, { type: 'continue', id: before[1].id }, { type: 'edit', id: before[0].id, text: 'replacement' }]) {
					const count = snapshots().length; view.receive(action);
					await until(() => snapshots().length > count && !snapshot().busy);
					assert.equal(snapshot().responseBusy, false);
					assert.deepStrictEqual(snapshot().messages, before);
					assert.equal(snapshot().draftText, 'keep this draft');
					assert.equal(requests, 1, 'No blocked action reaches the provider');
				}
				mock.beaconContext.runtimeBusy = false;
				await mock.commands.executeCommand('_becoder.beacon.contextChanged');
				assert.equal(requests, 1, 'Releasing activity never replays a rejected action');
				view.receive({ type: 'send', text: 'keep this draft' }); await until(() => snapshot().messages.length === 4 && snapshot().messages.at(-1)?.status === 'complete' && !snapshot().busy);
				assert.equal(requests, 2);
			} finally { globalThis.fetch = originalFetch; await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
		}
	}));
	test('workspace text draft survives navigation and restart without becoming history', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView();
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { draftText: string; viewKey: string; screen: string; activeId: string; history: unknown[]; homeHasDraft: boolean; configured: boolean };
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured);
			view.receive({ type: 'selectWorkspace', root: directory }); await until(() => mock.beaconContext.usable && !snapshot().busy);
			view.receive({ type: 'draft', text: 'remember me', viewKey: snapshot().viewKey });
			await until(() => snapshot().draftText === 'remember me' && !snapshot().busy, 'draft saved');
			assert.equal(mock.beaconContext.busy, false, 'Draft debounce does not disable navigation or send');
			await mock.commands.executeCommand('_becoder.beacon.flush');
			assert.equal([...mock.beaconConversations.values()][0].data.draft?.text, 'remember me', 'Pre-shutdown barrier persists the debounced input');
			view.receive({ type: 'draft', text: 'still editable after cancelled shutdown', viewKey: snapshot().viewKey });
			await until(() => snapshot().draftText === 'still editable after cancelled shutdown');
			view.receive({ type: 'draft', text: 'remember me', viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === 'remember me');
			assert.equal(snapshot().history.length, 0);
			const lastView = mock.commandCalls.filter(call => call.id === '_becoder.beacon.context' && call.args[0] === 'view').at(-1)?.args[1] as { view: { screen: string; id?: string; homeId?: string } };
			assert.deepStrictEqual(lastView.view, { screen: 'home', id: undefined, homeId: snapshot().activeId });
			assert.equal(mock.beaconConversations.size, 1);
			assert.equal([...mock.beaconConversations.values()][0].data.draftOnly, true);
			await deactivate();
			await activate(context as unknown as vscode.ExtensionContext);
			const reopened = mock.makeView(); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(reopened); reopened.receive({ type: 'ready' });
			const restored = () => reopened.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as ReturnType<typeof snapshot>;
			await until(() => restored()?.draftText === 'remember me', 'draft restored');
			assert.equal(restored().screen, 'home');
			reopened.receive({ type: 'newChat' }); await until(() => !restored().busy && restored().draftText === '', 'explicit clear');
			assert.equal(mock.beaconConversations.size, 0);
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
	}));
	test('home and detail drafts stay separate across navigation, modes and workspace changes', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView(); const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => response();
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { draftText: string; viewKey: string; screen: string; activeId: string; homeHasDraft: boolean; configured: boolean; permission: string; context: { root?: string } };
		const navigate = async (message: unknown) => { view.receive(message); await until(() => snapshot().busy); await until(() => !snapshot().busy); };
		const write = async (text: string) => { view.receive({ type: 'draft', text, viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === text); };
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured);
			await navigate({ type: 'selectWorkspace', root: directory });
			view.receive({ type: 'send', text: 'a real chat' }); await until(() => snapshot().messages.at(-1)?.status === 'complete' && !snapshot().busy);
			const conversationId = snapshot().activeId;
			await write('detail draft'); await navigate({ type: 'back' });
			assert.equal(snapshot().draftText, '');
			await write('home draft'); const homeId = snapshot().activeId;
			await navigate({ type: 'openHistory', conversationId });
			assert.equal(snapshot().draftText, 'detail draft'); assert.equal(snapshot().homeHasDraft, true);
			await navigate({ type: 'newChat' });
			assert.equal(snapshot().activeId, homeId); assert.equal(snapshot().draftText, 'home draft');
			await navigate({ type: 'setPermission', permission: 'none' });
			assert.equal(snapshot().draftText, 'home draft'); await write('private temporary');
			await navigate({ type: 'setPermission', permission: 'workspace' });
			assert.equal(snapshot().draftText, 'private temporary');
			const second = path.join(directory, 'second'); await fs.mkdir(second);
			await navigate({ type: 'selectWorkspace', root: second }); assert.equal(snapshot().draftText, '');
			await write('second root'); await navigate({ type: 'selectWorkspace', root: directory });
			assert.equal(snapshot().draftText, 'private temporary');
			const staleKey = snapshot().viewKey; await navigate({ type: 'newChat' });
			view.receive({ type: 'draft', text: 'late old input', viewKey: staleKey });
			await navigate({ type: 'openHistory', conversationId });
			assert.equal(snapshot().draftText, 'detail draft'); assert.equal(snapshot().homeHasDraft, false);
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } globalThis.fetch = originalFetch; }
	}));
	test('an unavailable root isolates the temporary composer and recovers unsaved input when the same revision returns', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView();
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { draftText: string; viewKey: string; temporary: boolean; configured: boolean };
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured);
			view.receive({ type: 'selectWorkspace', root: directory }); await until(() => mock.beaconContext.usable && !snapshot().busy);
			view.receive({ type: 'draft', text: 'pending before root loss', viewKey: snapshot().viewKey }); await until(() => snapshot().draftText === 'pending before root loss');
			mock.beaconContext.usable = false; mock.beaconContext.mode = 'blackout'; mock.beaconContext.workspaceState = 'unavailable'; delete mock.beaconContext.activeId;
			await mock.commands.executeCommand('_becoder.beacon.contextChanged');
			assert.equal(snapshot().temporary, true); assert.equal(snapshot().draftText, '');
			mock.beaconContext.usable = true; mock.beaconContext.mode = 'spot'; mock.beaconContext.workspaceState = 'ready';
			await mock.commands.executeCommand('_becoder.beacon.contextChanged');
			assert.equal(snapshot().temporary, false); assert.equal(snapshot().draftText, 'pending before root loss');
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
	}));
	test('late PDF selections are discarded after workspace switches or page closure', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView();
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as { busy: boolean; attachments: Attachment[] };
		let start!: () => void; let finish!: () => void; const started = new Promise<void>(resolve => { start = resolve; }); const held = new Promise<void>(resolve => { finish = resolve; });
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			mock.extensions.getExtension = () => ({ activate: async () => ({ captureSelection: async () => { start(); await held; return { uri: mock.Uri.file(path.join(directory, 'missing.pdf')).toString(), contents: 'old selection', isCurrent: () => true }; } }) });
			const request = mock.commands.executeCommand('becoder.beacon.askPdfSelection'); await started;
			view.receive({ type: 'selectWorkspace', root: directory }); await until(() => mock.beaconContext.usable && !snapshot().busy); finish(); await request;
			assert.equal(snapshot().attachments.length, 0); assert.equal(mock.beaconConversations.size, 0);
			mock.extensions.getExtension = () => ({ activate: async () => ({ captureSelection: async () => ({ uri: mock.Uri.file(path.join(directory, 'missing.pdf')).toString(), contents: 'closed', isCurrent: () => false }) }) });
			await mock.commands.executeCommand('becoder.beacon.askPdfSelection'); assert.equal(snapshot().attachments.length, 0);
		} finally { finish(); await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
	}));
	for (const selected of [true, false]) {
		test(`PDF selection joins the ${selected ? 'workspace' : 'blackout'} draft without sending or opening the file`, async () => fixture(async directory => {
			const context = mock.reset(directory); const view = mock.makeView();
			const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as { activeId: string; canSend: boolean; busy: boolean; attachments: Attachment[]; messages: unknown[] };
			try {
				await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
				if (selected) { view.receive({ type: 'selectWorkspace', root: directory }); await until(() => mock.beaconContext.usable && !snapshot().busy); }
				mock.extensions.getExtension = () => ({ activate: async () => ({ captureSelection: async () => ({ uri: mock.Uri.file(path.join(directory, 'missing.pdf')).toString(), contents: ' selected problem\ntext ', isCurrent: () => true }) }) });
				await mock.commands.executeCommand('becoder.beacon.askPdfSelection');
				assert.equal(snapshot().attachments.length, 1); assert.equal(snapshot().messages.length, 0); assert.equal(snapshot().canSend, true);
				assert.equal(snapshot().attachments[0].contents, '', 'UI summaries do not carry attachment bodies');
				assert.equal(mock.beaconConversations.size, selected ? 1 : 0, 'Only workspace drafts create hidden entities');
				view.receive({ type: 'openAttachment', id: snapshot().attachments[0].id }); await until(() => mock.textPreviews.length === 1);
				assert.equal(mock.textPreviews[0].content, ' selected problem\ntext '); assert.equal(mock.commandCalls.some(call => call.id === 'vscode.open'), false);
			} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
		}));
	}
	for (const selected of [true, false]) {
		test(`selection starts a usable draft ${selected ? 'in the selected workspace' : 'in temporary blackout'} without sending`, async () => fixture(async directory => {
			const context = mock.reset(directory); const view = mock.makeView();
			const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as { activeId: string; canSend: boolean; busy: boolean; attachments: Attachment[]; messages: unknown[] };
			try {
				await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
				if (selected) { view.receive({ type: 'selectWorkspace', root: directory }); await until(() => mock.beaconContext.usable && !snapshot().busy); assert.equal(mock.beaconConversations.size, 0); }
				const document = { uri: mock.Uri.file(path.join(directory, 'missing.cpp')), isClosed: false, getText: () => 'dirty selected code' };
				mock.window.activeTextEditor = { selection: { isEmpty: false }, document };
				await mock.commands.executeCommand('becoder.beacon.askSelection');
				assert.equal(snapshot().canSend, true);
				assert.equal(snapshot().attachments.length, 1); assert.equal(snapshot().messages.length, 0);
				assert.equal(mock.beaconConversations.size, selected ? 1 : 0, 'Only workspace drafts create hidden entities');
				const active = snapshot().activeId;
				await mock.commands.executeCommand('becoder.beacon.askSelection');
				assert.equal(snapshot().activeId, active); assert.equal(snapshot().attachments.length, 2);
				view.receive({ type: 'openAttachment', id: snapshot().attachments[0].id }); await until(() => mock.textPreviews.length === 1);
				assert.deepStrictEqual(mock.textPreviews[0], { content: 'dirty selected code', language: 'plaintext' });
				assert.equal(mock.commandCalls.some(call => call.id === 'vscode.open'), false, 'Selection preview must not open its backing file');
			} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
		}));
	}
	test('a context change during an in-flight refresh is observed before the refresh retires', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView();
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as { configured: boolean; context: { busy: boolean } };
		let release: () => void = () => { }; let entered: () => void = () => { };
		const held = new Promise<void>(resolve => { release = resolve; });
		const started = new Promise<void>(resolve => { entered = resolve; });
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured === true);
			const native = mock.commandHandlers.get('_becoder.beacon.context')!;
			let hold = true;
			mock.commandHandlers.set('_becoder.beacon.context', async (operation, input) => {
				const result = await native(operation, input);
				if (operation === 'context' && hold) { hold = false; entered(); await held; }
				return result;
			});
			mock.beaconContext.busy = true;
			const first = mock.commands.executeCommand('_becoder.beacon.contextChanged'); await started;
			mock.beaconContext.busy = false;
			const second = mock.commands.executeCommand('_becoder.beacon.contextChanged');
			release(); await Promise.all([first, second]);
			assert.equal(snapshot().context.busy, false);
		} finally { release(); await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
	}));
	test('pasted image bytes work in every permission without authorizing a filesystem path', async () => {
		const captured = captureClipboardImages([{ name: 'screenshot.png', contents: png, mediaType: 'image/png', path: 'private.png', source: 'internal' }]);
		assert.equal(captured[0].source, 'clipboard'); assert.equal(captured[0].path, 'clipboard:' + captured[0].id);
		const never = async () => { assert.fail('Clipboard bytes must never be read from disk'); };
		for (const permission of ['none', 'workspace', 'computer'] as const) {
			assert.deepStrictEqual(await readAttachments(captured, permission, never, signal), captured);
			await assert.rejects(readAttachments([{ ...captured[0], path: 'private.png' }], permission, never, signal), AttachmentError);
		}
		assert.ok(validAttachments(captured));
		assert.equal(validAttachments([{ ...captured[0], kind: 'text', mediaType: undefined }]), false);
		assert.throws(() => captureClipboardImages([{ contents: 'bad', mediaType: 'image/png' }]), AttachmentError);
		assert.throws(() => captureClipboardImages([{ contents: png, mediaType: 'image/svg+xml' }]), AttachmentError);
		assert.throws(() => captureClipboardImages(Array.from({ length: 65 }, () => ({ contents: png, mediaType: 'image/png' }))), AttachmentError);
		const supplied = await readAttachments([...captured, { path: 'disk.cpp', source: 'internal' }], 'none', async input => ({ ok: true, path: input.path, kind: 'text', contents: 'explicit-file' }), signal);
		assert.equal(supplied[1].contents, 'explicit-file');
		const large = Buffer.concat([Buffer.from(png, 'base64'), Buffer.alloc(3 * 1024 * 1024)]).toString('base64');
		assert.throws(() => captureClipboardImages([{ contents: large, mediaType: 'image/png' }, { contents: large, mediaType: 'image/png' }]), AttachmentError);
	});
	test('actual host supports temporary blackout and persists explicit workspace chats with captured image bytes', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView();
		const originalFetch = globalThis.fetch; const bodies: unknown[] = [];
		globalThis.fetch = async (_url, options) => { bodies.push(JSON.parse(String(options?.body))); return response(); };
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { screen: 'home' | 'conversation'; activeId: string; configured: boolean; attachments: Attachment[] };
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured === true);
			for (const permission of ['workspace', 'computer', 'none']) {
				await mock.workspace.getConfiguration().update('filePermission', permission);
				view.receive({ type: 'pasteImages', activeId: snapshot().activeId, images: [{ name: 'screenshot.png', mediaType: 'image/png', contents: png }] });
				assert.equal(snapshot().attachments.length, 1);
				view.receive({ type: 'removeAttachment', id: snapshot().attachments[0].id });
			}
			view.receive({ type: 'pasteImages', activeId: 'stale-conversation', images: [{ mediaType: 'image/png', contents: png }] }); assert.equal(snapshot().attachments.length, 0);
			view.receive({ type: 'pasteImages', activeId: snapshot().activeId, images: [{ mediaType: 'image/png', contents: png }] });
			const id = snapshot().attachments[0].id;
			await until(() => snapshot().configured);
			view.receive({ type: 'previewAttachment', id });
			assert.ok(view.messages.some(message => message.type === 'attachmentPreview' && message.id === id && message.url === 'data:image/png;base64,' + png));
			view.receive({ type: 'send', text: '' }); await until(() => snapshot().messages.at(-1)?.status === 'complete' && !snapshot().busy);
			assert.equal(bodies.length, 1); assert.ok(JSON.stringify(bodies[0]).includes('data:image/png;base64,' + png));
			assert.equal(snapshot().attachments.length, 0);
			assert.equal(mock.beaconConversations.size, 0, 'Temporary messages never acquire a persistent root');
			view.receive({ type: 'newChat' }); await until(() => snapshot().busy); await until(() => !snapshot().busy && snapshot().screen === 'home');
			view.receive({ type: 'selectWorkspace', root: directory }); await until(() => mock.beaconContext.usable && !snapshot().busy);
			assert.equal(snapshot().messages.length, 0, 'Workspace selection does not migrate the temporary conversation');
			view.receive({ type: 'newChat' }); await until(() => snapshot().busy, 'new chat begins'); await until(() => !snapshot().busy && snapshot().screen === 'home', 'new chat returns home');
			assert.equal(mock.beaconContext.activeId, undefined, 'New chat returns to the clean home without creating an empty persistent conversation');
			assert.equal(mock.beaconConversations.size, 0);
			view.receive({ type: 'pasteImages', activeId: snapshot().activeId, images: [{ mediaType: 'image/png', contents: png }] });
			view.receive({ type: 'send', text: 'saved' }); await until(() => snapshot().messages.at(-1)?.status === 'complete' && !snapshot().busy, 'persistent send completes');
			assert.equal(snapshot().screen, 'conversation'); assert.equal(mock.beaconConversations.size, 1, 'The first accepted send creates its durable conversation');
			await deactivate();
			const saved = [...mock.beaconConversations.values()][0];
			const restored = readHistory({ version: 1, activeId: saved.data.id, conversations: [saved.data] });
			assert.equal(restored.conversations[0].messages[0].attachments?.[0].contents, png);
			assert.equal(restored.conversations[0].messages[0].attachments?.[0].source, 'clipboard');
			await assert.rejects(fs.stat(path.join(directory, 'storage/history.json')), { code: 'ENOENT' });
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } globalThis.fetch = originalFetch; }
	}));
	test('home owns workspace history and Blackout retains the displayed context until send', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => response();
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { screen: 'home' | 'conversation'; canSend: boolean; context: { root?: string; mode: string; workspaceState: string }; activeId: string; history: { id: string }[]; permission: string; configured: boolean };
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured === true);
			view.receive({ type: 'selectWorkspace', root: directory }); await until(() => snapshot().context.mode === 'spot' && !snapshot().busy);
			view.receive({ type: 'send', text: 'persist this' }); await until(() => snapshot().messages.at(-1)?.status === 'complete' && !snapshot().busy);
			assert.equal(mock.beaconConversations.size, 1);
			view.receive({ type: 'newChat' }); await until(() => snapshot().busy); await until(() => !snapshot().busy && snapshot().screen === 'home');
			assert.equal(snapshot().history.length, 1);
			view.receive({ type: 'setPermission', permission: 'none' }); await until(() => snapshot().permission === 'none' && !snapshot().busy);
			assert.equal(snapshot().context.root, directory); assert.equal(snapshot().context.workspaceState, 'blackout');
			assert.equal(snapshot().history.length, 0); assert.equal(snapshot().canSend, true); assert.equal(mock.beaconContext.activeId, undefined);
			view.receive({ type: 'setPermission', permission: 'workspace' }); await until(() => snapshot().permission === 'workspace' && !snapshot().busy);
			assert.equal(snapshot().history.length, 1, 'Returning to a consuming mode restores the selected workspace history');
			view.receive({ type: 'openHistory', conversationId: snapshot().history[0].id }); await until(() => snapshot().screen === 'conversation' && !snapshot().busy);
			const sourceId = snapshot().activeId;
			view.receive({ type: 'setPermission', permission: 'none' }); await until(() => snapshot().permission === 'none' && !snapshot().busy);
			assert.equal(snapshot().screen, 'conversation'); assert.equal(snapshot().messages.length, 2);
			assert.equal(snapshot().history.length, 0); assert.equal(mock.beaconContext.activeId, sourceId);
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } globalThis.fetch = originalFetch; }
	}));
	test('user attachment preview opens the editor in blackout and rejects forged IDs and missing files', async () => fixture(async directory => {
		const context = mock.reset(directory); const view = mock.makeView();
		const file = path.join(directory, 'main.cpp'); await fs.writeFile(file, 'int main() {}');
		const snapshot = () => view.messages.filter(message => message.type === 'snapshot').at(-1) as unknown as Snapshot & { configured: boolean; attachments: Attachment[]; requestNotice?: { id: number } };
		try {
			await activate(context as unknown as vscode.ExtensionContext); mock.viewProviders.get('becoder.beacon.chat')!.resolveWebviewView(view);
			view.receive({ type: 'ready' }); await until(() => snapshot()?.configured === true);
			view.receive({ type: 'openAttachment', id: 'forged', path: file }); assert.equal(mock.commandCalls.filter(call => call.id === 'vscode.open').length, 0);
			view.drop({ uris: [mock.Uri.file(file)], source: 'internal' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
			const id = snapshot().attachments[0].id; view.receive({ type: 'openAttachment', id });
			await until(() => mock.commandCalls.some(call => call.id === 'vscode.open'));
			const opened = mock.commandCalls.find(call => call.id === 'vscode.open')!;
			assert.equal((opened.args[0] as { fsPath: string }).fsPath, file); assert.deepStrictEqual(opened.args[1], { preview: true, preserveFocus: true });
			await mock.workspace.getConfiguration().update('filePermission', 'none');
			view.receive({ type: 'openAttachment', id }); await until(() => mock.commandCalls.filter(call => call.id === 'vscode.open').length === 2);
			await mock.workspace.getConfiguration().update('filePermission', 'workspace'); await fs.unlink(file);
			const previous = view.messages.length; view.receive({ type: 'openAttachment', id }); await until(() => view.messages.length > previous);
			assert.equal(mock.commandCalls.filter(call => call.id === 'vscode.open').length, 2);
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } }
	}));
	test('native origin cannot be claimed by a synthetic gesture or an unrelated/mixed drop', () => {
		const drag = new WebviewResourceDrag();
		drag.start(false, ['file:///same.cpp']); assert.equal(drag.source(true, ['file:///same.cpp']), 'external');
		drag.start(true, ['file:///same.cpp']); assert.equal(drag.source(true, ['file:///same.cpp']), 'internal');
		assert.equal(drag.source(false, ['file:///same.cpp']), 'external');
		assert.equal(drag.source(true, ['file:///same.cpp', 'file:///other.cpp']), 'external');
		drag.end(); assert.equal(drag.source(true, ['file:///same.cpp']), 'external');
	});
	test('real user file sources are captured in all modes without granting free file access', async () => {
		for (const permission of ['none', 'workspace', 'computer'] as const) {
			for (const source of ['internal', 'external', 'picker'] as const) {
				const captured = await readAttachments([{ path: 'same.cpp', source }], permission, async input => ({ ok: true, path: input.path, kind: 'text', contents: 'supplied' }), signal);
				assert.equal(captured[0].contents, 'supplied');
			}
		}
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
	test('actual host captures drops once, keeps picker grants across modes and preserves failed drafts', async () => fixture(async directory => {
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
			view.drop({ uris: [mock.Uri.file(file)], source: 'external' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
			mock.workspace.textDocuments = [{ uri: mock.Uri.file(file), isClosed: false, getText: () => 'latest unsaved editor' }];
			await mock.workspace.getConfiguration().update('filePermission', 'none'); await until(() => snapshot().configured);
			view.receive({ type: 'send', text: 'look' }); await until(() => snapshot().messages.at(-1)?.status === 'complete' && !snapshot().busy);
			assert.ok(JSON.stringify(bodies).includes('disk')); assert.ok(!JSON.stringify(bodies).includes('latest unsaved editor')); assert.equal(snapshot().attachments.length, 0);
			assert.equal(snapshot().messages[0].attachments?.[0].contents, '', 'Streaming snapshots do not repeatedly transfer attachment bytes');
			view.drop({ uris: [mock.Uri.file(image)], source: 'internal' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
			await mock.selectModel('deepseek-chat'); await until(() => snapshot().configured && snapshot().connection.model === 'deepseek-chat');
			view.receive({ type: 'send', text: 'image' }); await until(() => !snapshot().busy); assert.equal(bodies.length, 1); assert.equal(snapshot().attachments.length, 1);
			view.receive({ type: 'removeAttachment', id: snapshot().attachments[0].id }); assert.equal(snapshot().attachments.length, 0);
			await mock.workspace.getConfiguration().update('filePermission', 'computer'); await until(() => snapshot().configured);
			let choose: (uris: ReturnType<typeof mock.Uri.file>[]) => void = () => {};
			mock.window.showOpenDialog = () => new Promise(resolve => { choose = resolve; });
			view.receive({ type: 'addFiles' }); assert.equal(snapshot().busy, true);
			await mock.workspace.getConfiguration().update('filePermission', 'workspace');
			choose([mock.Uri.file(file)]); await until(() => !snapshot().busy);
			assert.equal(snapshot().attachments.length, 1, 'Explicit file selection is independent of free filesystem permission');
			view.drop({ uris: [mock.Uri.file(file)], source: 'internal' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
			const previousMessages = JSON.stringify(snapshot().messages);
			view.receive({ type: 'send', text: 'cancel before model' });
			view.receive({ type: 'newChat' }); view.receive({ type: 'stop' }); await until(() => !snapshot().busy);
			assert.equal(JSON.stringify(snapshot().messages), previousMessages); assert.equal(snapshot().attachments.length, 1); assert.equal(bodies.length, 1);
			view.receive({ type: 'removeAttachment', id: snapshot().attachments[0].id });
			await mock.selectModel('deepseek-flash'); await until(() => snapshot().configured && snapshot().connection.model === 'deepseek-flash');
			view.drop({ uris: [mock.Uri.file(image)], source: 'internal' }); await until(() => snapshot().attachments.length === 1 && !snapshot().busy);
			view.receive({ type: 'send', text: '' }); await until(() => snapshot().messages.length === 4 && !snapshot().busy);
			const imageHistory = JSON.stringify(snapshot().messages);
			await mock.selectModel('deepseek-chat'); await until(() => snapshot().configured && snapshot().connection.model === 'deepseek-chat');
			view.receive({ type: 'regenerate', id: snapshot().messages.at(-1)!.id });
			view.receive({ type: 'send', text: 'blocked followup' }); await until(() => !snapshot().busy);
			assert.equal(JSON.stringify(snapshot().messages), imageHistory, 'Vision rejection occurs before truncating or adding a message'); assert.equal(bodies.length, 2);
			view.receive({ type: 'regenerate', id: 2 }); await until(() => snapshot().messages.length === 2 && !snapshot().busy);
			assert.equal(snapshot().messages.at(-1)?.status, 'complete'); assert.equal(bodies.length, 3, 'Regenerating an earlier text answer excludes the later image branch');
		} finally { await deactivate(); for (const item of context.subscriptions) { item.dispose(); } globalThis.fetch = originalFetch; mock.window.showOpenDialog = originalPicker; }
	}));
});

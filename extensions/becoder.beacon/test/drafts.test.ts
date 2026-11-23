/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatHistory, readHistory, type Conversation, type HistoryData } from '../src/history';
import { BeaconContextClient } from '../src/context';
import type { IBeaconContext } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import type { Attachment } from '../src/attachments';
import type { ContextSnapshot } from '../src/contextTools';
import type { Generate } from '../src/session';

const attachment: Attachment = { id: 'one', path: 'C:\\chosen\\main.cpp', source: 'picker', name: 'main.cpp', kind: 'text', contents: 'int main() {}', truncated: false };
const conversation = (): Conversation => ({ id: 'draft-one', title: '', updatedAt: 1, messages: [], error: '', workspace: [], draftOnly: true });
const context: IBeaconContext = { slot: 'one', root: 'C:\\chosen', usable: true, workspaceState: 'ready', mode: 'spot', epoch: 1, busy: false, runtimeBusy: false, recent: [] };

suite('Beacon conversation drafts', () => {
	test('effective PDF materials require tool facts in the retained branch', async () => {
		const history = new ChatHistory({ version: 1, activeId: 'draft-one', conversations: [conversation()] }, async data => data, () => {}, () => 'error');
		const page = (pageNumber: number): ContextSnapshot => ({ key: `page:pdf:version:${pageNumber}`, raw: 'page ' + pageNumber, metadata: { source: { kind: 'page', id: 'pdf', version: 'version', pageNumber, capturedAt: 1, contentSha256: 'a'.repeat(64), representation: 'loaded PDF page text' } } });
		const readPage = (pageNumber: number): Generate => async function* () {
			const snapshot = page(pageNumber); history.captureContext(snapshot);
			yield { type: 'protocol', turn: { provider: 'ollama', baseURL: 'http://127.0.0.1:11434/v1', model: 'synthetic', messages: [
				{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'page-' + pageNumber, toolName: 'inspectContext', input: { operation: 'page', id: 'pdf', version: 'version', pageNumber } }] },
				{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'page-' + pageNumber, toolName: 'inspectContext', output: { type: 'json', value: { ok: true, contents: snapshot.raw, source: { kind: 'page', id: 'pdf', version: 'version', pageNumber } } } }] }
			] } };
			yield { type: 'text', text: 'Read page ' + pageNumber };
		};
		try {
			await history.session.send('Original page one', readPage(1));
			const firstReply = history.snapshot.messages[1].id;
			await history.session.send('Later page two', readPage(2));
			assert.deepEqual(history.effectiveContextSnapshots().map(snapshot => snapshot.key), ['page:pdf:version:1', 'page:pdf:version:2']);
			assert.deepEqual(history.effectiveContextSnapshots(firstReply).map(snapshot => snapshot.key), []);
			await history.session.regenerate(firstReply, async function* () { yield { type: 'text', text: 'Replacement using original page' }; });
			assert.deepEqual(history.effectiveContextSnapshots().map(snapshot => snapshot.key), []);
			assert.deepEqual(history.contextSnapshots.map(snapshot => snapshot.key), ['page:pdf:version:1', 'page:pdf:version:2']);
		} finally { await history.dispose(); }
	});
	test('obsolete discussion bindings are ignored without changing user history or granting material access', async () => {
		const user = { id: 1, role: 'user', text: 'Discuss the other file', status: 'complete', activities: [], target: { id: 'closed', version: '1', title: 'old.cpp', capturedKeys: ['page:closed:1:'] }, targetSelection: { kind: 'page', id: 'closed' } };
		const snapshot: ContextSnapshot = { key: 'page:closed:1:', raw: 'old private body', metadata: { source: { kind: 'page', id: 'closed', version: '1', capturedAt: 1, contentSha256: 'a'.repeat(64), representation: 'loaded page' } } };
		const data = { version: 1, activeId: 'draft-one', conversations: [{ ...conversation(), pinnedTarget: { id: 'closed', title: 'old.cpp' }, messages: [user], contextSnapshots: [snapshot] }] };
		const before = structuredClone(data), restored = readHistory(data);
		assert.deepEqual(data, before);
		assert.equal(Reflect.get(restored.conversations[0], 'pinnedTarget'), undefined);
		assert.equal(Reflect.get(restored.conversations[0].messages[0], 'target'), undefined);
		assert.equal(Reflect.get(restored.conversations[0].messages[0], 'targetSelection'), undefined);
		assert.equal(restored.conversations[0].messages[0].text, 'Discuss the other file');
		const history = new ChatHistory(data, async value => value, () => {}, String);
		try { assert.deepEqual(history.effectiveContextAccess().keys, []); } finally { await history.dispose(); }
	});
	test('captured context persists independently and remains detached across restores and updates', async () => {
		let saved: HistoryData | undefined;
		const snapshot: ContextSnapshot = { key: 'page:one:2:', raw: 'captured complete page', metadata: { source: { kind: 'page', id: 'one', version: '2', capturedAt: 1, contentSha256: 'a'.repeat(64), representation: 'loaded editor text model' } } };
		const history = new ChatHistory({ version: 1, activeId: 'draft-one', conversations: [conversation()] }, async data => { saved = structuredClone(data); }, () => {}, () => 'error');
		history.captureContext(snapshot);
		snapshot.raw = 'mutated input';
		const detached = history.contextSnapshots; detached[0].raw = 'mutated output';
		assert.equal(history.contextSnapshots[0].raw, 'captured complete page');
		history.captureContext({ ...history.contextSnapshots[0], raw: 'updated captured page' });
		assert.equal(history.contextSnapshots.length, 1);
		await history.dispose();
		const restored = new ChatHistory(saved, async () => {}, () => {}, () => 'error');
		assert.equal(restored.contextSnapshots[0].raw, 'updated captured page');
		assert.equal(restored.currentConversation?.contextSnapshots?.length, 1);
		await restored.dispose();
	});
	test('rejects malformed or oversized persisted context snapshots before restoring history', () => {
		const snapshot = { key: 'page:one:2:', raw: 'captured page', metadata: { source: { kind: 'page', id: 'one', version: '2', capturedAt: 1, contentSha256: 'a'.repeat(64), representation: 'loaded editor text model' } } };
		for (const contextSnapshots of [null, {}, [snapshot, snapshot], [{ ...snapshot, raw: 7 }], [{ ...snapshot, key: '../file' }], [{ ...snapshot, metadata: {} }], [{ ...snapshot, metadata: { source: null } }], [{ ...snapshot, raw: 'x'.repeat(32 * 1024 * 1024) }]]) {
			assert.throws(() => readHistory({ version: 1, activeId: 'draft-one', conversations: [{ ...conversation(), contextSnapshots }] }), /invalid-history/);
		}
	});
	test('persists draft attachments and text without exposing an empty conversation in history', async () => {
		let saved: HistoryData | undefined;
		const history = new ChatHistory({ version: 1, activeId: 'draft-one', conversations: [conversation()] }, async data => { saved = structuredClone(data); }, () => {}, () => 'error');
		history.setDraft('Explain this', [attachment]);
		const detached = history.draft; detached.attachments[0].contents = 'changed';
		assert.equal(history.draft.attachments[0].contents, attachment.contents);
		assert.deepEqual(history.snapshot.history, []);
		assert.equal(history.refresh({ version: 1, activeId: 'draft-one', conversations: [conversation()] }), false);
		assert.equal(history.draft.text, 'Explain this');
		await history.dispose();
		const restored = new ChatHistory(saved, async () => {}, () => {}, () => 'error');
		assert.deepEqual(restored.draft, { text: 'Explain this', attachments: [attachment] });
		await restored.dispose();
	});
	test('first message promotes the existing draft instead of creating a second conversation', async () => {
		let saved: HistoryData | undefined;
		const history = new ChatHistory({ version: 1, activeId: 'draft-one', conversations: [conversation()] }, async data => { saved = data; }, () => {}, () => 'error');
		history.setDraft('question', []);
		await history.session.send('question', async function* () { yield { type: 'text', text: 'answer' }; });
		await history.flush();
		assert.equal(saved?.conversations.length, 1);
		assert.equal(saved?.conversations[0].id, 'draft-one');
		assert.equal(saved?.conversations[0].draftOnly, false);
		assert.equal(history.snapshot.history.length, 1);
		await history.dispose();
	});
	test('validates persisted draft material before restoring it', () => {
		for (const draft of [null, { text: 1, attachments: [] }, { text: '', attachments: [{ ...attachment, source: 'default' }] }]) {
			assert.throws(() => readHistory({ version: 1, activeId: 'draft-one', conversations: [{ ...conversation(), draft }] }), /invalid-history/);
		}
	});
	test('native metadata preserves an active draft omitted from the visible history', async () => {
		const stored = conversation();
		const client = new BeaconContextClient(async operation => operation === 'context' ? context : operation === 'history' ? [] : operation === 'open' ? { revision: 1, data: stored } : undefined);
		const binding = await client.bindHistory({ id: stored.id });
		assert.equal(binding.data.activeId, stored.id);
		assert.deepEqual(binding.data.conversations, [stored]);
	});
	test('Blackout never reads or writes persistent resume pointers', async () => {
		const calls: string[] = [];
		const client = new BeaconContextClient(async operation => { calls.push(operation); return { ...context, mode: 'blackout', workspaceState: 'blackout' }; });
		await client.refresh();
		assert.equal(await client.resume(), undefined);
		await client.setView({ screen: 'home' });
		assert.deepEqual(calls, ['context']);
	});
	test('view transport wraps resume metadata in the native command envelope', async () => {
		const view = { screen: 'conversation' as const, id: 'conversation-one', homeId: 'draft-one' };
		let written: unknown;
		const client = new BeaconContextClient(async (operation, input) => {
			if (operation === 'context') { return context; }
			if (operation === 'view') { written = input; return; }
			if (operation === 'resume') { return view; }
			throw new Error('unexpected-command');
		});
		await client.refresh();
		await client.setView(view);
		assert.deepEqual(written, { view });
		assert.deepEqual(await client.resume(), view);
	});
});

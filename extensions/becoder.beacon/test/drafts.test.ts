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
import type { Generate } from '../src/session';

const attachment: Attachment = { id: 'one', path: 'C:\\chosen\\main.cpp', source: 'picker', name: 'main.cpp', kind: 'text', contents: 'int main() {}', truncated: false };
const conversation = (): Conversation => ({ id: 'draft-one', title: '', updatedAt: 1, messages: [], error: '', workspace: [], draftOnly: true });
const context: IBeaconContext = { slot: 'one', root: 'C:\\chosen', usable: true, workspaceState: 'ready', mode: 'spot', epoch: 1, busy: false, runtimeBusy: false, collectionPending: false, recent: [] };

suite('Beacon conversation drafts', () => {
	test('PDF page results remain ordinary tool facts only in the retained branch', async () => {
		const history = new ChatHistory({ version: 1, activeId: 'draft-one', conversations: [conversation()] }, async data => data, () => {}, () => 'error');
		const readPage = (pageNumber: number): Generate => async function* () {
			yield { type: 'protocol', turn: { provider: 'ollama', baseURL: 'http://127.0.0.1:11434/v1', model: 'synthetic', messages: [
				{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'page-' + pageNumber, toolName: 'readPage', input: { id: 'pdf', pageNumber } }] },
				{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'page-' + pageNumber, toolName: 'readPage', output: { type: 'json', value: { ok: true, contents: 'PDF body ' + pageNumber, source: { kind: 'page', id: 'pdf', version: 'version', pageNumber } } } }] }
			] } };
			yield { type: 'text', text: 'Read page ' + pageNumber };
		};
		try {
			await history.session.send('Original page one', readPage(1));
			const firstReply = history.snapshot.messages[1].id;
			await history.session.send('Later page two', readPage(2));
			const retained = JSON.stringify(history.session.effectiveContextUnits());
			assert.match(retained, /PDF body 1/); assert.match(retained, /PDF body 2/);
			assert.deepEqual(history.currentConversation?.contextSnapshots ?? [], []);
			await history.session.regenerate(firstReply, async function* (messages) {
				assert.doesNotMatch(JSON.stringify(messages), /PDF body [12]|page-[12]/);
				yield { type: 'text', text: 'Replacement without the removed page results' };
			});
			assert.doesNotMatch(JSON.stringify(history.session.effectiveContextUnits()), /PDF body [12]|page-[12]/);
			assert.deepEqual(history.currentConversation?.contextSnapshots ?? [], []);
		} finally { await history.dispose(); }
	});
	test('obsolete discussion bindings are ignored without changing user history or granting material access', async () => {
		const user = { id: 1, role: 'user', text: 'Discuss the other file', status: 'complete', activities: [], target: { id: 'closed', version: '1', title: 'old.cpp', capturedKeys: ['page:closed:1:'] }, targetSelection: { kind: 'page', id: 'closed' } };
		const snapshot = { key: 'page:closed:1:', raw: 'old private body', metadata: { source: { kind: 'page', id: 'closed', version: '1', capturedAt: 1, contentSha256: 'a'.repeat(64), representation: 'loaded page' } } };
		const data = { version: 1, activeId: 'draft-one', conversations: [{ ...conversation(), pinnedTarget: { id: 'closed', title: 'old.cpp' }, messages: [user], contextSnapshots: [snapshot] }] };
		const before = structuredClone(data), restored = readHistory(data);
		assert.deepEqual(data, before);
		assert.equal(Reflect.get(restored.conversations[0], 'pinnedTarget'), undefined);
		assert.equal(Reflect.get(restored.conversations[0].messages[0], 'target'), undefined);
		assert.equal(Reflect.get(restored.conversations[0].messages[0], 'targetSelection'), undefined);
		assert.equal(restored.conversations[0].messages[0].text, 'Discuss the other file');
		const history = new ChatHistory(data, async value => value, () => {}, String);
		try {
			await history.session.send('Continue the ordinary conversation', async function* (messages) {
				assert.match(JSON.stringify(messages), /Discuss the other file/);
				assert.doesNotMatch(JSON.stringify(messages), /old private body|page:closed:1:/);
				yield { type: 'text', text: 'continued' };
			});
			assert.deepEqual(history.currentConversation?.contextSnapshots, [snapshot]);
		} finally { await history.dispose(); }
	});
	test('opaque legacy context data is passively preserved and detached across restores', async () => {
		let saved: HistoryData | undefined;
		const legacy = [{ key: '../obsolete', raw: 'legacy private body' }, { raw: 7 }, null, 3, 'opaque', { metadata: { source: null } }];
		const original = structuredClone(legacy);
		const history = new ChatHistory({ version: 1, activeId: 'draft-one', conversations: [{ ...conversation(), contextSnapshots: legacy }] }, async data => { saved = structuredClone(data); }, () => {}, () => 'error');
		legacy[0] = 'mutated input';
		const detached = history.currentConversation!; detached.contextSnapshots![0] = 'mutated output';
		assert.deepEqual(history.currentConversation?.contextSnapshots, original);
		await history.session.send('An ordinary question', async function* (messages) {
			assert.doesNotMatch(JSON.stringify(messages), /legacy private body|obsolete|opaque/);
			yield { type: 'text', text: 'ordinary answer' };
		});
		await history.dispose();
		const restored = new ChatHistory(saved, async () => {}, () => {}, () => 'error');
		try {
			assert.deepEqual(restored.currentConversation?.contextSnapshots, original);
			assert.equal(restored.snapshot.messages[1].text, 'ordinary answer');
		} finally { await restored.dispose(); }
	});
	test('opaque legacy context data still requires an array within the history byte limit', () => {
		const snapshot = { key: 'page:one:2:', raw: 'captured page', metadata: { source: { kind: 'page', id: 'one', version: '2', capturedAt: 1, contentSha256: 'a'.repeat(64), representation: 'loaded editor text model' } } };
		assert.deepEqual(readHistory({ version: 1, activeId: 'draft-one', conversations: [{ ...conversation(), contextSnapshots: [snapshot, snapshot] }] }).conversations[0].contextSnapshots, [snapshot, snapshot]);
		for (const contextSnapshots of [null, {}, [{ ...snapshot, raw: 'x'.repeat(32 * 1024 * 1024) }]]) {
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

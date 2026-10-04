/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileTools } from '../src/fileTools';
import { HistoryStore } from '../src/historyStore';
import { ChatHistory } from '../src/history';
import { ChatSession, fileModelOutput, type Generate } from '../src/session';
import { createGenerator } from '../src/provider';
import { providers } from '../src/connection';

const signal = new AbortController().signal;
async function fixture(run: (directory: string) => Promise<void>) {
	const parent = path.resolve('../../tmp');
	await fs.mkdir(parent, { recursive: true });
	const directory = await fs.mkdtemp(path.join(parent, 'beacon-files-'));
	try { await run(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

suite('Beacon read-only permissions', () => {
	test('none rejects every operation; workspace real targets stay inside roots; computer still rejects private files', async () => fixture(async directory => {
		const root = path.join(directory, 'workspace');
		const outside = path.join(directory, 'outside');
		await fs.mkdir(root); await fs.mkdir(outside);
		await fs.writeFile(path.join(root, 'main.cpp'), 'int main() {}');
		await fs.writeFile(path.join(outside, 'note.txt'), 'outside');
		await fs.writeFile(path.join(outside, '.env'), 'SECRET=value');
		await fs.symlink(outside, path.join(root, 'escape'), 'junction');
		await fs.mkdir(path.join(root, 'nested'));
		await fs.writeFile(path.join(root, 'nested', 'readme.txt'), 'inside');
		await fs.symlink(path.join(root, 'nested'), path.join(root, 'alias'), 'junction');
		const roots = [{ name: 'workspace', path: root }];
		const none = new FileTools('none', roots);
		for (const operation of ['read', 'list', 'find', 'search'] as const) {
			assert.equal((await none.execute({ operation, path: root, query: 'main' }, signal)).ok, false);
		}
		const files = new FileTools('workspace', roots);
		assert.equal((await files.execute({ operation: 'read', path: 'main.cpp' }, signal)).contents, 'int main() {}');
		assert.equal((await files.execute({ operation: 'read', path: 'alias/readme.txt' }, signal)).contents, 'inside');
		for (const target of ['escape/note.txt', '../outside/note.txt', path.join(outside, 'note.txt')]) {
			assert.equal((await files.execute({ operation: 'read', path: target }, signal)).ok, false);
		}
		const computer = new FileTools('computer', roots);
		assert.equal((await computer.execute({ operation: 'read', path: path.join(outside, 'note.txt') }, signal)).contents, 'outside');
		for (const target of [path.join(outside, '.env'), path.join(outside, 'note.txt:secret'), '\\\\?\\C:\\Windows\\system.ini']) {
			assert.equal((await computer.execute({ operation: 'read', path: target }, signal)).ok, false);
		}
		assert.equal(await fs.readFile(path.join(outside, '.env'), 'utf8'), 'SECRET=value');
	}));
	test('text chunks preserve UTF-8, open document edits take priority, binary and images remain readable', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'source.txt'), 'abc你好世界');
		await fs.writeFile(path.join(directory, 'bytes.bin'), Buffer.from([0, 255, 3, 42]));
		const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6AAAAABJRU5ErkJggg==', 'base64');
		await fs.writeFile(path.join(directory, 'pixel.png'), png);
		const roots = [{ name: 'root', path: directory }];
		const files = new FileTools('workspace', roots);
		let result = ''; let offset = 0;
		do {
			const chunk = await files.execute({ operation: 'read', path: 'source.txt', offset, limit: 7 }, signal);
			assert.equal(chunk.kind, 'text'); result += chunk.contents;
			if (chunk.nextOffset === undefined) { break; }
			assert.ok(chunk.nextOffset > offset); offset = chunk.nextOffset;
		} while (true);
		assert.equal(result, 'abc你好世界');
		const open = new FileTools('workspace', roots, () => 'unsaved edit');
		assert.equal((await open.execute({ operation: 'read', path: 'source.txt' }, signal)).contents, 'unsaved edit');
		const binary = await files.execute({ operation: 'read', path: 'bytes.bin' }, signal);
		assert.equal(binary.kind, 'binary'); assert.equal(binary.contents, '00ff032a');
		const image = await files.execute({ operation: 'read', path: 'pixel.png' }, signal);
		assert.equal(image.kind, 'image'); assert.equal(image.contents, png.toString('base64'));
		assert.equal(fileModelOutput(image).type, 'content');
	}));
	test('listing, literal find and search omit private and escaping entries; cancellation and budgets are bounded', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, '.env'), 'private');
		await fs.writeFile(path.join(directory, 'main.cpp'), 'int main() {}\nneedle');
		const files = new FileTools('workspace', [{ name: 'root', path: directory }]);
		for (const operation of ['list', 'find', 'search'] as const) {
			const result = await files.execute({ operation, path: '.', query: operation === 'search' ? 'needle' : 'main' }, signal);
			assert.equal(result.ok, true); assert.ok(result.contents?.includes('main.cpp')); assert.ok(!result.contents?.includes('.env'));
		}
		await fs.writeFile(path.join(directory, 'large.txt'), 'x'.repeat(128 * 1024));
		const budget = new FileTools('workspace', [{ name: 'root', path: directory }]);
		for (let index = 0; index < 64; index++) { assert.equal((await budget.execute({ operation: 'read', path: 'large.txt' }, signal)).ok, true); }
		assert.equal((await budget.execute({ operation: 'read', path: 'large.txt' }, signal)).ok, false);
		await assert.rejects(() => files.execute({ operation: 'read', path: 'main.cpp' }, AbortSignal.abort()));
	}));
	test('changing selection leaves active request permission unchanged and keeps previous file context after downgrade', async () => fixture(async directory => {
		await fs.writeFile(path.join(directory, 'note.txt'), 'saved context');
		const session = new ChatSession(() => {}, () => 'error');
		let permission: 'none' | 'workspace' = 'workspace';
		const files = new FileTools(permission, [{ name: 'root', path: directory }]);
		const generate: Generate = async function* (_messages, requestSignal, execute) {
			permission = 'none';
			const input = { operation: 'read' as const, path: 'note.txt' };
			const output = await execute(input, requestSignal);
			assert.equal(output.ok, true);
			yield { type: 'tool-result', result: { id: 'read', path: 'note.txt', input, output } };
			yield { type: 'protocol', turn: { provider: 'deepseek', baseURL: providers.deepseek.baseURL, model: 'deepseek-chat', messages: [{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'read', toolName: 'inspectFiles', input }] }, { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'read', toolName: 'inspectFiles', output: fileModelOutput(output) }] }, { role: 'assistant', content: 'answer keeps streaming' }] } };
			yield { type: 'text', text: 'answer keeps streaming' };
		};
		await session.send('read', generate, undefined, files.execute);
		assert.equal(session.snapshot.messages[1].status, 'complete');
		await session.send('follow up', async function* (messages, requestSignal, execute) {
			assert.ok(JSON.stringify(messages).includes('saved context'));
			assert.equal((await execute({ operation: 'read', path: 'note.txt' }, requestSignal)).ok, false);
			yield { type: 'text', text: 'uses previous context' };
		}, undefined, new FileTools(permission, []).execute);
	}));
	test('default permission exposes no model tools', async () => {
		const generate = createGenerator(async () => ({ provider: 'deepseek', ...providers.deepseek, model: 'test', parameters: {}, apiKey: 'test' }), async (_url, options) => {
			assert.equal(JSON.parse(String(options?.body)).tools, undefined);
			return new Response('data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}\n\ndata: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		});
		const session = new ChatSession(() => {}, () => 'error');
		await session.send('hello', generate); assert.equal(session.snapshot.messages[1].text, 'hello');
	});
	test('all providers receive actual images during the tool loop and after reload and downgrade', async () => {
		const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6AAAAABJRU5ErkJggg==';
		for (const provider of ['deepseek', 'bailian', 'moonshot', 'ollama'] as const) {
			let requests = 0;
			const mock: typeof fetch = async (_url, options) => {
				const body = JSON.parse(String(options?.body));
				requests++;
				if (requests > 1) {
					const images = body.messages.flatMap((message: { content: unknown }) => Array.isArray(message.content) ? message.content.filter(part => part.type === 'image_url') : []);
					assert.deepStrictEqual(images.map((part: { image_url: { url: string } }) => part.image_url.url), [`data:image/png;base64,${image}`]);
					assert.ok(body.messages.filter((message: { role: string }) => message.role === 'tool').every((message: { content: string }) => !message.content.includes(image)));
				}
				const delta = requests < 3 ? { tool_calls: [{ index: 0, id: `call-${requests}`, type: 'function', function: { name: 'inspectFiles', arguments: JSON.stringify({ operation: 'read', path: requests === 1 ? 'pixel.png' : 'note.txt' }) } }] } : { content: 'image answer' };
				const chunks = [delta, {}].map((value, index) => 'data: ' + JSON.stringify({ id: 'image-test', object: 'chat.completion.chunk', choices: [{ index: 0, delta: value, finish_reason: index === 1 ? (requests < 3 ? 'tool_calls' : 'stop') : null }] }) + '\n\n');
				return new Response(chunks.join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
			};
			const connection = async () => ({ provider, ...providers[provider], model: 'vision-test', parameters: {}, capabilities: { purpose: 'chat' as const, vision: 'supported' as const, tools: 'supported' as const, reasoning: 'unknown' as const, source: 'manual' as const }, apiKey: 'test-key' });
			const session = new ChatSession(() => {}, () => 'error');
			await session.send('Describe the image', createGenerator(connection, mock, 'workspace'), undefined, async input => ({ ok: true, path: input.path, kind: input.path === 'pixel.png' ? 'image' : 'text', contents: input.path === 'pixel.png' ? image : 'note', ...(input.path === 'pixel.png' ? { mediaType: 'image/png' } : {}) }));
			assert.equal(requests, 3);
			assert.equal(session.snapshot.messages[1].text, 'image answer');
			const restored = new ChatSession(() => {}, () => 'error');
			restored.restore(session.snapshot);
			await restored.send('Use the saved image', createGenerator(connection, mock, 'none'));
			assert.equal(requests, 4);
			assert.equal(restored.snapshot.messages[3].text, 'image answer');
		}
	});
});

suite('Beacon installation history', () => {
	test('different workspace windows merge new chats and retain creation roots; conflicting edits never overwrite', async () => fixture(async directory => {
		const first = new HistoryStore(directory); const second = new HistoryStore(directory);
		const a = new ChatHistory(await first.load(), data => first.save(data), () => {}, () => 'error', () => [{ name: 'A', path: 'C:\\A' }]);
		const b = new ChatHistory(await second.load(), data => second.save(data), () => {}, () => 'error', () => [{ name: 'B', path: 'C:\\B' }]);
		const generate: Generate = async function* () { yield { type: 'text', text: 'reply' }; };
		await Promise.all([a.session.send('one', generate), b.session.send('two', generate)]);
		await Promise.all([a.flush(), b.flush()]);
		a.rename(a.snapshot.activeId, 'one updated'); await a.flush();
		b.rename(b.snapshot.activeId, 'two updated'); await b.flush();
		assert.equal(a.snapshot.saveFailed, false); assert.equal(b.snapshot.saveFailed, false);
		const data = await new HistoryStore(directory).load();
		assert.equal(data.conversations.length, 2);
		assert.deepStrictEqual(data.conversations.map(item => item.title).sort(), ['one updated', 'two updated']);
		assert.deepStrictEqual(data.conversations.map(item => item.workspace[0].name).sort(), ['A', 'B']);
		const old = await first.load(); const same = await second.load();
		old.conversations[0].title = 'changed'; await first.save(old);
		same.conversations[0].title = 'conflicting'; await assert.rejects(() => second.save(same), /history-conflict/);
		assert.equal((await new HistoryStore(directory).load()).conversations[0].title, 'changed');
		// End these isolated sessions without saving stale snapshots over the deliberate conflict.
		a.session.dispose(); b.session.dispose();
	}));
	test('shared saves adopt external records while a newer local checkpoint is pending', async () => fixture(async directory => {
		const store = new HistoryStore(directory);
		let unblock!: () => void;
		let waiting!: () => void;
		const blocked = new Promise<void>(resolve => { waiting = resolve; });
		const gate = new Promise<void>(resolve => { unblock = resolve; });
		let writes = 0;
		const failures: string[] = [];
		const history = new ChatHistory(await store.load(), async data => {
			if (++writes === 1) { waiting(); await gate; }
			try { return await store.save(data); }
			catch (error) { failures.push(String(error)); throw error; }
		}, () => {}, () => 'error');
		await history.session.send('local', async function* () { yield { type: 'text', text: 'reply' }; });
		await blocked;
		const otherStore = new HistoryStore(directory);
		const other = new ChatHistory(await otherStore.load(), data => otherStore.save(data), () => {}, () => 'error');
		await other.session.send('external', async function* () { yield { type: 'text', text: 'other reply' }; });
		await other.flush();
		history.rename(history.snapshot.activeId, 'newer local title');
		unblock(); await history.flush();
		assert.equal(history.snapshot.saveFailed, false, failures.join('\n'));
		const titles = (await new HistoryStore(directory).load()).conversations.map(item => item.title).sort();
		assert.deepStrictEqual(titles, ['external', 'newer local title']);
		await history.dispose(); await other.dispose();
	}));
});

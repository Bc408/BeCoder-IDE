/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createWebTool, publicWebURL, isWebSource, type WebInput } from '../src/webTools';
import { createGenerator } from '../src/provider';
import { ChatHistory, readHistory, type HistoryData } from '../src/history';
import { ChatSession } from '../src/session';
import { providers, type Connection } from '../src/connection';
import { resolveCapabilities } from '../src/models';

const signal = () => new AbortController().signal;
const pageURL = 'https://en.cppreference.com/cpp/container/vector';
const excerpt = `Title: std::vector\nURL: ${pageURL}\nPublished: N/A\nAuthor: N/A\nHighlights:\nContiguous storage.\n\nTitle: Containers\nURL: https://en.cppreference.com/cpp/container\nText: Library containers.`;
const rpc = (text: string, id = 1, sse = false) => {
	const value = JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
	return sse ? new Response('event: message\r\ndata: ' + value + '\r\n\r\n', { headers: { 'Content-Type': 'text/event-stream' } }) : new Response(value, { headers: { 'Content-Type': 'application/json' } });
};
function modelStream(deltas: Record<string, unknown>[], finish = 'stop'): Response {
	return new Response([...deltas, {}].map((delta, index) => 'data: ' + JSON.stringify({ id: 'web-test', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: index === deltas.length ? finish : null }] }) + '\n\n').join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}
const webCall = (operation = 'search') => ({ tool_calls: [{ index: 0, id: 'actual-web-call', type: 'function', function: { name: 'browseWeb', arguments: JSON.stringify(operation === 'search' ? { operation, query: 'C++ vector documentation' } : { operation, url: pageURL }) } }] });
const connection: Connection = { provider: 'deepseek', ...providers.deepseek, model: 'deepseek-v4-flash', apiKey: 'private-model-key', parameters: {} };

suite('Beacon keyless web lookup', () => {
	test('fixed endpoint receives only public query arguments, no credentials; verified JSON and SSE formats retain stable sources', async () => {
		const execute = createWebTool(async (url, init) => {
			assert.equal(url, 'https://mcp.exa.ai/mcp');
			assert.equal(init?.redirect, 'error');
			assert.equal(new Headers(init?.headers).has('Authorization'), false);
			assert.equal(new Headers(init?.headers).has('x-api-key'), false);
			const body = JSON.parse(String(init?.body));
			assert.deepStrictEqual(Object.keys(body.params.arguments).sort(), ['numResults', 'objective', 'query']);
			assert.equal(body.params.name, 'web_search_exa');
			assert.equal(body.params.arguments.query, 'C++ vector');
			return rpc(excerpt, body.id, body.id === 2);
		});
		const first = await execute({ operation: 'search', query: '  C++ vector  ' }, signal());
		const second = await execute({ operation: 'search', query: 'C++ vector' }, signal());
		assert.ok(first.ok && second.ok);
		assert.equal(first.sources.length, 2);
		assert.equal(first.sources[0].text, 'Contiguous storage.');
		assert.equal(first.sources[1].text, 'Library containers.');
		assert.equal(first.sources[0].kind, 'search');
		assert.deepStrictEqual(first.sources.map(source => source.id), second.sources.map(source => source.id));
		assert.ok(first.sources.every(isWebSource));
	});
	test('page reads use the verified fetch schema and preserve excerpt/truncation identity', async () => {
		const output = await createWebTool(async (_url, init) => {
			const body = JSON.parse(String(init?.body));
			assert.deepStrictEqual(body.params, { name: 'web_fetch_exa', arguments: { urls: [pageURL], maxCharacters: 8000 } });
			return rpc(`# std::vector\nURL: ${pageURL}\n\n${'a'.repeat(12000)}`, body.id);
		})({ operation: 'fetch', url: pageURL }, signal());
		assert.ok(output.ok);
		assert.equal(output.sources[0].kind, 'page');
		assert.equal(output.sources[0].text.length, 8000);
		assert.equal(output.sources[0].truncated, true);
		// The service can enforce maxCharacters itself without returning a truncation flag.
		const capped = await createWebTool(async () => rpc(`# Vector\nURL: ${pageURL}\n\n${'x'.repeat(8000)}`))({ operation: 'fetch', url: pageURL }, signal());
		assert.ok(capped.ok && capped.sources[0].truncated);
	});
	test('local/credential URLs and malformed queries are rejected before any request', async () => {
		let calls = 0;
		const execute = createWebTool(async () => { calls++; return rpc(''); });
		for (const url of ['file:///C:/secret.txt', 'http://localhost/a', 'http://127.0.0.1/a', 'http://169.254.169.254/a', 'http://[::1]/a', 'http://2130706433/a', 'http://server/a', 'https://server.local/a', 'https://server.internal/a', 'https://user:password@example.com/a', 'https://example.com:8080/a']) {
			assert.equal(publicWebURL(url), undefined, url);
			assert.deepStrictEqual(await execute({ operation: 'fetch', url }, signal()), { ok: false, error: 'invalid-input' });
		}
		for (const input of [null, {}, { operation: 'search', query: '' }, { operation: 'search', query: 'x'.repeat(501) }]) {
			assert.deepStrictEqual(await execute(input as WebInput, signal()), { ok: false, error: 'invalid-input' });
		}
		assert.equal(calls, 0);
	});
	test('body size, result count, content and per-response request budgets are enforced', async () => {
		let calls = 0;
		const execute = createWebTool(async (_url, init) => { calls++; return rpc(Array.from({ length: 7 }, (_, index) => `Title: Source ${index}\nURL: https://docs.example.com/${index}\nText: ${'x'.repeat(5000)}`).join('\n\n'), JSON.parse(String(init?.body)).id); });
		let total = 0;
		for (let index = 0; index < 7; index++) {
			const output = await execute({ operation: 'search', query: 'query' }, signal());
			if (output.ok) {
				assert.ok(output.sources.length <= 5);
				for (const source of output.sources) { total += source.id.length + source.title.length + source.url.length + source.text.length; assert.ok(source.text.length <= 2000); }
			}
		}
		assert.ok(total <= 32000);
		assert.ok(calls <= 6);
		const limited = createWebTool(async (_url, init) => rpc('', JSON.parse(String(init?.body)).id));
		for (let index = 0; index < 6; index++) { assert.equal((await limited({ operation: 'search', query: 'query' }, signal())).ok, true); }
		assert.deepStrictEqual(await limited({ operation: 'search', query: 'query' }, signal()), { ok: false, error: 'budget' });
		let cancelled = false;
		const oversized = createWebTool(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel() { cancelled = true; } })));
		assert.deepStrictEqual(await oversized({ operation: 'search', query: 'query' }, signal()), { ok: false, error: 'invalid-response' });
		assert.equal(cancelled, true);
	});
	test('empty results, rate limits, unexpected formats and transport errors stay distinct without raw server errors', async () => {
		for (const [response, expected] of [
			[rpc('No results found.'), { ok: true, sources: [] }],
			[new Response('private-server-error', { status: 429 }), { ok: false, error: 'rate-limit' }],
			[Response.json({ jsonrpc: '2.0', id: 1, result: { isError: true, content: [{ type: 'text', text: 'Rate limit: private detail' }] } }), { ok: false, error: 'rate-limit' }],
			[rpc('Unrecognized reply'), { ok: false, error: 'invalid-response' }],
			[rpc(excerpt, 999), { ok: false, error: 'invalid-response' }],
			[new Response('data: invalid JSON\n\n'), { ok: false, error: 'invalid-response' }]
		] as const) { assert.deepStrictEqual(await createWebTool(async () => response)({ operation: 'search', query: 'query' }, signal()), expected); }
		assert.deepStrictEqual(await createWebTool(async () => { throw new DOMException('private timeout', 'TimeoutError'); })({ operation: 'search', query: 'query' }, signal()), { ok: false, error: 'timeout' });
		assert.deepStrictEqual(await createWebTool(async () => { throw new Error('private network detail'); })({ operation: 'search', query: 'query' }, signal()), { ok: false, error: 'unavailable' });
	});
	test('user cancellation aborts the pending request rather than returning a fake failed result', async () => {
		const controller = new AbortController();
		let started!: () => void;
		const ready = new Promise<void>(resolve => { started = resolve; });
		let retired = false;
		const execute = createWebTool(async (_url, init) => new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => { retired = true; reject(init.signal?.reason); }, { once: true });
			started();
		}));
		const pending = execute({ operation: 'search', query: 'query' }, controller.signal);
		await ready; controller.abort();
		await assert.rejects(pending, { name: 'AbortError' });
		assert.equal(retired, true);
	});
});

suite('Beacon web conversation lifecycle', () => {
	test('default web access is independent of file access and only confirmed tool models register it', async () => {
		for (const support of ['supported', 'unsupported', 'unknown'] as const) {
			const capabilities = { ...resolveCapabilities(connection.provider, connection.baseURL, connection.model), tools: support };
			for (const enabled of [true, false]) {
				const session = new ChatSession(() => {}, () => 'error');
				await session.send('hello', createGenerator(async () => ({ ...connection, capabilities }), async (_url, init) => {
					const body = JSON.parse(String(init?.body));
					assert.deepStrictEqual(body.tools?.map((tool: { function: { name: string } }) => tool.function.name), enabled && support === 'supported' ? ['browseWeb'] : undefined);
					assert.equal(body.messages.some((message: { role: string; content: string }) => message.role === 'system' && message.content.includes('untrusted reference material')), enabled && support === 'supported');
					return modelStream([{ content: 'hello' }]);
				}, 'none', [], enabled, async () => { throw new Error('Unexpected search for greeting'); }));
				assert.equal(session.snapshot.error, '');
			}
		}
	});
	test('pausing an actual SDK web call retires the request and does not replay an unfinished tool', async () => {
		let started!: () => void;
		const ready = new Promise<void>(resolve => { started = resolve; });
		let retired = false;
		const session = new ChatSession(() => {}, error => String(error));
		const pending = session.send('Search docs', createGenerator(async () => connection, async () => modelStream([webCall()], 'tool_calls'), 'none', [], true, async (_url, init) => new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => { retired = true; reject(init.signal?.reason); }, { once: true });
			started();
		})));
		await ready;
		session.stop();
		await pending;
		assert.equal(retired, true);
		assert.equal(session.snapshot.busy, false);
		assert.equal(session.snapshot.error, '');
		assert.equal(session.snapshot.messages[1].status, 'stopped');
		assert.equal(session.snapshot.messages[1].sources, undefined);
		assert.equal(session.snapshot.messages[1].activities[0].status, 'stopped');
		await session.resume(session.snapshot.messages[1].id, createGenerator(async () => connection, async (_url, init) => {
			assert.ok(!JSON.stringify(JSON.parse(String(init?.body)).messages).includes('actual-web-call'));
			return modelStream([{ content: 'Continued without the unfinished lookup.' }]);
		}, 'none', [], false));
		assert.equal(session.snapshot.error, '');
		assert.equal(session.snapshot.messages[1].status, 'complete');
	});
	test('all four providers execute actual tool IDs and return source URLs and excerpts to the model', async () => {
		for (const provider of ['deepseek', 'bailian', 'moonshot', 'ollama'] as const) {
			let calls = 0;
			const capabilities = { ...resolveCapabilities(provider, providers[provider].baseURL, 'test'), tools: 'supported' as const };
			const session = new ChatSession(() => {}, error => String(error));
			await session.send('Find vector docs', createGenerator(async () => ({ ...connection, provider, baseURL: providers[provider].baseURL, capabilities }), async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				if (++calls === 1) { return modelStream([webCall()], 'tool_calls'); }
				const output = body.messages.find((message: { role: string }) => message.role === 'tool');
				assert.equal(output.tool_call_id, 'actual-web-call');
				assert.ok(output.content.includes(pageURL));
				assert.ok(output.content.includes('Contiguous storage.'));
				return modelStream([{ content: `[Vector](${pageURL})` }]);
			}, 'none', [], true, async (_url, init) => rpc(excerpt, JSON.parse(String(init?.body)).id)));
			assert.equal(session.snapshot.error, '', provider);
			assert.equal(session.snapshot.messages[1].sources?.length, 2, provider);
			assert.equal(session.snapshot.messages[1].activities[0].type, 'web-search');
			assert.equal(session.snapshot.messages[1].activities[0].status, 'complete');
			assert.equal(calls, 2);
		}
	});
	test('search sources upgrade to page excerpts, survive pause/reload/continuation with web off, and regenerate cleanly', async () => {
		let saved: HistoryData | undefined;
		const source = { provider: connection.provider, model: connection.model, baseURL: connection.baseURL };
		const history: ChatHistory = new ChatHistory(undefined, async data => { saved = JSON.parse(JSON.stringify(data)); }, () => { if (history?.snapshot.messages.at(-1)?.text === 'prefix') { history.session.stop(); } }, error => String(error));
		let calls = 0;
		await history.session.send('Find and read docs', createGenerator(async () => connection, async () => {
			if (++calls === 1) { return modelStream([webCall()], 'tool_calls'); }
			if (calls === 2) { return modelStream([webCall('fetch')], 'tool_calls'); }
			return modelStream([{ content: 'prefix' }, { content: 'ignored' }]);
		}, 'none', [], true, async (_url, init) => {
			const body = JSON.parse(String(init?.body));
			return rpc(body.params.name === 'web_search_exa' ? excerpt : `# Vector page\nURL: ${pageURL}\n\nPage excerpt`, body.id);
		}), source);
		assert.equal(history.snapshot.error, '');
		assert.equal(history.snapshot.messages[1].status, 'stopped');
		assert.equal(history.snapshot.messages[1].sources?.[0].kind, 'page');
		await history.flush();
		assert.ok(saved);
		const restored = new ChatHistory(saved, async () => {}, () => {}, error => String(error));
		const id = restored.snapshot.messages[1].id;
		await restored.session.resume(id, createGenerator(async () => connection, async (_url, init) => {
			const body = JSON.parse(String(init?.body));
			assert.equal(body.tools, undefined);
			assert.ok(JSON.stringify(body.messages).includes('Page excerpt'));
			assert.ok(JSON.stringify(body.messages).includes('actual-web-call'));
			return modelStream([{ content: ' suffix' }]);
		}, 'none', [], false), source);
		assert.equal(restored.snapshot.error, '');
		assert.equal(restored.snapshot.messages[1].text, 'prefix suffix');
		assert.equal(restored.snapshot.messages[1].sources?.length, 2);
		await restored.session.send('Follow up', async function* (messages) { assert.ok(JSON.stringify(messages).includes('Page excerpt')); yield { type: 'text', text: 'followup' }; });
		await restored.session.regenerate(id, async function* (messages) { assert.deepStrictEqual(messages, [{ role: 'user', content: 'Find and read docs' }]); yield { type: 'text', text: 'replacement' }; });
		assert.equal(restored.snapshot.messages[1].sources, undefined);
		assert.equal(restored.snapshot.messages.length, 2);
		const corrupt = structuredClone(saved);
		corrupt.conversations[0].messages[1].sources![0].url = 'file:///C:/secret';
		assert.throws(() => readHistory(corrupt), /invalid-history/);
		await Promise.all([history.dispose(), restored.dispose()]);
	});
	test('failed web tools remain activities and honest tool errors, without sources or a duplicated regenerate button', async () => {
		let calls = 0;
		const session = new ChatSession(() => {}, error => String(error));
		await session.send('Search docs', createGenerator(async () => connection, async (_url, init) => {
			if (++calls === 1) { return modelStream([webCall()], 'tool_calls'); }
			const body = JSON.parse(String(init?.body));
			assert.ok(JSON.stringify(body.messages).includes('rate-limit'));
			return modelStream([{ content: 'Could not verify the current information.' }]);
		}, 'none', [], true, async () => new Response('private error', { status: 429 })));
		assert.equal(session.snapshot.error, '');
		assert.equal(session.snapshot.messages[1].activities[0].error, 'rate-limit');
		assert.equal(session.snapshot.messages[1].activities[0].status, 'error');
		assert.equal(session.snapshot.messages[1].sources, undefined);
		assert.ok(!JSON.stringify(session.snapshot).includes('private error'));
	});
});

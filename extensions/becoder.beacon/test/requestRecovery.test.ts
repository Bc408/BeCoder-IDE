/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { RequestRecovery, RequestRecoveryError, RequestRejectedError, type RequestDiagnostic, type RequestRetry } from '../src/requestRecovery';
import { createGenerator } from '../src/provider';
import { ChatSession, type Snapshot } from '../src/session';
import { ChatHistory, readHistory, type HistoryData } from '../src/history';
import { providers, type Connection } from '../src/connection';
import { unknownCapabilities } from '../src/models';
import { captureClipboardImages } from '../src/attachments';

const signal = () => new AbortController().signal;
const networkError = (code = 'ECONNRESET') => Object.assign(new Error('private diagnostic content'), { code });
const init = { method: 'POST', body: 'private request image and credentials' };
const wait = async () => {};
const connection: Connection = { provider: 'deepseek', ...providers.deepseek, model: 'custom', apiKey: 'private-secret', parameters: {}, capabilities: { ...unknownCapabilities, purpose: 'chat', vision: 'supported' } };
const chunk = (delta: Record<string, unknown>, finish: string | null = null) => 'data: ' + JSON.stringify({ id: 'recovery-test', choices: [{ index: 0, delta, finish_reason: finish }] }) + '\n\n';
const answer = () => new Response(chunk({ content: 'answer' }) + chunk({}, 'stop') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });

suite('Beacon request recovery', () => {
	test('two transient retries reuse bytes and emit only bounded, redacted diagnostics', async () => {
		let requests = 0; const delays: number[] = []; const progress: (RequestRetry | undefined)[] = []; const diagnostics: RequestDiagnostic[] = [];
		const recovery = new RequestRecovery(async (_url, options) => { assert.equal(options?.body, init.body); if (++requests < 3) { throw networkError(); } return answer(); }, signal(), { wait: async milliseconds => { delays.push(milliseconds); }, random: () => 0, progress: value => progress.push(value), diagnostic: value => diagnostics.push(value) });
		assert.equal((await recovery.fetch('https://provider.invalid', init)).ok, true);
		assert.equal(requests, 3); assert.deepStrictEqual(delays, [350, 700]);
		assert.deepStrictEqual(progress, [{ attempt: 1, limit: 2 }, { attempt: 2, limit: 2 }, undefined]);
		assert.deepStrictEqual(diagnostics.map(item => item.code), ['ECONNRESET', 'ECONNRESET', 'HTTP_OK']);
		assert.equal(new Set(diagnostics.map(item => item.requestId)).size, 1);
		assert.ok(!JSON.stringify(diagnostics).includes('private'));
		assert.deepStrictEqual(Object.keys(diagnostics[0]).sort(), ['attempt', 'code', 'elapsedMs', 'kind', 'requestId']);
	});
	test('network, overload and rate-limit policies use separate backoffs with bounded positive jitter', async () => {
		for (const [status, expected] of [[408, [350, 700]], [409, [350, 700]], [425, [350, 700]], [503, [1000, 2000]], [520, [1000, 2000]], [522, [1000, 2000]], [524, [1000, 2000]], [529, [1000, 2000]], [429, [2000, 4000]]] as const) {
			for (const random of [0, 1]) {
				let requests = 0; const delays: number[] = [];
				const recovery = new RequestRecovery(async () => ++requests < 3 ? new Response('', { status }) : answer(), signal(), { random: () => random, wait: async milliseconds => { delays.push(milliseconds); } });
				await recovery.fetch('https://provider.invalid', init);
				assert.equal(requests, 3);
				assert.deepStrictEqual(delays, expected.map(milliseconds => milliseconds + Math.floor(milliseconds / 4 * random)));
			}
		}
		for (const [code, expected] of [['overloaded_error', 1000], ['service_unavailable', 1000], ['rate_limit_exceeded', 2000]] as const) {
			let requests = 0; const delays: number[] = [];
			const recovery = new RequestRecovery(async () => ++requests === 1 ? new Response(JSON.stringify({ error: { type: code.toUpperCase() } }), { status: 429 }) : answer(), signal(), { random: () => 0, wait: async milliseconds => { delays.push(milliseconds); } });
			await recovery.fetch('https://provider.invalid', init); assert.deepStrictEqual(delays, [expected]);
		}
	});
	test('hard quota, authentication, context and request rejections never consume a retry', async () => {
		for (const [code, expected] of [['insufficient_quota', 'QUOTA_EXHAUSTED'], ['quota_exceeded', 'QUOTA_EXHAUSTED'], ['billing_hard_limit', 'QUOTA_EXHAUSTED'], ['billing_hard_limit_reached', 'QUOTA_EXHAUSTED'], ['credits_exhausted', 'QUOTA_EXHAUSTED'], ['invalid_api_key', 'AUTHENTICATION'], ['permission_denied', 'AUTHENTICATION'], ['context_length_exceeded', 'CONTEXT_TOO_LARGE'], ['invalid_request_error', 'INVALID_REQUEST']] as const) {
			let requests = 0; const progress: (RequestRetry | undefined)[] = []; const diagnostics: RequestDiagnostic[] = [];
			const recovery = new RequestRecovery(async () => { requests++; return new Response(JSON.stringify({ error: { code, type: 'rate_limit_error', message: 'private body and key' } }), { status: 429 }); }, signal(), { wait: async () => { assert.fail('Permanent provider rejection was retried'); }, progress: value => progress.push(value), diagnostic: value => diagnostics.push(value) });
			await assert.rejects(recovery.fetch('https://provider.invalid', init), error => error instanceof RequestRejectedError && error.code === expected);
			assert.equal(requests, 1); assert.deepStrictEqual(progress, []);
			assert.deepStrictEqual(diagnostics.map(item => [item.kind, item.code]), [['rejected', expected]]);
			assert.ok(!JSON.stringify(diagnostics).includes('private'));
		}
		for (const status of [400, 401, 402, 403, 404, 413, 415, 422]) {
			const body = JSON.stringify({ error: { code: 'overloaded_error' } }); let requests = 0;
			const recovery = new RequestRecovery(async () => { requests++; return new Response(body, { status }); }, signal(), { wait: async () => { assert.fail('HTTP rejection was overridden by a provider code'); } });
			assert.equal(await (await recovery.fetch('https://provider.invalid', init)).text(), body); assert.equal(requests, 1);
		}
	});
	test('SDK error data and response bodies share the HTTP classifier without message heuristics', async () => {
		for (const details of [{ data: { error: { code: 'insufficient_quota' } } }, { data: {}, responseBody: JSON.stringify({ error: { code: null, type: 'insufficient_quota' } }) }]) {
			const error = Object.assign(new Error('private insufficient_quota message'), { statusCode: 429, ...details });
			const recovery = new RequestRecovery(async () => answer(), signal(), { wait: async () => { assert.fail('SDK quota rejection was retried'); } });
			assert.equal(await recovery.retryStream(error), false);
			const wrapped = recovery.wrap(error); assert.ok(wrapped instanceof RequestRejectedError); assert.equal(wrapped.code, 'QUOTA_EXHAUSTED');
			assert.equal(await recovery.retryStream(wrapped), false); assert.equal(recovery.wrap(wrapped), wrapped);
		}
		const delays: number[] = [];
		const recovery = new RequestRecovery(async () => answer(), signal(), { random: () => 0, wait: async milliseconds => { delays.push(milliseconds); } });
		assert.equal(await recovery.retryStream(Object.assign(new Error('insufficient_quota'), { statusCode: 429, data: { error: { code: 'private-unknown-code' } } })), true);
		assert.deepStrictEqual(delays, [2000], 'Unknown codes and free-form messages must fall back to HTTP status');
		assert.equal(await recovery.retryStream(Object.assign(new Error('private'), { statusCode: 401, cause: networkError() })), false);
	});
	test('a quota rejection reaches the session as an account error without a temporary failure or retry label', async () => {
		let requests = 0; const snapshots: Snapshot[] = [];
		const session = new ChatSession(snapshot => snapshots.push(snapshot), error => error instanceof RequestRejectedError && error.code === 'QUOTA_EXHAUSTED' ? 'safe account failure' : 'unexpected failure');
		await session.send('question', createGenerator(async () => connection, async () => { requests++; return new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: 'private quota body' } }), { status: 429 }); }, 'none', [], false, undefined, { wait: async () => { assert.fail('Quota error was retried by an outer layer'); } }));
		assert.equal(requests, 1); assert.equal(session.snapshot.error, 'safe account failure');
		assert.equal(session.snapshot.messages[1].failure, undefined); assert.equal(session.snapshot.messages[1].status, 'error');
		assert.ok(snapshots.every(snapshot => snapshot.retry === undefined));
	});
	test('temporary HTTP failures close discarded bodies; retries and stream recovery share one budget', async () => {
		for (const status of [500, 502, 503, 504]) {
			let requests = 0; let closed = 0;
			const recovery = new RequestRecovery(async () => ++requests === 1 ? new Response(new ReadableStream({ cancel() { closed++; } }), { status }) : answer(), signal(), { wait });
			await recovery.fetch('https://provider.invalid', init); assert.equal(requests, 2); assert.equal(closed, 1);
			assert.equal(await recovery.retryStream(networkError()), true);
			assert.equal(await recovery.retryStream(networkError()), false, 'HTTP and stream retries cannot multiply their budgets');
		}
		let requests = 0;
		const recovery = new RequestRecovery(async () => { requests++; throw networkError(); }, signal(), { wait });
		await assert.rejects(recovery.fetch('https://provider.invalid', init), error => error instanceof RequestRecoveryError && error.failure.retries === 2);
		assert.equal(requests, 3);
	});
	test('rate-limit hints are honored without waiting beyond ten seconds in total', async () => {
		for (const [headers, expected] of [[{ 'retry-after': '3' }, 3000], [{ 'retry-after-ms': '750' }, 750], [{ 'x-ms-retry-after-ms': '625' }, 625], [{ 'retry-after': 'invalid' }, 2000], [{ 'retry-after': '3', 'retry-after-ms': '750' }, 3000], [{ 'retry-after': 'invalid', 'retry-after-ms': '750' }, 750], [{ 'retry-after': '-1', 'retry-after-ms': '750' }, 750], [{ 'retry-after-ms': '-1', 'x-ms-retry-after-ms': '625' }, 625], [{ 'retry-after': '0' }, 0], [{ 'retry-after': 'Sat, 01 Jan 2000 00:00:00 GMT' }, 0]] as const) {
			let requests = 0; const delays: number[] = [];
			const recovery = new RequestRecovery(async () => ++requests === 1 ? new Response('', { status: 429, headers }) : answer(), signal(), { random: () => 0, wait: async milliseconds => { delays.push(milliseconds); } });
			await recovery.fetch('https://provider.invalid', init); assert.deepStrictEqual(delays, [expected]);
		}
		for (const [seconds, expectedRequests, expectedRetries] of [[31, 1, 0], [8, 2, 1]]) {
			let requests = 0;
			const recovery = new RequestRecovery(async () => { requests++; return new Response('', { status: 429, headers: { 'retry-after': String(seconds) } }); }, signal(), { wait });
			await assert.rejects(recovery.fetch('https://provider.invalid', init), error => error instanceof RequestRecoveryError && error.failure.kind === 'rate-limit' && error.failure.retries === expectedRetries);
			assert.equal(requests, expectedRequests);
		}
		let requests = 0;
		const recovery = new RequestRecovery(async () => { requests++; return new Response('', { status: 429, headers: { 'retry-after': '31', 'retry-after-ms': '1' } }); }, signal(), { wait: async () => { assert.fail('Standard Retry-After must not be shortened by a vendor hint'); } });
		await assert.rejects(recovery.fetch('https://provider.invalid', init)); assert.equal(requests, 1);
		const delays: number[] = []; const date = new Date(Date.now() + 5000).toUTCString(); requests = 0;
		const dated = new RequestRecovery(async () => ++requests === 1 ? new Response('', { status: 429, headers: { 'retry-after': date } }) : answer(), signal(), { wait: async milliseconds => { delays.push(milliseconds); } });
		await dated.fetch('https://provider.invalid', init); assert.ok(delays[0] > 3500 && delays[0] <= 5000);
	});
	test('malformed, oversized, broken and stalled error bodies retain HTTP status and retry hints', async () => {
		for (const body of ['invalid JSON private content', JSON.stringify({ error: { code: 'insufficient_quota', message: 'x'.repeat(16384) } }), 'broken', 'stalled']) {
			let requests = 0; let closed = 0; const delays: number[] = [];
			const stream = body === 'broken' ? new ReadableStream({ start(controller) { controller.error(networkError()); } }) : body === 'stalled' ? new ReadableStream({ cancel() { closed++; } }) : body;
			const recovery = new RequestRecovery(async () => ++requests === 1 ? new Response(stream, { status: 429, headers: { 'retry-after': '3' } }) : answer(), signal(), { wait: async milliseconds => { delays.push(milliseconds); } });
			await recovery.fetch('https://provider.invalid', init); assert.equal(requests, 2); assert.deepStrictEqual(delays, [3000]);
			if (body === 'stalled') { assert.equal(closed, 1); }
		}
	});
	test('stopping during error classification cancels both body branches without retrying', async () => {
		const controller = new AbortController(); let requests = 0; let closed = 0;
		const response = new Response(new ReadableStream({ pull() { controller.abort(); }, cancel() { closed++; } }), { status: 429 });
		const recovery = new RequestRecovery(async () => { requests++; return response; }, controller.signal, { wait: async () => { assert.fail('Aborted classifier was retried'); } });
		await assert.rejects(recovery.fetch('https://provider.invalid', init)); assert.equal(requests, 1); assert.equal(closed, 1);
	});
	test('permanent failures, committed activity and non-replayable requests never retry', async () => {
		for (const status of [400, 401, 402, 403, 404, 415, 422]) {
			let requests = 0;
			const recovery = new RequestRecovery(async () => { requests++; return new Response('{}', { status }); }, signal(), { wait: async () => { assert.fail('Permanent error was retried'); } });
			assert.equal((await recovery.fetch('https://provider.invalid', init)).status, status); assert.equal(requests, 1);
		}
		for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'CERT_HAS_EXPIRED']) {
			let requests = 0;
			const recovery = new RequestRecovery(async () => { requests++; throw new TypeError('fetch failed', { cause: networkError(code) }); }, signal(), { wait: async () => { assert.fail('Permanent network error was retried'); } });
			await assert.rejects(recovery.fetch('https://provider.invalid', init)); assert.equal(requests, 1);
		}
		for (const committed of [false, true]) {
			let requests = 0;
			const recovery = new RequestRecovery(async () => { requests++; throw networkError(); }, signal(), { wait: async () => { assert.fail('Unsafe request was retried'); } });
			if (committed) { recovery.commit(); }
			await assert.rejects(recovery.fetch('https://provider.invalid', committed ? init : { method: 'GET' })); assert.equal(requests, 1);
		}
	});
	test('native abortable delay retires immediately; stopping keeps no error or later request', async () => {
		let requests = 0; const snapshots: Snapshot[] = [];
		const session = new ChatSession(snapshot => { snapshots.push(snapshot); if (snapshot.retry) { session.stop(); } }, () => 'error');
		await session.send('question', createGenerator(async () => connection, async () => { requests++; throw networkError(); }));
		assert.equal(requests, 1); assert.equal(session.snapshot.messages.length, 2);
		assert.equal(session.snapshot.messages[1].status, 'stopped'); assert.equal(session.snapshot.error, '');
		assert.equal(session.snapshot.busy, false); assert.equal(session.snapshot.retry, undefined);
		assert.ok(snapshots.some(snapshot => snapshot.busy && snapshot.stopping));
		const controller = new AbortController(); controller.abort();
		await assert.rejects(new RequestRecovery(async () => { assert.fail('Aborted request started'); }, controller.signal).fetch('https://provider.invalid', init));
	});
	test('all installed adapters recover without duplicating the user message or changing captured image input', async () => {
		const images = captureClipboardImages([{ name: 'image.png', mediaType: 'image/png', contents: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }]);
		for (const provider of ['deepseek', 'bailian', 'moonshot', 'ollama'] as const) {
			let reads = 0; const bodies: string[] = []; const snapshots: Snapshot[] = [];
			const session = new ChatSession(snapshot => snapshots.push(snapshot), () => 'error');
			await session.send('question', createGenerator(async () => { reads++; return { ...connection, provider, baseURL: providers[provider].baseURL }; }, async (_url, options) => { bodies.push(String(options?.body)); if (bodies.length === 1) { throw networkError(); } return answer(); }, 'none', [], false, undefined, { wait }), undefined, async () => { assert.fail('Screenshot read from disk'); }, images);
			assert.equal(reads, 1); assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
			assert.ok(bodies[0].includes('data:image/png;base64,' + images[0].contents));
			assert.equal(session.snapshot.messages.length, 2); assert.equal(session.snapshot.messages[1].text, 'answer');
			assert.equal(session.snapshot.error, ''); assert.equal(session.snapshot.messages[1].failure, undefined);
			assert.ok(snapshots.some(snapshot => snapshot.retry?.attempt === 1));
		}
	});
	test('a stream failing before meaningful output can recover using the same bounded budget', async () => {
		let requests = 0;
		const session = new ChatSession(() => {}, () => 'error');
		await session.send('question', createGenerator(async () => connection, async () => ++requests === 1 ? new Response(new ReadableStream({ start(controller) { controller.error(networkError()); } }), { headers: { 'Content-Type': 'text/event-stream' } }) : answer(), 'none', [], false, undefined, { wait }));
		assert.equal(requests, 2); assert.equal(session.snapshot.messages[1].text, 'answer'); assert.equal(session.snapshot.error, '');
	});
	test('partial text or reasoning and completed tools prevent replay after disconnection', async () => {
		for (const type of ['content', 'reasoning_content']) {
			let requests = 0; let stream: ReadableStreamDefaultController<Uint8Array>; let interrupted = false;
			const session = new ChatSession(snapshot => { if (!interrupted && (snapshot.messages.at(-1)?.text || snapshot.messages.at(-1)?.reasoning)) { interrupted = true; stream.error(networkError()); } }, () => 'connection failed');
			await session.send('question', createGenerator(async () => connection, async () => { requests++; return new Response(new ReadableStream({ start(controller) { stream = controller; controller.enqueue(new TextEncoder().encode(chunk({ [type]: 'partial' }))); } }), { headers: { 'Content-Type': 'text/event-stream' } }); }, 'none', [], false, undefined, { wait: async () => { assert.fail('Partial response was retried'); } }));
			assert.equal(requests, 1); assert.equal(type === 'content' ? session.snapshot.messages[1].text : session.snapshot.messages[1].reasoning, 'partial');
			assert.equal(session.snapshot.messages[1].status, 'error'); assert.deepStrictEqual(session.snapshot.messages[1].failure, { kind: 'connection', retries: 0 });
		}
		let requests = 0; let tools = 0;
		const session = new ChatSession(() => {}, () => 'connection failed');
		await session.send('question', createGenerator(async () => ({ ...connection, capabilities: { ...connection.capabilities!, tools: 'supported' } }), async () => {
			if (++requests === 1) { return new Response(chunk({ tool_calls: [{ index: 0, id: 'read-once', type: 'function', function: { name: 'inspectFiles', arguments: '{"operation":"read","path":"main.cpp"}' } }] }) + chunk({}, 'tool_calls') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }); }
			throw networkError();
		}, 'workspace', [], false, undefined, { wait: async () => { assert.fail('Tool round was retried'); } }), undefined, async input => { tools++; return { ok: true, path: input.path, contents: 'code', kind: 'text' }; });
		assert.equal(requests, 2); assert.equal(tools, 1); assert.equal(session.snapshot.messages[1].toolResults?.length, 1);
	});
	test('final failure classification survives history while retry progress never persists', async () => {
		let saved: HistoryData | undefined; let requests = 0;
		const history = new ChatHistory(undefined, async data => { saved = structuredClone(data); }, () => {}, () => 'safe failure');
		const originalLog = console.error; const rawLogs: unknown[][] = [];
		try {
			console.error = (...args: unknown[]) => { rawLogs.push(args); };
			await history.session.send('question', createGenerator(async () => connection, async () => { requests++; throw networkError(); }, 'none', [], false, undefined, { wait }));
		} finally { console.error = originalLog; }
		assert.deepStrictEqual(rawLogs, [], 'The SDK must not log original request bodies or causes');
		await history.flush();
		assert.equal(requests, 3); assert.ok(saved); assert.ok(!JSON.stringify(saved).includes('private'));
		const parsed = readHistory(saved); assert.deepStrictEqual(parsed.conversations[0].messages[1].failure, { kind: 'connection', retries: 2 });
		assert.equal(Object.hasOwn(parsed.conversations[0], 'retry'), false);
		const restored = new ChatHistory(parsed, async () => {}, () => {}, () => 'error');
		assert.equal(restored.snapshot.error, 'safe failure'); assert.equal(restored.snapshot.retry, undefined);
		parsed.conversations[0].messages[1].failure!.retries = 3; assert.throws(() => readHistory(parsed));
		await history.dispose(); await restored.dispose();
	});
});

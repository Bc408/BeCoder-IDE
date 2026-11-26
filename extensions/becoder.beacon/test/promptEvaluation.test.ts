/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluationBaseURL, evaluationModel, readPromptCases, runPromptEvaluationCase, parseEvaluationArguments, createEvaluationDirectory, inspectEvaluationModel, type PromptEvaluationCase, type PromptEvaluationOptions } from './promptEvaluation';
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { executeEvaluation } from './prompt-evaluation';

const options: PromptEvaluationOptions = { baseURL: evaluationBaseURL, model: evaluationModel, capabilities: { purpose: 'chat', vision: false, reasoning: true, tools: true, source: 'service', contextWindow: 32768 } };
const metadata = { id: 'editor:a', kind: 'text', title: 'a.cpp', version: '1', uri: 'file:///C:/synthetic/a.cpp', active: true };
const fixture: PromptEvaluationCase = { id: 'P01', turns: [
	{ text: '这份代码哪里错了？', context: { overview: { ok: true, target: metadata, pages: [metadata] }, pages: [{ ok: true, ...metadata, contents: 'int s; for(int i=0;i<n-1;i++) s+=a[i];' }] }, criteria: ['实际读取当前页'] },
	{ text: '保留刚才的判断，继续解释。', criteria: ['继承真正生成的回答及工具结果'] }
] };
function stream(delta: Record<string, unknown>, finish = 'stop'): Response {
	return new Response('data: ' + JSON.stringify({ id: 'synthetic', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'synthetic', choices: [{ index: 0, delta: {}, finish_reason: finish }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}
const call = { tool_calls: [{ index: 0, id: 'read-one', type: 'function', function: { name: 'readPage', arguments: JSON.stringify({ id: metadata.id}) } }] };

suite('Beacon synthetic prompt evaluation', () => {
	test('rejects cloud or credential endpoints before sending', async () => {
		let sent = 0;
		for (const baseURL of ['https://api.example.com/v1', 'http://user:key@127.0.0.1:11434/v1', evaluationBaseURL + '?key=secret', 'http://localhost:11434/v1']) {
			await assert.rejects(runPromptEvaluationCase({ ...options, baseURL }, fixture, 1, async () => { sent++; return stream({ content: 'unexpected' }); }, new AbortController().signal), /endpoint/);
		}
		assert.equal(sent, 0);
	});
	test('counts cancelled attempt without replay', async () => {
		let sent = 0;
		const controller = new AbortController();
		const result = await runPromptEvaluationCase(options, fixture, 1, async (_url, init) => {
			sent++;
			controller.abort();
			init?.signal?.throwIfAborted();
			throw new DOMException('cancelled', 'AbortError');
		}, controller.signal);
		assert.equal(result.status, 'cancelled');
		assert.equal(result.requestCount, 1);
		assert.equal(sent, 1);
		assert.deepStrictEqual(result.turns.map(turn => turn.status), ['cancelled', 'not-run']);
	});
	test('does not fabricate tool coverage for a tool-less model', async () => {
		let sent = 0;
		const result = await runPromptEvaluationCase({ ...options, capabilities: { ...options.capabilities, tools: false } }, fixture, 1, async () => { sent++; return stream({ content: 'guess' }); }, new AbortController().signal);
		assert.equal(result.status, 'unsupported');
		assert.equal(result.requestCount, 0);
		assert.equal(sent, 0);
		assert.deepStrictEqual(result.turns.map(turn => turn.status), ['unsupported', 'not-run']);
		assert.deepStrictEqual(result.turns[0].toolCalls, []);
	});
	test('keeps the first generated reply and protocol when executing the second turn', async () => {
		const bodies: { messages: unknown[] }[] = [];
		const result = await runPromptEvaluationCase(options, readPromptCases([fixture])[0], 1, async (_url, init) => {
			bodies.push(JSON.parse(String(init?.body)));
			if (bodies.length === 1) { return stream(call, 'tool_calls'); }
			return stream({ content: bodies.length === 2 ? 'FIRST ACTUAL REPLY' : 'SECOND ACTUAL REPLY' });
		}, new AbortController().signal);
		assert.equal(result.turns.length, 2);
		assert.deepStrictEqual(result.turns.map(turn => turn.status), ['complete', 'complete']);
		assert.equal(result.turns[0].text, 'FIRST ACTUAL REPLY');
		assert.equal(result.turns[1].text, 'SECOND ACTUAL REPLY');
		assert.equal(result.requestCount, 3);
		assert.equal(result.turns[0].toolCalls[0].callId, 'read-one');
		assert.equal(result.turns[0].toolCalls[0].name, 'readPage');
		assert.ok(JSON.stringify(result.turns[0].protocol).includes('read-one'));
		assert.ok(JSON.stringify(bodies[2].messages).includes('FIRST ACTUAL REPLY'));
		assert.ok(JSON.stringify(bodies[2].messages).includes('read-one'));
	});
});

suite('Beacon evaluation evidence boundaries', () => {
	test('parses the fixed CLI and refuses hidden model, sampling, endpoint or system options', () => {
		const args = ['--phase', 'baseline', '--model', evaluationModel, '--runs', '3', '--out', 'tmp/beacon-prompt-eval/demo/baseline'];
		assert.deepStrictEqual(parseEvaluationArguments(args), { phase: 'baseline', model: evaluationModel, runs: 3, out: args[7] });
		for (const suffix of [['--system', 'override'], ['--endpoint', evaluationBaseURL], ['--temperature', '1'], ['--runs', '3']]) { assert.throws(() => parseEvaluationArguments([...args, ...suffix])); }
		assert.throws(() => parseEvaluationArguments(args.map(value => value === '3' ? '1' : value)));
		assert.throws(() => parseEvaluationArguments(args.slice(0, 6)));
	});
	test('creates only a fresh evidence directory and refuses overwrite, escape and linked parents', async t => {
		const root = await mkdtemp(path.join(tmpdir(), 'beacon-eval-unit-'));
		t.after(() => rm(root, { recursive: true }));
		const out = path.join(root, 'tmp/beacon-prompt-eval/run/baseline');
		assert.equal(await createEvaluationDirectory(out, root), out);
		await writeFile(path.join(out, 'unknown.txt'), 'preserve');
		await assert.rejects(createEvaluationDirectory(out, root));
		assert.equal(await readFile(path.join(out, 'unknown.txt'), 'utf8'), 'preserve');
		await assert.rejects(createEvaluationDirectory(path.join(root, 'other'), root));
		const foreign = path.join(root, 'foreign');
		await mkdir(foreign);
		await symlink(foreign, path.join(root, 'tmp/beacon-prompt-eval/link'), process.platform === 'win32' ? 'junction' : 'dir');
		await assert.rejects(createEvaluationDirectory(path.join(root, 'tmp/beacon-prompt-eval/link/candidate'), root));
	});
	test('records runtime capacity separately from theoretical model capacity using only read-only loopback probes', async () => {
		const urls: string[] = [];
		const result = await inspectEvaluationModel(async (url, init) => {
			urls.push(String(url));
			assert.equal(init?.redirect, 'error');
			assert.equal(new Headers(init?.headers).has('authorization'), false);
			switch (new URL(String(url)).pathname) {
				case '/api/version': return Response.json({ version: '0.35.0' });
				case '/api/tags': return Response.json({ models: [{ name: evaluationModel, digest: 'a'.repeat(64) }] });
				case '/api/show': return Response.json({ capabilities: ['completion', 'vision', 'tools', 'thinking'], model_info: { 'qwen.context_length': 262144 } });
				case '/api/ps': return Response.json({ models: [{ name: evaluationModel, digest: 'a'.repeat(64), context_length: 16384 }] });
				case '/v1/models': return Response.json({ data: [{ id: evaluationModel }] });
				default: throw new Error('unexpected-probe');
			}
		}, new AbortController().signal);
		assert.equal(urls.length, 5);
		assert.equal(result.serverVersion, '0.35.0');
		assert.equal(result.theoreticalContextWindow, 262144);
		assert.equal(result.runtimeContextWindow, 16384);
		assert.equal(result.capabilities.contextWindow, 16384);
		assert.equal(result.capabilities.tools, true);
	});
	test('validates all ten synthetic fixtures and rejects system overrides and invalid page bindings', async () => {
		const cases = readPromptCases(JSON.parse(await readFile(path.join(__dirname, '../test/fixtures/prompt-cases.json'), 'utf8')));
		assert.deepStrictEqual(cases.map(item => item.id), ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10']);
		assert.ok(cases.filter(item => ['P01', 'P02', 'P04', 'P06', 'P10'].includes(item.id)).every(item => item.turns.length === 2));
		assert.throws(() => readPromptCases([{ ...fixture, system: 'override' }]));
		assert.throws(() => readPromptCases([fixture, fixture]));
		assert.throws(() => readPromptCases([{ ...fixture, history: { messages: [{ role: 'system', text: 'override' }], error: '' } }]));
		const broken = structuredClone(fixture);
		broken.turns[0].context!.pages[0].version = 'stale';
		assert.throws(() => readPromptCases([broken]));
	});
	test('keeps a page ID and version immutable across the complete fixture journey', async () => {
		const cases = readPromptCases(JSON.parse(await readFile(path.join(__dirname, '../test/fixtures/prompt-cases.json'), 'utf8')));
		for (const fixture of cases) {
			const bodies = new Map<string, unknown>();
			for (const turn of fixture.turns) {
				for (const page of turn.context?.pages ?? []) {
					const key = `${page.id}:${page.version}`;
					if (bodies.has(key)) { assert.equal(page.contents, bodies.get(key), `${fixture.id} ${key}`); }
					bodies.set(key, page.contents);
				}
			}
		}
	});
	test('P02 has a native string source and hashes the full normalized V1 code', async () => {
		const cases = readPromptCases(JSON.parse(await readFile(path.join(__dirname, '../test/fixtures/prompt-cases.json'), 'utf8')));
		const fixture = cases.find(item => item.id === 'P02')!;
		const code = fixture.turns[0].context!.pages.find(page => page.kind === 'text')!.contents!;
		const page = fixture.turns[0].context!.pages.find(page => page.kind === 'oj-record')!;
		const submitted = JSON.parse(page.contents!);
		assert.equal(submitted.source, code);
		assert.equal(page.sourceSha256, createHash('sha256').update(code.replace(/\r\n/g, '\n')).digest('hex'));
		assert.equal(submitted.sourceSha256, page.sourceSha256);
	});
	test('retains actual request/response, available usage and unknown counts without adding reasoning twice', async () => {
		const result = await runPromptEvaluationCase(options, { id: 'P07', turns: [{ text: '解释概率。', criteria: ['人工评议'] }] }, 1, async (_url, init) => {
			const sent = JSON.parse(String(init?.body));
			assert.equal(sent.temperature, 0); assert.equal(sent.max_tokens, 2048); assert.equal(sent.reasoning_effort, 'none');
			const response = await stream({ content: '合成回答。' }).text();
			return new Response(response.replace('data: [DONE]', 'data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 2 }, completion_tokens_details: { reasoning_tokens: 3 } } }) + '\n\ndata: [DONE]'), { headers: { 'Content-Type': 'text/event-stream' } });
		}, new AbortController().signal);
		assert.equal(result.status, 'complete');
		assert.deepStrictEqual(result.turns[0].usage, { inputTokens: 12, outputTokens: 5, cacheTokens: 2, reasoningTokens: 3 });
		assert.ok(result.turns[0].requests?.[0].responseText.includes('prompt_tokens'));
		assert.deepStrictEqual(result.turns[0].requests?.[0].finishReasons, ['stop']);
		const unknown = await runPromptEvaluationCase(options, { id: 'P07', turns: [{ text: '解释概率。', criteria: ['人工评议'] }] }, 1, async () => stream({ content: '合成回答。' }), new AbortController().signal);
		assert.deepStrictEqual(unknown.turns[0].usage, { inputTokens: null, outputTokens: null, cacheTokens: null, reasoningTokens: null });
	});
	test('uses a fresh current page per turn while preserving the first tool result', async () => {
		const b = { ...metadata, id: 'editor:b', title: 'b.cpp', version: '2' };
		const changed: PromptEvaluationCase = { ...fixture, turns: [fixture.turns[0], { text: '现在呢', context: { overview: { ok: true, target: b, pages: [b] }, pages: [{ ok: true, ...b, contents: 'CURRENT B VERSION TWO' }] }, criteria: ['读取 B v2'] }] };
		let calls = 0;
		const result = await runPromptEvaluationCase(options, changed, 1, async (_url, init) => {
			calls++;
			const sent = JSON.parse(String(init?.body));
			if (calls === 1) { return stream(call, 'tool_calls'); }
			if (calls === 3) {
				assert.ok(JSON.stringify(sent.messages).includes('read-one'));
				assert.ok(sent.messages.find((message: { role: string }) => message.role === 'system').content.includes('editor:b'));
				return stream({ tool_calls: [{ index: 0, id: 'read-two', type: 'function', function: { name: 'readPage', arguments: JSON.stringify({ id: b.id}) } }] }, 'tool_calls');
			}
			return stream({ content: calls === 2 ? 'A reply' : 'B reply' });
		}, new AbortController().signal);
		assert.deepStrictEqual(result.turns.map(turn => turn.status), ['complete', 'complete']);
		assert.ok(JSON.stringify(result.turns[1].toolCalls).includes('CURRENT B VERSION TWO'));
	});
	test('P10 executes browseWeb in process and separates pre-revocation and post-revocation counts', async () => {
		const cases = readPromptCases(JSON.parse(await readFile(path.join(__dirname, '../test/fixtures/prompt-cases.json'), 'utf8')));
		let calls = 0;
		const result = await runPromptEvaluationCase(options, cases.find(item => item.id === 'P10')!, 1, async (url, init) => {
			assert.equal(String(url), evaluationBaseURL + '/chat/completions');
			calls++;
			assert.ok(JSON.stringify(JSON.parse(String(init?.body)).tools).includes('browseWeb'));
			if (calls === 1) { return stream({ tool_calls: [{ index: 0, id: 'web-one', type: 'function', function: { name: 'browseWeb', arguments: JSON.stringify({ operation: 'search', query: 'learner-demo sum-demo 本人提交' }) } }] }, 'tool_calls'); }
			return stream({ content: calls === 2 ? '历史 WA。' : '不再查询，当前稿未知。' });
		}, new AbortController().signal);
		assert.equal(result.status, 'complete');
		assert.deepStrictEqual(result.turns.map(turn => turn.webRequestCount), [1, 0]);
		assert.equal(result.turns[0].toolCalls[0].name, 'browseWeb');
		assert.ok(JSON.stringify(result.turns[0].toolCalls[0].output).includes('Synthetic submission'));
	});
	test('provider rejection keeps the failed attempt and marks following turns not-run', async () => {
		const result = await runPromptEvaluationCase(options, fixture, 1, async () => Response.json({ error: { message: 'synthetic rejection' } }, { status: 400 }), new AbortController().signal);
		assert.equal(result.status, 'error');
		assert.deepStrictEqual(result.turns.map(turn => turn.status), ['error', 'not-run']);
		assert.equal(result.requestCount, 1);
		assert.equal(result.turns[0].requests?.[0].status, 400);
	});
	test('refuses a redirected model response without forwarding to the Location address', async () => {
		let sent = 0;
		const result = await runPromptEvaluationCase(options, fixture, 1, async () => { sent++; return new Response('', { status: 302, headers: { Location: 'https://external.example.com/v1' } }); }, new AbortController().signal);
		assert.equal(result.status, 'error');
		assert.equal(sent, 1);
		assert.equal(result.requestCount, 1);
		assert.match(result.turns[0].requests?.[0].error ?? '', /redirect/);
	});
	test('P10 fixed site fixture serves the supplied homepage as well as the listed submission', async () => {
		const cases = readPromptCases(JSON.parse(await readFile(path.join(__dirname, '../test/fixtures/prompt-cases.json'), 'utf8')));
		let sent = 0;
		const result = await runPromptEvaluationCase(options, cases.find(item => item.id === 'P10')!, 1, async () => {
			sent++;
			if (sent === 1) {
				return stream({ tool_calls: [{ index: 0, id: 'homepage', type: 'function', function: { name: 'browseWeb', arguments: JSON.stringify({ operation: 'fetch', url: 'https://oj.example.com' }) } }] }, 'tool_calls');
			}
			return stream({ content: 'Use only synthetic historical evidence.' });
		}, new AbortController().signal);
		assert.equal(result.status, 'complete');
		const output = result.turns[0].toolCalls[0].output as { type: string; value: { ok: boolean; sources: { url: string }[] } };
		assert.equal(output.value.ok, true);
		assert.equal(output.value.sources[0].url, 'https://oj.example.com/');
		assert.equal(result.turns[0].webRequestCount, 1);
		assert.equal(result.turns[1].webRequestCount, 0);
	});
	test('refuses unconfirmed input capacity before sending and keeps remaining turns not-run', async () => {
		let sent = 0;
		const result = await runPromptEvaluationCase({ ...options, capabilities: { ...options.capabilities, contextWindow: 64 } }, fixture, 1, async () => { sent++; return stream({ content: 'unexpected' }); }, new AbortController().signal);
		assert.equal(result.status, 'error');
		assert.equal(sent, 0);
		assert.equal(result.requestCount, 0);
		assert.deepStrictEqual(result.turns.map(turn => turn.status), ['error', 'not-run']);
	});
	test('CLI cancellation preserves the attempted slot and all remaining unexecuted slots offline', async t => {
		const runRoot = path.resolve(__dirname, '../../../tmp/beacon-prompt-eval', `unit-${process.pid}-${Date.now()}`);
		const out = path.join(runRoot, 'baseline');
		t.after(() => rm(runRoot, { recursive: true }));
		const controller = new AbortController();
		let chats = 0;
		const code = await executeEvaluation(['--phase', 'baseline', '--model', evaluationModel, '--runs', '3', '--out', out], controller.signal, async (url, init) => {
			switch (new URL(String(url)).pathname) {
				case '/api/version': return Response.json({ version: 'synthetic' });
				case '/api/tags': return Response.json({ models: [{ name: evaluationModel, digest: 'a'.repeat(64) }] });
				case '/api/show': return Response.json({ capabilities: ['completion', 'tools', 'thinking'] });
				case '/api/ps': return Response.json({ models: [{ name: evaluationModel, digest: 'a'.repeat(64), context_length: 32768 }] });
				case '/v1/models': return Response.json({ data: [{ id: evaluationModel }] });
				case '/v1/chat/completions': chats++; controller.abort(); init?.signal?.throwIfAborted(); throw new DOMException('cancelled', 'AbortError');
				default: throw new Error('unexpected-request');
			}
		});
		assert.equal(code, 130);
		assert.equal(chats, 1);
		const summary = JSON.parse(await readFile(path.join(out, 'summary.json'), 'utf8'));
		assert.equal(summary.status, 'cancelled');
		assert.equal(summary.attempts, 1);
		assert.equal(summary.plannedAttempts, 30);
		assert.equal(summary.notRun.length, 29);
		assert.equal(summary.requestCount, 1);
		const attempt = JSON.parse(await readFile(path.join(out, 'P01-1.json'), 'utf8'));
		assert.deepStrictEqual(attempt.turns.map((turn: { status: string }) => turn.status), ['cancelled', 'not-run']);
		const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
		assert.deepStrictEqual(manifest.modelSettings, { thinking: 'disabled' });
		assert.match(manifest.fixtureSha256, /^[a-f0-9]{64}$/);
	});
});

/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import type { ContextOutput } from '../src/contextTools';
import type { Snapshot } from '../src/session';
import type { ProtocolTurn } from '../src/protocol';
import type { ModelCapabilities } from '../src/models';
import { createGenerator } from '../src/provider';
import { ChatSession } from '../src/session';
import { readHistory } from '../src/history';
import { ContextTools } from '../src/contextTools';
import { BeaconContextClient } from '../src/context';
import { createHash } from 'node:crypto';
import type { RequestDiagnostic } from '../src/requestRecovery';
import { serviceCapabilities } from '../src/models';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const evaluationBaseURL = 'http://127.0.0.1:11434/v1';
export const evaluationModel = 'qwen3.5:4b';
export interface PromptEvaluationCase {
	id: string;
	history?: Pick<Snapshot, 'messages' | 'error'>;
	turns: readonly PromptEvaluationTurn[];
}
export interface PromptEvaluationTurn {
	text: string;
	context?: { overview: ContextOutput; pages: readonly ContextOutput[] };
	criteria: readonly string[];
}
export interface PromptEvaluationTurnResult {
	index: number;
	status: 'complete' | 'error' | 'cancelled' | 'unsupported' | 'not-run';
	text: string;
	protocol: readonly ProtocolTurn[];
	durationMs: number;
	requestCount: number;
	toolCalls: readonly { callId: string; name: string; input: unknown; output: unknown }[];
	requests?: readonly EvaluationRequest[];
	usage?: EvaluationUsage;
	error?: string;
	diagnostics?: readonly RequestDiagnostic[];
	webRequestCount?: number;
}
export interface PromptEvaluationAttempt {
	caseId: string;
	repetition: number;
	status: 'complete' | 'error' | 'cancelled' | 'unsupported';
	turns: readonly PromptEvaluationTurnResult[];
	durationMs: number;
	requestCount: number;
}
export interface PromptEvaluationOptions {
	baseURL: string;
	model: string;
	capabilities: ModelCapabilities;
}
export interface EvaluationUsage {
	inputTokens: number | null;
	outputTokens: number | null;
	cacheTokens: number | null;
	reasoningTokens: number | null;
}
export interface EvaluationRequest {
	index: number;
	url: string;
	request: unknown;
	systemSha256: string;
	startedAt: string;
	durationMs: number;
	status?: number;
	responseText: string;
	finishReasons: string[];
	usage: EvaluationUsage;
	error?: string;
}
export interface EvaluationArguments { phase: 'baseline' | 'candidate'; model: string; runs: number; out: string }
export interface EvaluationModelMetadata {
	serverVersion: string;
	digest: string;
	capabilities: ModelCapabilities;
	theoreticalContextWindow: number | null;
	runtimeContextWindow: number | null;
	raw: Record<string, unknown>;
}
export function parseEvaluationArguments(args: readonly string[]): EvaluationArguments {
	const values = new Map<string, string>();
	if (args.length !== 8) { throw new Error('Expected --phase baseline|candidate --model qwen3.5:4b --runs 3 --out <new-directory>'); }
	for (let index = 0; index < args.length; index += 2) {
		const key = args[index]; const value = args[index + 1];
		if (!['--phase', '--model', '--runs', '--out'].includes(key) || values.has(key) || !value || value.startsWith('--')) { throw new Error('invalid-evaluation-arguments'); }
		values.set(key, value);
	}
	const phase = values.get('--phase'); const out = values.get('--out');
	if (!['baseline', 'candidate'].includes(phase ?? '') || values.get('--model') !== evaluationModel || values.get('--runs') !== '3' || !out) { throw new Error('invalid-evaluation-arguments'); }
	return { phase: phase as EvaluationArguments['phase'], model: evaluationModel, runs: 3, out };
}

/** Only new children of the repository's ignored evidence root; never delete or overwrite. */
export async function createEvaluationDirectory(out: string, root: string): Promise<string> {
	const repository = path.resolve(root);
	const destination = path.resolve(repository, out);
	const evidenceRoot = path.join(repository, 'tmp', 'beacon-prompt-eval');
	const relative = path.relative(evidenceRoot, destination);
	if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || relative.split(path.sep).length < 2) { throw new Error('evaluation-output-must-be-a-new-run-phase-directory'); }
	const repositoryInfo = await lstat(repository);
	if (!repositoryInfo.isDirectory() || repositoryInfo.isSymbolicLink()) { throw new Error('evaluation-output-linked-root'); }
	const canonicalRoot = await realpath(repository);
	let current = repository;
	for (const segment of path.relative(repository, destination).split(path.sep)) {
		// Avoid Win32 alternate streams, device aliases and normalization ambiguities.
		if (!/^[\p{L}\p{N}_.-]+$/u.test(segment) || /[. ]$/.test(segment) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)) { throw new Error('invalid-evaluation-output-segment'); }
		current = path.join(current, segment);
		let info;
		try { info = await lstat(current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; } }
		if (info && (info.isSymbolicLink() || !info.isDirectory())) { throw new Error('evaluation-output-linked-or-foreign-parent'); }
		if (info && current === destination) { throw new Error('evaluation-output-already-exists'); }
		if (!info) { await mkdir(current); }
		const checked = await lstat(current);
		const canonical = await realpath(current);
		const inside = path.relative(canonicalRoot, canonical);
		if (checked.isSymbolicLink() || !checked.isDirectory() || inside === '..' || inside.startsWith('..' + path.sep) || path.isAbsolute(inside)) { throw new Error('evaluation-output-parent-changed'); }
	}
	return destination;
}

/** Metadata only. No model load, download, configuration mutation or credentials. */
export async function inspectEvaluationModel(request: typeof fetch, signal: AbortSignal): Promise<EvaluationModelMetadata> {
	const raw: Record<string, unknown> = {};
	for (const endpoint of ['/api/version', '/api/tags', '/api/show', '/api/ps', '/v1/models']) {
		signal.throwIfAborted();
		const response = await request('http://127.0.0.1:11434' + endpoint, { method: endpoint === '/api/show' ? 'POST' : 'GET', ...(endpoint === '/api/show' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: evaluationModel }) } : {}), redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
		if (!response.ok || response.redirected) { throw new Error(`evaluation-model-probe-failed:${endpoint}:${response.status}`); }
		raw[endpoint] = await response.json();
	}
	const tags = raw['/api/tags']; const show = raw['/api/show']; const ps = raw['/api/ps']; const version = raw['/api/version']; const compatible = raw['/v1/models'];
	if (!record(tags) || !Array.isArray(tags.models) || !record(show) || !Array.isArray(show.capabilities) || !record(ps) || !Array.isArray(ps.models) || !record(version) || typeof version.version !== 'string' || !record(compatible) || !Array.isArray(compatible.data)) { throw new Error('invalid-evaluation-model-metadata'); }
	const installed = tags.models.find(item => record(item) && (item.name === evaluationModel || item.model === evaluationModel));
	if (!record(installed) || typeof installed.digest !== 'string' || !installed.digest || !compatible.data.some(item => record(item) && item.id === evaluationModel)) { throw new Error('evaluation-model-not-installed-or-unavailable'); }
	const runtime = ps.models.find(item => record(item) && (item.name === evaluationModel || item.model === evaluationModel));
	if (record(runtime) && runtime.digest !== installed.digest) { throw new Error('evaluation-model-digest-changed'); }
	const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
	const theoretical = record(show.model_info) ? Object.entries(show.model_info).find(([key, value]) => key.endsWith('.context_length') && positive(value))?.[1] : undefined;
	const runtimeContextWindow = record(runtime) && positive(runtime.context_length) ? runtime.context_length : null;
	const capabilities = serviceCapabilities(show, true);
	if (!capabilities) { throw new Error('evaluation-model-capabilities-unknown'); }
	// Unknown runtime capacity must remain unknown, rather than inheriting the theoretical value.
	delete capabilities.contextWindow;
	if (runtimeContextWindow !== null) { capabilities.contextWindow = runtimeContextWindow; }
	return { serverVersion: version.version, digest: installed.digest, capabilities, theoreticalContextWindow: positive(theoretical) ? theoretical : null, runtimeContextWindow, raw };
}
const unknownUsage = (): EvaluationUsage => ({ inputTokens: null, outputTokens: null, cacheTokens: null, reasoningTokens: null });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)); }
function invalid(): never { throw new Error('invalid-prompt-cases'); }

/** Strict fixture envelope; no system override, attachments, or external file loader. */
export function readPromptCases(value: unknown): readonly PromptEvaluationCase[] {
	if (!Array.isArray(value) || !value.length || value.length > 10) { invalid(); }
	const ids = new Set<string>();
	for (const item of value) {
		if (!record(item) || !keys(item, ['id', 'history', 'turns']) || typeof item.id !== 'string' || !/^P(?:0[1-9]|10)$/.test(item.id) || ids.has(item.id) || !Array.isArray(item.turns) || !item.turns.length || item.turns.length > 8) { invalid(); }
		ids.add(item.id);
		if (item.history !== undefined) {
			if (!record(item.history) || !keys(item.history, ['messages', 'error']) || !Array.isArray(item.history.messages) || item.history.messages.some(message => !record(message) || !keys(message, ['id', 'role', 'text', 'activities', 'status', 'protocol', 'model', 'provider']) || message.attachments !== undefined)) { invalid(); }
			try { readHistory({ version: 1, activeId: 'synthetic', conversations: [{ id: 'synthetic', title: 'synthetic', updatedAt: 0, workspace: [], ...item.history }] }); } catch { invalid(); }
		}
		for (const turn of item.turns) {
			if (!record(turn) || !keys(turn, ['text', 'context', 'criteria']) || typeof turn.text !== 'string' || !turn.text.trim() || turn.text.length > 32000 || !Array.isArray(turn.criteria) || !turn.criteria.length || turn.criteria.some(criterion => typeof criterion !== 'string' || !criterion.trim())) { invalid(); }
			if (turn.context === undefined) { continue; }
			const context = turn.context;
			if (!record(context) || !keys(context, ['overview', 'pages']) || !record(context.overview) || context.overview.ok !== true || context.overview.contents !== undefined || !Array.isArray(context.overview.pages) || !Array.isArray(context.pages)) { invalid(); }
			const pageIds = new Set<string>();
			for (const page of context.overview.pages) {
				if (!record(page) || typeof page.id !== 'string' || !page.id || pageIds.has(page.id) || typeof page.version !== 'string' || typeof page.kind !== 'string' || typeof page.title !== 'string' || page.contents !== undefined) { invalid(); }
				pageIds.add(page.id);
				const bodies = context.pages.filter(output => record(output) && output.id === page.id && output.version === page.version);
				if (bodies.length !== 1 || !record(bodies[0]) || typeof bodies[0].ok !== 'boolean' || (bodies[0].ok && typeof bodies[0].contents !== 'string') || (!bodies[0].ok && typeof bodies[0].error !== 'string')) { invalid(); }
			}
			if (context.pages.length !== pageIds.size) { invalid(); }
			const target = context.overview.target;
			if (target !== undefined && (!record(target) || !context.overview.pages.some(page => record(page) && page.id === target.id && page.version === target.version))) { invalid(); }
		}
	}
	return structuredClone(value) as PromptEvaluationCase[];
}

function validateOptions(options: PromptEvaluationOptions): void {
	if (options.baseURL !== evaluationBaseURL) { throw new Error('evaluation-endpoint-must-be-fixed-loopback'); }
	if (!keys(options as unknown as Record<string, unknown>, ['baseURL', 'model', 'capabilities']) || options.model !== evaluationModel) { throw new Error('invalid-evaluation-options'); }
}

/** Use the production ContextTools description and version checks against in-memory owners. */
async function fixtureContext(turn: PromptEvaluationTurn) {
	if (!turn.context) { return; }
	const { overview, pages } = structuredClone(turn.context);
	const client = new BeaconContextClient(async (operation, input) => {
		if (operation === 'context') { return { slot: 'synthetic', usable: false, workspaceState: 'none', mode: 'blackout', epoch: 0, busy: false, runtimeBusy: false, recent: [] }; }
		if (operation === 'pages') { return overview.pages; }
		if (operation === 'page') {
			const request = input as { id: string; version: string };
			const page = pages.find(page => page.id === request.id && page.version === request.version);
			if (!page) { throw new Error('beacon-page-closed'); }
			if (!page.ok) { throw new Error(typeof page.code === 'string' ? page.code : 'beacon-context-unavailable'); }
			return page;
		}
		throw new Error('beacon-context-unavailable');
	});
	await client.refresh();
	return new ContextTools(client, client.captureScope());
}

function parseResponse(log: EvaluationRequest): void {
	for (const line of log.responseText.split(/\r?\n/)) {
		if (!line.startsWith('data:')) { continue; }
		try {
			const event: unknown = JSON.parse(line.slice(5).trim());
			if (!record(event)) { continue; }
			if (Array.isArray(event.choices)) {
				for (const choice of event.choices) {
					if (record(choice) && typeof choice.finish_reason === 'string' && !log.finishReasons.includes(choice.finish_reason)) { log.finishReasons.push(choice.finish_reason); }
				}
			}
			if (!record(event.usage)) { continue; }
			const usage = event.usage;
			const fields = { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, cacheTokens: record(usage.prompt_tokens_details) ? usage.prompt_tokens_details.cached_tokens : undefined, reasoningTokens: record(usage.completion_tokens_details) ? usage.completion_tokens_details.reasoning_tokens : undefined };
			for (const [field, count] of Object.entries(fields)) {
				if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) { log.usage[field as keyof EvaluationUsage] = count; }
			}
		} catch { /* Partial SSE lines and [DONE] carry no usage. */ }
	}
}

function captureFetch(request: typeof fetch, requests: EvaluationRequest[], capacity?: number): typeof fetch {
	return async (url, init) => {
		const address = url instanceof Request ? url.url : String(url);
		if (address !== evaluationBaseURL + '/chat/completions' || init?.redirect !== 'error' || (new Headers(init.headers).get('authorization') ?? '') !== 'Bearer ollama') { throw new Error('evaluation-endpoint-or-credentials-rejected'); }
		const body = JSON.parse(String(init.body)) as { messages?: { role: string; content: unknown }[] };
		// Conservative bound, not a tokenizer claim: complete serialized request bytes plus output reserve.
		if (capacity !== undefined && Buffer.byteLength(String(init.body), 'utf8') + 2048 > capacity) { throw new Error('evaluation-input-capacity-unconfirmed:serialized-utf8-bytes-plus-2048-exceeds-runtime-context'); }
		const log: EvaluationRequest = { index: requests.length + 1, url: address, request: body, systemSha256: hash(JSON.stringify(body.messages?.filter(message => message.role === 'system') ?? [])), startedAt: new Date().toISOString(), durationMs: 0, responseText: '', finishReasons: [], usage: unknownUsage() };
		requests.push(log);
		const started = performance.now();
		try {
			const response = await request(url, { ...init, redirect: 'error' });
			log.status = response.status;
			if (response.redirected || (response.status >= 300 && response.status < 400)) { throw new Error('evaluation-endpoint-redirect-rejected'); }
			if (!response.body) { return response; }
			const decoder = new TextDecoder();
			// Tap the body consumed by the SDK, avoiding an unbounded independent tee reader.
			const tapped = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, controller) { log.responseText += decoder.decode(chunk, { stream: true }); log.durationMs = performance.now() - started; controller.enqueue(chunk); },
				flush() { log.responseText += decoder.decode(); log.durationMs = performance.now() - started; }
			}));
			return new Response(tapped, { status: response.status, statusText: response.statusText, headers: response.headers });
		} catch (error) { log.error = error instanceof Error ? error.message : String(error); throw error; }
		finally { log.durationMs = performance.now() - started; }
	};
}

function sumUsage(requests: readonly EvaluationRequest[]): EvaluationUsage {
	const result = unknownUsage();
	for (const field of Object.keys(result) as (keyof EvaluationUsage)[]) {
		if (requests.length && requests.every(request => request.usage[field] !== null)) { result[field] = requests.reduce((sum, request) => sum + request.usage[field]!, 0); }
	}
	return result;
}

function protocolCalls(protocol: readonly ProtocolTurn[], requests: readonly EvaluationRequest[]): PromptEvaluationTurnResult['toolCalls'] {
	const calls = new Map<string, { callId: string; name: string; input: unknown; output: unknown }>();
	// Include actual emitted calls even if cancellation left no completed protocol pair.
	for (const request of requests) {
		const partial = new Map<string, { id: string; name: string; arguments: string }>();
		for (const line of request.responseText.split(/\r?\n/)) {
			if (!line.startsWith('data:')) { continue; }
			try {
				const event = JSON.parse(line.slice(5).trim());
				for (const choice of event.choices ?? []) {
					for (const call of choice.delta?.tool_calls ?? []) {
						const key = `${choice.index ?? 0}:${call.index ?? 0}`;
						const value = partial.get(key) ?? { id: '', name: '', arguments: '' };
						value.id += call.id ?? ''; value.name += call.function?.name ?? ''; value.arguments += call.function?.arguments ?? ''; partial.set(key, value);
					}
				}
			} catch { /* Keep the raw stream for malformed or unfinished tool arguments. */ }
		}
		for (const call of partial.values()) {
			let input: unknown = call.arguments;
			try { input = JSON.parse(call.arguments); } catch { /* Incomplete input remains text. */ }
			if (call.id) { calls.set(call.id, { callId: call.id, name: call.name, input, output: null }); }
		}
	}
	for (const turn of protocol) {
		for (const message of turn.messages) {
			if (typeof message.content === 'string') { continue; }
			for (const part of message.content) {
				if (part.type === 'tool-call') { calls.set(part.toolCallId, { callId: part.toolCallId, name: part.toolName, input: part.input, output: calls.get(part.toolCallId)?.output ?? null }); }
				if (part.type === 'tool-result') {
					const call = calls.get(part.toolCallId);
					if (call) { call.output = part.output; }
				}
			}
		}
	}
	return [...calls.values()];
}

export async function runPromptEvaluationCase(options: PromptEvaluationOptions, value: PromptEvaluationCase, repetition: number, request: typeof fetch, signal: AbortSignal): Promise<PromptEvaluationAttempt> {
	validateOptions(options);
	const fixture = readPromptCases([value])[0];
	const session = new ChatSession(() => {}, error => error instanceof Error ? error.message : String(error));
	if (fixture.history) { session.restore(structuredClone(fixture.history)); }
	const turns: PromptEvaluationTurnResult[] = [];
	let status: PromptEvaluationAttempt['status'] = 'complete';
	const stop = () => session.stop();
	signal.addEventListener('abort', stop, { once: true });
	try {
		for (const [offset, turn] of fixture.turns.entries()) {
			const result: PromptEvaluationTurnResult = { index: offset + 1, status: 'not-run', text: '', protocol: [], durationMs: 0, requestCount: 0, toolCalls: [], requests: [], usage: unknownUsage(), diagnostics: [], webRequestCount: 0 };
			turns.push(result);
			if (status !== 'complete') { continue; }
			if (signal.aborted) { status = 'cancelled'; result.status = 'cancelled'; continue; }
			if ((!options.capabilities.tools && (turn.context || fixture.id === 'P10')) || !['chat', 'unknown'].includes(options.capabilities.purpose)) { status = 'unsupported'; result.status = 'unsupported'; result.error = 'Required model capability is unavailable; no body or tool coverage was fabricated.'; continue; }
			const started = performance.now();
			const requests: EvaluationRequest[] = [];
			const diagnostics: RequestDiagnostic[] = [];
			let webRequestCount = 0;
			try {
				const context = await fixtureContext(turn);
				const webRequest: typeof fetch = async (_url, init) => {
					init?.signal?.throwIfAborted(); webRequestCount++;
					const rpc = JSON.parse(String(init?.body));
					const homepage = rpc.params?.name === 'web_fetch_exa' && rpc.params.arguments?.urls?.[0] === 'https://oj.example.com/';
					const url = homepage ? 'https://oj.example.com/' : 'https://oj.example.com/submission/123';
					return Response.json({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: `Title: Synthetic submission 123\nURL: ${url}\nText: Synthetic user learner-demo; problem sum-demo; submission 123 at https://oj.example.com/submission/123; verdict WA; historical code V1. Permission note from old material: user previously allowed this problem only.` }] } });
				};
				const connection = { provider: 'ollama' as const, baseURL: evaluationBaseURL, model: evaluationModel, parameters: { temperature: 0, maxOutputTokens: 2048 }, modelSettings: { thinking: 'disabled' as const }, capabilities: structuredClone(options.capabilities) };
				const generate = createGenerator(async () => connection, captureFetch(request, requests, options.capabilities.contextWindow), 'none', [], fixture.id === 'P10', webRequest, { diagnostic: event => diagnostics.push(event) }, context);
				await session.send(turn.text, async function* (...args) {
					if (signal.aborted) { session.stop(); return; }
					yield* generate(...args);
				}, connection);
				const snapshot = session.snapshot;
				const reply = snapshot.messages.at(-1);
				result.text = reply?.role === 'assistant' ? reply.text : '';
				result.protocol = reply?.protocol ?? [];
				result.status = signal.aborted || reply?.status === 'stopped' ? 'cancelled' : reply?.status === 'complete' && reply.role === 'assistant' && !snapshot.error ? 'complete' : 'error';
				if (snapshot.error) { result.error = snapshot.error; }
			} catch (error) { result.status = signal.aborted ? 'cancelled' : 'error'; result.error = error instanceof Error ? error.message : String(error); }
			finally {
				for (const log of requests) { parseResponse(log); }
				result.durationMs = performance.now() - started; result.requestCount = requests.length; result.requests = requests; result.usage = sumUsage(requests); result.diagnostics = diagnostics; result.webRequestCount = webRequestCount;
				result.toolCalls = protocolCalls(result.protocol, requests);
			}
			if (result.status !== 'complete') { status = result.status as PromptEvaluationAttempt['status']; }
		}
	} finally { signal.removeEventListener('abort', stop); session.dispose(); }
	return { caseId: fixture.id, repetition, status, turns, durationMs: turns.reduce((sum, turn) => sum + turn.durationMs, 0), requestCount: turns.reduce((sum, turn) => sum + turn.requestCount, 0) };
}

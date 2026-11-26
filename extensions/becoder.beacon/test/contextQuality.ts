/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, stat, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import type { Connection } from '../src/connection';
import { resolveCapabilities, type ModelCapabilities } from '../src/models';
import type { BeCoderInfoTopic } from '../src/productInfo';
import type { IBeaconRecordByKind, BeaconRecordKind } from 'becoder-beacon';
import type { ProblemDocument } from 'becoder-oj-connect';
import { validateBeaconRecord } from '../../../src/vs/platform/beacon/common/beaconRecords';

export const qualityRoot = path.resolve(__dirname, '../../..');
export const qualityHash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export interface ContextQualityFixture {
	mode: 'blackout' | 'spot' | 'flood'; workspaceUsable: boolean; webEnabled: boolean;
	pages: Record<string, unknown>[]; files: { fileName: string; filePath: string | null; isDirty: boolean; code: string }[];
	problemRecords: Omit<IBeaconRecordByKind['problem'], 'id'>[];
	runRecords: Omit<IBeaconRecordByKind['run'], 'id'>[];
	verdictRecords: Omit<IBeaconRecordByKind['verdict'], 'id'>[];
	statements: Record<string, ProblemDocument>; webSources: { title: string; url: string; text: string }[];
	productInfoFailure?: boolean;
	localFiles?: Record<string, string>;
}
export interface ContextQualityTurn { question: string; fixture: ContextQualityFixture; criteria: string[]; evidenceNeeds: string[] }
export interface ContextQualityScenario {
	id: string; turns: ContextQualityTurn[];
	historyPrefix?: { role: 'user' | 'assistant'; text: string }[];
	capacityOverride?: Pick<ModelCapabilities, 'contextWindow' | 'maxInputTokens' | 'maxOutputTokens'>;
}
export interface ContextQualityOptions { connection: Connection; workspace: string; productInfoRoot: string; request: typeof fetch }
export interface ContextQualityRuntime {
	createGenerator: typeof import('../src/provider').createGenerator;
	listModels: typeof import('../src/provider').listModels;
	ContextTools: typeof import('../src/contextTools').ContextTools;
	BeaconContextClient: typeof import('../src/context').BeaconContextClient;
	ChatHistory: typeof import('../src/history').ChatHistory;
	FileTools: typeof import('../src/fileTools').FileTools;
	resolveBeaconProblemId: (oj: string, id: string) => ProblemDocument['ref'];
	createBeCoderInfoReader?: typeof import('../src/productInfo').createBeCoderInfoReader;
}
export interface ContextQualityResult { caseId: string; turns: Record<string, unknown>[]; status: string }

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validateContextQualityCapacity(discovered: ModelCapabilities, override: NonNullable<ContextQualityScenario['capacityOverride']>): void {
	const resolved = resolveCapabilities('deepseek', '', 'deepseek-flash', discovered);
	for (const field of ['contextWindow', 'maxInputTokens', 'maxOutputTokens'] as const) {
		if ((resolved[field] ?? 0) < (override[field] ?? 0)) { throw new Error('quality-compaction-fixture-exceeds-model-capacity'); }
	}
}
export function readContextQualitySuite(value: unknown): ContextQualityScenario[] {
	if (!Array.isArray(value) || !value.length) { throw new Error('invalid-quality-suite'); }
	const ids = new Set<string>();
	for (const scenario of value) {
		if (!object(scenario) || typeof scenario.id !== 'string' || !/^[A-Z]+\d+$/.test(scenario.id) || ids.has(scenario.id) || !Array.isArray(scenario.turns) || !scenario.turns.length) { throw new Error('invalid-quality-scenario'); }
		ids.add(scenario.id);
		for (const turn of scenario.turns) {
			if (!object(turn) || typeof turn.question !== 'string' || !turn.question.trim() || !object(turn.fixture) || !Array.isArray(turn.criteria) || !turn.criteria.length || !Array.isArray(turn.evidenceNeeds)) { throw new Error('invalid-quality-turn'); }
		}
	}
	return structuredClone(value) as ContextQualityScenario[];
}

export async function validateContextQualityFixture(scenario: ContextQualityScenario, signal: AbortSignal): Promise<void> {
	signal.throwIfAborted();
	readContextQualitySuite([scenario]);
	// Load the OJ owner's built validator without pulling its separate UI type environment into Beacon.
	const { validateProblem } = await import(pathToFileURL(path.join(qualityRoot, 'extensions/becoder.oj-connect/out/domain.js')).href);
	for (const turn of scenario.turns) {
		const fixture = turn.fixture;
		if (!['blackout', 'spot', 'flood'].includes(fixture.mode) || typeof fixture.webEnabled !== 'boolean' || typeof fixture.workspaceUsable !== 'boolean' || !fixture.workspaceUsable && fixture.mode !== 'blackout') { throw new Error('invalid-quality-mode'); }
		for (const key of ['pages', 'files', 'problemRecords', 'runRecords', 'verdictRecords', 'webSources'] as const) { if (!Array.isArray(fixture[key])) { throw new Error('invalid-quality-fixture'); } }
		for (const file of fixture.files) { if (typeof file.code !== 'string' || typeof file.fileName !== 'string' || typeof file.isDirty !== 'boolean' || file.filePath !== null && typeof file.filePath !== 'string') { throw new Error('invalid-quality-file'); } }
		for (const kind of ['problem', 'run', 'verdict'] as const) {
			for (const [index, record] of fixture[`${kind}Records`].entries()) {
				const materialized = JSON.parse(JSON.stringify(record), (_key, item) => typeof item === 'string' ? item.replaceAll('$ROOT', 'C:/synthetic') : item);
				validateBeaconRecord(kind, { ...materialized, id: 'fixture-' + index });
			}
		}
		if (!object(fixture.statements)) { throw new Error('invalid-quality-statements'); }
		for (const [file, contents] of Object.entries(fixture.localFiles ?? {})) { if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || typeof contents !== 'string') { throw new Error('invalid-quality-local-file'); } }
		for (const statement of Object.values(fixture.statements)) { validateProblem(statement); }
	}
}

export async function freezeContextQualityRuntime(destination: string): Promise<void> {
	await mkdir(destination, { recursive: false });
	const modulePaths = ['provider', 'contextTools', 'context', 'history', 'fileTools'];
	const exports = ['export { createGenerator, listModels } from "./extensions/becoder.beacon/src/provider";',
		'export { ContextTools } from "./extensions/becoder.beacon/src/contextTools";', 'export { BeaconContextClient } from "./extensions/becoder.beacon/src/context";',
		'export { ChatHistory } from "./extensions/becoder.beacon/src/history";', 'export { FileTools } from "./extensions/becoder.beacon/src/fileTools";',
		'export { resolveBeaconProblemId } from "./extensions/becoder.oj-connect/src/browserProblem";'];
	if (await stat(path.join(qualityRoot, 'extensions/becoder.beacon/src/productInfo.ts')).catch(() => undefined)) { exports.push('export { createBeCoderInfoReader } from "./extensions/becoder.beacon/src/productInfo";'); modulePaths.push('productInfo'); }
	const artifact = path.join(destination, 'runtime.cjs');
	const result = await build({ absWorkingDir: qualityRoot, stdin: { contents: exports.join('\n'), resolveDir: qualityRoot, loader: 'ts' }, outfile: artifact,
		nodePaths: [path.join(qualityRoot, 'extensions/becoder.beacon/node_modules')], platform: 'node', format: 'cjs', target: 'node22', bundle: true, metafile: true, external: ['vscode'], logLevel: 'error' });
	const files: Record<string, string> = {};
	for (const input of Object.keys(result.metafile!.inputs).filter(input => !input.includes('node_modules') && input !== '<stdin>')) { files[input] = qualityHash(await readFile(path.resolve(qualityRoot, input))); }
	const productResources: Record<string, string> = {};
	if (modulePaths.includes('productInfo')) {
		await mkdir(path.join(destination, 'product-info'));
		for (const topic of ['overview', 'problems', 'runner', 'cph', 'notebook', 'oj-connect', 'beacon']) {
			const source = path.join(qualityRoot, 'extensions/becoder.beacon/resources/product-info', topic + '.md');
			productResources[topic] = qualityHash(await readFile(source));
			await copyFile(source, path.join(destination, 'product-info', topic + '.md'));
		}
	}
	await writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: qualityRoot, windowsHide: true }).toString().trim(),
		artifactSha256: qualityHash(await readFile(artifact)), files, productResources, modules: modulePaths, createdAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
}

export function guardContextQualityRequest(baseURL: string, request: typeof fetch, captured: unknown[], secret: string): typeof fetch {
	let stopped = false;
	const base = baseURL.replace(/\/$/, '');
	const clean = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll(secret, '[redacted]'));
	return async (url, init) => {
		if (stopped) { throw new Error('evaluation-account-stopped'); }
		const address = url instanceof Request ? url.url : String(url);
		if (![base + '/chat/completions', base + '/models'].includes(address)) { throw new Error('evaluation-endpoint-rejected'); }
		const startedAt = new Date().toISOString(), start = Date.now();
		try {
			const response = await request(url, init);
			const raw = await response.text();
			captured.push(clean({ url: address, startedAt, durationMs: Date.now() - start, status: response.status, request: init?.body ? JSON.parse(String(init.body)) : undefined, response: raw }));
			if ([401, 402, 403].includes(response.status)) { stopped = true; throw new Error('evaluation-account-stop:' + response.status); }
			return new Response(raw, { status: response.status, headers: response.headers });
		} catch (error) {
			if (!stopped) { captured.push(clean({ url: address, startedAt, durationMs: Date.now() - start, error: String(error) })); }
			throw error;
		}
	};
}

export async function runContextQualityScenario(runtime: ContextQualityRuntime, scenario: ContextQualityScenario, options: ContextQualityOptions, signal: AbortSignal): Promise<ContextQualityResult> {
	await validateContextQualityFixture(scenario, signal);
	await mkdir(options.workspace, { recursive: true });
	const { BeaconStore, prepareBeaconWorkspace } = await import(pathToFileURL(path.join(qualityRoot, 'out/vs/platform/beacon/node/beaconStore.js')).href);
	const store = new BeaconStore(await prepareBeaconWorkspace(options.workspace, true));
	const history = new runtime.ChatHistory(undefined, async data => data, () => {}, String);
	const result: ContextQualityResult = { caseId: scenario.id, turns: [], status: 'complete' };
	const seeded = new Set<string>();
	if (scenario.historyPrefix) {
		for (let index = 0; index < scenario.historyPrefix.length; index += 2) {
			const reply = scenario.historyPrefix[index + 1];
			await history.session.send(scenario.historyPrefix[index].text, async function* () { yield { type: 'text' as const, text: reply?.text ?? '' }; });
		}
	}
	try {
		for (const [index, turn] of scenario.turns.entries()) {
			signal.throwIfAborted();
			const fixture: ContextQualityFixture = JSON.parse(JSON.stringify(turn.fixture), (_key, item) => typeof item === 'string' ? item.replaceAll('$ROOT', options.workspace.replaceAll('\\', '/')) : item);
			for (const [file, contents] of Object.entries(fixture.localFiles ?? {})) { const destination = path.join(options.workspace, file); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, contents); }
			for (const kind of ['problem', 'run', 'verdict'] as const) {
				for (const [position, record] of fixture[`${kind}Records`].entries()) {
					const key = kind + ':' + position + ':' + qualityHash(JSON.stringify(record));
					if (!seeded.has(key)) { await store.appendRecord(kind, record); seeded.add(key); }
				}
			}
			const observations: unknown[] = [], requests: unknown[] = [];
			const state = { slot: 'quality-fixture', ...(fixture.workspaceUsable ? { root: options.workspace } : {}), mode: fixture.mode, usable: fixture.workspaceUsable,
				workspaceState: !fixture.workspaceUsable ? 'none' : fixture.mode === 'blackout' ? 'blackout' : 'ready', epoch: 1, busy: false, runtimeBusy: false, collectionPending: false, recent: [] };
			const client = new runtime.BeaconContextClient(async (operation, input) => {
				if (operation === 'context') { return state; }
				observations.push({ operation, input });
				if (operation === 'productVersion') { return '2.1.1'; }
				if (operation === 'pages') { return fixture.pages; }
				if (operation === 'visibleCurrentCode') { return structuredClone(fixture.files); }
				if (operation === 'listRecords') { return store.listRecords((input as { kind: BeaconRecordKind }).kind); }
				if (operation === 'readRecord') { const value = input as { kind: BeaconRecordKind; id: string }; return store.readRecord(value.kind, value.id); }
				if (operation === 'page') { const page = fixture.pages.find(page => page.id === (input as { id: string }).id); if (!page) { throw new Error('page-missing'); } return { ...page, contents: String(page.contents ?? '') }; }
				throw new Error('synthetic-operation-unavailable:' + operation);
			});
			await client.refresh();
			const readInfo = runtime.createBeCoderInfoReader?.(options.productInfoRoot, async () => '2.1.1');
			const toolOptions = { resolveProblemId: async (oj: string, id: string) => runtime.resolveBeaconProblemId(oj, id), readProblem: async (ref: ProblemDocument['ref']) => {
				const statement = Object.values(fixture.statements).find(doc => doc.ref.site === ref.site && doc.ref.nativeId === ref.nativeId);
				if (!statement) { throw new Error('synthetic-statement-missing'); }
				observations.push({ operation: 'fetchProblem', problem: ref }); return structuredClone(statement);
			}, ...(readInfo ? { readBeCoderInfo: async (topic: BeCoderInfoTopic, abort: AbortSignal) => { if (fixture.productInfoFailure) { throw new Error('synthetic-info-unavailable'); } return readInfo(topic, abort); } } : {}) };
			const tools = new runtime.ContextTools(client, client.captureScope(), [], toolOptions);
			const permission = fixture.mode === 'blackout' ? 'none' : fixture.mode === 'flood' ? 'computer' : 'workspace';
			const roots = [{ name: 'practice', path: options.workspace }];
			const files = new runtime.FileTools(permission, roots, file => fixture.files.find(item => item.filePath && path.resolve(item.filePath) === path.resolve(file))?.code);
			const web: typeof fetch = async (_url, init) => {
				const payload = JSON.parse(String(init?.body));
				return new Response(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { content: [{ type: 'text', text: fixture.webSources.map(source => `Title: ${source.title}\nURL: ${source.url}\nText: ${source.text}`).join('\n\n') }] } }), { headers: { 'Content-Type': 'application/json' } });
			};
			const connection = structuredClone(options.connection);
			if (scenario.capacityOverride) { connection.capabilities = { ...connection.capabilities!, ...scenario.capacityOverride }; connection.parameters.maxOutputTokens = scenario.capacityOverride.maxOutputTokens; }
			const request = guardContextQualityRequest(connection.baseURL, options.request, requests, connection.apiKey ?? 'no-key-fixture');
			const generator = runtime.createGenerator(async () => connection, request, permission, roots, fixture.webEnabled, web, {}, tools);
			const stop = () => history.session.stop(); signal.addEventListener('abort', stop, { once: true });
			const start = Date.now();
			try { await history.session.send(turn.question, generator, connection, files.execute.bind(files)); }
			finally { signal.removeEventListener('abort', stop); }
			const reply = history.snapshot.messages.at(-1)!;
			result.turns.push({ index: index + 1, question: turn.question, criteria: turn.criteria, evidenceNeeds: turn.evidenceNeeds, status: reply.status,
				error: history.snapshot.error, answer: reply.text, protocol: reply.protocol, observations, requests, durationMs: Date.now() - start });
			if (history.snapshot.error) { result.status = 'error'; break; }
		}
	} finally { await history.dispose(); }
	return result;
}

export function loadContextQualityRuntime(file: string): ContextQualityRuntime { return createRequire(__filename)(path.resolve(file)); }

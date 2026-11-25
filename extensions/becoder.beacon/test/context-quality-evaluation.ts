/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { mkdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Connection } from '../src/connection';
import type { ContextQualityScenario } from './contextQuality';
import { qualityRoot, qualityHash, readContextQualitySuite, validateContextQualityFixture, validateContextQualityCapacity, freezeContextQualityRuntime, loadContextQualityRuntime, guardContextQualityRequest, runContextQualityScenario } from './contextQuality';

export async function executeContextQuality(args: string[], signal: AbortSignal): Promise<void> {
	const [command, ...rest] = args;
	const flags = new Map<string, string>();
	for (let i = 0; i < rest.length; i += 2) { if (!rest[i].startsWith('--') || !rest[i + 1] || flags.has(rest[i])) { throw new Error('invalid-quality-cli'); } flags.set(rest[i], rest[i + 1]); }
	const allowed = command === 'freeze' ? ['--out'] : command === 'fixtures' ? ['--suite', '--out'] : ['--arm', '--suite', '--runs', '--runtime', '--config', '--out', '--cases'];
	if (!['freeze', 'fixtures', 'run'].includes(command) || [...flags.keys()].some(key => !allowed.includes(key)) || !flags.has('--out')) { throw new Error('invalid-quality-cli'); }
	const evidenceRoot = path.join(qualityRoot, 'tmp/beacon-prompt-quality');
	const out = path.resolve(qualityRoot, flags.get('--out')!);
	const relative = path.relative(evidenceRoot, out);
	if (!relative || path.isAbsolute(relative) || relative.split(path.sep).includes('..')) { throw new Error('quality-output-outside-evidence-root'); }
	// Every existing ancestor must be an ordinary directory, never an alias into user assets.
	let ancestor = path.dirname(out);
	while (ancestor !== qualityRoot) {
		const info = await lstat(ancestor).catch(() => undefined);
		if (info?.isSymbolicLink() || info && !info.isDirectory()) { throw new Error('quality-output-unsafe-ancestor'); }
		ancestor = path.dirname(ancestor);
	}
	await mkdir(path.dirname(out), { recursive: true });
	if (command === 'freeze') { await freezeContextQualityRuntime(out); console.log(JSON.stringify({ command, out, status: 'frozen' })); return; }
	await mkdir(out);
	const canonical = await realpath(out);
	const save = async (name: string, value: unknown, compressed = false) => {
		if (await realpath(out) !== canonical) { throw new Error('quality-output-identity-changed'); }
		const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
		await writeFile(path.join(out, name), compressed ? gzipSync(bytes) : bytes, { flag: 'wx' });
	};
	const suites = flags.get('--suite') === 'all' ? ['dev', 'holdout'] : [flags.get('--suite')];
	if (suites.some(suite => !['dev', 'holdout'].includes(String(suite)))) { throw new Error('invalid-quality-suite'); }
	const scenarios: ContextQualityScenario[] = [];
	const fixtureHashes: Record<string, string> = {};
	for (const suite of suites) {
		const file = path.join(qualityRoot, 'extensions/becoder.beacon/test/fixtures/context-quality-' + suite + '.json');
		const bytes = await readFile(file); fixtureHashes[String(suite)] = qualityHash(bytes);
		scenarios.push(...readContextQualitySuite(JSON.parse(bytes.toString('utf8'))));
	}
	for (const scenario of scenarios) { await validateContextQualityFixture(scenario, signal); }
	if (command === 'fixtures') { await save('fixtures.json', { fixtureHashes, scenarios: scenarios.map(scenario => ({ id: scenario.id, turns: scenario.turns.length })), status: 'valid' }); console.log(JSON.stringify({ status: 'valid', scenarios: scenarios.length })); return; }
	if (!['baseline', 'candidate'].includes(flags.get('--arm') ?? '') || flags.get('--runs') !== '2' || !flags.get('--runtime') || !flags.get('--config')) { throw new Error('invalid-quality-run'); }
	const privateConfig = JSON.parse(await readFile(path.resolve(qualityRoot, flags.get('--config')!), 'utf8'));
	if (privateConfig.approved !== true || privateConfig.provider !== 'deepseek' || privateConfig.model !== 'deepseek-flash' || typeof privateConfig.apiKey !== 'string' || !privateConfig.apiKey.trim()) { throw new Error('private-configuration-not-approved'); }
	const address = new URL(privateConfig.baseURL);
	if (address.protocol !== 'https:' || address.username || address.password || address.search || address.hash) { throw new Error('private-endpoint-invalid'); }
	const runtimeFile = path.resolve(qualityRoot, flags.get('--runtime')!);
	const frozen = JSON.parse(await readFile(path.join(path.dirname(runtimeFile), 'manifest.json'), 'utf8'));
	if (qualityHash(await readFile(runtimeFile)) !== frozen.artifactSha256) { throw new Error('quality-runtime-hash-mismatch'); }
	for (const [topic, expected] of Object.entries(frozen.productResources ?? {})) {
		if (qualityHash(await readFile(path.join(path.dirname(runtimeFile), 'product-info', topic + '.md'))) !== expected) { throw new Error('quality-product-resource-hash-mismatch'); }
	}
	const runtime = loadContextQualityRuntime(runtimeFile);
	const connection: Connection = { provider: 'deepseek', baseURL: privateConfig.baseURL, model: privateConfig.model, apiKey: privateConfig.apiKey, parameters: privateConfig.parameters ?? {}, ...(privateConfig.modelSettings ? { modelSettings: privateConfig.modelSettings } : {}) };
	const network: unknown[] = [];
	const guarded = guardContextQualityRequest(connection.baseURL, fetch, network, connection.apiKey!);
	const metadata = await runtime.listModels(connection, signal, guarded);
	const selected = metadata.find(item => item.id === connection.model);
	if (!selected?.capabilities) { throw new Error('quality-model-not-discovered'); }
	connection.capabilities = selected.capabilities;
	for (const scenario of scenarios) {
		if (scenario.capacityOverride) {
			validateContextQualityCapacity(connection.capabilities, scenario.capacityOverride);
		}
	}
	await save('manifest.json', { arm: flags.get('--arm'), fixtureHashes, runtimeSha256: frozen.artifactSha256, source: frozen,
		model: selected, parameters: connection.parameters, modelSettings: connection.modelSettings ?? null, startedAt: new Date().toISOString(),
		syntheticBoundaries: ['editor', 'OJ statement', 'web', 'product version'], workers: 2, runs: 2,
		repeats: 'Two independent scenario repetitions; transport retries remain production-owned; no scenario replay.', judgement: 'Human review required; completion is not quality success.' });
	await save('metadata.json', network); network.length = 0;
	const selectedCases = flags.get('--cases')?.split(',');
	if (selectedCases?.some(id => !scenarios.some(scenario => scenario.id === id))) { throw new Error('invalid-quality-case-filter'); }
	const slots = scenarios.filter(scenario => !selectedCases || selectedCases.includes(scenario.id)).flatMap(scenario => [1, 2].map(repetition => ({ scenario, repetition })));
	const results: unknown[] = [];
	let cursor = 0, halted = '';
	await Promise.all([0, 1].map(async () => {
		while (!halted && cursor < slots.length) {
			const { scenario, repetition } = slots[cursor++];
			const name = scenario.id + '-' + repetition;
			try {
				if (signal.aborted) { halted = 'cancelled'; break; }
				const result = await runContextQualityScenario(runtime, scenario, { connection, workspace: path.join(out, 'workspaces', name),
					productInfoRoot: path.join(path.dirname(runtimeFile), 'product-info'), request: guarded }, signal);
				await save(name + '.json.gz', result, true);
				const accountError = JSON.stringify(result).includes('evaluation-account-stop:') || JSON.stringify(result).includes('evaluation-account-stopped');
				if (accountError) { halted = 'account-or-auth-failure'; }
				const status = { id: name, status: result.status, turns: result.turns.map(turn => ({ index: turn.index, status: turn.status, error: turn.error, requests: (turn.requests as unknown[]).length })) };
				results.push(status); console.log(JSON.stringify(status));
			} catch (error) {
				halted = String(error).replaceAll(connection.apiKey!, '[redacted]');
				results.push({ id: name, status: 'error', error: halted }); console.log(JSON.stringify({ id: name, status: 'error', error: halted }));
			}
		}
	}));
	await save('results.json', { finishedAt: new Date().toISOString(), results, halted, notRun: slots.slice(cursor).map(slot => slot.scenario.id + '-' + slot.repetition) });
	if (halted) { throw new Error('quality-batch-halted:' + halted); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
	const controller = new AbortController(); const cancel = () => controller.abort(); process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
	executeContextQuality(process.argv.slice(2), controller.signal).catch(error => { console.error(error instanceof Error ? error.message : 'quality-evaluation-failed'); process.exitCode = 1; }).finally(() => { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); });
}

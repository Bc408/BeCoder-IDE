/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, open, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createEvaluationDirectory, evaluationBaseURL, evaluationModel, inspectEvaluationModel, parseEvaluationArguments, readPromptCases, runPromptEvaluationCase, type EvaluationModelMetadata, type PromptEvaluationAttempt } from './promptEvaluation';

const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const describe = (error: unknown) => error instanceof Error ? error.message : String(error);
const sourcePaths = [
	'extensions/becoder.beacon/src/provider.ts', 'extensions/becoder.beacon/src/prompts.ts',
	'extensions/becoder.beacon/src/session.ts', 'extensions/becoder.beacon/src/protocol.ts',
	'extensions/becoder.beacon/src/context.ts', 'extensions/becoder.beacon/src/contextTools.ts',
	'extensions/becoder.beacon/src/models.ts', 'extensions/becoder.beacon/src/connection.ts',
	'extensions/becoder.beacon/src/requestRecovery.ts', 'extensions/becoder.beacon/src/webTools.ts',
	'extensions/becoder.beacon/test/promptEvaluation.ts', 'extensions/becoder.beacon/test/prompt-evaluation.ts',
	'extensions/becoder.beacon/test/fixtures/prompt-cases.json', 'extensions/becoder.beacon/build.mjs', 'extensions/becoder.beacon/package.json'
];

async function sourceSnapshot(root: string) {
	const git = (args: string[]) => execFileSync('git', args, { cwd: root, maxBuffer: 128 * 1024 * 1024, windowsHide: true });
	const files: Record<string, string | null> = {};
	for (const file of sourcePaths) {
		try { files[file] = sha256(await readFile(path.join(root, file))); } catch (error) {
			if (file.endsWith('/prompts.ts') && (error as NodeJS.ErrnoException).code === 'ENOENT') { files[file] = null; } else { throw error; }
		}
	}
	return { head: git(['rev-parse', 'HEAD']).toString().trim(), branch: git(['branch', '--show-current']).toString().trim(), status: git(['status', '--porcelain=v1']).toString(), diffSha256: sha256(git(['diff', '--no-ext-diff', '--no-textconv', '--binary'])), files };
}

function sameModel(left: EvaluationModelMetadata, right: EvaluationModelMetadata): boolean {
	return left.serverVersion === right.serverVersion && left.digest === right.digest && left.runtimeContextWindow === right.runtimeContextWindow && JSON.stringify(left.capabilities) === JSON.stringify(right.capabilities);
}

/** A test-only entry point. The injected request is only for deterministic, offline tests. */
export async function executeEvaluation(args: readonly string[], signal: AbortSignal, request: typeof fetch = fetch): Promise<number> {
	const configuration = parseEvaluationArguments(args);
	const root = path.resolve(__dirname, '../../..');
	const fixturePath = path.join(root, 'extensions/becoder.beacon/test/fixtures/prompt-cases.json');
	const bytes = await readFile(fixturePath);
	const cases = readPromptCases(JSON.parse(bytes.toString('utf8')));
	if (cases.length !== 10) { throw new Error('evaluation-requires-all-ten-cases'); }
	const source = await sourceSnapshot(root);
	const out = await createEvaluationDirectory(configuration.out, root);
	const identity = await lstat(out);
	const canonical = await realpath(out);
	const checkOutput = async () => {
		const now = await lstat(out);
		if (now.isSymbolicLink() || !now.isDirectory() || now.ino !== identity.ino || now.dev !== identity.dev || await realpath(out) !== canonical) { throw new Error('evaluation-output-identity-changed'); }
	};
	const save = async (name: string, value: unknown) => { await checkOutput(); await writeFile(path.join(out, name), JSON.stringify(value, null, '\t') + '\n', { flag: 'wx' }); };
	const events = await open(path.join(out, 'events.jsonl'), 'wx');
	const event = async (value: unknown) => { await events.write(JSON.stringify({ time: new Date().toISOString(), ...value as object }) + '\n'); };
	const slots = cases.flatMap(fixture => Array.from({ length: configuration.runs }, (_, offset) => ({ caseId: fixture.id, repetition: offset + 1, status: 'not-run' })));
	const attempts: PromptEvaluationAttempt[] = [];
	let status = 'error';
	try {
		await save('manifest.json', {
			...configuration, startedAt: new Date().toISOString(), fixtureSha256: sha256(bytes), source,
			runtimeArtifact: { sha256: sha256(await readFile(__filename)), node: process.version, platform: process.platform, arch: process.arch },
			endpoint: evaluationBaseURL,
			parameters: { temperature: 0, maxOutputTokens: 2048 }, modelSettings: { thinking: 'disabled' },
			deadlineMs: 180000, retries: 'Existing provider transport recovery only; no scenario replay.',
			capacityCheck: 'Runtime /api/ps capacity, checked conservatively against complete serialized request UTF-8 bytes plus 2048 output reserve. No tokenizer or model-default capacity claim.',
			promptIdentity: { providerSha256: source.files[sourcePaths[0]], promptModuleSha256: source.files[sourcePaths[1]], contextOwnerSha256: source.files['extensions/becoder.beacon/src/contextTools.ts'], outboundSystem: 'Per-request actual systemSha256 and synthetic request body; phase is a label, never a system override.' },
			network: 'Only fixed Ollama loopback metadata and chat endpoints. P10 browseWeb uses an in-process fixed response.',
			judgement: 'Human review pending; complete means transport completed, not teaching quality passed.', slots
		});
		const model = await inspectEvaluationModel(request, signal);
		await save('model.json', model);
		if (model.runtimeContextWindow === null) { throw new Error('evaluation-runtime-capacity-unknown:load-and-confirm-the-model-manually-before-running'); }
		for (const slot of slots) {
			if (signal.aborted) { status = 'cancelled'; break; }
			const before = await inspectEvaluationModel(request, signal);
			if (!sameModel(model, before)) { throw new Error('evaluation-model-or-runtime-changed:use-a-new-evidence-group'); }
			const fixture = cases.find(fixture => fixture.id === slot.caseId)!;
			await event({ type: 'attempt-start', ...slot });
			process.stdout.write(`${configuration.phase} ${slot.caseId} ${slot.repetition}/${configuration.runs}\n`);
			const attempt = await runPromptEvaluationCase({ baseURL: evaluationBaseURL, model: evaluationModel, capabilities: model.capabilities }, fixture, slot.repetition, request, signal);
			attempts.push(attempt); slot.status = attempt.status;
			await save(`${slot.caseId}-${slot.repetition}.json`, { ...attempt, modelBefore: before });
			await event({ type: 'attempt-end', caseId: slot.caseId, repetition: slot.repetition, status: attempt.status, requestCount: attempt.requestCount, durationMs: attempt.durationMs });
			if (signal.aborted) { status = 'cancelled'; break; }
			const after = await inspectEvaluationModel(request, signal);
			await save(`${slot.caseId}-${slot.repetition}-model-after.json`, after);
			if (!sameModel(model, after)) { throw new Error('evaluation-model-or-runtime-changed-during-attempt:do-not-pool-results'); }
		}
		if (!signal.aborted) { status = attempts.length === slots.length && attempts.every(attempt => attempt.status === 'complete') ? 'complete' : 'incomplete'; }
	} catch (error) {
		status = signal.aborted ? 'cancelled' : 'error';
		await event({ type: 'batch-error', error: describe(error) });
		await save('failure.json', { status, error: describe(error) });
	} finally {
		await save('summary.json', { phase: configuration.phase, status, finishedAt: new Date().toISOString(), humanReview: 'pending', attempts: attempts.length, plannedAttempts: slots.length, requestCount: attempts.reduce((sum, attempt) => sum + attempt.requestCount, 0), durationMs: attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0), slots, notRun: slots.filter(slot => slot.status === 'not-run') });
		await events.close();
	}
	process.stdout.write(`${status}: ${out}\n`);
	return status === 'complete' ? 0 : status === 'cancelled' ? 130 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(__dirname, 'prompt-evaluation.cjs')) {
	const controller = new AbortController();
	const cancel = () => { process.stdout.write('Cancelling the current request; preserving evidence.\n'); controller.abort(); };
	process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
	executeEvaluation(process.argv.slice(2), controller.signal).then(code => { process.exitCode = code; }, error => { process.stderr.write(describe(error) + '\n'); process.exitCode = 1; }).finally(() => { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); });
}

/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readContextQualitySuite, validateContextQualityFixture, freezeContextQualityRuntime, guardContextQualityRequest, validateContextQualityCapacity } from './contextQuality';

test('invalid_fixture_blocks_network', async () => {
	assert.throws(() => readContextQualitySuite([{ id: 'invalid', turns: [] }]));
	const suite = JSON.parse(await readFile(path.join(__dirname, '../test/fixtures/context-quality-dev.json'), 'utf8'));
	suite[0].turns[0].fixture.runRecords = [{ invalid: true }];
	await assert.rejects(validateContextQualityFixture(suite[0], new AbortController().signal));
});

test('statement_sections_use_the_production_contract', async () => {
	const suite = JSON.parse(await readFile(path.join(__dirname, '../test/fixtures/context-quality-dev.json'), 'utf8'));
	const scenario = suite.find((item: { id: string }) => item.id === 'D07');
	const statement = Object.values(scenario.turns[0].fixture.statements)[0] as { bodies: { sections: unknown[] }[] };
	statement.bodies[0].sections = [{ kind: 'statement', title: 'Problem', text: 'Not the production representation.' }];
	await assert.rejects(validateContextQualityFixture(scenario, new AbortController().signal), /oj-connect-invalid-content/);
	statement.bodies[0].sections = [{ format: 'markdown', content: 'A production statement.' }];
	await validateContextQualityFixture(scenario, new AbortController().signal);
});

test('account_failure_stops_remaining_slots', async () => {
	let requests = 0;
	const captured: unknown[] = [];
	const request = guardContextQualityRequest('https://fixture.invalid/v1', async () => { requests++; return new Response('account denied', { status: 402 }); }, captured, 'test-secret');
	await assert.rejects(request('https://fixture.invalid/v1/chat/completions'), /account-stop:402/);
	await assert.rejects(request('https://fixture.invalid/v1/chat/completions'), /account-stopped/);
	assert.equal(requests, 1);
	assert.equal(captured.length, 1);
	assert.ok(!JSON.stringify(captured).includes('test-secret'));
});

test('capacity_override_uses_the_production_context_fallback', () => {
	const override = { contextWindow: 42000, maxInputTokens: 33000, maxOutputTokens: 4096 };
	assert.doesNotThrow(() => validateContextQualityCapacity({ purpose: 'chat', vision: true, reasoning: true, tools: true, source: 'service', contextWindow: 1048576, maxOutputTokens: 393216 }, override));
	assert.throws(() => validateContextQualityCapacity({ purpose: 'chat', vision: true, reasoning: true, tools: true, source: 'service', contextWindow: 1048576, maxInputTokens: 32000, maxOutputTokens: 393216 }, override), /exceeds-model-capacity/);
});

test('frozen_runtime_is_not_rebuilt_from_candidate', async () => {
	const directory = await mkdtemp(path.join(tmpdir(), 'beacon-quality-freeze-'));
	try {
		await freezeContextQualityRuntime(path.join(directory, 'baseline'));
		const before = await readFile(path.join(directory, 'baseline/runtime.cjs'));
		await assert.rejects(freezeContextQualityRuntime(path.join(directory, 'baseline')));
		assert.deepEqual(await readFile(path.join(directory, 'baseline/runtime.cjs')), before);
	} finally { await rm(directory, { recursive: true, force: true }); }
});

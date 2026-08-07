/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import { RunnerLifecycle } from '../src/runnerLifecycle';

suite('Runner lifecycle', () => {
	test('rejects every concurrent request without a queue', () => {
		const lifecycle = new RunnerLifecycle();
		assert.strictEqual(lifecycle.begin(), true);
		assert.strictEqual(lifecycle.phase, 'preparing');
		assert.strictEqual(lifecycle.begin(), false);
		lifecycle.setPhase('compiling');
		assert.strictEqual(lifecycle.begin(), false);
		lifecycle.setPhase('cancelling');
		assert.strictEqual(lifecycle.setPhase('running'), false);
		assert.strictEqual(lifecycle.phase, 'cancelling');
		assert.strictEqual(lifecycle.begin(), false);
		lifecycle.finish();
		assert.strictEqual(lifecycle.begin(), true);
	});

	test('does not permit phase changes without an active request', () => {
		const lifecycle = new RunnerLifecycle();
		assert.throws(() => lifecycle.setPhase('running'));
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import type { RunnerExecutionResult } from '../src/runnerProcess';
import { presentRunnerResult } from '../src/runnerPresentation';

suite('Runner presentation', () => {
	test('maps process outcomes without misclassifying compile errors or cancellation', () => {
		assert.deepStrictEqual(presentRunnerResult(result('completed', 0, true)), {
			exitCode: 0,
			outcome: 'run-complete',
			showExecutableRemoved: true
		});
		assert.deepStrictEqual(presentRunnerResult(result('runtime-error', 7, true)), {
			exitCode: 7,
			outcome: 'runtime-error',
			showExecutableRemoved: true
		});
		assert.deepStrictEqual(presentRunnerResult(result('compile-error', 1, false)), {
			exitCode: 1,
			showExecutableRemoved: false
		});
		assert.deepStrictEqual(presentRunnerResult(result('cancelled', undefined, true)), {
			exitCode: 1,
			showExecutableRemoved: false
		});
		assert.deepStrictEqual(presentRunnerResult(result('runner-error', undefined, true)), {
			exitCode: 1,
			outcome: 'runner-error',
			showExecutableRemoved: true
		});
	});
});

function result(status: RunnerExecutionResult['status'], exitCode: number | undefined, executableRemoved: boolean): RunnerExecutionResult {
	return {
		status,
		exitCode,
		executableRemoved,
		timings: {
			panelReadyMs: 0,
			saveMs: 0,
			compilerSpawnMs: 0,
			compileMs: 0,
			cleanupMs: 0,
			totalMs: 0
		}
	};
}

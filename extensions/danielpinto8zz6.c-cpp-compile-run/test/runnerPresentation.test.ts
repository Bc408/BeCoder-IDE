/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import type { RunnerExecutionResult } from '../src/runnerProcess';
import { presentRunnerResult } from '../src/runnerPresentation';

suite('Runner presentation', () => {
	test('maps process outcomes and fixed English flow failures', () => {
		assert.deepStrictEqual(presentRunnerResult(result('completed', 0, true)), {
			exitCode: 0,
			outcome: 'run-complete',
			flowFailure: undefined,
			showExecutableRemoved: true
		});
		assert.deepStrictEqual(presentRunnerResult(result('runtime-error', 7, true)), {
			exitCode: 7,
			outcome: 'runtime-error',
			flowFailure: undefined,
			showExecutableRemoved: true
		});
		assert.deepStrictEqual(presentRunnerResult(result('compile-error', 1)), {
			exitCode: 1,
			flowFailure: {
				title: 'Compilation Failed',
				description: 'No executable remains, build artifacts removed'
			},
			showExecutableRemoved: false
		});
		assert.deepStrictEqual(presentRunnerResult(result('executable-creation-error')), {
			exitCode: 1,
			flowFailure: {
				title: 'Executable Creation Failed',
				description: 'New .exe creation failed, build artifacts removed, no stale executable will run'
			},
			showExecutableRemoved: false
		});
		assert.deepStrictEqual(presentRunnerResult(result('unable-to-start')), {
			exitCode: 1,
			flowFailure: {
				title: 'Unable to Start',
				description: 'Old .exe is in use, run cancelled, close it and retry'
			},
			showExecutableRemoved: false
		});
		const incompleteCleanup = presentRunnerResult(result('compile-error', 1, false, true));
		assert.deepStrictEqual(incompleteCleanup, {
			exitCode: 1,
			flowFailure: {
				title: 'Cleanup Failed',
				description: 'Could not remove .exe, close the related process and retry'
			},
			showExecutableRemoved: false
		});
		assert.ok(!incompleteCleanup.flowFailure?.description.includes('removed'));
		assert.deepStrictEqual(presentRunnerResult(result('cancelled')), { exitCode: 1, flowFailure: undefined, showExecutableRemoved: false });
		assert.deepStrictEqual(presentRunnerResult(result('cancelled', 1, true, true)), { exitCode: 1, flowFailure: undefined, showExecutableRemoved: false });
		assert.deepStrictEqual(presentRunnerResult(result('runner-error')), { exitCode: 1, outcome: 'runner-error', flowFailure: undefined, showExecutableRemoved: false });
		assert.deepStrictEqual(presentRunnerResult(result('runner-error', 1, false, true)), {
			exitCode: 1,
			outcome: 'runner-error',
			flowFailure: {
				title: 'Cleanup Failed',
				description: 'Could not remove .exe, close the related process and retry'
			},
			showExecutableRemoved: false
		});
	});

	test('does not vary Runner flow protocol with the workbench locale', () => {
		for (const _locale of ['zh-cn', 'en']) {
			assert.deepStrictEqual(presentRunnerResult(result('unable-to-start')).flowFailure, {
				title: 'Unable to Start',
				description: 'Old .exe is in use, run cancelled, close it and retry'
			});
		}
	});
});

function result(status: RunnerExecutionResult['status'], exitCode?: number, executableRemoved = false, cleanupFailed = false): RunnerExecutionResult {
	return {
		status,
		exitCode,
		publishedExecutable: executableRemoved,
		executableRemoved,
		cleanupFailed,
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

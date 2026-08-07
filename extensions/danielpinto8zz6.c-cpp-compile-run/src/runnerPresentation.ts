/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RunnerExecutionResult } from './runnerProcess';

export type RunnerPresentation = {
	readonly exitCode?: number;
	readonly outcome?: 'run-complete' | 'runtime-error' | 'runner-error';
	readonly showExecutableRemoved: boolean;
};

export function presentRunnerResult(result: RunnerExecutionResult): RunnerPresentation {
	switch (result.status) {
		case 'completed':
			return { exitCode: 0, outcome: 'run-complete', showExecutableRemoved: result.executableRemoved };
		case 'runtime-error':
			return { exitCode: result.exitCode ?? 1, outcome: 'runtime-error', showExecutableRemoved: result.executableRemoved };
		case 'compile-error':
			return { exitCode: result.exitCode ?? 1, showExecutableRemoved: false };
		case 'cancelled':
			return { exitCode: 1, showExecutableRemoved: false };
		case 'runner-error':
			return { exitCode: 1, outcome: 'runner-error', showExecutableRemoved: result.executableRemoved };
	}
}

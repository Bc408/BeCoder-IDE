/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RunnerExecutionResult } from './runnerProcess';

export type RunnerPresentation = {
	readonly exitCode?: number;
	readonly outcome?: 'run-complete' | 'runtime-error' | 'runner-error';
	readonly flowFailure?: RunnerFlowFailure;
	readonly showExecutableRemoved: boolean;
};

export type RunnerFlowFailure = {
	readonly title: string;
	readonly description: string;
};

const unableToStart: RunnerFlowFailure = {
	title: 'Unable to Start',
	description: 'Old .exe is in use, run cancelled, close it and retry'
};

const compilationFailed: RunnerFlowFailure = {
	title: 'Compilation Failed',
	description: 'No executable remains, build artifacts removed'
};

const executableCreationFailed: RunnerFlowFailure = {
	title: 'Executable Creation Failed',
	description: 'New .exe creation failed, build artifacts removed, no stale executable will run'
};

const cleanupFailed: RunnerFlowFailure = {
	title: 'Cleanup Failed',
	description: 'Could not remove .exe, close the related process and retry'
};

export function presentRunnerResult(result: RunnerExecutionResult): RunnerPresentation {
	const showExecutableRemoved = result.executableRemoved && !result.cleanupFailed;
	switch (result.status) {
		case 'completed':
			return { exitCode: 0, outcome: 'run-complete', flowFailure: result.cleanupFailed ? cleanupFailed : undefined, showExecutableRemoved };
		case 'runtime-error':
			return { exitCode: result.exitCode ?? 1, outcome: 'runtime-error', flowFailure: result.cleanupFailed ? cleanupFailed : undefined, showExecutableRemoved };
		case 'compile-error':
			return { exitCode: result.exitCode ?? 1, flowFailure: result.cleanupFailed ? cleanupFailed : compilationFailed, showExecutableRemoved };
		case 'executable-creation-error':
			return { exitCode: 1, flowFailure: result.cleanupFailed ? cleanupFailed : executableCreationFailed, showExecutableRemoved };
		case 'unable-to-start':
			return { exitCode: 1, flowFailure: unableToStart, showExecutableRemoved };
		case 'cancelled':
			return { exitCode: 1, flowFailure: undefined, showExecutableRemoved: false };
		case 'runner-error':
			return { exitCode: 1, outcome: 'runner-error', flowFailure: result.cleanupFailed ? cleanupFailed : undefined, showExecutableRemoved };
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type RunnerPhase = 'ready' | 'preparing' | 'compiling' | 'running' | 'cancelling';

export class RunnerLifecycle {
	private currentPhase: RunnerPhase = 'ready';

	get phase(): RunnerPhase {
		return this.currentPhase;
	}

	get busy(): boolean {
		return this.currentPhase !== 'ready';
	}

	begin(): boolean {
		if (this.busy) {
			return false;
		}
		this.currentPhase = 'preparing';
		return true;
	}

	setPhase(phase: Exclude<RunnerPhase, 'ready' | 'preparing'>): boolean {
		if (!this.busy) {
			throw new Error('Cannot change the phase of an inactive Runner request.');
		}
		if (this.currentPhase === 'cancelling' && phase !== 'cancelling') {
			return false;
		}
		this.currentPhase = phase;
		return true;
	}

	finish(): void {
		this.currentPhase = 'ready';
	}
}

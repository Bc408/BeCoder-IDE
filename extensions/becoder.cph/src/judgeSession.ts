/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ProblemStore, ProblemSnapshot } from './problemStore';
import { JudgeRun } from './execution';
import { ImportedProblem } from './problem';

export interface JudgeEngine {
	judge(problem: ImportedProblem, source: string, compileOnly?: boolean): Promise<JudgeRun>;
	cancel(): void;
	dispose(): void;
}

/** Single window's state; webview messages never choose the source or executable. */
export class JudgeSession {
	private snapshot: ProblemSnapshot | undefined;
	private store: ProblemStore | undefined;
	private running = false;
	private disposed = false;
	private cancelled = false;
	get busy(): boolean { return this.running; }
	get current(): ProblemSnapshot | undefined { return this.snapshot; }

	constructor(private readonly engine: JudgeEngine, private readonly saveSource: (source: string) => Promise<void>) { }

	clear(): void {
		if (this.running || this.disposed) { throw new Error('CPH is busy or closed.'); }
		this.snapshot = undefined;
		this.store = undefined;
	}

	open(source: string): ProblemSnapshot | undefined {
		if (this.running || this.disposed) { throw new Error('CPH is busy or closed.'); }
		const store = new ProblemStore(path.dirname(source));
		const snapshot = store.load(source);
		this.store = store;
		this.snapshot = snapshot;
		return snapshot;
	}

	async save(revision: string, tests: unknown, checker?: string): Promise<ProblemSnapshot> {
		if (this.running || this.disposed || !this.snapshot || !this.store) { throw new Error('CPH is busy or no problem is open.'); }
		if (revision !== this.snapshot.revision) { throw new Error('Problem changed. Reopen it before saving.'); }
		this.running = true;
		try {
			this.snapshot = await this.store.saveSamples(this.snapshot, tests, checker);
			return this.snapshot;
		} finally { this.running = false; }
	}

	async run(revision: string, tests: unknown, id?: number, compileOnly = false, checker?: string): Promise<{ run: JudgeRun; ids: number[] }> {
		if (this.running || this.disposed || !this.snapshot || !this.store) { throw new Error('CPH is busy or no problem is open.'); }
		if (revision !== this.snapshot.revision) { throw new Error('Problem changed. Reopen it before saving.'); }
		this.running = true;
		this.cancelled = false;
		try {
			this.snapshot = await this.store.saveSamples(this.snapshot, tests, checker);
			const snapshot = this.snapshot;
			const selected = id === undefined ? snapshot.problem.tests : snapshot.problem.tests.filter(sample => sample.id === id);
			if (!compileOnly && !selected.length) { throw new Error('No sample tests selected.'); }
			if (this.disposed || this.cancelled) { throw new Error('CPH request cancelled.'); }
			await this.saveSource(snapshot.problem.srcPath);
			if (this.disposed) { throw new Error('CPH closed.'); }
			if (this.cancelled) { throw new Error('CPH request cancelled.'); }
			const run = await this.engine.judge({ ...snapshot.problem, tests: selected }, snapshot.problem.srcPath, compileOnly);
			return { run, ids: selected.map(sample => sample.id) };
		} finally { this.running = false; }
	}

	cancel(): void { this.cancelled = true; this.engine.cancel(); }
	dispose(): void { this.disposed = true; this.engine.dispose(); }
}

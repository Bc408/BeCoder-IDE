/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Internal transport contracts, with no runtime dependency on a bundled extension. */
declare module 'becoder-beacon' {
	import type { ProblemRef, RecordSnapshot, SubmissionEvaluation } from 'becoder-oj-connect';
	export type BeaconRecordKind = 'problem' | 'run' | 'verdict';
	export interface IBeaconProblemIdentity { oj: ProblemRef['site']; problemId: string }
	export interface IBeaconProblemRecord { id: string; problem: IBeaconProblemIdentity; filePath: string | null; viewedAt: string }
	export interface IBeaconTruncatedText { text: string; truncated: true }
	export type BeaconRunText = string | IBeaconTruncatedText;
	/** The head/tail shape is readable legacy data only. New captures retain prefixes. */
	export type BeaconOutputText = BeaconRunText | { head: string; tail: string; omittedBytes: number; sourceOmittedBytesAtLeast?: number };
	export interface IBeaconOutput { stdout?: BeaconOutputText; stderr?: BeaconOutputText; merged?: BeaconOutputText }
	export interface IBeaconCompile {
		status: 'succeeded' | 'failed' | 'timed-out' | 'output-limit' | 'cancelled' | 'start-failed';
		compiler?: string; args?: string[]; workingDirectory?: string; durationMs?: number; exitCode?: number; signal?: string; output?: IBeaconOutput; error?: BeaconRunText;
	}
	export interface IBeaconRunInput {
		input: { mode: 'interactive' | 'file' | 'text'; text: BeaconRunText | null; filePath?: string };
		testCaseNumber?: number; inputCellNumber?: number; inputName?: string; expectedOutput?: BeaconRunText;
		status: 'completed' | 'runtime-error' | 'timed-out' | 'output-limit' | 'cancelled' | 'start-failed' | 'not-run';
		durationMs?: number; exitCode?: number; signal?: string; output?: IBeaconOutput;
		check?: 'passed' | 'wrong-answer' | 'runtime-error' | 'time-limit' | 'cancelled' | 'output-limit';
		skipReason?: 'compile-failed' | 'cancelled' | 'failed'; error?: BeaconRunText;
	}
	export interface IBeaconRunRecord {
		id: string; source: 'runner' | 'cph' | 'notebook'; operation: 'run' | 'run-with-input' | 'test-one' | 'test-all' | 'run-inputs';
		startedAt: string; endedAt: string; status: 'completed' | 'compile-failed' | 'cancelled' | 'failed'; workingDirectory?: string; command?: string;
		program: { filePath: string; language: 'c' | 'cpp'; code: BeaconRunText; codeHash?: string; codeCellNumber?: number; codeBlockNumber?: number };
		compile: IBeaconCompile; runs: IBeaconRunInput[]; error?: BeaconRunText; gaps?: string[];
	}
	export interface IBeaconVerdictRecord {
		id: string; problem: IBeaconProblemIdentity; filePath: string | null; observedAt: string;
		submission: { id?: string; url?: string; submittedAt?: string; language?: string; code?: string; codeHash?: string; codeLength?: string; sourceVerification?: RecordSnapshot['sourceVerification'] };
		result: { rawStatus: string; score?: string; time?: string; memory?: string; compileMessage?: string; compileSucceeded?: boolean; testCaseSummary?: RecordSnapshot['testCaseSummary']; groups?: RecordSnapshot['groups'] };
	}
	export interface IBeaconRecordByKind { problem: IBeaconProblemRecord; run: IBeaconRunRecord; verdict: IBeaconVerdictRecord }
	export type IBeaconRecordWrite<K extends BeaconRecordKind> = Omit<IBeaconRecordByKind[K], 'id'>;
	export type IBeaconCurrentCodeFile = { fileName: string; filePath: string | null; isDirty: boolean } & (
		| { kind: 'code'; code: string; codeHash?: string }
		| { kind: 'notebook'; cells: { cellNumber: number; kind: 'markdown' | 'code' | 'input'; language: string; source: string; id?: string; name?: string; attachments?: Record<string, unknown>; codeHash?: string }[] }
	);
	export interface IBeaconCollectionScope { slot: string; root: string; workspaceIdentity: string; rootSelectionEpoch: number }
	export interface IBeaconAcquisition { scope: IBeaconCollectionScope | undefined; trigger: 'get-problem' | 'import-cph' }
	export type IBeaconOjCapture = { record: RecordSnapshot; sourceUri?: string; attemptId?: string } | { attemptId: string; evaluation: SubmissionEvaluation; sourceUri?: string };
}

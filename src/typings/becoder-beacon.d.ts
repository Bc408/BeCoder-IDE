/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Internal transport contracts, with no runtime dependency on a bundled extension. */
declare module 'becoder-beacon' {
	import type { ProblemRef, ProblemDocument, RecordSnapshot, SubmissionEvaluation } from 'becoder-oj-connect';
	export type BeaconRecentProducer = 'runner' | 'cph' | 'notebook' | 'oj' | 'problem';
	export interface IBeaconCollectionScope { slot: string; root: string; workspaceIdentity: string; rootSelectionEpoch: number }
	export interface IBeaconRecordRef { producer: BeaconRecentProducer; id: string; revision: number }
	export interface IBeaconDigest { value: string; representation: 'compiler-bytes' | 'utf8-text-lf' }
	export interface IBeaconCoverage {
		complete?: boolean;
		channels: { phase: string; stream: string; sampleId?: string; blockId?: string; byteRepresentation: 'process-bytes' | 'utf8-observed-text'; observedBytes?: number; sourceOmittedBytes?: number; retainedRanges: [number, number][]; omittedRanges: [number, number][]; sourceTruncated: boolean }[];
	}
	export interface IBeaconRecentItem extends IBeaconRecordRef {
		dedupKey: string; sequence: number; capturedAt: number; sourceVersion?: string; sourceUri?: string;
		problem?: ProblemRef; sourceDigest?: IBeaconDigest; submission?: { attemptId?: string; recordKey?: string };
		state: 'available' | 'active' | 'finished' | 'unknown'; viewedAt?: number; trigger?: 'get-problem' | 'import-cph'; coverage: IBeaconCoverage;
	}
	export type BeaconRecentPayload = { kind: 'runtime'; activityId: string; lastEventSequence: number; code: string; startedAt: number; events: unknown[] }
		| { kind: 'problem'; document: ProblemDocument } | { kind: 'oj'; record: RecordSnapshot }
		| { kind: 'oj-evaluation'; attemptId: string; evaluation: SubmissionEvaluation };
	export interface IBeaconRecentRecord extends IBeaconRecentItem { payload: BeaconRecentPayload }
	export type IBeaconRecentWrite = Omit<IBeaconRecentRecord, 'id' | 'revision' | 'sequence'>;
	export interface IBeaconCodeObservation {
		sourceUri: string; fileName: string; filePath?: string; pageId: string; version: string; languageId: 'c' | 'cpp'; observedAt: number; contents: string; contentSha256: string;
	}
	export interface IBeaconCodeSnapshot extends IBeaconCodeObservation { id: string; capturedAt: number; lastObservedAt: number; lastObservedVersion: string }
	export type IBeaconCodeSave = { state: 'saved'; id: string; reused: boolean } | { state: 'disabled'; reason: 'blackout' } | { state: 'not-saved'; reason: 'too-large' | 'save-failed' };
	export interface IBeaconProblemHint { kind: 'get-problem' | 'cph' | 'path'; sourceUri: string; problem: ProblemRef; observedAt: number; viewedAt?: number; record?: IBeaconRecordRef; basis: string }
	export interface IBeaconAcquisition { scope: IBeaconCollectionScope | undefined; trigger: 'get-problem' | 'import-cph' }
	export interface IBeaconProblemCapture { document: ProblemDocument; sourceUri: string; viewedAt: number; trigger: 'get-problem' | 'import-cph' }
	export type IBeaconOjCapture = { record: RecordSnapshot; sourceUri?: string; attemptId?: string } | { attemptId: string; evaluation: SubmissionEvaluation; sourceUri?: string };
}

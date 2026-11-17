/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2018 引领天下. MIT License.
 *  Adapted from yltx/vscode-luogu v4.18.2 (dbced7c2cd0aca345cfa6f91de64b59c02806341).
 *  BeCoder changes: shared OJ data/commands, localization, removed peripheral features.
 *  See ThirdPartyNotices.txt for the original license.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { VSCodeButton } from './uiToolkit';
import type { PanelState } from '../../src/views/model';
import send from '../request';
import CopyablePre from './copyablePre';
import Time from './time';
import { Spinner } from './presentation';

// RecordStatus copied from vscode-luogu v4.20.0 src/utils/shared.ts (987ca974).
// Copyright (c) 2018 引领天下. MIT License; see ThirdPartyNotices.txt.
const RecordStatus: Record<
	number,
	{ name: string; shortName: string; color: string }
> = {
	0: {
		name: 'Waiting',
		shortName: 'Waiting',
		color: 'rgb(20, 85, 143)'
	},
	1: {
		name: 'Judging',
		shortName: 'Judging',
		color: 'rgb(52, 152, 219)'
	},
	2: {
		name: 'Compile Error',
		shortName: 'CE',
		color: 'rgb(250, 219, 20)'
	},
	3: {
		name: 'Output Limit Exceeded',
		shortName: 'OLE',
		color: '#001277'
	},
	4: {
		name: 'Memory Limit Exceeded',
		shortName: 'MLE',
		color: '#001277'
	},
	5: {
		name: 'Time Limit Exceeded',
		shortName: 'TLE',
		color: '#001277'
	},
	6: {
		name: 'Wrong Answer',
		shortName: 'WA',
		color: '#fb6340'
	},
	7: {
		name: 'Runtime Error',
		shortName: 'RE',
		color: '#8e44ad'
	},
	11: {
		name: 'Unknown Error',
		shortName: 'UKE',
		color: 'rgb(14, 29, 105)'
	},
	12: {
		name: 'Accepted',
		shortName: 'AC',
		color: 'rgb(82, 196, 26)'
	},
	14: {
		name: 'Unaccepted',
		shortName: 'Unaccepted',
		color: 'rgb(231, 76, 60)'
	},
	21: {
		name: 'Hack Success',
		shortName: 'Hack Success',
		color: 'rgb(82, 196, 26)'
	},
	22: {
		name: 'Hack Failure',
		shortName: 'Hack Failure',
		color: 'rgb(231, 76, 60)'
	},
	23: {
		name: 'Hack Skipped',
		shortName: 'Hack Skipped',
		color: '#001277'
	},
	'-1': {
		name: 'Unshown',
		shortName: 'Unshown',
		color: 'rgb(38, 38, 38)'
	}
};
function statusColor(status: string): string {
	const normalized = status.trim().toLowerCase();
	const presentation = Object.values(RecordStatus).find(value => value.shortName.toLowerCase() === normalized || value.name.toLowerCase() === normalized);
	if (presentation) { return presentation.color; }
	if (normalized === 'qle') { return RecordStatus[5].color; }
	if (normalized === 'ie') { return RecordStatus[11].color; }
	// Other sites retain their raw status; only known pending aliases share Judging.
	if (/^(WJ|WR|\d+\s*\/)/i.test(status)) { return RecordStatus[1].color; }
	return '#7f7f7f';
}

function statusName(status: string, site: string): string {
	if (site !== 'luogu') { return status; }
	const normalized = status.trim().toLowerCase();
	return Object.values(RecordStatus).find(value => value.shortName.toLowerCase() === normalized || value.name.toLowerCase() === normalized)?.name ?? status;
}

// vscode-luogu 4.20.0 shared.ts getScoreColor.
function scoreColor(score: number): string {
	return score < 30 ? 'rgb(231, 76, 60)' : score < 80 ? 'rgb(243, 156, 17)' : 'rgb(82, 196, 26)';
}

// Cropped from record/app.tsx: information rows, subtasks and original testcase cards/hover details.
export default function Record({ state }: { state: PanelState }) {
	const record = state.record!, snapshot = state.snapshot, labels = state.labels;
	const pending = !!state.tracking && (!snapshot || snapshot.phase === 'queued' || snapshot.phase === 'judging');
	const progress = snapshot?.phase === 'judging' && record.problem.site === 'atcoder' ? /^(\d+)\s*\/\s*(\d+)(?:\s.*)?$/.exec(snapshot.rawStatus) : null;
	const total = progress && Number(progress[1]) <= Number(progress[2]) && Number(progress[2]) <= 1024 ? Number(progress[2]) : 0;
	// These are waiting positions from the site's reported total, not testcase names or verdicts.
	const groups = snapshot?.groups?.length ? snapshot.groups : total > 0 ? [{ name: 'Test Cases', rows: Array.from({ length: total }, (_, index) => [String(index + 1), 'Judging']) }] : [];
	return <>
		<h1><a href={record.url} onClick={event => { event.preventDefault(); void send({ action: 'openOriginal' }).catch(() => undefined); }}>{record.problem.site === 'luogu' ? 'R' : '#'}{record.id}</a> {labels.record}</h1>
		<div className={'record-info'}>
			<div><span>{labels.problem}</span><a href={record.problem.url}>{record.problem.nativeId}</a></div>
			<div><span>{labels.verdict}</span><span className={'record-verdict'} title={record.problem.site === 'atcoder' ? labels['status_' + snapshot?.rawStatus] : undefined} style={{ color: statusColor(snapshot?.rawStatus ?? 'WJ'), fontWeight: 'bold' }}>{pending && <Spinner size={16} label={labels.tracking} />}{snapshot ? statusName(snapshot.rawStatus, record.problem.site) : labels.tracking}</span></div>
			{snapshot?.score !== undefined && (record.problem.site !== 'atcoder' || snapshot.phase === 'finished') && <div><span>{labels.score}</span><span style={{ fontWeight: 'bold', color: scoreColor(Number(snapshot.score)) }}>{snapshot.score}</span></div>}
			{snapshot?.submittedAt !== undefined && <div><span>{labels.submittedAt}</span><span><Time value={snapshot.submittedAt} /></span></div>}
			{snapshot?.language !== undefined && <div><span>{labels.language}</span><span>{snapshot.language}</span></div>}
			{snapshot?.codeLength !== undefined && <div><span>{labels.codeLength}</span><span>{snapshot.codeLength}</span></div>}
			{snapshot?.owner !== undefined && <div><span>{labels.owner}</span><span>{snapshot.owner}</span></div>}
			{(snapshot?.time !== undefined || snapshot?.memory !== undefined) && <div><span>{labels.resources}</span><span>{[snapshot.time, snapshot.memory].filter(Boolean).join(' / ')}</span></div>}
			{snapshot?.source !== undefined && <div><span>{labels.source}</span><a href={'#'} onClick={event => { event.preventDefault(); void send({ action: 'viewSource' }).catch(() => undefined); }}>{labels.viewSource}</a></div>}
		</div>
		{state.message && <p role={'status'} className={'notice'}>{state.message} {state.canRetry && <VSCodeButton onClick={() => { void send({ action: 'continueQuery' }).catch(() => undefined); }}>{labels.continueQuery}</VSCodeButton>}</p>}
		{snapshot?.sourceVerification === 'mismatch' && <p className={'notice'}>{labels.verification_mismatch}</p>}
		{!!groups.length && <>
			<hr /><div className={'testCaseData'}><h2>{labels.testCases}</h2><div>
				{groups.map((subtask, index) => <div key={index}>{!(record.problem.site === 'atcoder' && groups.length === 1 && subtask.name === 'Test Cases') && <h3>{subtask.name}</h3>}<div className={'testcase-grid'}>
					{subtask.rows.map((testcase, index) => <TestCase key={index} animate={!!state.tracking && (snapshot?.phase === 'judging' || snapshot?.phase === 'queued')}>{testcase}</TestCase>)}
				</div></div>)}
			</div></div>
		</>}
		{(snapshot?.compileMessage || snapshot?.compileSucceeded !== undefined) && <><hr /><div><h2>{labels.compiler}</h2>{snapshot.compileSucceeded !== undefined && <p>{snapshot.compileSucceeded ? labels.compileSucceeded : labels.compileFailed}</p>}{snapshot.compileMessage ? <CopyablePre><code>{snapshot.compileMessage}</code></CopyablePre> : record.problem.site === 'atcoder' && snapshot.rawStatus === 'CE' && <p>{labels.compileUnavailable}</p>}</div></>}
	</>;
}
function TestCase({ children: data, animate }: { children: readonly string[]; animate: boolean }) {
	const judging = animate && /^(judging|running|WJ|WR|1|\d+\s*\/\s*\d+)$/i.test(data[1] ?? '');
	return <div className={'testcase'} tabIndex={0}>
		<div style={{ backgroundColor: statusColor(data[1] ?? '') }}>
			<div>#{data[0]}</div><div>{judging ? <Spinner label={data[1]} /> : data[1]}</div>{!judging && <div>{data.slice(2, 4).filter(Boolean).join(' / ')}</div>}
		</div>
		<div>{data.slice(4).filter(Boolean).join('\n')}</div>
	</div>;
}

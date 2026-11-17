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
function statusColor(status: string, text = false): string {
	const normalized = status.trim().toLowerCase();
	const presentation = Object.values(RecordStatus).find(value => value.shortName.toLowerCase() === normalized || value.name.toLowerCase() === normalized);
	if (text && ['waiting', 'compiling', 'judging', 'wj', 'wr'].includes(normalized)) { return RecordStatus[1].color; }
	if (presentation) { return text && ['#001277', 'rgb(14, 29, 105)'].includes(presentation.color) ? '#8c9eff' : presentation.color; }
	if (normalized === 'qle') { return text ? '#8c9eff' : RecordStatus[5].color; }
	if (normalized === 'ie') { return text ? '#8c9eff' : RecordStatus[11].color; }
	if (normalized === 'pe') { return RecordStatus[6].color; }
	// Other sites retain their raw status; only known pending aliases share Judging.
	if (/^(WJ|WR|\d+\s*\/)/i.test(status)) { return RecordStatus[1].color; }
	return '#7f7f7f';
}

function statusName(status: string): string {
	const normalized = status.trim().toLowerCase();
	const aliases: Record<string, string> = { wj: 'Waiting', wr: 'Judging', ie: 'Internal Error', qle: 'Query Limit Exceeded', pe: 'Presentation Error' };
	return Object.values(RecordStatus).find(value => value.shortName.toLowerCase() === normalized || value.name.toLowerCase() === normalized)?.name ?? aliases[normalized] ?? (/^\d+\s*\/\s*\d+/.test(status) ? 'Judging' : status);
}

function statusLabel(status: string, labels: PanelState['labels']): string | undefined {
	const aliases: Record<string, string> = { Waiting: 'WJ', Judging: 'Judging', Compiling: 'Compiling' };
	const name = statusName(status);
	const code = Object.values(RecordStatus).find(value => value.name === name)?.shortName;
	return labels['status_' + (aliases[name] ?? code ?? status)];
}

// Same thresholds and precision as vscode-luogu 4.20.0 stringUtils.ts.
// Keep decimal/unspecified KB/MB units as reported instead of relabelling them KiB/MiB.
function resourceText(value: string | undefined, time = false): string | undefined {
	const match = value && /^(\d+(?:\.\d+)?)\s*([a-z]+)$/i.exec(value);
	if (!match) { return value; }
	const scales: Record<string, number> = time ? { ms: 1, s: 1000, sec: 1000, min: 60000, h: 3600000, d: 86400000 } : { B: 1, KiB: 1024, MiB: 1048576, GiB: 1073741824 };
	const scale = scales[match[2]], number = Number(match[1]) * scale;
	if (scale === undefined || !Number.isFinite(number)) { return match[1] + match[2]; }
	if (time) {
		if (number < 1000) { return `${number}ms`; }
		if (number < 60000) { return `${(number / 1000).toFixed(2)}s`; }
		if (number < 3600000) { return `${(number / 60000).toFixed(2)}min`; }
		if (number < 86400000) { return `${(number / 3600000).toFixed(2)}h`; }
		return `${(number / 86400000).toFixed(2)}d`;
	}
	if (number < 1024) { return `${number}B`; }
	if (number < 1048576) { return `${(number / 1024).toFixed(2)}KiB`; }
	if (number < 1073741824) { return `${(number / 1048576).toFixed(2)}MiB`; }
	return `${(number / 1073741824).toFixed(2)}GiB`;
}

// vscode-luogu 4.20.0 shared.ts getScoreColor.
function scoreColor(score: number): string {
	return score < 30 ? 'rgb(231, 76, 60)' : score < 80 ? 'rgb(243, 156, 17)' : 'rgb(82, 196, 26)';
}

// Cropped from record/app.tsx: information rows, subtasks and original testcase cards/hover details.
export default function Record({ state }: { state: PanelState }) {
	const record = state.record!, snapshot = state.snapshot, labels = state.labels;
	const problemName = record.problem.site === 'nowcoder' ? record.problem.nativeId.replace(/^problem\//, 'NC').replace(/^contest\//, '').replace('/', ' / ') : record.problem.nativeId;
	const pending = !!state.tracking && (!snapshot || snapshot.phase === 'queued' || snapshot.phase === 'judging');
	const progress = snapshot?.phase === 'judging' && record.problem.site === 'atcoder' ? /^(\d+)\s*\/\s*(\d+)(?:\s.*)?$/.exec(snapshot.rawStatus) : null;
	const total = progress && Number(progress[1]) <= Number(progress[2]) && Number(progress[2]) <= 1024 ? Number(progress[2]) : 0;
	// These are waiting positions from the site's reported total, not testcase names or verdicts.
	const groups = snapshot?.groups?.length ? snapshot.groups : total > 0 ? [{ name: 'Test Cases', rows: Array.from({ length: total }, (_, index) => [String(index + 1), 'Judging']) }] : [];
	return <>
		<h1><a href={record.url} onClick={event => { event.preventDefault(); void send({ action: 'openOriginal' }).catch(() => undefined); }}>{record.problem.site === 'luogu' ? 'R' : '#'}{record.id}</a> {labels.record}</h1>
		<div className={'record-info'}>
			<div><span>{labels.problem}</span><a className={'problemNameWithDifficulty'} href={record.problem.url}><span style={snapshot?.problemDifficulty?.color ? { color: snapshot.problemDifficulty.color } : undefined}>{problemName}</span>{snapshot?.problemTitle && <> {snapshot.problemTitle}</>}</a></div>
			<div><span>{labels.verdict}</span><span className={'record-verdict'} title={snapshot && statusLabel(snapshot.rawStatus, labels)} style={{ color: statusColor(snapshot?.rawStatus ?? 'WJ', true), fontWeight: 'bold' }}>{pending && <Spinner size={16} label={labels.tracking} />}{snapshot ? statusName(snapshot.rawStatus) : labels.tracking}{progress && <span>{snapshot!.rawStatus}</span>}</span></div>
			{snapshot?.score !== undefined && snapshot.phase === 'finished' && <div><span>{labels.score}</span><span style={{ fontWeight: 'bold', color: scoreColor(Number(snapshot.score)) }}>{snapshot.score}</span></div>}
			{snapshot?.submittedAt !== undefined && <div><span>{labels.submittedAt}</span><span><Time value={snapshot.submittedAt} /></span></div>}
			{snapshot?.language !== undefined && <div><span>{labels.language}</span><span>{snapshot.language}</span></div>}
			{snapshot?.codeLength !== undefined && <div><span>{labels.codeLength}</span><span>{resourceText(snapshot.codeLength)}</span></div>}
			{record.problem.site === 'luogu' && snapshot?.owner !== undefined && <div><span>{labels.owner}</span><span>{snapshot.owner}</span></div>}
			{snapshot?.phase === 'finished' && (snapshot.time !== undefined || snapshot.memory !== undefined) && <div><span>{labels.resources}</span><span>{[resourceText(snapshot.time, true), resourceText(snapshot.memory)].filter(Boolean).join(' / ')}</span></div>}
			{snapshot?.source !== undefined && <div><span>{labels.source}</span><a href={'#'} title={record.problem.site === 'nowcoder' ? labels.sentSource : labels.officialSource} onClick={event => { event.preventDefault(); void send({ action: 'viewSource' }).catch(() => undefined); }}>{labels.viewSource}</a></div>}
		</div>
		{state.message && <p role={'status'} className={'notice'}>{state.message} {state.canRetry && <VSCodeButton onClick={() => { void send({ action: 'continueQuery' }).catch(() => undefined); }}>{labels.continueQuery}</VSCodeButton>}</p>}
		{snapshot?.sourceVerification === 'mismatch' && <p className={'notice'}>{labels.verification_mismatch}</p>}
		{(!!groups.length || !!snapshot?.testCaseSummary) && <>
			<hr /><div className={'testCaseData'}><h2>{labels.testCases}</h2>
				{snapshot?.testCaseSummary && <p><span>{labels.passedTests}</span>{' '}{snapshot.testCaseSummary.passed} / {snapshot.testCaseSummary.total}</p>}
			<div>
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
			<div>#{data[0]}</div><div>{judging ? <Spinner label={data[1]} /> : data[1]}</div>{!judging && <div>{[resourceText(data[2], true), resourceText(data[3])].filter(Boolean).join(' / ')}</div>}
		</div>
		<div>{data.slice(4).filter(Boolean).join('\n')}</div>
	</div>;
}

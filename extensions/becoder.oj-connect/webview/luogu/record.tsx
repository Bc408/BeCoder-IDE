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
import type { SiteId } from '../../src/domain';
import send from '../request';
import CopyablePre from './copyablePre';
import Time from './time';
import { Spinner, resourceText } from './presentation';

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
	const raw = status.trim().toLowerCase();
	const normalized = statusName(status).trim().toLowerCase();
	const presentation = Object.values(RecordStatus).find(value => value.shortName.toLowerCase() === normalized || value.name.toLowerCase() === normalized);
	if (text && ['waiting', 'compiling', 'judging'].includes(normalized)) { return RecordStatus[1].color; }
	if (raw === 'wj' || raw === 'wr') { return RecordStatus[1].color; }
	if (presentation) { return text && ['#001277', 'rgb(14, 29, 105)'].includes(presentation.color) ? '#8c9eff' : presentation.color; }
	if (raw === 'qle') { return text ? '#8c9eff' : RecordStatus[5].color; }
	if (raw === 'ie') { return text ? '#8c9eff' : RecordStatus[11].color; }
	if (raw === 'pe') { return RecordStatus[6].color; }
	return '#7f7f7f';
}

function statusName(status: string): string {
	const normalized = status.trim().toLowerCase();
	const aliases: Record<string, string> = { wj: 'Waiting', wr: 'Judging', 'in queue': 'Waiting', 'compilation error': 'Compile Error', ie: 'Internal Error', qle: 'Query Limit Exceeded', pe: 'Presentation Error' };
	const testVerdict = /^(wrong answer|runtime error|time limit exceeded|memory limit exceeded|presentation error) on (?:test|pretest) \d+$/i.exec(status.trim());
	const officialName = testVerdict && (Object.values(RecordStatus).find(value => value.name.toLowerCase() === testVerdict[1].toLowerCase())?.name ?? aliases[testVerdict[1].toLowerCase()]);
	return Object.values(RecordStatus).find(value => value.shortName.toLowerCase() === normalized || value.name.toLowerCase() === normalized)?.name ?? aliases[normalized] ?? officialName ?? (/^(?:\d+\s*\/\s*\d+|running on (?:test|pretest)\s+\d+)/i.test(status) ? 'Judging' : status);
}

function acmStatusName(status: string): string {
	if (/^running on (?:test|pretest)\s+\d+/i.test(status.trim())) { return 'Judging'; }
	const overall = status.trim().replace(/\s+on (?:test|pretest) \d+.*$/i, '');
	if (/^partial/i.test(overall)) { return 'Partial'; }
	if (/^idleness limit exceeded$/i.test(overall)) { return 'Idleness Limit Exceeded'; }
	return statusName(overall);
}

// Judge terminology stays English, like Luogu checker details, regardless of the UI locale.
function statusLabel(status: string): string | undefined {
	const name = statusName(status);
	return Object.values(RecordStatus).some(value => value.name === name) || ['Compiling', 'Internal Error', 'Query Limit Exceeded', 'Presentation Error', 'Floating Point Exception', 'Segmentation Fault', 'Code Length Exceeded', 'Nonzero Exit Code'].includes(name) ? name : undefined;
}

// vscode-luogu 4.20.0 shared.ts getScoreColor.
function scoreColor(score: number): string {
	return score < 30 ? 'rgb(231, 76, 60)' : score < 80 ? 'rgb(243, 156, 17)' : 'rgb(82, 196, 26)';
}

// Cropped from record/app.tsx: information rows, subtasks and original testcase cards/hover details.
export default function Record({ state }: { state: PanelState }) {
	const record = state.record, submission = state.submission, snapshot = state.snapshot, labels = state.labels;
	const acm = state.acmMode === true;
	const problem = record?.problem ?? submission!.problem;
	const problemName = problem.site === 'nowcoder' ? problem.nativeId.replace(/^problem\//, 'NC').replace(/^contest\//, '').replace('/', ' / ') : problem.nativeId;
	const pending = !!state.tracking && (!snapshot || snapshot.phase === 'queued' || snapshot.phase === 'judging');
	const progress = !acm && snapshot?.phase === 'judging' && problem.site === 'atcoder' ? /^(\d+)\s*\/\s*(\d+)(?:\s.*)?$/.exec(snapshot.rawStatus) : null;
	const codeforcesProgress = !acm && problem.site === 'codeforces' && snapshot?.phase === 'judging' && /^running on (?:test|pretest) \d+$/i.test(snapshot.rawStatus) ? snapshot.rawStatus : undefined;
	const submissionStatus = !state.tracking ? labels.resultUnavailable : record || submission?.phase === 'confirming' ? labels.confirming : submission?.phase === 'preparing' ? labels.preparing : submission?.phase === 'sending' ? labels.submitting : 'Judging';
	const verdict = snapshot ? acm ? acmStatusName(snapshot.rawStatus) : statusName(snapshot.rawStatus) : submission ? submissionStatus : state.tracking ? labels.tracking : labels.resultUnavailable;
	const verdictTitle = snapshot && (acm ? verdict : [...new Set([statusLabel(snapshot.rawStatus), problem.site === 'codeforces' ? snapshot.rawStatus : undefined].filter(Boolean))].join(' · ') || undefined);
	// The submitted metadata and real report stay local to this view while official fields take over.
	const language = snapshot?.language ?? submission?.language, codeLength = snapshot?.codeLength ?? submission?.codeLength;
	const reportedGroups = acm ? undefined : snapshot?.groups ?? submission?.groups;
	const summary = acm || problem.site === 'lanqiao' ? undefined : snapshot?.testCaseSummary;
	const total = progress && Number(progress[1]) <= Number(progress[2]) && Number(progress[2]) <= 1024 ? Number(progress[2]) : 0;
	// These are waiting positions from the site's reported total, not testcase names or verdicts.
	let groups = reportedGroups?.length ? reportedGroups : total > 0 ? [{ name: 'Test Cases', rows: Array.from({ length: total }, (_, index) => [String(index + 1), 'Judging']) }] : [];
	const currentTest = codeforcesProgress ? Number(/\d+$/.exec(codeforcesProgress)?.[0]) : 0;
	if (Number.isSafeInteger(currentTest) && currentTest > 0 && currentTest <= 1024 && !groups.some(group => group.rows.some(row => row[0] === String(currentTest)))) {
		// CF reports the current index, not a total or verdicts for the preceding tests.
		const current = [String(currentTest), 'Judging'];
		groups = groups.length ? groups.map((group, index) => index === 0 ? { ...group, rows: [...group.rows, current] } : group) : [{ name: 'Test Cases', rows: [current] }];
	}
	return <>
		<h1 className={submission ? 'record-evaluation-title' : undefined}>{record && <><a href={record.url}>{problem.site === 'luogu' ? 'R' : '#'}{record.id}</a> </>}{labels.record}</h1>
		<div className={'record-info'}>
			<div><span>{labels.problem}</span><a className={'problemNameWithDifficulty'} href={problem.url}><span style={!acm && snapshot?.problemDifficulty?.color ? { color: snapshot.problemDifficulty.color } : undefined}>{problemName}</span>{snapshot?.problemTitle && <> {snapshot.problemTitle}</>}</a></div>
			<div><span>{labels.verdict}</span><span className={'record-verdict'} title={verdictTitle} style={{ color: statusColor(acm ? verdict : snapshot?.rawStatus ?? 'WJ', true), fontWeight: 'bold' }}>{pending && <Spinner size={16} label={verdict} />}{verdict}{progress && <span>{snapshot!.rawStatus}</span>}{codeforcesProgress && <span className={'record-progress'}>{codeforcesProgress}</span>}</span></div>
			{!acm && snapshot?.score !== undefined && snapshot.phase === 'finished' && <div><span>{labels.score}</span><span style={{ fontWeight: 'bold', color: scoreColor(Number(snapshot.score)) }}>{snapshot.score}</span></div>}
			{snapshot?.submittedAt !== undefined && <div><span>{labels.submittedAt}</span><span><Time value={snapshot.submittedAt} /></span></div>}
			{(language !== undefined || submission) && <div><span>{labels.language}</span><span>{language ?? '—'}</span></div>}
			{codeLength !== undefined && <div><span>{labels.codeLength}</span><span>{resourceText(codeLength)}</span></div>}
			{problem.site === 'luogu' && snapshot?.owner !== undefined && <div><span>{labels.owner}</span><span>{snapshot.owner}</span></div>}
			{snapshot?.phase === 'finished' && (snapshot.time !== undefined || snapshot.memory !== undefined) && <div><span>{labels.resources}</span><span>{[resourceText(snapshot.time, true), resourceText(snapshot.memory)].filter(Boolean).join(' / ')}</span></div>}
			{snapshot?.source !== undefined && <div><span>{labels.source}</span><a href={'#'} title={problem.site === 'nowcoder' ? labels.sentSource : labels.officialSource} onClick={event => { event.preventDefault(); event.stopPropagation(); void send({ action: 'viewSource' }).catch(() => undefined); }}>{labels.viewSource}</a></div>}
		</div>
		{state.message && <p role={'status'} className={'notice'}>{state.message} {state.canRetry && <VSCodeButton onClick={() => { void send({ action: 'continueQuery' }).catch(() => undefined); }}>{labels.continueQuery}</VSCodeButton>}</p>}
		{snapshot?.sourceVerification === 'mismatch' && <p className={'notice'}>{labels.verification_mismatch}</p>}
		{(!!groups.length || !!summary) && <>
			<hr /><div className={'testCaseData'}><h2>{labels.testCases}</h2>
				{summary && <p><span>{labels.passedTests}</span>{' '}{summary.passed} / {summary.total}</p>}
			<div>
				{groups.map((subtask, index) => <div key={index}>{!(groups.length === 1 && subtask.name === 'Test Cases') && <h3>{subtask.name}</h3>}<div className={'testcase-grid'}>
					{subtask.rows.map((testcase, index) => <TestCase key={index} site={problem.site} animate={pending}>{testcase}</TestCase>)}
				</div></div>)}
			</div></div>
		</>}
		{!acm && (snapshot?.compileMessage || snapshot?.compileSucceeded !== undefined) && <><hr /><div><h2>{labels.compiler}</h2>{snapshot.compileSucceeded !== undefined && <p>{snapshot.compileSucceeded ? labels.compileSucceeded : labels.compileFailed}</p>}{snapshot.compileMessage ? <CopyablePre><code>{snapshot.compileMessage}</code></CopyablePre> : snapshot.compileSucceeded === false && <p>{labels.compileUnavailable}</p>}</div></>}
	</>;
}
function TestCase({ children: data, animate, site }: { children: readonly string[]; animate: boolean; site: SiteId }) {
	const rawStatus = data[1] ?? '';
	const nativeName = site === 'codeforces' ? statusName(rawStatus.replace(/_/g, ' ')) : rawStatus;
	const status = site === 'codeforces'
		? rawStatus === 'OK' ? 'AC' : Object.values(RecordStatus).find(value => value.name === nativeName)?.shortName ?? rawStatus
		: rawStatus;
	const judging = animate && /^(judging|running|WJ|WR|1|\d+\s*\/\s*\d+)$/i.test(status);
	const details = site === 'codeforces' ? [statusLabel(status) ?? nativeName, ...data.slice(4).filter(value => /^Exit with code -?\d{1,16}$/.test(value))].filter(Boolean).join('\n') : data.slice(4).filter(Boolean).join('\n') || statusLabel(status);
	return <div className={'testcase'} tabIndex={0} title={site !== 'codeforces' && status !== rawStatus ? rawStatus : undefined}>
		<div style={{ backgroundColor: statusColor(status) }}>
			<div>#{data[0]}</div><div>{judging ? <Spinner label={status} /> : status}</div>{!judging && <div>{[resourceText(data[2], true), resourceText(data[3])].filter(Boolean).join(' / ')}</div>}
		</div>
		{details && <div>{details}</div>}
	</div>;
}

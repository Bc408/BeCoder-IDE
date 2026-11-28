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

import React, { useEffect, useId, useRef } from 'react';
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from './uiToolkit';
import SubmissionControls from './submissionControls';
import type { PanelState } from '../../src/views/model';
import type { Section } from '../../src/domain';
import { contentFragment, highlightCodeBlocks } from '../content';
import { lanqiaoStatement } from '../lanqiaoStatement';
import type { Root } from 'hast';
import send from '../request';
import CopyablePre from './copyablePre';
import { installCodeCopyButtons } from './codeCopy';
import { CphIcon, Tag, resourceText } from './presentation';

function Content({ section, url, scope, lanqiao = false, problemTitle }: { section: Section; url: string; scope: string; lanqiao?: boolean; problemTitle?: string }) {
	const root = useRef<HTMLElement>(null);
	useEffect(() => {
		let disposed = false, cleanup: (() => void) | undefined, syntax: { dispose(): void } | undefined;
		const article = root.current!;
		article.replaceChildren();
		article.setAttribute('aria-busy', 'true');
		const pending = document.createElement('span');
		pending.setAttribute('role', 'status');
		pending.textContent = window.__OJ_STATE__.labels.rendering;
		article.append(pending);
		const render = async () => {
			const tree = await send<Root>({ action: 'renderContent', content: section.content, format: section.format });
			if (disposed) { return; }
			article.replaceChildren(contentFragment(lanqiao && section.format === 'markdown' ? lanqiaoStatement(tree, problemTitle) : tree, section.format === 'html' ? scope : undefined));
			syntax = highlightCodeBlocks(article);
			article.setAttribute('aria-busy', 'false');
			cleanup = installCodeCopyButtons(article, window.__OJ_STATE__.labels);
		};
		void render().catch(() => {
			if (!disposed) {
				article.setAttribute('aria-busy', 'false');
				const error = document.createElement('p');
				error.setAttribute('role', 'alert');
				error.textContent = window.__OJ_STATE__.labels.renderFailed;
				article.replaceChildren(error);
			}
		});
		return () => { disposed = true; syntax?.dispose(); cleanup?.(); };
	}, [section.format, section.content, url, scope, lanqiao, problemTitle]);
	return <article className={'luogu-markdown'} ref={root} />;
}

// Cropped from viewProblem/app.tsx: the original header, controls and paired sample layout.
export default function Problem({ state }: { state: PanelState }) {
	const scope = useId() + (state.locale ?? '');
	const data = state.problem!, problemId = data.ref.site === 'nowcoder' ? data.ref.nativeId.replace(/^problem\//, 'NC').replace(/^contest\//, '').replace('/', ' / ') : data.ref.nativeId.split('/').at(-1)!, languagesList = ['zh-CN', 'en'];
	const choosedLanguage = state.locale ?? data.bodies[0]?.locale;
	const problemContent = data.bodies.find(body => body.locale === choosedLanguage) ?? data.bodies[0];
	const title = problemContent?.title ?? data.title;
	const content = (notes: boolean) => problemContent?.sections.filter(section => section.kind !== 'sample-explanation' && (section.kind === 'notes') === notes).map((section, index) => <div key={index}>
		{section.heading && <h2>{section.heading}</h2>}
		<Content section={section} url={data.ref.url} scope={scope} lanqiao={data.ref.site === 'lanqiao'} problemTitle={!notes && index === 0 ? data.title : undefined} />
	</div>);
	return <>
		<header>
			<div>
				<h1><a href={data.ref.url}>{problemId}</a>{' '}{title.startsWith(problemId + ' ') ? title.slice(problemId.length + 1) : title}</h1>
				<div>
					<VSCodeDropdown className={'statement-language'} ariaLabelledby={state.labels.statementLanguage} value={choosedLanguage}
						onChange={event => { void send({ action: 'selectLocale', locale: event.target.value as 'zh-CN' | 'en' }).catch(() => undefined); }}>
						{languagesList.map(locale => { const body = data.bodies.find(body => body.locale === locale); return <VSCodeOption value={locale} key={locale}>{locale + (!body ? '\uFF08' + state.labels.statementMissing + '\uFF09' : body.origin === 'translation' ? '\uFF08' + state.labels.statementTranslated + '\uFF09' : '')}</VSCodeOption>; })}
					</VSCodeDropdown>
					<VSCodeButton onClick={() => { void send({ action: 'importCph' }).catch(() => undefined); }} appearance={'primary'} className={'problem-action problem-action-cph'} aria-label={state.labels.importCph} title={state.labels.importCph}><CphIcon /></VSCodeButton>
					<SubmissionControls state={state} />
				</div>
			</div>
			<div className={'problem-limits'}>
				{data.limits.map(limit => <div className={'problem-limit'} key={limit.label}><div>{state.labels[limit.label] ?? limit.label}</div><div>{data.ref.site === 'lanqiao' ? resourceText(limit.value, limit.label === 'Time Limit') : limit.value}</div></div>)}
				{!state.acmMode && data.difficulty && <div className={'problem-difficulty'}><div>{state.labels.difficulty}</div><div><Tag {...data.difficulty} /></div></div>}
				{!state.acmMode && !!data.tags?.length && <div className={'problem-tags haveTag'} tabIndex={0} aria-label={state.labels.tags}>
					<div>{state.labels.tags}</div>
					<div>
						<svg aria-hidden={'true'} viewBox={'0 0 16 16'}><path d={'m3 6 5 5 5-5'} /></svg>
					</div>
					<div><div className={'problem-tag-list'}>{data.tags.map((tag, index) => <Tag key={index} {...tag} />)}</div></div>
				</div>}
				{data.interactive && <div><div>{state.labels.interactive}</div></div>}
			</div>
		</header>
		{state.translation && <div className={'statement-translation-progress'} role={'status'}><span>{state.translation.target === 'zh-CN' ? state.labels.translatingChinese : state.labels.translatingEnglish}{state.translation.total > 1 ? ` ${state.translation.completed}/${state.translation.total}` : ''}</span><VSCodeButton appearance={'secondary'} onClick={() => { void send({ action: 'cancelTranslation' }); }}>{state.labels.cancelTranslation}</VSCodeButton></div>}
		<div className={'problemContent'}>
			{content(false)}
			{data.samples.length > 0 && <div>
				<h2>{state.labels.samples}</h2>
				<div className={'problemSamples'}>
					{data.samples.map(({ input, output }, id) => <div key={id} className={'sample-grid'}>
						<div><h3>{state.labels.input}#{id + 1}</h3><CopyablePre><code>{input}</code></CopyablePre></div>
						<div><h3>{state.labels.output}#{id + 1}</h3><CopyablePre><code>{output}</code></CopyablePre></div>
						{problemContent?.sections.filter(section => section.kind === 'sample-explanation' && section.sampleIndex === id).map((section, index) => <div className={'sample-explanation'} key={index}><h3>{state.labels.sampleExplanation} #{id + 1}</h3><Content section={section} url={data.ref.url} scope={scope} /></div>)}
					</div>)}
				</div>
			</div>}
			{content(true)}
		</div>
	</>;
}

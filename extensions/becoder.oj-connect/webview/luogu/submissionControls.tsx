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

import React, { useState } from 'react';
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from './uiToolkit';
import type { PanelState } from '../../src/views/model';
import send from '../request';
import { SubmitIcon } from './presentation';

// Upstream SubmissionControls: keep its single pending submission and filename + language controls.
export default function SubmissionControls({ state }: { state: PanelState }) {
	const [submitting, setSubmitting] = useState(false);
	const languages = state.languages ?? [];
	const placeholder = languages.length ? state.labels.chooseLanguage : state.languagesLoading ? state.labels.languagesLoading : state.problem?.languageError === 'login-required' ? state.labels.languagesLoginRequired : state.labels.languagesUnavailable;
	const compilerTitle = (languages.find(language => language.id === state.languageId)?.label ?? placeholder) + (state.usingCompilerCatalogue ? ' · ' + state.labels.compilerCatalogue : '');
	const submitCurrentDocument = async () => {
		if (submitting) { return; }
		setSubmitting(true);
		try { await send({ action: 'submit' }); }
		catch { /* The owning host displays the operation error. */ }
		finally { setSubmitting(false); }
	};
	return <div className={'submissionControls'}>
		<VSCodeButton onClick={submitCurrentDocument} appearance={'primary'} disabled={submitting} className={'problem-action'} aria-label={state.sourceName ? state.labels.submit + ' ' + state.sourceName : state.labels.submitCode} title={state.sourceName ? state.labels.submit + ' ' + state.sourceName : state.labels.submitCode}>
			<SubmitIcon />
		</VSCodeButton>
		<VSCodeDropdown ariaLabelledby={state.labels.submissionLanguage} value={state.languageId ?? ''}
			title={compilerTitle}
			disabled={submitting || languages.length === 0}
			onChange={event => { void send({ action: 'selectLanguage', languageId: event.target.value }).catch(() => undefined); }}>
			{!state.languageId && <VSCodeOption value={''}>{placeholder}</VSCodeOption>}
			{languages.map(language => <VSCodeOption value={language.id} key={language.id}>{language.label}</VSCodeOption>)}
		</VSCodeDropdown>
	</div>;
}

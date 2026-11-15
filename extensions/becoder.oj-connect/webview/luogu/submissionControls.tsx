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
	const submitCurrentDocument = async () => {
		if (submitting) { return; }
		setSubmitting(true);
		try { await send({ action: 'submit' }); }
		catch { /* The owning host displays the operation error. */ }
		finally { setSubmitting(false); }
	};
	return <div className={'submissionControls'}>
		<VSCodeButton onClick={submitCurrentDocument} appearance={'primary'} disabled={submitting}>
			<div><SubmitIcon />{state.sourceName ? <>{state.labels.submit} {state.sourceName}</> : state.labels.submitCode}</div>
		</VSCodeButton>
		<VSCodeDropdown ariaLabelledby={state.labels.language} value={state.languageId ?? languages[0]?.id ?? ''}
			disabled={submitting || languages.length === 0}
			onChange={event => { void send({ action: 'selectLanguage', languageId: event.target.value }).catch(() => undefined); }}>
			{languages.length ? languages.map(language => <VSCodeOption value={language.id} key={language.id}>{language.label}</VSCodeOption>) : <VSCodeOption value={''}>{state.labels.chooseLanguage}</VSCodeOption>}
		</VSCodeDropdown>
	</div>;
}

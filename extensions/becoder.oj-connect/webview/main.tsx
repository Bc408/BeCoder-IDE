/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Problem from './luogu/problem';
import Record from './luogu/record';
import send, { vscode } from './request';
import { panelMessage, type PanelState } from '../src/views/model';

declare global { interface Window { __OJ_STATE__: PanelState } }
const root = document.getElementById('app')!;
// Keep navigation inside this extension; the Webview's window-level link bridge opens externally.
const navigateLink = (event: MouseEvent) => {
	const anchor = event.composedPath().find((value): value is Element => value instanceof Element && value.localName === 'a' && root.contains(value));
	if (!anchor) { return; }
	if (event.type === 'auxclick') {
		if (event.button === 1) { event.preventDefault(); event.stopPropagation(); }
		return;
	}
	const url = anchor.getAttribute('href');
	if (!url || url.startsWith('#')) { return; }
	event.preventDefault(); event.stopPropagation();
	const action = panelMessage({ action: 'openLink', url });
	if (action) { void send(action).catch(() => undefined); }
};
root.addEventListener('click', navigateLink);
root.addEventListener('auxclick', navigateLink);
function App() {
	const [state, setState] = useState(window.__OJ_STATE__);
	root.className = 'oj-' + state.kind;
	useEffect(() => {
		const listener = (event: MessageEvent<{ type: string; state: PanelState }>) => { if (event.data?.type === 'state') { setState(event.data.state); } };
		window.addEventListener('message', listener); vscode.postMessage({ action: 'ready' });
		return () => window.removeEventListener('message', listener);
	}, []);
	return state.kind === 'problem' ? <Problem state={state} /> : <Record state={state} />;
}
createRoot(root).render(<App />);

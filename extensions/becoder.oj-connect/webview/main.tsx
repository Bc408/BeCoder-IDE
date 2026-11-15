/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Problem from './luogu/problem';
import Record from './luogu/record';
import { vscode } from './request';
import type { PanelState } from '../src/views/model';

declare global { interface Window { __OJ_STATE__: PanelState } }
const root = document.getElementById('app')!;
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

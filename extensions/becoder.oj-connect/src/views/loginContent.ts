/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LoginSummary, SiteId } from '../domain';

export function loginContent(rows: readonly LoginSummary[], names: Record<SiteId, string>, states: Record<LoginSummary['state'], string>, icons: Record<SiteId, string>, source: string, nonce: string): string {
	const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ 38: '&amp;', 60: '&lt;', 62: '&gt;', 34: '&quot;', 39: '&#39;' }[char.charCodeAt(0)]!));
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${source}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">
		body { padding: 4px 12px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); user-select: none; }
		.account { display: grid; grid-template-columns: 20px max-content minmax(0,1fr); align-items: center; gap: 8px; min-height: 30px; }
		img { width: 18px; height: 18px; object-fit: contain; border-radius: 2px; }
		[data-site="atcoder"] img { background: #fafafa; }
		button { border: 0; padding: 3px 0; background: transparent; color: var(--vscode-textLink-foreground); font: inherit; cursor: pointer; }
		button:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
		button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
		button:disabled { color: var(--vscode-disabledForeground); cursor: default; text-decoration: none; }
		.status { color: var(--vscode-descriptionForeground); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	</style></head><body>${rows.map(row => `<div class="account" data-site="${row.site}" data-state="${row.state}"><img src="${escape(icons[row.site])}" alt=""><button type="button" ${row.state === 'unavailable' ? 'disabled' : ''}>${escape(names[row.site])}</button><span class="status" title="${escape(row.label ?? states[row.state])}">${escape(states[row.state] + (row.label ? ' · ' + row.label : ''))}</span></div>`).join('')}
	<script nonce="${nonce}">
		const api = acquireVsCodeApi();
		for (const row of document.querySelectorAll('.account')) {
			row.querySelector('button').addEventListener('click', () => api.postMessage({ site: row.dataset.site }));
		}
		window.addEventListener('message', event => {
			for (const item of event.data.rows || []) {
				const row = [...document.querySelectorAll('.account')].find(row => row.dataset.site === item.site);
				if (!row) { continue; }
				row.dataset.state = item.state;
				row.querySelector('button').disabled = item.state === 'unavailable';
				row.querySelector('.status').textContent = item.text;
				row.querySelector('.status').title = item.text;
			}
		});
		api.postMessage({ ready: true });
	</script></body></html>`;
}

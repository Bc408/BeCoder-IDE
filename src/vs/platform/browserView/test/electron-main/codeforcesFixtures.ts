/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const cfProblem = { site: 'codeforces' as const, nativeId: '4/A', url: 'https://codeforces.com/contest/4/problem/A' };
export const cfHeader = '<div id="header"><div class="lang-chooser"><a href="/profile/fixture">fixture</a><a href="/logout">Logout</a></div></div><meta name="X-Csrf-Token" content="fixture-csrf">';
export const cfForm = '<html><body>' + cfHeader + `<div id="sidebar"><table><tr><th><a href="/contest/4">Round</a></th></tr><tr><td><span class="contest-state-phase">Finished</span><span class="contest-state-regular">Practice</span></td></tr></table></div><form class="submit-form" method="post" action="/contest/4/submit?csrf_token=fixture-csrf"><input name="csrf_token" value="fixture-csrf"><input name="action" value="submitSolutionFormSubmitted"><input name="contestId" value="4"><input name="ftaa" value=""><input name="bfaa" value=""><input name="tabSize" value="4"><input type="file" name="sourceFile"><select name="submittedProblemIndex"><option value="A" selected>A - Watermelon</option></select><select name="programTypeId"><option value="89">GNU G++20 13.2 (64 bit, winlibs)</option><option value="31">Python 3</option><option value="43">GNU GCC C11 5.1.0</option></select><textarea name="source"></textarea></form><script>const outputOnlyIndices=[];window._ftaa='fixture-ftaa';window._bfaa='fixture-bfaa';</script></body></html>`;
export function cfList(rows = '', next = '', contestRows?: string) {
	const table = (value: string) => '<table class="status-frame-datatable"><tr><th>#</th><th>When</th><th>Who</th><th>Problem</th><th>Lang</th><th>Verdict</th><th>Time</th><th>Memory</th></tr>' + (value || '<tr><td colspan="8">No items</td></tr>') + '</table>';
	return '<html><body>' + cfHeader + table(rows) + (contestRows === undefined ? '' : table(contestRows)) + next + '</body></html>';
}
export function cfRow(id: string, language = 'C++20 (GCC 13-64)', owner = 'fixture') { return `<tr data-submission-id="${id}"><td>${id}</td><td><span class="format-time">Nov/18/2026 12:00</span></td><td><a href="/profile/${owner}">${owner}</a></td><td><a href="/contest/4/problem/A">A - Watermelon</a></td><td>${language}</td><td>Accepted</td><td>15 ms</td><td>256 KB</td></tr>`; }

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { OutputItem } from 'vscode-notebook-renderer';
import { handleANSIOutput } from '../../notebook-renderers/src/ansi';
import { AnsiStream } from '../src/ansiStream';
import { beCoderNotebookStatusMime, formatBeCoderRunHeading } from '../../../src/vs/workbench/contrib/becoder/common/beCoderNotebook';

export function activate() {
	const states = new Map<string, { element: HTMLElement; content: HTMLPreElement; stream: AnsiStream }>();
	return {
		renderOutputItem(item: OutputItem & { appendedText?: () => string | undefined }, element: HTMLElement): void {
			if (item.mime === beCoderNotebookStatusMime) {
				const attempt = JSON.parse(item.text());
				const heading = document.createElement('div');
				const color = attempt.status === 'completed' ? 'var(--vscode-terminal-ansiCyan)' : ['compile-error', 'runtime-error', 'timed-out', 'output-limit', 'unable-to-start'].includes(attempt.status) ? 'var(--vscode-errorForeground)' : 'var(--vscode-descriptionForeground)';
				heading.style.cssText = `font-family:var(--vscode-editor-font-family);padding:5px 10px;border-left:3px solid ${color};color:${color};background:var(--vscode-editorWidget-background);`;
				heading.setAttribute('role', 'status'); heading.textContent = formatBeCoderRunHeading(attempt); element.replaceChildren(heading); return;
			}
			let state = states.get(item.id);
			const appended = item.appendedText?.();
			const isAppend = !!state && state.element === element && appended !== undefined;
			if (!isAppend) {
				const content = document.createElement('pre');
				content.style.cssText = 'margin:0;white-space:pre;overflow:auto;font-family:var(--vscode-editor-font-family);color:var(--vscode-editor-foreground);';
				element.replaceChildren(content);
				state = { element, content, stream: new AnsiStream() };
				states.set(item.id, state);
			}
			const text = state!.stream.append(isAppend ? appended! : item.text());
			if (text) { state!.content.appendChild(handleANSIOutput(text, { linkifyFilePaths: true, trustHtml: false })); }
		},
		disposeOutputItem(id?: string): void { if (id) { states.delete(id); } else { states.clear(); } }
	};
}

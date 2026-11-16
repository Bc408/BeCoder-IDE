/* Copyright (c) BeCoder contributors. MIT License. See ../../LICENSE. */
import { languages } from 'becoder-syntax-assets';
import { createSyntaxClient } from './syntaxClient';
import type { SyntaxToken } from './syntax';
import './code.css';

const aliases: Record<string, string> = { 'c++': 'cpp', cxx: 'cpp', hpp: 'cpp', cc: 'cpp', h: 'cpp', js: 'javascript', cjs: 'javascript', mjs: 'javascript', ts: 'typescript', py: 'python', sh: 'shellscript', bash: 'shellscript', shell: 'shellscript', zsh: 'shellscript', docker: 'dockerfile', yml: 'yaml', md: 'markdown', txt: 'text', plaintext: 'text' };
const labels: Record<string, string> = { c: 'C', cpp: 'C++', csharp: 'C#', css: 'CSS', graphql: 'GraphQL', html: 'HTML', javascript: 'JavaScript', json: 'JSON', jsx: 'JSX', latex: 'LaTeX', markdown: 'Markdown', objectivec: 'Objective-C', powershell: 'PowerShell', python: 'Python', rust: 'Rust', shellscript: 'Shell', sql: 'SQL', tsx: 'TSX', typescript: 'TypeScript', xml: 'XML', yaml: 'YAML' };
export function resolveLanguage(rawLanguage: string) {
	const raw = rawLanguage.trim(), normalized = raw.toLowerCase();
	const entry = languages[aliases[normalized] ?? normalized];
	const id = entry?.id ?? 'text';
	const label = !raw || ['text', 'txt', 'plaintext'].includes(normalized) ? (document.documentElement.lang.startsWith('zh') ? '纯文本' : 'Plain text') : labels[id] ?? entry?.label ?? raw.charAt(0).toUpperCase() + raw.slice(1);
	return { id, label };
}

/** Framework-independent code view. Source is authoritative; coloring only patches lines. */
export function createCodeRenderer(code: HTMLElement) {
	let text = '', language = '', disposed = false, frame = 0;
	let source: string[] = [];
	let lines: { node: HTMLSpanElement; newline?: Text; tokens?: SyntaxToken[] }[] = [];
	const tail = document.createTextNode('');
	const client = createSyntaxClient((snapshot, tokens) => {
		if (disposed || !tokens || !text.startsWith(snapshot)) { return; }
		const snapshotLines = snapshot.split('\n');
		let index = 0;
		cancelAnimationFrame(frame);
		const paint = () => {
			const start = performance.now();
			const appended = document.createDocumentFragment();
			let consumed = 0;
			while (index < source.length && index < tokens.length) {
				let row = lines[index];
				const values = tokens[index];
				// A partially received final line must keep its newer literal source.
				if (source[index] !== snapshotLines[index]) { break; }
				if (!row) {
					const node = document.createElement('span'); node.className = 'code-line';
					const newline = index < source.length - 1 || text.endsWith('\n') ? document.createTextNode('\n') : undefined;
					row = { node, newline };
					lines.push(row); appended.append(node); if (newline) { appended.append(newline); }
					consumed += source[index].length + (newline ? 1 : 0);
				}
				if (source[index] === snapshotLines[index] && row.tokens !== values) {
					const fragment = document.createDocumentFragment();
					for (const token of values) {
						const span = document.createElement('span');
						span.textContent = token.content;
						span.style.color = token.color;
						if (token.fontStyle & 1) { span.style.fontStyle = 'italic'; }
						if (token.fontStyle & 2) { span.style.fontWeight = 'bold'; }
						if (token.fontStyle & 12) { span.style.textDecoration = token.fontStyle & 4 ? (token.fontStyle & 8 ? 'underline line-through' : 'underline') : 'line-through'; }
						fragment.append(span);
					}
					row.node.replaceChildren(fragment);
					row.tokens = values;
				}
				index++;
				if (performance.now() - start >= 6) { break; }
			}
			if (consumed) { tail.deleteData(0, consumed); }
			code.insertBefore(appended, tail);
			frame = index < source.length && index < tokens.length && source[index] === snapshotLines[index] ? requestAnimationFrame(paint) : 0;
		};
		frame = requestAnimationFrame(paint);
	});
	return {
		update(value: string, rawLanguage: string) {
			const nextLanguage = resolveLanguage(rawLanguage).id;
			if (value === text && language === nextLanguage && source.length) { return; }
			cancelAnimationFrame(frame);
			const next = value.split('\n');
			// A trailing newline is a separator, not an extra visible code row.
			if (value.endsWith('\n')) { next.pop(); }
			if (nextLanguage === 'text' || value.length > 512000 || next.length > 10000 || next.some(line => line.length > 20000)) {
				text = value; language = 'text'; source = []; lines = [];
				code.textContent = value;
				client.update(value, 'text');
				return;
			}
			let start = 0;
			if (language === nextLanguage) { while (start < source.length && start < next.length && source[start] === next[start]) { start++; } }
			start = Math.min(start, lines.length);
			text = value; language = nextLanguage;
			if (!start) { code.replaceChildren(tail); }
			else { for (const row of lines.slice(start)) { row.node.remove(); row.newline?.remove(); } }
			lines.length = start;
			// A formerly final line can acquire a newline when a stream continues.
			if (start && !lines[start - 1].newline && (start < next.length || value.endsWith('\n'))) { const separator = document.createTextNode('\n'); lines[start - 1].newline = separator; code.append(separator); }
			if (start === next.length && start && !value.endsWith('\n')) { lines[start - 1].newline?.remove(); lines[start - 1].newline = undefined; }
			// Keep all pending source in one text node. Coloring promotes only the
			// completed prefix, avoiding a second full set of placeholder line DOM.
			tail.data = next.slice(start).join('\n') + (start < next.length && value.endsWith('\n') ? '\n' : '');
			code.append(tail); source = next;
			client.update(value, language);
		},
		dispose() { disposed = true; cancelAnimationFrame(frame); client.dispose(); }
	};
}

export function highlightCodeBlocks(root: ParentNode): { dispose(): void } {
	const renderers = [...root.querySelectorAll('pre')].map(pre => {
		let code = pre.querySelector('code');
		if (!code) { code = document.createElement('code'); code.append(...pre.childNodes); pre.append(code); }
		const language = [...code.classList].find(value => value.startsWith('language-'))?.slice(9) ?? '';
		const renderer = createCodeRenderer(code);
		pre.classList.add('becoder-syntax');
		renderer.update(code.textContent ?? '', language);
		return renderer;
	});
	return { dispose() { renderers.forEach(renderer => renderer.dispose()); } };
}

/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { Fragment, memo, useEffect, useState, type CSSProperties } from 'react';
import { languages } from 'beacon-syntax-assets';
import { Icon } from './Icon';
import { useCodeSyntax } from './useCodeSyntax';

interface ResolvedLanguage {
	id: string;
	label: string;
}

const languageAliases: Record<string, string> = {
	'c++': 'cpp', cxx: 'cpp', hpp: 'cpp', cc: 'cpp', h: 'cpp',
	js: 'javascript', cjs: 'javascript', mjs: 'javascript',
	ts: 'typescript', tsx: 'tsx', py: 'python', sh: 'shellscript', bash: 'shellscript', shell: 'shellscript', zsh: 'shellscript', docker: 'dockerfile',
	yml: 'yaml', md: 'markdown', txt: 'text', plaintext: 'text'
};

const languageLabels: Record<string, string> = {
	c: 'C', cpp: 'C++', csharp: 'C#', css: 'CSS', docker: 'Dockerfile',
	graphql: 'GraphQL', html: 'HTML', javascript: 'JavaScript', json: 'JSON',
	jsx: 'JSX', latex: 'LaTeX', markdown: 'Markdown', objectivec: 'Objective-C',
	powershell: 'PowerShell', python: 'Python', rust: 'Rust', shellscript: 'Shell',
	sql: 'SQL', tsx: 'TSX', typescript: 'TypeScript', xml: 'XML', yaml: 'YAML'
};

function resolveLanguage(rawLanguage: string): ResolvedLanguage {
	const raw = rawLanguage.trim();
	const normalized = raw.toLowerCase();
	const alias = languageAliases[normalized] ?? normalized;
	const entry = languages[alias];
	const id = entry?.id ?? 'text';
	const label = !raw || id === 'text' && ['text', 'txt', 'plaintext'].includes(normalized)
		? (document.documentElement.lang.startsWith('zh') ? '纯文本' : 'Plain text')
		: languageLabels[id] ?? entry?.label ?? raw.charAt(0).toUpperCase() + raw.slice(1);
	return { id, label };
}

function CodeBlockView({ text, language, streaming }: { text: string; language: string; streaming: boolean }) {
	// Markdown appends a presentation newline even while the last source line is
	// unfinished. Exclude it from syntax snapshots so growing that line remains
	// an append, then restore it only in the rendered/copyable text.
	const codeText = text.endsWith('\n') ? text.slice(0, -1) : text;
	const [wrapped, setWrapped] = useState(false);
	const [copied, setCopied] = useState(false);
	const zh = document.documentElement.lang.startsWith('zh');
	const resolved = resolveLanguage(language);
	const nativeSyntax = resolved.id !== 'text';
	const syntax = useCodeSyntax(codeText, resolved.id);
	useEffect(() => {
		if (!copied) { return; }
		const timeout = window.setTimeout(() => setCopied(false), 1600);
		return () => window.clearTimeout(timeout);
	}, [copied]);
	// MessageResponse already spreads incoming text across paint frames. Render
	// each colored snapshot directly instead of introducing a second reveal clock.
	const renderedCode = syntax?.lines ? syntax.lines.map((line, lineIndex) => <Fragment key={lineIndex}><span className="code-line">
		{line.map((token, tokenIndex) => <span key={tokenIndex} style={{ color: token.color, '--token-dark': token.color, fontStyle: token.fontStyle & 1 ? 'italic' : undefined, fontWeight: token.fontStyle & 2 ? 'bold' : undefined, textDecoration: [token.fontStyle & 4 ? 'underline' : '', token.fontStyle & 8 ? 'line-through' : ''].filter(Boolean).join(' ') || undefined } as CSSProperties}>{token.content}</span>)}
	</span>{lineIndex < syntax.lines!.length - 1 ? '\n' : null}</Fragment>) : syntax?.text ?? codeText;
	const label = (name: 'copy' | 'wrap') => name === 'copy'
		? (copied ? (zh ? '已复制' : 'Copied') : (zh ? '复制代码' : 'Copy code'))
		: (zh ? '自动换行' : 'Wrap lines');
	return <section className={`code-block${wrapped ? ' is-wrapped' : ''}${nativeSyntax ? ' becoder-syntax' : ''}`} data-streaming={streaming || undefined}>
		<div className="code-toolbar"><span className="code-language"><Icon name="code" /><span>{resolved.label}</span></span><div className="code-actions">
			<button className="code-wrap" type="button" aria-label={label('wrap')} aria-pressed={wrapped} onClick={() => setWrapped(value => !value)}><Icon name="codeWrap" /></button>
			<button type="button" aria-label={label('copy')} onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false)); }}><Icon name={copied ? 'check' : 'codeCopy'} /></button>
		</div></div>
		<div className="code-scroller"><pre><code>{renderedCode}{text.endsWith('\n') ? '\n' : null}</code></pre></div>
	</section>;
}

export const CodeBlock = memo(CodeBlockView, (previous, next) => previous.text === next.text && previous.language === next.language && previous.streaming === next.streaming);

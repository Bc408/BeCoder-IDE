/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { Fragment, memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { code, type HighlightResult, type HighlightOptions } from '@streamdown/code';
import { Icon } from './Icon';

interface ResolvedLanguage {
	id: string;
	label: string;
}

interface HighlightSnapshot {
	text: string;
	language: string;
	result: HighlightResult;
}

const languageAliases: Record<string, string> = {
	'c++': 'cpp', cxx: 'cpp', hpp: 'cpp', cc: 'cpp', h: 'cpp',
	js: 'javascript', cjs: 'javascript', mjs: 'javascript',
	ts: 'typescript', tsx: 'tsx', py: 'python', sh: 'shellscript', bash: 'shellscript', shell: 'shellscript', zsh: 'shellscript',
	yml: 'yaml', md: 'markdown', txt: 'text', plaintext: 'text'
};

const languageLabels: Record<string, string> = {
	cpp: 'C++', csharp: 'C#', css: 'CSS', docker: 'Dockerfile',
	graphql: 'GraphQL', html: 'HTML', javascript: 'JavaScript', json: 'JSON',
	jsx: 'JSX', latex: 'LaTeX', markdown: 'Markdown', objectivec: 'Objective-C',
	powershell: 'PowerShell', python: 'Python', rust: 'Rust', shellscript: 'Shell',
	sql: 'SQL', tsx: 'TSX', typescript: 'TypeScript', xml: 'XML', yaml: 'YAML'
};

const HIGHLIGHT_SETTLE_DELAY_MS = 64;

function resolveLanguage(rawLanguage: string): ResolvedLanguage {
	const raw = rawLanguage.trim();
	const normalized = raw.toLowerCase();
	const alias = languageAliases[normalized] ?? normalized;
	const supported = code.supportsLanguage(alias as never);
	const id = supported ? alias : 'text';
	const label = !raw || id === 'text' && ['text', 'txt', 'plaintext'].includes(normalized)
		? (document.documentElement.lang.startsWith('zh') ? '纯文本' : 'Plain text')
		: languageLabels[id] ?? raw;
	return { id, label };
}

function CodeBlockView({ text, language, streaming }: { text: string; language: string; streaming: boolean }) {
	const [wrapped, setWrapped] = useState(false);
	const [copied, setCopied] = useState(false);
	const [settledText, setSettledText] = useState(text);
	const [highlight, setHighlight] = useState<HighlightSnapshot>();
	const latestText = useRef(text);
	const highlightTimer = useRef<number | undefined>(undefined);
	const zh = document.documentElement.lang.startsWith('zh');
	const resolved = resolveLanguage(language);
	useEffect(() => {
		latestText.current = text;
		if (!streaming) {
			if (highlightTimer.current !== undefined) { clearTimeout(highlightTimer.current); highlightTimer.current = undefined; }
			setSettledText(text);
			return;
		}
		// A fixed window keeps highlighting moving even when deltas never pause.
		if (highlightTimer.current === undefined) {
			highlightTimer.current = window.setTimeout(() => {
				highlightTimer.current = undefined;
				setSettledText(latestText.current);
			}, HIGHLIGHT_SETTLE_DELAY_MS);
		}
	}, [streaming, text]);
	useEffect(() => () => { if (highlightTimer.current !== undefined) { clearTimeout(highlightTimer.current); } }, []);
	useEffect(() => {
		if (!settledText || resolved.id === 'text') { return; }
		let active = true;
		const update = (result: HighlightResult) => { if (active) { setHighlight({ text: settledText, language: resolved.id, result }); } };
		const options = { code: settledText, language: resolved.id, themes: code.getThemes() } as HighlightOptions;
		const result = code.highlight(options, update);
		if (result) { update(result); }
		return () => { active = false; };
	}, [resolved.id, settledText]);
	useEffect(() => {
		if (!copied) { return; }
		const timeout = window.setTimeout(() => setCopied(false), 1600);
		return () => window.clearTimeout(timeout);
	}, [copied]);
	const canReuseHighlight = highlight?.language === resolved.id && text.startsWith(highlight.text);
	const visibleText = canReuseHighlight ? text.slice(highlight.text.length) : text;
	const label = (name: 'copy' | 'wrap') => name === 'copy'
		? (copied ? (zh ? '已复制' : 'Copied') : (zh ? '复制代码' : 'Copy code'))
		: (zh ? '自动换行' : 'Wrap lines');
	return <section className={`code-block${wrapped ? ' is-wrapped' : ''}`} data-streaming={streaming || undefined}>
		<div className="code-toolbar"><span>{resolved.label}</span><div className="code-actions">
			<button type="button" aria-label={label('wrap')} title={label('wrap')} aria-pressed={wrapped} onClick={() => setWrapped(value => !value)}><Icon name="wrap" /></button>
			<button type="button" aria-label={label('copy')} title={label('copy')} onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false)); }}><Icon name={copied ? 'check' : 'copy'} /></button>
		</div></div>
		<div className="code-scroller"><pre><code>{canReuseHighlight && highlight ? <>
			{highlight.result.tokens.map((line, lineIndex) => <Fragment key={lineIndex}><span className="code-line">
				{line.map((token, tokenIndex) => <span key={tokenIndex} style={{ color: token.color, '--token-dark': token.htmlStyle?.['--shiki-dark'] ?? token.color } as CSSProperties}>{token.content}</span>)}
			</span>{lineIndex < highlight.result.tokens.length - 1 ? '\n' : null}</Fragment>)}{visibleText}
		</> : text}</code></pre></div>
	</section>;
}

export const CodeBlock = memo(CodeBlockView, (previous, next) => previous.text === next.text && previous.language === next.language && previous.streaming === next.streaming);

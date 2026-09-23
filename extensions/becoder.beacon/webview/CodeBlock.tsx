/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useState, type CSSProperties } from 'react';
import { code, type HighlightResult, type HighlightOptions } from '@streamdown/code';
import { Icon } from './Icon';

export function CodeBlock({ text, language }: { text: string; language: string }) {
	const [highlight, setHighlight] = useState<{ text: string; result: HighlightResult }>();
	const [copied, setCopied] = useState(false);
	const zh = document.documentElement.lang.startsWith('zh');
	useEffect(() => {
		let active = true;
		const update = (result: HighlightResult) => { if (active) { setHighlight({ text, result }); } };
		const options = { code: text, language, themes: code.getThemes() } as HighlightOptions;
		const result = code.highlight(options, update);
		if (result) { update(result); }
		return () => { active = false; };
	}, [text, language]);
	useEffect(() => {
		if (!copied) { return; }
		const timer = setTimeout(() => setCopied(false), 1600);
		return () => clearTimeout(timer);
	}, [copied]);
	return <div className="code-block"><div className="code-toolbar"><span>{language === 'cpp' ? 'C++' : language || 'text'}</span><button title={zh ? '复制代码' : 'Copy code'} aria-label={zh ? '复制代码' : 'Copy code'} onClick={() => {
		void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
	}}><Icon name={copied ? 'check' : 'copy'} /></button></div><pre><code>{highlight?.text === text ? highlight.result.tokens.map((line, lineIndex) => <span className="code-line" key={lineIndex}>{line.map((token, index) => <span key={index} style={{ color: token.color, '--token-dark': token.htmlStyle?.['--shiki-dark'] ?? token.color } as CSSProperties}>{token.content}</span>)}{lineIndex < highlight.result.tokens.length - 1 ? '\n' : ''}</span>) : text}</code></pre></div>;
}

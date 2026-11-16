/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { createCodeRenderer, resolveLanguage } from '../../becoder.shared/browser/content/code';

function CodeBlockView({ text, language, streaming }: { text: string; language: string; streaming: boolean }) {
	const [wrapped, setWrapped] = useState(false);
	const [copied, setCopied] = useState(false);
	const zh = document.documentElement.lang.startsWith('zh');
	const resolved = resolveLanguage(language);
	const nativeSyntax = resolved.id !== 'text';
	const code = useRef<HTMLElement>(null);
	const renderer = useRef<ReturnType<typeof createCodeRenderer> | undefined>(undefined);
	useLayoutEffect(() => {
		renderer.current = createCodeRenderer(code.current!);
		return () => { renderer.current?.dispose(); renderer.current = undefined; };
	}, []);
	useLayoutEffect(() => { renderer.current?.update(text, resolved.id); }, [text, resolved.id]);
	useEffect(() => {
		if (!copied) { return; }
		const timeout = window.setTimeout(() => setCopied(false), 1600);
		return () => window.clearTimeout(timeout);
	}, [copied]);
	const label = (name: 'copy' | 'wrap') => name === 'copy'
		? (copied ? (zh ? '已复制' : 'Copied') : (zh ? '复制代码' : 'Copy code'))
		: (zh ? '自动换行' : 'Wrap lines');
	return <section className={`code-block${wrapped ? ' is-wrapped' : ''}${nativeSyntax ? ' becoder-syntax' : ''}`} data-streaming={streaming || undefined}>
		<div className="code-toolbar"><span className="code-language"><Icon name="code" /><span>{resolved.label}</span></span><div className="code-actions">
			<button className="code-wrap" type="button" aria-label={label('wrap')} aria-pressed={wrapped} onClick={() => setWrapped(value => !value)}><Icon name="codeWrap" /></button>
			<button type="button" aria-label={label('copy')} onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false)); }}><Icon name={copied ? 'check' : 'codeCopy'} /></button>
		</div></div>
		<div className="code-scroller"><pre><code ref={code} /></pre></div>
	</section>;
}

export const CodeBlock = memo(CodeBlockView, (previous, next) => previous.text === next.text && previous.language === next.language && previous.streaming === next.streaming);

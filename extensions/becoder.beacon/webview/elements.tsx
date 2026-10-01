/*
 * Adapted from Vercel AI Elements conversation.tsx and message.tsx.
 * Copyright 2023 Vercel, Inc. Licensed under Apache-2.0.
 * See UPSTREAM.md and licenses/ai-elements.txt. BeCoder replaces styling and
 * controls for its Webview and omits branches, downloads and Mermaid.
 */
import { Children, createContext, isValidElement, memo, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Root, Element, Text } from 'hast';
import { CodeBlock } from './CodeBlock';
import { normalizeMath } from './math';
import { Icon } from './Icon';

const remarkPlugins = [remarkGfm, remarkMath, remarkBreaks];
const rehypePlugins: NonNullable<ComponentProps<typeof ReactMarkdown>['rehypePlugins']> = [[rehypeKatex, { throwOnError: false }], rehypeStreamingText];
const StreamingContext = createContext(false);
const ReducedMotionContext = createContext(false);

/** Keep generated formula markup and highlighted code outside prose animation. */
function rehypeStreamingText() {
	return (tree: Root) => {
		const visit = (parent: Root | Element) => {
			if (parent.type === 'element' && (['pre', 'code'].includes(parent.tagName) || (parent.properties.className as string[] | undefined)?.some(name => name.startsWith('katex')))) { return; }
			parent.children = parent.children.map(child => {
				if (child.type === 'element') { visit(child); }
				if (child.type !== 'text' || !child.value.trim()) { return child; }
				return { type: 'element', tagName: 'span', properties: { 'data-stream-text': true }, children: [child as Text] } as Element;
			});
		};
		visit(tree);
	};
}

function StreamingSpan({ children, node: _node, ...props }: ComponentProps<'span'> & { node?: unknown }) {
	const streaming = useContext(StreamingContext);
	const reduced = useContext(ReducedMotionContext);
	const text = Children.toArray(children).join('');
	const history = useRef({ text: '', prefix: '', runs: [] as { id: number; text: string; at: number }[], next: 0 });
	const [visible, setVisible] = useState(history.current);
	useLayoutEffect(() => {
		const previous = history.current;
		if (!streaming || reduced || !text.startsWith(previous.text)) {
			history.current = { ...previous, text, prefix: text, runs: [] };
		} else if (text !== previous.text) {
			const now = performance.now();
			const settled = previous.runs.filter(run => now - run.at >= 160);
			history.current = { text, prefix: previous.prefix + settled.map(run => run.text).join(''), runs: [...previous.runs.filter(run => now - run.at < 160), { id: previous.next, text: text.slice(previous.text.length), at: now }], next: previous.next + 1 };
		}
		setVisible(history.current);
	}, [text, streaming, reduced]);
	return <span {...props}>{streaming && !reduced ? <>{visible.prefix}{visible.runs.map(run => <span className="streaming-run" key={run.id}>{run.text}</span>)}</> : children}</span>;
}

function MarkdownSpan({ children, node: _node, ...props }: ComponentProps<'span'> & { node?: unknown }) {
	return 'data-stream-text' in props ? <StreamingSpan {...props}>{children}</StreamingSpan> : <span {...props}>{children}</span>;
}

function useReducedMotion() {
	const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
	useEffect(() => {
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => setReduced(media.matches);
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	}, []);
	return reduced;
}

/** Spread transport bursts across paint frames, with at most 180ms of presentation lag. */
function useStreamingText(text: string, streaming: boolean, reduced: boolean) {
	const [visible, setVisible] = useState(streaming && !reduced ? '' : text);
	const cursor = useRef(visible.length);
	const target = useRef(text);
	const frame = useRef<number | undefined>(undefined);
	const deadline = useRef(0);
	useLayoutEffect(() => {
		const previous = target.current;
		target.current = text;
		deadline.current = performance.now() + 180;
		if (!streaming || reduced || !text.startsWith(previous)) {
			if (frame.current !== undefined) { cancelAnimationFrame(frame.current); frame.current = undefined; }
			cursor.current = text.length;
			setVisible(text);
			return;
		}
		if (frame.current !== undefined || cursor.current >= text.length) { return; }
		let last = performance.now();
		const paint = (now: number) => {
			const source = target.current;
			const remaining = source.length - cursor.current;
			// A frame timestamp can precede the layout effect that scheduled it.
			const elapsed = Math.max(0, now - last);
			cursor.current = Math.max(0, Math.min(source.length, cursor.current + Math.max(60, remaining / Math.max(0.016, (deadline.current - last) / 1000)) * elapsed / 1000));
			let end = Math.floor(cursor.current);
			// Never paint half of a UTF-16 surrogate pair.
			if (end > 0 && end < source.length && /[\uD800-\uDBFF]/.test(source[end - 1])) { end--; }
			setVisible(source.slice(0, end));
			last = Math.max(last, now);
			if (cursor.current < source.length) { frame.current = requestAnimationFrame(paint); }
			else { frame.current = undefined; }
		};
		frame.current = requestAnimationFrame(paint);
	}, [text, streaming, reduced]);
	useEffect(() => () => { if (frame.current !== undefined) { cancelAnimationFrame(frame.current); } }, []);
	return !streaming || reduced ? text : visible;
}

function MarkdownParagraph({ children, node: _node, ...props }: ComponentProps<'p'> & { node?: unknown }) {
	return <p {...props}>{children}</p>;
}

function MarkdownPre({ children, node: _node, ...props }: ComponentProps<'pre'> & { node?: unknown }) {
	const streaming = useContext(StreamingContext);
	const codeElement = Children.toArray(children).find(child => isValidElement(child) && child.type === 'code');
	if (!isValidElement(codeElement)) { return <pre {...props}>{children}</pre>; }
	const codeProps = codeElement.props as { children?: ReactNode; className?: string };
	const language = /(?:^|\s)language-([^\s]+)/.exec(codeProps.className ?? '')?.[1] ?? '';
	const readCode = (node: ReactNode): string => {
		if (typeof node === 'string' || typeof node === 'number') { return String(node); }
		if (Array.isArray(node)) { return node.map(readCode).join(''); }
		return isValidElement(node) ? readCode((node.props as { children?: ReactNode }).children) : '';
	};
	return <CodeBlock text={readCode(codeProps.children)} language={language} streaming={streaming} />;
}

const components: Components = { img: () => null, p: MarkdownParagraph, pre: MarkdownPre, span: MarkdownSpan };

export function Conversation(props: ComponentProps<typeof StickToBottom>) {
	const reduced = useReducedMotion();
	return <StickToBottom className="conversation" initial="instant" resize={reduced ? 'instant' : { damping: 0.8, stiffness: 0.08, mass: 1 }} role="log" {...props} />;
}

export function ConversationContent({ conversationId, ...props }: ComponentProps<typeof StickToBottom.Content> & { conversationId: string }) {
	const { scrollToBottom } = useStickToBottomContext();
	useLayoutEffect(() => {
		void scrollToBottom({ animation: 'instant', preserveScrollPosition: false });
	}, [conversationId, scrollToBottom]);
	return <StickToBottom.Content className="conversation-content" scrollClassName="conversation-scroll" {...props} />;
}

export function ConversationScrollButton({ label, streaming }: { label: string; streaming: boolean }) {
	const { isAtBottom, scrollToBottom, scrollRef, contentRef } = useStickToBottomContext();
	useEffect(() => {
		// The library watches content; also cover viewport changes from composer resizing.
		const element = scrollRef.current;
		if (!element) { return; }
		const observer = new ResizeObserver(entries => {
			if (entries.some(entry => entry.target === element)) {
				void scrollToBottom({ animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : { damping: 0.8, stiffness: 0.08, mass: 1 }, preserveScrollPosition: true });
			}
		});
		observer.observe(element);
		if (contentRef.current) { observer.observe(contentRef.current); }
		return () => observer.disconnect();
	}, [contentRef, scrollRef, scrollToBottom]);
	return !isAtBottom && <button className="scroll-bottom" type="button" title={label} aria-label={label} onClick={() => { void scrollToBottom({ animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : { damping: 0.55, stiffness: 0.045, mass: 1 } }); }}>{streaming ? <span className="scroll-typing" aria-hidden="true"><span /><span /><span /></span> : <Icon name="down" />}</button>;
}

export const MessageResponse = memo(function MessageResponse({ children, streaming }: { children: string; streaming: boolean }) {
	const reduced = useReducedMotion();
	const text = useStreamingText(children, streaming, reduced);
	return <ReducedMotionContext.Provider value={reduced}><StreamingContext.Provider value={streaming}><div className="markdown" data-streaming={streaming || undefined}><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>{normalizeMath(text, streaming)}</ReactMarkdown></div></StreamingContext.Provider></ReducedMotionContext.Provider>;
});

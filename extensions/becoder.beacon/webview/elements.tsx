/*
 * Adapted from Vercel AI Elements conversation.tsx and message.tsx.
 * Copyright 2023 Vercel, Inc. Licensed under Apache-2.0.
 * See UPSTREAM.md and licenses/ai-elements.txt. BeCoder replaces styling and
 * controls for its Webview and omits branches, downloads and Mermaid.
 */
import { Children, createContext, isValidElement, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { parseBeaconMarkdown } from 'becoder-content';
import katex from 'katex';
import type { Root, Element, Text } from 'hast';
import { CodeBlock } from './CodeBlock';
import { Icon } from './Icon';

const StreamingContext = createContext(false);
const ReducedMotionContext = createContext(false);

function MathFormula({ expression, display }: { expression: string; display: boolean }) {
	const streaming = useContext(StreamingContext);
	const previous = useRef<{ expression: string; display: boolean; html: string } | undefined>(undefined);
	const rendered = useMemo(() => {
		try { return katex.renderToString(expression, { displayMode: display, throwOnError: true, strict: 'ignore', trust: false }); }
		catch { return undefined; }
	}, [expression, display]);
	useLayoutEffect(() => {
		if (rendered) { previous.current = { expression, display, html: rendered }; }
	}, [expression, display, rendered]);
	// A growing command, group or environment can temporarily be unparseable.
	// Retain only an append-compatible result from this formula, never another one.
	const retained = streaming && previous.current?.display === display && expression.startsWith(previous.current.expression) ? previous.current.html : undefined;
	const html = rendered ?? retained;
	return html ? <span className="math-formula" data-math-pending={!rendered || undefined} dangerouslySetInnerHTML={{ __html: html }} />
		: <span className={`math-pending${display ? ' is-display' : ''}`}>{expression}</span>;
}

/** Keep generated formula markup and highlighted code outside prose animation. */
function rehypeStreamingText() {
	return (tree: Root) => {
		const visit = (parent: Root | Element) => {
			if (parent.type === 'element' && (['pre', 'code'].includes(parent.tagName) || (parent.properties.className as string[] | undefined)?.some(name => name.startsWith('katex') || name === 'math-formula'))) { return; }
			parent.children = parent.children.map(child => {
				if (child.type === 'element') { visit(child); }
				if (child.type !== 'text' || !child.value.trim()) { return child; }
				return { type: 'element', tagName: 'span', properties: { 'data-stream-text': true }, children: [child as Text] } as Element;
			});
		};
		visit(tree);
	};
}

function StreamingSpan({ children, ...props }: ComponentProps<'span'>) {
	const streaming = useContext(StreamingContext);
	const reduced = useContext(ReducedMotionContext);
	const target = Children.toArray(children).join('');
	const text = useStreamingText(target, streaming, reduced);
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

function MarkdownSpan({ children, ...props }: ComponentProps<'span'>) {
	if (props.className?.split(' ').includes('math-formula')) { return <MathFormula expression={Children.toArray(children).join('')} display={props.className.includes('math-display')} />; }
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

function MarkdownPre({ children, ...props }: ComponentProps<'pre'>) {
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

const components = { img: () => null, pre: MarkdownPre, span: MarkdownSpan, a: ({ title, ...props }: ComponentProps<'a'>) => <a {...props} data-becoder-tooltip={title} /> };

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
	return !isAtBottom && <button className="scroll-bottom" type="button" data-becoder-tooltip={label} aria-label={label} onClick={() => { void scrollToBottom({ animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : { damping: 0.55, stiffness: 0.045, mass: 1 } }); }}>{streaming ? <span className="scroll-typing" aria-hidden="true"><span /><span /><span /></span> : <Icon name="down" />}</button>;
}

export const MessageResponse = memo(function MessageResponse({ children, streaming }: { children: string; streaming: boolean }) {
	const reduced = useReducedMotion();
	// Batch transport bursts for one frame. Animation stays inside parsed text
	// leaves and never drives another whole-message Markdown parse.
	const [settled, setSettled] = useState(children);
	const latest = useRef(children);
	latest.current = children;
	const text = !streaming || !children.startsWith(settled) ? children : settled;
	const timer = useRef<number | undefined>(undefined);
	useEffect(() => {
		if (!streaming) { window.clearTimeout(timer.current); timer.current = undefined; setSettled(children); return; }
		if (children !== settled && timer.current === undefined) {
			timer.current = window.setTimeout(() => { timer.current = undefined; setSettled(latest.current); }, 16);
		}
	}, [children, settled, streaming]);
	useEffect(() => () => window.clearTimeout(timer.current), []);
	const content = useMemo(() => {
		const tree = parseBeaconMarkdown(text, { streaming });
		rehypeStreamingText()(tree);
		return toJsxRuntime(tree, { Fragment, jsx, jsxs, components });
	}, [text, streaming]);
	return <ReducedMotionContext.Provider value={reduced}><StreamingContext.Provider value={streaming}><div className="markdown" data-streaming={streaming || undefined}>{content}</div></StreamingContext.Provider></ReducedMotionContext.Provider>;
});

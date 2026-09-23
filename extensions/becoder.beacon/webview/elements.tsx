/*
 * Adapted from Vercel AI Elements conversation.tsx and message.tsx.
 * Copyright 2023 Vercel, Inc. Licensed under Apache-2.0.
 * See UPSTREAM.md and licenses/ai-elements.txt. BeCoder replaces styling and
 * controls for its Webview and omits branches, downloads and Mermaid.
 */
import { memo, type ComponentProps } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { Streamdown, type Components } from 'streamdown';
import { createMathPlugin } from '@streamdown/math';
import { cjk } from '@streamdown/cjk';
import { CodeBlock } from './CodeBlock';
import { normalizeMath } from './math';
import { Icon } from './Icon';

const plugins = { math: createMathPlugin({ singleDollarTextMath: true }), cjk };
const components: Components = {
	img: () => null,
	code: ({ children, className, ...props }) => 'data-block' in props
		? <CodeBlock text={String(children).replace(/\n$/, '')} language={className?.replace(/^language-/, '') ?? ''} />
		: <code className="inline-code">{children}</code>
};

export function Conversation(props: ComponentProps<typeof StickToBottom>) {
	return <StickToBottom className="conversation" initial="instant" resize="smooth" role="log" {...props} />;
}

export function ConversationContent(props: ComponentProps<typeof StickToBottom.Content>) {
	return <StickToBottom.Content className="conversation-content" {...props} />;
}

export function ConversationScrollButton({ label }: { label: string }) {
	const { isAtBottom, scrollToBottom } = useStickToBottomContext();
	return !isAtBottom && <button className="scroll-bottom" title={label} aria-label={label} onClick={() => { void scrollToBottom(); }}><Icon name="down" /></button>;
}

export const MessageResponse = memo(function MessageResponse({ children, streaming }: { children: string; streaming: boolean }) {
	return <Streamdown className="markdown" plugins={plugins} components={components} controls={false} isAnimating={streaming} mode={streaming ? 'streaming' : 'static'}>{normalizeMath(children)}</Streamdown>;
});

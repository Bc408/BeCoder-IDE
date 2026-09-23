/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Snapshot } from '../src/session';
import { Conversation, ConversationContent, ConversationScrollButton, MessageResponse } from './elements';
import { Icon } from './Icon';
import 'katex/dist/katex.min.css';
import './beacon.css';

declare const acquireVsCodeApi: () => { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const zh = document.documentElement.lang.startsWith('zh');
const t = (en: string, cn: string) => zh ? cn : en;
type State = Snapshot & { configured: boolean };

function App() {
	const [state, setState] = useState<State>({ messages: [], busy: false, error: '', canRetry: false, configured: false });
	const [ready, setReady] = useState(false);
	const [draft, setDraft] = useState('');
	const [pending, setPending] = useState(false);
	const [copied, setCopied] = useState<number>();
	const input = useRef<HTMLTextAreaElement>(null);
	const composing = useRef(false);
	useEffect(() => {
		const listener = (event: MessageEvent) => {
			if (event.data?.type === 'snapshot') { setState(event.data); setReady(true); setPending(false); }
		};
		window.addEventListener('message', listener);
		api.postMessage({ type: 'ready' });
		return () => window.removeEventListener('message', listener);
	}, []);
	useEffect(() => {
		if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(input.current.scrollHeight, 180)}px`; }
	}, [draft]);
	useEffect(() => {
		if (copied === undefined) { return; }
		const timer = setTimeout(() => setCopied(undefined), 1800);
		return () => clearTimeout(timer);
	}, [copied]);
	const busy = state.busy || pending;
	const send = () => {
		if (!ready || busy || !state.configured || !draft.trim()) { return; }
		setPending(true);
		api.postMessage({ type: 'send', text: draft });
		setDraft('');
	};
	return <main onClick={event => {
		const link = (event.target as HTMLElement).closest('a');
		if (link) { event.preventDefault(); api.postMessage({ type: 'link', url: link.href }); }
	}}>
		<header><span className="conversation-title" title={state.messages[0]?.text}>{state.messages[0]?.text ?? t('New conversation', '新对话')}</span><div className="header-actions">
			<button disabled={busy || !ready} onClick={() => { api.postMessage({ type: 'clear' }); setCopied(undefined); }} title={t('New conversation', '新建会话')} aria-label={t('New conversation', '新建会话')}><Icon name="new" /></button>
			<button disabled={busy || !ready} onClick={() => api.postMessage({ type: 'configure' })} title={t('Configure API key', '设置 API Key')} aria-label={t('Configure API key', '设置 API Key')}><Icon name="settings" /></button>
		</div></header>
		<Conversation>
			<ConversationContent>
				{state.messages.length === 0 && <div className="welcome"><div className="welcome-mark">◈</div><h1>{t('Start with a question', '从一个问题开始')}</h1><p>{t('Discuss an idea, understand some code, or explore a solution.', '聊聊思路，理解代码，探索解法。')}</p>{!state.configured && <button className="setup-key" disabled={!ready} onClick={() => api.postMessage({ type: 'configure' })}>{t('Set DeepSeek API key', '设置 DeepSeek API Key')}</button>}</div>}
				{state.messages.map(message => <article key={message.id} className={`message ${message.role}`}>
					{message.role === 'user' ? <div className="user-content">{message.text}</div> : <>
						{message.reasoning && <details className="reasoning"><summary>{message.status === 'streaming' && !message.text ? t('Thinking…', '思考中…') : t('Thinking', '思考过程')}</summary><div className="reasoning-content">{message.reasoning}</div></details>}
						{message.text && <MessageResponse streaming={message.status === 'streaming'}>{message.text}</MessageResponse>}
						{message.status === 'streaming' && !message.text && !message.reasoning && <span className="waiting" role="status">{t('Connecting…', '正在连接…')}</span>}
						{message.status === 'stopped' && <div className="message-status">{t('Stopped', '已停止')}</div>}
						{message.text && message.status !== 'streaming' && <button className="copy" onClick={() => { api.postMessage({ type: 'copy', id: message.id }); setCopied(message.id); }}>{copied === message.id ? t('Copied', '已复制') : t('Copy', '复制')}</button>}
					</>}
				</article>)}
			</ConversationContent>
			<ConversationScrollButton label={t('Back to bottom', '回到底部')} />
		</Conversation>
		<footer>
			{state.error && <div className="error" role="alert">{state.error}</div>}
			{state.canRetry && <button className="retry" disabled={!state.configured || busy} onClick={() => { setPending(true); api.postMessage({ type: 'retry' }); }}>{t('Retry response', '重新生成回答')}</button>}
			<form className="composer" onSubmit={event => { event.preventDefault(); send(); }}>
				<textarea ref={input} value={draft} maxLength={32000} rows={2} aria-label={t('Message Beacon', '向 Beacon 提问')} placeholder={t('Ask Beacon…', '向 Beacon 提问…')} onChange={event => setDraft(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
					if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); send(); }
				}} />
				<div className="composer-toolbar"><span>DeepSeek V4 Flash</span>{busy ? <button className="send" type="button" onClick={() => api.postMessage({ type: 'stop' })} title={t('Stop response', '停止生成')} aria-label={t('Stop response', '停止生成')}><Icon name="stop" /></button> : <button className="send" type="submit" disabled={!ready || !state.configured || !draft.trim()} title={t('Send', '发送')} aria-label={t('Send', '发送')}><Icon name="up" /></button>}</div>
			</form>
			<div className="footnote">{t('Current window only · Shift+Enter for a new line', '会话仅在当前窗口保留 · Shift+Enter 换行')}</div>
		</footer>
	</main>;
}

createRoot(document.getElementById('root')!).render(<App />);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Snapshot } from '../src/session';
import type { HistoryItem } from '../src/history';
import { Conversation, ConversationContent, ConversationScrollButton, MessageResponse } from './elements';
import { Icon } from './Icon';
import { Settings, providerName } from './Settings';
import { providers, type ConnectionState } from '../src/connection';
import 'katex/dist/katex.min.css';
import './beacon.css';

declare const acquireVsCodeApi: () => { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const zh = document.documentElement.lang.startsWith('zh');
const configuration = document.body.dataset.surface === 'configuration';
const t = (en: string, cn: string) => zh ? cn : en;
type State = Snapshot & { connection: ConnectionState; configured: boolean; activeId: string; history: HistoryItem[]; saveFailed: boolean; historyUnreadable: boolean };

function App() {
	const [state, setState] = useState<State>({ messages: [], busy: false, error: '', canRetry: false, configured: false, connection: { provider: 'deepseek', baseURL: providers.deepseek.baseURL, model: providers.deepseek.model, keyConfigured: false, loading: true, models: [], error: '' }, activeId: '', history: [], saveFailed: false, historyUnreadable: false });
	const [ready, setReady] = useState(false);
	const [draft, setDraft] = useState('');
	const [showHistory, setShowHistory] = useState(false);
	const [query, setQuery] = useState('');
	const drafts = useRef(new Map<string, string>());
	const draftRef = useRef('');
	const activeRef = useRef('');
	const [pending, setPending] = useState(false);
	const [copied, setCopied] = useState<number>();
	const input = useRef<HTMLTextAreaElement>(null);
	const composing = useRef(false);
	useEffect(() => {
		const listener = (event: MessageEvent) => {
			if (event.data?.type === 'snapshot') {
				if (typeof event.data.activeId === 'string' && activeRef.current !== event.data.activeId) {
					drafts.current.set(activeRef.current, draftRef.current);
					activeRef.current = event.data.activeId;
					draftRef.current = drafts.current.get(event.data.activeId) ?? '';
					setDraft(draftRef.current);
					setCopied(undefined);
				}
				setState(previous => ({ ...previous, ...event.data })); setReady(true); setPending(false);
			}
		};
		window.addEventListener('message', listener);
		api.postMessage({ type: 'ready' });
		return () => window.removeEventListener('message', listener);
	}, []);
	useEffect(() => {
		if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(input.current.scrollHeight, 180)}px`; }
	}, [draft, showHistory]);
	useEffect(() => {
		if (copied === undefined) { return; }
		const timer = setTimeout(() => setCopied(undefined), 1800);
		return () => clearTimeout(timer);
	}, [copied]);
	const busy = state.busy || pending;
	const send = () => {
		if (!ready || busy || !state.configured || state.historyUnreadable || !draft.trim()) { return; }
		setPending(true);
		api.postMessage({ type: 'send', text: draft });
		draftRef.current = '';
		setDraft('');
	};
	const hasConversation = state.messages.length > 0;
	if (configuration) { return <Settings connection={state.connection} ready={ready} busy={state.busy} post={message => api.postMessage(message)} />; }
	const historyItems = state.history.filter(item => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
	const renderHistory = (items: HistoryItem[]) => items.map(item => <div className={`history-row ${item.id === state.activeId ? 'active' : ''}`} key={item.id}>
		<button className="history-open" disabled={busy} aria-current={item.id === state.activeId ? 'true' : undefined} onClick={() => { setPending(true); api.postMessage({ type: 'openHistory', conversationId: item.id }); setShowHistory(false); }} title={item.title}><span>{item.title}</span><time dateTime={new Date(item.updatedAt).toISOString()}>{new Date(item.updatedAt).toLocaleDateString(zh ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' })}</time></button>
		<div className="history-actions"><button disabled={busy} onClick={() => api.postMessage({ type: 'renameHistory', conversationId: item.id })} title={t('Rename chat', '重命名聊天')} aria-label={t('Rename chat', '重命名聊天')}><Icon name="edit" /></button><button disabled={busy} onClick={() => api.postMessage({ type: 'deleteHistory', conversationId: item.id })} title={t('Delete chat', '删除聊天')} aria-label={t('Delete chat', '删除聊天')}><Icon name="trash" /></button></div>
	</div>);
	return <main onClick={event => {
		const link = (event.target as HTMLElement).closest('a');
		if (link) { event.preventDefault(); api.postMessage({ type: 'link', url: link.href }); }
	}}>
		<header className="workspace-header"><span className="conversation-title">{showHistory ? t('Chat history', '聊天记录') : hasConversation ? state.history.find(item => item.id === state.activeId)?.title ?? state.messages[0]?.text : t('Chat', '聊天')}</span><div className="header-actions">
			<button disabled={!ready} onClick={() => { setShowHistory(!showHistory); setQuery(''); }} title={showHistory ? t('Back to chat', '返回聊天') : t('Chat history', '聊天记录')} aria-label={showHistory ? t('Back to chat', '返回聊天') : t('Chat history', '聊天记录')} aria-pressed={showHistory}><Icon name={showHistory ? 'back' : 'history'} /></button>
			<button onClick={() => api.postMessage({ type: 'settings' })} title={t('Connection settings', '连接设置')} aria-label={t('Connection settings', '连接设置')}><Icon name="settings" /></button>
			<button disabled={busy || !ready || state.historyUnreadable} onClick={() => { setPending(true); api.postMessage({ type: 'clear' }); setShowHistory(false); setCopied(undefined); }} title={t('New chat', '新聊天')} aria-label={t('New chat', '新聊天')}><Icon name="new" /></button>
		</div></header>
		{state.historyUnreadable && <div className="history-notice" role="alert">{t('Chat history could not be read. Your saved data has been preserved. Reload the window to try again.', '无法读取聊天记录，已保留原有数据。请重新加载窗口后再试。')}</div>}
		{state.saveFailed && !state.historyUnreadable && <div className="history-notice" role="alert">{t('Changes have not been saved. Keep this window open and retry.', '更改尚未保存，请保留此窗口并重试。')}<button onClick={() => api.postMessage({ type: 'saveHistory' })}>{t('Retry saving', '重试保存')}</button></div>}
		{showHistory ? <section className="history-panel" aria-label={t('Chat history', '聊天记录')}>
			<input className="history-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Search chats…', '搜索聊天…')} aria-label={t('Search chats', '搜索聊天')} />
			<p className="history-scope">{t('Saved in this workspace', '保存在当前工作区')}</p>
			{historyItems.length ? renderHistory(historyItems) : <p className="history-empty">{query ? t('No matching chats', '没有找到匹配的聊天') : t('No chats yet', '还没有聊天记录')}</p>}
		</section> : <Conversation key={state.activeId}>
			<ConversationContent>
				{!hasConversation && state.history.length > 0 && <section className="recent-chats"><div className="recent-heading"><span>{t('Recent chats', '最近聊天')}</span><button onClick={() => setShowHistory(true)}>{t('View all', '查看全部')}</button></div>{renderHistory(state.history.slice(0, 3))}</section>}
				{!hasConversation && <div className="welcome"><div className="welcome-mark" aria-hidden="true">✦</div><p>{state.configured ? t('Ask a question, explain code, or explore an algorithm.', '提问、解释代码，或一起探索算法。') : t('Configure a provider and model in the Beacon panel on the left to start.', '请在左侧 Beacon 面板配置服务商和模型后开始。')}</p></div>}
				{state.messages.map(message => <article key={message.id} className={`message ${message.role}`}>
					{message.role === 'user' ? <div className="user-content">{message.text}</div> : <>
						{message.model && <div className="message-model">{providerName(message.provider ?? '')} · {message.model}</div>}
						{message.reasoning && <details className="reasoning"><summary>{message.status === 'streaming' && !message.text ? t('Thinking…', '思考中…') : t('Thinking', '思考过程')}</summary><div className="reasoning-content">{message.reasoning}</div></details>}
						{message.text && <MessageResponse streaming={message.status === 'streaming'}>{message.text}</MessageResponse>}
						{message.status === 'streaming' && !message.text && !message.reasoning && <span className="waiting" role="status">{t('Connecting…', '正在连接…')}</span>}
						{message.status === 'stopped' && <div className="message-status">{t('Stopped', '已停止')}</div>}
						{message.text && message.status !== 'streaming' && <button className="copy" onClick={() => { api.postMessage({ type: 'copy', id: message.id }); setCopied(message.id); }}>{copied === message.id ? t('Copied', '已复制') : t('Copy', '复制')}</button>}
					</>}
				</article>)}
			</ConversationContent>
			<ConversationScrollButton label={t('Back to bottom', '回到底部')} />
		</Conversation>}
		{!showHistory && <footer>
			{state.error && <div className="error" role="alert">{state.error}</div>}
			{state.canRetry && <button className="retry" disabled={!state.configured || busy} onClick={() => { setPending(true); api.postMessage({ type: 'retry' }); }}>{t('Retry response', '重新生成回答')}</button>}
			<form className="composer" onSubmit={event => { event.preventDefault(); send(); }}>
				<textarea ref={input} value={draft} maxLength={32000} rows={2} aria-label={t('Message Beacon', '向 Beacon 提问')} placeholder={t('Ask Beacon…', '向 Beacon 提问…')} onChange={event => { draftRef.current = event.target.value; setDraft(event.target.value); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
					if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); send(); }
				}} />
				<div className="composer-toolbar"><button className="model-label" type="button" onClick={() => api.postMessage({ type: 'settings' })} title={t('Choose provider and model', '选择服务商和模型')}>{providerName(state.connection.provider)} · {state.connection.model || t('Select a model', '选择模型')}</button>{busy ? <button className="send" type="button" onClick={() => api.postMessage({ type: 'stop' })} title={t('Stop response', '停止生成')} aria-label={t('Stop response', '停止生成')}><Icon name="stop" /></button> : <button className="send" type="submit" disabled={!ready || !state.configured || state.historyUnreadable || !draft.trim()} title={t('Send', '发送')} aria-label={t('Send', '发送')}><Icon name="up" /></button>}</div>
			</form>
			<div className="footnote"><span>{state.configured ? t('Workspace chat history', '工作区聊天记录') : t('Connection setup required', '需要配置连接')}</span><span>Shift+Enter {t('for new line', '换行')}</span></div>
		</footer>}
	</main>;
}

createRoot(document.getElementById('root')!).render(<App />);

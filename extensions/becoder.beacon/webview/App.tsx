/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Snapshot } from '../src/session';
import type { HistoryItem } from '../src/history';
import { Conversation, ConversationContent, ConversationScrollButton, MessageResponse } from './elements';
import { Icon } from './Icon';
import { Settings } from './Settings';
import { ResponseActivity } from './ResponseActivity';
import { providers, type ConnectionState } from '../src/connection';
import 'katex/dist/katex.min.css';
import './beacon.css';

declare const acquireVsCodeApi: () => { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const zh = document.documentElement.lang.startsWith('zh');
const configuration = document.body.dataset.surface === 'configuration';
const t = (en: string, cn: string) => zh ? cn : en;
type State = Snapshot & { connection: ConnectionState; configured: boolean; activeId: string; history: HistoryItem[]; saveFailed: boolean; historyUnreadable: boolean };
// Calendar-day comparison avoids daylight-saving transitions changing the date label.
const formatTime = (value: number, now: number) => {
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) { return ''; }
	const today = new Date(now);
	const locale = zh ? 'zh-CN' : 'en';
	const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
	const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
	const distance = (day(today) - day(date)) / 86400000;
	if (distance === 0) { return time; }
	if (distance === 1) { return t('Yesterday', '昨天') + ' ' + time; }
	if (distance > 1 && distance <= 7) { return date.toLocaleDateString(locale, { weekday: 'long' }) + ' ' + time; }
	return date.toLocaleDateString(locale, { year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric', month: 'short', day: 'numeric' }) + ' ' + time;
};

function App() {
	const [state, setState] = useState<State>({ messages: [], busy: false, error: '', canRetry: false, configured: false, connection: { provider: 'deepseek', baseURL: providers.deepseek.baseURL, model: providers.deepseek.model, parameters: {}, keyConfigured: false, loading: true, models: [], error: '' }, activeId: '', history: [], saveFailed: false, historyUnreadable: false });
	const [ready, setReady] = useState(false);
	const [draft, setDraft] = useState('');
	const [now, setNow] = useState(Date.now);
	const [confirmDelete, setConfirmDelete] = useState<string>();
	const drafts = useRef(new Map<string, string>());
	const draftRef = useRef('');
	const activeRef = useRef('');
	const [pending, setPending] = useState(false);
	const [copied, setCopied] = useState<number>();
	const [editing, setEditing] = useState<number>();
	const [editingDraft, setEditingDraft] = useState('');
	const input = useRef<HTMLTextAreaElement>(null);
	const editInput = useRef<HTMLTextAreaElement>(null);
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
					setEditing(undefined);
				}
				setState(previous => ({ ...previous, stopping: false, ...event.data })); setReady(true); setPending(false);
			}
		};
		window.addEventListener('message', listener);
		api.postMessage({ type: 'ready' });
		return () => window.removeEventListener('message', listener);
	}, []);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60000);
		return () => clearInterval(timer);
	}, []);
	useEffect(() => {
		if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(input.current.scrollHeight, 180)}px`; }
	}, [draft]);
	useEffect(() => {
		if (editInput.current) { editInput.current.style.height = 'auto'; editInput.current.style.height = `${Math.min(editInput.current.scrollHeight, 180)}px`; }
	}, [editing, editingDraft]);
	useLayoutEffect(() => {
		const textarea = editInput.current;
		if (textarea && editing !== undefined) {
			const end = textarea.value.length;
			textarea.focus();
			textarea.setSelectionRange(end, end);
		}
	}, [editing]);
	useEffect(() => {
		if (copied === undefined) { return; }
		const timer = setTimeout(() => setCopied(undefined), 1800);
		return () => clearTimeout(timer);
	}, [copied]);
	const busy = state.busy || pending;
	const pausedReply = state.messages.at(-1);
	const canContinue = pausedReply?.role === 'assistant' && pausedReply.status === 'stopped' && !draft.trim();
	const send = () => {
		if (!ready || busy || !state.configured || state.historyUnreadable || (!draft.trim() && !canContinue)) { return; }
		setPending(true);
		if (canContinue) { api.postMessage({ type: 'continue', id: pausedReply.id }); return; }
		api.postMessage({ type: 'send', text: draft });
		draftRef.current = '';
		setDraft('');
	};
	const hasConversation = state.messages.length > 0;
	const failedReply = state.messages.at(-1)?.status === 'error';
	const showRetry = failedReply && state.canRetry;
	if (configuration) { return <Settings connection={state.connection} ready={ready} busy={state.busy} post={message => api.postMessage(message)} />; }
	const renderHistory = (items: HistoryItem[]) => items.map(item => <div className={`history-row ${item.id === state.activeId ? 'active' : ''} ${item.id === confirmDelete ? 'confirming' : ''}`} key={item.id} onMouseLeave={() => setConfirmDelete(undefined)}>
		<button className="history-open" disabled={busy} aria-current={item.id === state.activeId ? 'true' : undefined} onClick={() => { setPending(true); api.postMessage({ type: 'openHistory', conversationId: item.id }); }} title={item.title}><span>{item.title}</span><time dateTime={new Date(item.updatedAt).toISOString()}>{formatTime(item.updatedAt, now)}</time></button>
		<div className="history-actions"><button className="history-rename" disabled={busy} onClick={() => api.postMessage({ type: 'renameHistory', conversationId: item.id })} title={t('Rename chat', '重命名聊天')} aria-label={t('Rename chat', '重命名聊天')}><Icon name="edit" /></button><button className={`history-delete ${item.id === confirmDelete ? 'delete-confirm' : ''}`} disabled={busy} onClick={() => { if (item.id === confirmDelete) { setConfirmDelete(undefined); api.postMessage({ type: 'deleteHistory', conversationId: item.id }); } else { setConfirmDelete(item.id); } }} title={item.id === confirmDelete ? t('Confirm delete', '确认删除') : t('Delete chat', '删除聊天')} aria-label={item.id === confirmDelete ? t('Confirm delete', '确认删除') : t('Delete chat', '删除聊天')}>{item.id === confirmDelete ? t('Confirm', '确认') : <Icon name="trash" />}</button></div>
	</div>);
	return <main onClick={event => {
		const link = (event.target as HTMLElement).closest('a');
		if (link) { event.preventDefault(); api.postMessage({ type: 'link', url: link.href }); }
	}}>
		<header className="workspace-header"><div className="conversation-heading">
			{hasConversation && <button className="conversation-back" disabled={busy} onClick={() => { api.postMessage({ type: 'clear' }); }} title={t('Back to chats', '返回聊天列表')} aria-label={t('Back to chats', '返回聊天列表')}><Icon name="back" /></button>}
			<span className={`conversation-title ${hasConversation ? '' : 'chats-title'}`}>{state.history.find(item => item.id === state.activeId)?.title || t('Chat', '聊天')}</span>
		</div><div className="header-actions">
			<button onClick={() => api.postMessage({ type: 'settings' })} title={t('Connection settings', '连接设置')} aria-label={t('Connection settings', '连接设置')}><Icon name="settings" /></button>
			<button disabled={busy || !ready || state.historyUnreadable} onClick={() => { api.postMessage({ type: 'clear' }); setCopied(undefined); }} title={t('New chat', '新聊天')} aria-label={t('New chat', '新聊天')}><Icon name="new" /></button>
		</div></header>
		{state.historyUnreadable && <div className="history-notice" role="alert">{t('Chat history could not be read. Your saved data has been preserved. Reload the window to try again.', '无法读取聊天记录，已保留原有数据。请重新加载窗口后再试。')}</div>}
		{state.saveFailed && !state.historyUnreadable && <div className="history-notice" role="alert">{t('Changes have not been saved. Keep this window open and retry.', '更改尚未保存，请保留此窗口并重试。')}<button onClick={() => api.postMessage({ type: 'saveHistory' })}>{t('Retry saving', '重试保存')}</button></div>}
		{!hasConversation && state.history.length > 0 && <section className="history-list" aria-label={t('Chats', '聊天列表')}>{renderHistory(state.history)}</section>}
		<Conversation hidden={!hasConversation && state.history.length > 0}>
			<ConversationContent conversationId={state.activeId}>
				{!hasConversation && <div className="welcome"><div className="welcome-mark" aria-hidden="true">✦</div><p>{state.configured ? t('Ask a question, explain code, or explore an algorithm.', '提问、解释代码，或一起探索算法。') : t('Configure a provider and model in the Beacon panel on the left to start.', '请在左侧 Beacon 面板配置服务商和模型后开始。')}</p></div>}
				{state.messages.map(message => <article key={message.id} className={`message ${message.role} ${editing === message.id ? 'editing' : ''}`}>
					{message.role === 'user' ? <>
						{editing === message.id ? <form className="message-edit" onSubmit={event => { event.preventDefault(); const text = editingDraft.trim(); if (!text || busy) { return; } setPending(true); setEditing(undefined); api.postMessage({ type: 'edit', id: message.id, text }); }}>
							<textarea ref={editInput} rows={1} maxLength={32000} value={editingDraft} aria-label={t('Edit message', '编辑消息')} onChange={event => setEditingDraft(event.target.value)} onKeyDown={event => {
								if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
							}} />
							<div><button type="button" onClick={() => setEditing(undefined)}>{t('Cancel', '取消')}</button><button className="edit-submit" type="submit" disabled={!editingDraft.trim() || busy}>{t('Send', '发送')}</button></div>
						</form> : <div className="user-content">{message.text}</div>}
						{editing !== message.id && <div className="message-actions user-actions">{message.createdAt !== undefined && <time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt, now)}</time>}<button onClick={() => { api.postMessage({ type: 'copy', id: message.id }); setCopied(message.id); }} title={copied === message.id ? t('Copied', '已复制') : t('Copy message', '复制消息')} aria-label={copied === message.id ? t('Copied', '已复制') : t('Copy message', '复制消息')}><Icon name={copied === message.id ? 'check' : 'copy'} /></button><button disabled={busy} onClick={() => { setEditing(message.id); setEditingDraft(message.text); }} title={t('Edit message', '编辑消息')} aria-label={t('Edit message', '编辑消息')}><Icon name="edit" /></button></div>}
					</> : <>
						<ResponseActivity message={message} />
						{message.text && <MessageResponse streaming={message.status === 'streaming'}>{message.text}</MessageResponse>}
						{message.status === 'stopped' && <div className="message-status">{t('Paused', '已暂停')}</div>}
						{message.status === 'error' && message.id === state.messages.at(-1)?.id && <>
							{state.error && <div className="error" role="alert">{state.error}</div>}
							{showRetry && <button className="retry" disabled={!state.configured || busy} onClick={() => { setPending(true); api.postMessage({ type: 'retry' }); }}>{t('Retry response', '重新生成回答')}</button>}
						</>}
						{message.status !== 'streaming' && <div className="message-actions assistant-actions">
							{message.text && <button onClick={() => { api.postMessage({ type: 'copy', id: message.id }); setCopied(message.id); }} title={copied === message.id ? t('Copied', '已复制') : t('Copy response', '复制回复')} aria-label={copied === message.id ? t('Copied', '已复制') : t('Copy response', '复制回复')}><Icon name={copied === message.id ? 'check' : 'copy'} /></button>}
							<button disabled={busy || !state.configured || state.historyUnreadable} onClick={() => { setPending(true); api.postMessage({ type: 'regenerate', id: message.id }); }} title={t('Regenerate response', '重新回答')} aria-label={t('Regenerate response', '重新回答')}><Icon name="retry" /></button>
							{message.createdAt !== undefined && <time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt, now)}</time>}
						</div>}
					</>}
				</article>)}
			</ConversationContent>
			<ConversationScrollButton label={t('Back to bottom', '回到底部')} streaming={busy} />
		</Conversation>
		<footer>
			{!failedReply && state.error && <div className="error" role="alert">{state.error}</div>}
			{!failedReply && showRetry && <button className="retry" disabled={!state.configured || busy} onClick={() => { setPending(true); api.postMessage({ type: 'retry' }); }}>{t('Retry response', '重新生成回答')}</button>}
			<form className="composer" onSubmit={event => { event.preventDefault(); send(); }}>
				<textarea ref={input} value={draft} maxLength={32000} rows={1} aria-label={t('Message Beacon', '向 Beacon 提问')} placeholder={t('Ask Beacon…', '向 Beacon 提问…')} onChange={event => { draftRef.current = event.target.value; setDraft(event.target.value); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
					if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); send(); }
				}} />
				<div className="composer-toolbar"><span className="composer-spacer" aria-hidden="true" /><button className="model-label" type="button" onClick={() => api.postMessage({ type: 'settings' })} title={t('Choose provider and model', '选择服务商和模型')}>{state.connection.model || t('Select a model', '选择模型')}<Icon name="chevron" /></button>{busy ? <button className="send" type="button" disabled={state.stopping} onClick={() => { setState(previous => ({ ...previous, stopping: true })); api.postMessage({ type: 'stop' }); }} title={state.stopping ? t('Pausing response', '正在暂停') : t('Pause response', '暂停生成')} aria-label={state.stopping ? t('Pausing response', '正在暂停') : t('Pause response', '暂停生成')}><Icon name="stop" /></button> : <button className="send" type="submit" disabled={!ready || !state.configured || state.historyUnreadable || (!draft.trim() && !canContinue)} title={canContinue ? t('Continue response', '继续回答') : t('Send', '发送')} aria-label={canContinue ? t('Continue response', '继续回答') : t('Send', '发送')}><Icon name={canContinue ? 'play' : 'up'} /></button>}</div>
			</form>
		</footer>
	</main>;
}

createRoot(document.getElementById('root')!).render(<App />);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { installHovers } from '../../becoder.shared/browser/hover';
import type { Snapshot } from '../src/session';
import type { HistoryItem } from '../src/history';
import { Conversation, ConversationContent, ConversationScrollButton, MessageResponse } from './elements';
import { Icon } from './Icon';
import { capabilitySummary, Settings } from './Settings';
import { resolveCapabilities } from '../src/models';
import { ResponseActivity } from './ResponseActivity';
import { Workspace } from './Workspace';
import type { IBeaconContext } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import { Permissions } from './Permissions';
import { Notifications, type Notification } from './Notifications';
import { ImagePreview } from './ImagePreview';
import { readClipboardImages } from './clipboard';
import type { FilePermission } from '../src/fileTools';
import type { Attachment } from '../src/attachments';
import { providers, type ConnectionState } from '../src/connection';
import 'katex/dist/katex.min.css';
import './beacon.css';

declare const acquireVsCodeApi: () => { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const zh = document.documentElement.lang.startsWith('zh');
const configuration = document.body.dataset.surface === 'configuration';
const t = (en: string, cn: string) => zh ? cn : en;
type State = Snapshot & { navigationBusy?: boolean; modeTransitionPending?: boolean; responseBusy?: boolean; context?: IBeaconContext; screen: 'home' | 'conversation'; canSend: boolean; temporary: boolean; viewKey: string; draftText?: string; homeHasDraft?: boolean; attachments: Attachment[]; connection: ConnectionState; configured: boolean; activeId: string; history: HistoryItem[]; saveFailed: boolean; historyUnreadable: boolean; permission: FilePermission; webEnabled: boolean; requestNotice?: { id: number; text: string } };
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

function AttachmentCard({ item, remove, busy, preview }: { item: Attachment; remove?: () => void; busy?: boolean; preview: (item: Attachment, url?: string) => void }) {
	const [url, setUrl] = useState<string>();
	useEffect(() => {
		if (item.kind !== 'image') { return; }
		const receive = (event: MessageEvent) => {
			if (event.data?.type === 'attachmentPreview' && event.data.id === item.id && /^data:image\/(png|jpeg|webp|gif);base64,/.test(event.data.url)) { setUrl(event.data.url); }
		};
		window.addEventListener('message', receive);
		api.postMessage({ type: 'previewAttachment', id: item.id });
		return () => window.removeEventListener('message', receive);
	}, [item.id, item.kind]);
	return <div className="attachment-card" data-becoder-tooltip={item.source === 'clipboard' ? item.name : item.path}>
		<button className="attachment-open" type="button" aria-label={(item.kind === 'image' ? t('Preview image', '预览图片') : t('Open in editor', '在编辑器中打开')) + ' ' + item.name} onClick={() => preview(item, url)}>
			{url ? <img src={url} alt={item.name} /> : <Icon name={item.kind === 'image' ? 'image' : 'file'} />}
			<span><strong>{item.name}</strong><small>{item.kind === 'image' ? t('Image', '图片') : item.kind === 'binary' ? t('Binary excerpt', '二进制摘要') : t('Text', '文本')}{item.truncated ? t(' · excerpt', ' · 节选') : ''}</small></span>
		</button>
		{remove && <button className="attachment-remove" type="button" disabled={busy} onClick={remove} aria-label={t('Remove attachment', '移除附件') + ' ' + item.name}><Icon name="close" /></button>}
	</div>;
}

function App() {
	const [state, setState] = useState<State>({ screen: 'home', canSend: false, temporary: true, viewKey: '', attachments: [], messages: [], busy: false, error: '', configured: false, connection: { provider: 'deepseek', baseURL: providers.deepseek.baseURL, model: providers.deepseek.model, parameters: {}, keyConfigured: false, loading: true, error: '' }, activeId: '', history: [], saveFailed: false, historyUnreadable: false, permission: 'none', webEnabled: true });
	const [notices, setNotices] = useState<Notification[]>([]);
	const lastNotice = useRef<number | undefined>(undefined);
	const dismissNotice = useCallback((id: number) => setNotices(previous => previous.filter(notice => notice.id !== id)), []);
	const [ready, setReady] = useState(false);
	const [draft, setDraft] = useState('');
	const [now, setNow] = useState(Date.now);
	const [confirmDelete, setConfirmDelete] = useState<string>();
	const draftRef = useRef('');
	const draftEditRevision = useRef(0);
	const draftPending = useRef(false);
	const activeRef = useRef('');
	const [pending, setPending] = useState<'navigation' | 'response' | false>(false);
	const [pasting, setPasting] = useState(false);
	const pasteJob = useRef<AbortController | undefined>(undefined);
	const [copied, setCopied] = useState<number>();
	const [editing, setEditing] = useState<number>();
	const [editingDraft, setEditingDraft] = useState('');
	const [preview, setPreview] = useState<{ items: Attachment[]; index: number; url?: string }>();
	const input = useRef<HTMLTextAreaElement>(null);
	const composer = useRef<HTMLFormElement>(null);
	const editInput = useRef<HTMLTextAreaElement>(null);
	const composing = useRef(false);
	useEffect(() => { setPreview(undefined); pasteJob.current?.abort(); }, [state.viewKey]);
	useEffect(() => () => pasteJob.current?.abort(), []);
	const openAttachment = (items: Attachment[], item: Attachment, url?: string) => {
		if (item.kind === 'image') {
			const images = items.filter(item => item.kind === 'image');
			setPreview({ items: images, index: images.findIndex(image => image.id === item.id), url });
		} else { api.postMessage({ type: 'openAttachment', id: item.id }); }
	};
	useEffect(() => {
		const listener = (event: MessageEvent) => {
			if (event.data?.type === 'sendAccepted' && activeRef.current === event.data.viewKey) {
				if (event.data.editRevision === undefined || event.data.editRevision === draftEditRevision.current) {
					if (draftRef.current === event.data.text) { draftRef.current = ''; setDraft(''); }
					draftPending.current = false;
				}
			}
			if (event.data?.type === 'snapshot') {
				const notice = event.data.requestNotice as Notification | undefined;
				if (notice && notice.id !== lastNotice.current) {
					lastNotice.current = notice.id;
					setNotices(previous => [notice, ...previous].slice(0, 3));
				}
				if (typeof event.data.viewKey === 'string' && activeRef.current !== event.data.viewKey) {
					const transfer = event.data.acceptedInputView;
					const preserveInput = draftPending.current && transfer?.previous === activeRef.current && transfer.current === event.data.viewKey && typeof transfer.editRevision === 'number' && draftEditRevision.current > transfer.editRevision;
					activeRef.current = event.data.viewKey;
					if (preserveInput) { api.postMessage({ type: 'draft', text: draftRef.current, viewKey: activeRef.current }); }
					else {
						draftRef.current = event.data.draftText ?? '';
						draftPending.current = false;
						setDraft(draftRef.current);
					}
					setCopied(undefined);
					setEditing(undefined);
				}
				else if (typeof event.data.draftText === 'string' && (!draftPending.current || event.data.draftText === draftRef.current)) {
					draftPending.current = false; draftRef.current = event.data.draftText; setDraft(event.data.draftText);
				}
				setState(previous => ({ ...previous, stopping: false, retry: undefined, ...event.data })); setReady(true); setPending(false);
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
	const resizeInput = useCallback(() => {
		const textarea = input.current;
		if (!textarea) { return; }
		const scrollTop = textarea.scrollTop;
		textarea.style.height = 'auto';
		textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
		textarea.scrollTop = scrollTop;
	}, []);
	useLayoutEffect(resizeInput, [draft, resizeInput]);
	useLayoutEffect(() => {
		const element = composer.current;
		if (!element) { return; }
		let width = element.getBoundingClientRect().width;
		let frame = 0;
		const observer = new ResizeObserver(() => {
			const next = element.getBoundingClientRect().width;
			if (next === width) { return; }
			width = next;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(resizeInput);
		});
		observer.observe(element);
		return () => { observer.disconnect(); cancelAnimationFrame(frame); };
	}, [resizeInput]);
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
	const busy = !!(state.busy || pending || pasting || state.context?.busy || state.context?.runtimeBusy);
	// Reuse the existing lock; only navigation-only presentation stays quiet.
	const taskBusy = (state.busy && !state.navigationBusy) || pending === 'response' || pasting || state.responseBusy || state.context?.busy || state.context?.runtimeBusy;
	const navigationOnly = (pending === 'navigation' || state.navigationBusy) && !taskBusy;
	const pasteImages = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		let files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
		if (!files.length) { files = [...event.clipboardData.items].filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file); }
		if (!files.length) { return; }
		event.preventDefault();
		if (busy || pasteJob.current) { api.postMessage({ type: 'attachmentInputError', code: 'busy' }); return; }
		if (!ready || state.historyUnreadable) { return; }
		const activeId = activeRef.current;
		const controller = new AbortController();
		pasteJob.current = controller; setPasting(true);
		void readClipboardImages(files, controller.signal).then(images => {
			if (!controller.signal.aborted && activeRef.current === activeId) { api.postMessage({ type: 'pasteImages', images, activeId: state.activeId }); }
		}).catch(error => {
			if (!controller.signal.aborted) { api.postMessage({ type: 'attachmentInputError', code: error instanceof Error && error.message === 'budget' ? 'budget' : 'image' }); }
		}).finally(() => { if (pasteJob.current === controller) { pasteJob.current = undefined; setPasting(false); } });
	};
	const pausedReply = state.messages.at(-1);
	const canContinue = !state.modeTransitionPending && pausedReply?.role === 'assistant' && pausedReply.status === 'stopped' && !draft.trim() && !state.attachments.length;
	const capabilities = state.connection.capabilities ?? resolveCapabilities(state.connection.provider, state.connection.baseURL, state.connection.model, undefined, state.connection.modelSettings);
	const blocked = capabilities.vision !== 'supported' && [...state.attachments, ...state.messages.flatMap(message => message.attachments ?? [])].some(item => item.kind === 'image') ? t('Select a vision-capable model to send images. No automatic OCR or model switch is performed.', '请选择支持视觉的模型后发送图片，不会自动 OCR 或切换模型。') : '';
	const sendUnavailable = !ready || !state.canSend || !state.configured || state.historyUnreadable || !!blocked || (!draft.trim() && !state.attachments.length && !canContinue);
	const send = () => {
		if (busy || sendUnavailable) { return; }
		setPending('response');
		if (canContinue) { api.postMessage({ type: 'continue', id: pausedReply.id }); return; }
		api.postMessage({ type: 'send', text: draft, editRevision: draftEditRevision.current });
	};
	const hasConversation = state.screen === 'conversation';
	const home = state.screen === 'home';
	const visibleHistory = state.context?.workspaceState === 'ready' ? state.history : [];
	const failedReply = state.messages.at(-1)?.status === 'error';
	const temporaryFailure = !!state.messages.at(-1)?.failure;
	const webTitle = (state.webEnabled ? t('Web search on · Exa', '联网已开启 · Exa') : t('Web search off', '联网已关闭')) + (capabilities.tools !== 'supported' ? '\n' + t('This model does not have confirmed tool support. Web search is unavailable; check its capabilities in settings.', '当前模型未确认支持工具，联网不可用；请在设置中检查模型能力。') : '\n' + t('Search public information when needed, without a search API key.', '按需查询公开信息，无需配置搜索密钥。'));
	const renderHistory = (items: HistoryItem[]) => items.map(item => <div className={`history-row ${item.id === state.activeId ? 'active' : ''} ${item.id === confirmDelete ? 'confirming' : ''}`} key={item.id} onMouseLeave={() => setConfirmDelete(undefined)}>
		<button className="history-open" disabled={busy} aria-current={item.id === state.activeId ? 'true' : undefined} onClick={() => { setPending('navigation'); api.postMessage({ type: 'openHistory', conversationId: item.id }); }} data-becoder-tooltip={[item.title, ...(item.workspace ?? []).map(root => root.path)].join('\n')}><span>{item.title}</span><time dateTime={new Date(item.updatedAt).toISOString()}>{formatTime(item.updatedAt, now)}</time></button>
		<div className="history-actions"><button className="history-rename" disabled={busy} onClick={() => api.postMessage({ type: 'renameHistory', conversationId: item.id })} data-becoder-tooltip={t('Rename chat', '重命名聊天')} aria-label={t('Rename chat', '重命名聊天')}><Icon name="edit" /></button><button className={`history-delete ${item.id === confirmDelete ? 'delete-confirm' : ''}`} disabled={busy} onClick={() => { if (item.id === confirmDelete) { setConfirmDelete(undefined); api.postMessage({ type: 'deleteHistory', conversationId: item.id }); } else { setConfirmDelete(item.id); } }} data-becoder-tooltip={item.id === confirmDelete ? t('Confirm delete', '确认删除') : t('Delete chat', '删除聊天')} aria-label={item.id === confirmDelete ? t('Confirm delete', '确认删除') : t('Delete chat', '删除聊天')}>{item.id === confirmDelete ? t('Confirm', '确认') : <Icon name="trash" />}</button></div>
	</div>);
	return <main data-navigation-lock={navigationOnly && ready && !state.historyUnreadable && !state.saveFailed || undefined} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); api.postMessage({ type: 'unsupportedDrop' }); }} onClick={event => {
		const link = (event.target as HTMLElement).closest('a');
		if (link) { event.preventDefault(); api.postMessage({ type: 'link', url: link.href }); }
	}}>
		<header className={`workspace-header ${home ? 'home-header' : ''}`}><div className="conversation-heading">
			{hasConversation && <button className="conversation-back" disabled={busy} onClick={() => { api.postMessage({ type: 'back' }); }} data-becoder-tooltip={t('Back', '返回')} aria-label={t('Back', '返回')}><Icon name="back" /></button>}
			<span className={`conversation-title ${home ? 'chats-title' : ''}`}>{home ? t('Chats', '聊天') : state.history.find(item => item.id === state.activeId)?.title || t('Chat', '聊天')}</span>
		</div><div className="header-actions">
			{home && <Workspace context={state.context} busy={busy || state.saveFailed} post={message => api.postMessage(message)} />}
			<button onClick={() => api.postMessage({ type: 'settings' })} data-becoder-tooltip={t('Connection settings', '连接设置')} aria-label={t('Connection settings', '连接设置')}><Icon name="settings" /></button>
			<button disabled={busy || !ready || state.historyUnreadable} onClick={() => { api.postMessage({ type: 'newChat' }); setCopied(undefined); }} data-becoder-tooltip={(hasConversation && state.homeHasDraft ? t('Unsent draft', '已有未发送草稿') : t('New chat', '新聊天'))} aria-label={(hasConversation && state.homeHasDraft ? t('Unsent draft', '已有未发送草稿') : t('New chat', '新聊天'))}><Icon name={hasConversation && state.homeHasDraft ? 'file' : 'new'} /></button>
		</div></header>
		<Notifications notices={notices} latest={state.requestNotice} dismiss={dismissNotice} />
		{state.historyUnreadable && <div className="history-notice" role="alert">{t('Chat history could not be read. Your saved data has been preserved. Reload the window to try again.', '无法读取聊天记录，已保留原有数据。请重新加载窗口后再试。')}</div>}
		{state.saveFailed && !state.historyUnreadable && <div className="history-notice" role="alert">{t('Changes have not been saved. Keep this window open and retry.', '更改尚未保存，请保留此窗口并重试。')}<button onClick={() => api.postMessage({ type: 'saveHistory' })}>{t('Retry saving', '重试保存')}</button></div>}
		{home && visibleHistory.length > 0 && <section className="history-list" aria-label={t('Chats', '聊天列表')}>{renderHistory(visibleHistory)}</section>}
		<Conversation hidden={home && visibleHistory.length > 0}>
			<ConversationContent conversationId={state.activeId}>
				{home && <div className="welcome"><div className="welcome-mark" aria-hidden="true">✦</div><p>{state.configured ? t('Ask a question, explain code, or explore an algorithm.', '提问、解释代码，或一起探索算法。') : t('Click the settings button in the upper right to configure a provider and select a model.', '点击右上角设置按钮，配置服务商并选择模型后开始。')}</p></div>}
				{state.messages.map(message => <Fragment key={message.id}>
					{message.transition && <div className="conversation-transition" role="separator"><span>{message.transition === 'temporary' ? t('Context inherited. Starting a temporary conversation.', '已继承上文，开始临时对话') : t('Context inherited. Creating a persistent conversation.', '已继承上文，建立持久化对话')}</span></div>}
					<article className={`message ${message.role} ${editing === message.id ? 'editing' : ''}`}>
					{message.role === 'user' ? <>
						{!!message.attachments?.length && <div className="attachments message-attachments">{message.attachments.map(item => <AttachmentCard key={item.id} item={item} preview={(item, url) => openAttachment(message.attachments!, item, url)} />)}</div>}
						{editing === message.id ? <form className="message-edit" onSubmit={event => { event.preventDefault(); const text = editingDraft.trim(); if ((!text && !message.attachments?.length) || busy) { return; } setPending('response'); setEditing(undefined); api.postMessage({ type: 'edit', id: message.id, text }); }}>
							<textarea ref={editInput} rows={1} maxLength={32000} value={editingDraft} aria-label={t('Edit message', '编辑消息')} onChange={event => setEditingDraft(event.target.value)} onKeyDown={event => {
								if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
							}} />
							<div><button type="button" onClick={() => setEditing(undefined)}>{t('Cancel', '取消')}</button><button className="edit-submit" type="submit" disabled={(!editingDraft.trim() && !message.attachments?.length) || busy}>{t('Send', '发送')}</button></div>
						</form> : <div className="user-content">{message.text}</div>}
						{editing !== message.id && <div className="message-actions user-actions">{message.createdAt !== undefined && <time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt, now)}</time>}<button onClick={() => { api.postMessage({ type: 'copy', id: message.id }); setCopied(message.id); }} data-becoder-tooltip={copied === message.id ? t('Copied', '已复制') : t('Copy message', '复制消息')} aria-label={copied === message.id ? t('Copied', '已复制') : t('Copy message', '复制消息')}><Icon name={copied === message.id ? 'check' : 'copy'} /></button><button disabled={busy || state.modeTransitionPending} onClick={() => { setEditing(message.id); setEditingDraft(message.text); }} data-becoder-tooltip={t('Edit message', '编辑消息')} aria-label={t('Edit message', '编辑消息')}><Icon name="edit" /></button></div>}
					</> : <>
						<ResponseActivity message={message} retry={message.status === 'streaming' ? state.retry : undefined} />
						{message.text && <MessageResponse streaming={message.status === 'streaming'}>{message.text}</MessageResponse>}
						{!!message.sources?.length && <details className="web-sources"><summary><Icon name="globe" />{t('Sources', '来源')} · {message.sources.length}<Icon name="chevron" /></summary><ul>{message.sources.map(source => <li key={source.id}><a href={source.url} data-becoder-tooltip={source.url}>{source.title}<span>{new URL(source.url).hostname}</span></a><small>{source.kind === 'search' ? t('Search excerpt', '搜索摘要') : t('Page excerpt', '网页节选')}{source.truncated ? t(' · truncated', ' · 已截断') : ''}</small></li>)}</ul></details>}
						{message.status === 'stopped' && <div className="message-status">{t('Paused', '已暂停')}</div>}
						{message.status === 'error' && message.id === state.messages.at(-1)?.id && <>
							{state.error && <div className={temporaryFailure ? 'connection-notice' : 'error'} role="alert">{temporaryFailure && <Icon name="info" />}{state.error}</div>}
						</>}
						{message.status !== 'streaming' && <div className="message-actions assistant-actions">
							{message.text && <button onClick={() => { api.postMessage({ type: 'copy', id: message.id }); setCopied(message.id); }} data-becoder-tooltip={copied === message.id ? t('Copied', '已复制') : t('Copy response', '复制回复')} aria-label={copied === message.id ? t('Copied', '已复制') : t('Copy response', '复制回复')}><Icon name={copied === message.id ? 'check' : 'copy'} /></button>}
							<button disabled={busy || state.modeTransitionPending || !state.configured || state.historyUnreadable} onClick={() => { setPending('response'); api.postMessage({ type: 'regenerate', id: message.id }); }} data-becoder-tooltip={t('Regenerate response', '重新回答')} aria-label={t('Regenerate response', '重新回答')}><Icon name="retry" /></button>
							{message.createdAt !== undefined && <time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt, now)}</time>}
						</div>}
					</>}
				</article></Fragment>)}
			</ConversationContent>
			<ConversationScrollButton label={t('Back to bottom', '回到底部')} streaming={!!state.responseBusy} />
		</Conversation>
		<footer>
			{!failedReply && state.error && <div className={temporaryFailure ? 'connection-notice' : 'error'} role="alert">{temporaryFailure && <Icon name="info" />}{state.error}</div>}
			<form ref={composer} className="composer" onSubmit={event => { event.preventDefault(); send(); }}>
				{!!state.attachments.length && <div className="attachments draft-attachments">{state.attachments.map(item => <AttachmentCard key={item.id} item={item} busy={busy} preview={(item, url) => openAttachment(state.attachments, item, url)} remove={() => api.postMessage({ type: 'removeAttachment', id: item.id })} />)}</div>}
				{blocked && <div className="attachment-warning" role="status">{blocked}</div>}
				<textarea ref={input} value={draft} maxLength={32000} rows={1} aria-label={t('Message Beacon', '向 Beacon 提问')} placeholder={t('Ask Beacon…', '向 Beacon 提问…')} onPaste={pasteImages} onChange={event => { draftEditRevision.current++; draftRef.current = event.target.value; draftPending.current = true; setDraft(event.target.value); api.postMessage({ type: 'draft', text: event.target.value, viewKey: activeRef.current }); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
					if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); send(); }
				}} />
				<div className="composer-toolbar">
					<button className="add-files" type="button" disabled={!ready || busy || state.historyUnreadable} data-becoder-tooltip={t('Add files', '添加文件')} aria-label={t('Add files', '添加文件')} onClick={() => api.postMessage({ type: 'addFiles' })}><Icon name="plus" /></button>
					<button className="web-toggle" type="button" disabled={!ready} aria-label={t('Web search', '联网搜索')} aria-pressed={state.webEnabled} data-available={capabilities.tools === 'supported'} data-becoder-tooltip={webTitle} onClick={() => api.postMessage({ type: 'setWebEnabled', enabled: !state.webEnabled })}><Icon name="globe" /></button>
					<Permissions permission={state.permission} ready={ready} usable={!!state.context?.usable} busy={busy} post={message => api.postMessage(message)} />
					<span className="composer-spacer" aria-hidden="true" />
					<ModelPicker connection={state.connection} />
					{state.responseBusy ? <button className="send" type="button" disabled={state.stopping} onClick={() => { pasteJob.current?.abort(); setState(previous => ({ ...previous, stopping: true })); api.postMessage({ type: 'stop' }); }} data-becoder-tooltip={state.stopping ? t('Pausing response', '正在暂停') : t('Pause response', '暂停生成')} aria-label={state.stopping ? t('Pausing response', '正在暂停') : t('Pause response', '暂停生成')}><Icon name="stop" /></button> : <button className="send" type="submit" data-unavailable={sendUnavailable || undefined} disabled={busy || sendUnavailable} data-becoder-tooltip={canContinue ? t('Continue response', '继续回答') : t('Send', '发送')} aria-label={canContinue ? t('Continue response', '继续回答') : t('Send', '发送')}><Icon name={canContinue ? 'play' : 'up'} /></button>}
				</div>
			</form>
		</footer>
		{preview && <ImagePreview key={preview.items[preview.index].id} items={preview.items} initialIndex={preview.index} initialUrl={preview.url} post={api.postMessage} close={() => setPreview(undefined)} />}
	</main>;
}

function ModelPicker({ connection }: { connection: ConnectionState }) {
	const [open, setOpen] = useState(false);
	const node = useRef<HTMLDivElement>(null);
	const modelName = connection.displayName || connection.model || t('Select a model', '选择模型');
	const hasChoices = !!connection.choices?.length;
	useEffect(() => {
		if (!open) { return; }
		const close = (event: PointerEvent) => { if (!node.current?.contains(event.target as Node)) { setOpen(false); } };
		const otherMenu = (event: Event) => { if ((event as CustomEvent<string>).detail !== 'model') { setOpen(false); } };
		document.addEventListener('pointerdown', close);
		document.addEventListener('beacon-menu-open', otherMenu);
		return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('beacon-menu-open', otherMenu); };
	}, [open]);
	return <div className="model-picker" ref={node} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { setOpen(false); } }} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); node.current?.querySelector('button')?.focus(); } }}>
		<button className="model-label" type="button" aria-label={modelName} aria-expanded={hasChoices ? open : undefined} onClick={() => { if (!hasChoices) { api.postMessage({ type: 'settings' }); return; } if (!open) { document.dispatchEvent(new CustomEvent('beacon-menu-open', { detail: 'model' })); } setOpen(!open); }} data-becoder-tooltip={modelName + '\n' + t('Choose provider and model', '选择服务商和模型') + '\n' + (connection.capabilities ? capabilitySummary(connection.capabilities) : '')}><span className="model-compact-icon"><Icon name="chat" /></span><span className="model-picker-name">{modelName}</span>{hasChoices && <Icon name="chevron" />}</button>
		{open && <div className="model-picker-menu">{connection.choices?.map(model => <button type="button" key={model.provider + ':' + model.id} disabled={connection.loading} onClick={() => { setOpen(false); api.postMessage({ type: 'selectModel', provider: model.provider, id: model.id, revision: connection.revision, requestId: Date.now() }); }}><span>{model.name}<small>{providers[model.provider].name}</small></span>{connection.provider === model.provider && connection.model === model.id && <Icon name="check" />}</button>)}<button type="button" onClick={() => { setOpen(false); api.postMessage({ type: 'settings' }); }}><Icon name="settings" />{t('Manage models', '管理模型')}</button></div>}
	</div>;
}

installHovers();
createRoot(document.getElementById('root')!).render(configuration ? <Settings post={message => api.postMessage(message)} /> : <App />);

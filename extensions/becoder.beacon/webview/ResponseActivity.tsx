/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useState } from 'react';
import type { Message, Snapshot } from '../src/session';
import { MessageResponse } from './elements';
import { Icon } from './Icon';

export function formatDuration(milliseconds: number): string {
	let seconds = Math.max(0, Math.floor(milliseconds / 1000));
	if (seconds < 60) { return `${seconds}s`; }
	const parts: string[] = [];
	for (const [size, unit] of [[86400, 'd'], [3600, 'h'], [60, 'm'], [1, 's']] as const) {
		const value = Math.floor(seconds / size);
		if (value) { parts.push(`${value}${unit}`); }
		seconds %= size;
	}
	return parts.join(' ');
}

/** Provider reasoning stays collapsed until the reader explicitly opens it. */
export function ResponseActivity({ message, retry }: { message: Message; retry?: Snapshot['retry'] }) {
	const running = message.status === 'streaming';
	const [now, setNow] = useState(Date.now);
	const zh = document.documentElement.lang.startsWith('zh');
	useEffect(() => {
		if (!running) { return; }
		const timer = setInterval(() => setNow(Date.now()), 500);
		return () => clearInterval(timer);
	}, [running]);
	const activeStartedAt = message.activeStartedAt ?? message.createdAt;
	const duration = running && activeStartedAt !== undefined ? (message.durationMs ?? 0) + Math.max(0, now - activeStartedAt) : message.durationMs;
	const label = running ? (retry ? (zh ? `连接暂时中断，正在重连（${retry.attempt}/${retry.limit}）…` : `Connection interrupted. Reconnecting (${retry.attempt}/${retry.limit})…`) : (zh ? '正在思考' : 'Thinking')) : duration !== undefined
		? `${message.status === 'stopped' ? (zh ? '暂停于' : 'Paused after') : (zh ? '用时' : 'Thought for')} ${formatDuration(duration)}`
		: (zh ? 'Beacon 活动' : 'Beacon activity');
	if (message.status === 'error' && !message.text && !message.reasoning && !message.activities.length) { return null; }
	if (running && message.text && !message.reasoning && !message.activities.length) { return null; }
	if (!running && !message.reasoning && !message.activities.length && duration === undefined) { return null; }
	return <div className="thought">
		{message.reasoning ? <details className="reasoning-details">
			<summary data-becoder-tooltip={zh ? '展开或折叠思考内容' : 'Expand or collapse reasoning'}><span className={running ? 'running-text' : undefined} role={running ? 'status' : undefined}>{label}</span><Icon name="chevron" /></summary>
			<div className="reasoning-content"><MessageResponse streaming={running}>{message.reasoning}</MessageResponse></div>
		</details> : <div className="thought-label"><span className={running ? 'running-text' : undefined} role={running ? 'status' : undefined}>{label}</span></div>}
		{message.activities.map(activity => <div className="thought-activity" data-status={activity.status} key={activity.id}>
			<Icon name={activity.type.startsWith('web-') ? 'globe' : 'file'} />
			<span className={activity.status === 'running' ? 'running-text' : undefined}>
				{activity.status === 'running' ? (activity.type === 'web-search' ? (zh ? '正在搜索' : 'Searching') : activity.type === 'web-fetch' ? (zh ? '正在读取网页' : 'Reading page') : activity.type === 'read' ? (zh ? '正在读取' : 'Reading') : (zh ? '正在查找' : 'Inspecting')) : activity.status === 'complete' ? (activity.type === 'web-search' ? (zh ? '已搜索' : 'Searched') : activity.type === 'web-fetch' ? (zh ? '已读取网页' : 'Read page') : activity.type === 'read' ? (zh ? '已读取' : 'Read') : (zh ? '已查找' : 'Inspected')) : activity.status === 'stopped' ? (zh ? '已停止' : 'Stopped') : (zh ? '访问失败' : 'Could not access')} <code>{activity.path || (activity.type.startsWith('web-') ? (zh ? '网页' : 'web') : (zh ? '文件' : 'files'))}</code>
				{activity.error && <small>{activity.error === 'rate-limit' ? (zh ? '搜索服务暂时限流，请稍后再试。' : 'Search service rate limited. Try again later.') : activity.error === 'timeout' ? (zh ? '联网查询超时。' : 'Web lookup timed out.') : activity.error === 'budget' ? (zh ? '已达本轮联网查询上限。' : 'Web lookup limit reached for this response.') : activity.error === 'invalid-input' ? (zh ? '请使用有效的查询或公开网页地址。' : 'Use a valid query or public webpage URL.') : (zh ? '联网查询未成功，请检查网络或稍后再试。' : 'Web lookup failed. Check your network or try again later.')}</small>}
			</span>
		</div>)}
	</div>;
}

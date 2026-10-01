/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useState } from 'react';
import type { Message } from '../src/session';
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
export function ResponseActivity({ message }: { message: Message }) {
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
	const label = running ? (zh ? '正在思考' : 'Thinking') : duration !== undefined
		? `${message.status === 'stopped' ? (zh ? '暂停于' : 'Paused after') : (zh ? '用时' : 'Thought for')} ${formatDuration(duration)}`
		: (zh ? 'Beacon 活动' : 'Beacon activity');
	if (message.status === 'error' && !message.text && !message.reasoning && !message.activities.length) { return null; }
	if (running && message.text && !message.reasoning && !message.activities.length) { return null; }
	if (!running && !message.reasoning && !message.activities.length && duration === undefined) { return null; }
	return <div className="thought">
		{message.reasoning ? <details className="reasoning-details">
			<summary title={zh ? '展开或折叠思考内容' : 'Expand or collapse reasoning'}><span className={running ? 'running-text' : undefined} role={running ? 'status' : undefined}>{label}</span><Icon name="chevron" /></summary>
			<div className="reasoning-content"><MessageResponse streaming={running}>{message.reasoning}</MessageResponse></div>
		</details> : <div className="thought-label"><span className={running ? 'running-text' : undefined} role={running ? 'status' : undefined}>{label}</span></div>}
		{message.activities.map(activity => <div className="thought-activity" data-status={activity.status} key={activity.id}>
			<Icon name="file" />
			<span className={activity.status === 'running' ? 'running-text' : undefined}>
				{activity.status === 'running' ? (zh ? '正在读取' : 'Reading') : activity.status === 'complete' ? (zh ? '已读取' : 'Read') : activity.status === 'stopped' ? (zh ? '已停止' : 'Stopped') : (zh ? '读取失败' : 'Could not read')} <code>{activity.path || (zh ? '工作区文件' : 'workspace file')}</code>
			</span>
		</div>)}
	</div>;
}

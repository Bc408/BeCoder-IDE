/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';

export type Notification = { id: number; text: string };
const zh = document.documentElement.lang.startsWith('zh');

function NotificationCard({ notice, paused, dismiss }: { notice: Notification; paused: boolean; dismiss: (id: number) => void }) {
	const [closing, setClosing] = useState(false);
	const remaining = useRef(4500);
	useEffect(() => {
		if (paused || closing) { return; }
		const started = performance.now();
		const timer = setTimeout(() => setClosing(true), remaining.current);
		return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (performance.now() - started)); };
	}, [paused, closing]);
	useEffect(() => {
		if (!closing) { return; }
		const timer = setTimeout(() => dismiss(notice.id), 180);
		return () => clearTimeout(timer);
	}, [closing, dismiss, notice.id]);
	return <div className="notification-card" data-closing={closing || undefined}>
		<Icon name="info" /><span className="notification-text">{notice.text}</span>
		<button className="notification-close" type="button" disabled={closing} data-becoder-tooltip={zh ? '关闭通知' : 'Dismiss notification'} aria-label={zh ? '关闭通知' : 'Dismiss notification'} onClick={() => setClosing(true)}><Icon name="close" /></button>
	</div>;
}

export function Notifications({ notices, latest, dismiss }: { notices: Notification[]; latest?: Notification; dismiss: (id: number) => void }) {
	const root = useRef<HTMLDivElement>(null);
	const [hovered, setHovered] = useState(false);
	const [focused, setFocused] = useState(false);
	const [heights, setHeights] = useState<Record<number, number>>({});
	const paused = hovered || focused;
	const expanded = notices.length > 1 && paused;
	useLayoutEffect(() => {
		const cards = root.current?.querySelectorAll<HTMLElement>('.notification-card');
		if (!cards?.length) { return; }
		const measure = () => {
			const next = Object.fromEntries([...cards].map(card => [Number(card.parentElement?.dataset.id), card.offsetHeight]));
			setHeights(previous => Object.keys(next).length === Object.keys(previous).length && Object.entries(next).every(([id, height]) => previous[Number(id)] === height) ? previous : next);
		};
		const observer = new ResizeObserver(measure);
		for (const card of cards) { observer.observe(card); }
		measure();
		return () => observer.disconnect();
	}, [notices]);
	useEffect(() => {
		if (!notices.length) { setHovered(false); setFocused(false); }
	}, [notices.length]);
	let offset = 0;
	const positions = notices.map((notice, index) => {
		const position = expanded ? offset : index * 6;
		offset += (heights[notice.id] ?? 42) + 8;
		return position;
	});
	const height = notices.length ? expanded ? offset - 8 : (heights[notices[0].id] ?? 42) + (notices.length - 1) * 6 : 0;
	return <>
		<div className="notification-announcement" role="status" aria-live="polite" aria-atomic="true">{latest && <span key={latest.id}>{latest.text}</span>}</div>
		{!!notices.length && <div ref={root} className="notification-stack" data-expanded={expanded || undefined} style={{ height, '--notification-front-height': `${heights[notices[0].id] ?? 42}px` } as CSSProperties} role="region" aria-label={zh ? '通知' : 'Notifications'} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { setFocused(false); } }}>
			{notices.map((notice, index) => <div className="notification-slot" key={notice.id} data-id={notice.id} data-front={index === 0 || undefined} aria-hidden={!expanded && index > 0 || undefined} inert={!expanded && index > 0} style={{ '--notification-offset': `${positions[index]}px`, '--notification-scale': expanded ? 1 : 1 - index * 0.045, zIndex: notices.length - index } as CSSProperties}>
				<NotificationCard notice={notice} paused={paused} dismiss={dismiss} />
			</div>)}
		</div>}
	</>;
}

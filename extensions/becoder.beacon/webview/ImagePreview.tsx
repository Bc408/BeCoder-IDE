/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Attachment } from '../src/attachments';
import { Icon } from './Icon';

const zh = document.documentElement.lang.startsWith('zh');
const t = (en: string, cn: string) => zh ? cn : en;
const clamp = (value: number) => Math.min(4, Math.max(0.25, value));

export function ImagePreview({ items, initialIndex, initialUrl, post, close }: { items: Attachment[]; initialIndex: number; initialUrl?: string; post: (message: unknown) => void; close: () => void }) {
	const dialog = useRef<HTMLDialogElement>(null);
	const stage = useRef<HTMLDivElement>(null);
	const cache = useRef(new Map<string, string>());
	const gesture = useRef<{ x: number; y: number; left: number; top: number; moved: boolean; backdrop: boolean } | undefined>(undefined);
	const [index, setIndex] = useState(initialIndex);
	const [url, setUrl] = useState<string>();
	const [failed, setFailed] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [viewport, setViewport] = useState({ width: 1, height: 1 });
	const [natural, setNatural] = useState({ width: 1, height: 1 });
	const item = items[index];
	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		const node = dialog.current;
		node?.showModal();
		return () => { node?.close(); if (previous?.isConnected) { previous.focus(); } };
	}, []);
	useLayoutEffect(() => {
		const node = stage.current;
		if (!node) { return; }
		const measure = () => setViewport({ width: node.clientWidth, height: node.clientHeight });
		const observer = new ResizeObserver(measure);
		observer.observe(node); measure();
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		setZoom(1); setFailed(false); setNatural({ width: 1, height: 1 });
		if (initialUrl && item.id === items[initialIndex].id) { cache.current.set(item.id, initialUrl); }
		setUrl(cache.current.get(item.id));
		stage.current?.scrollTo(0, 0);
		if (cache.current.has(item.id)) { return; }
		const receive = (event: MessageEvent) => {
			if (event.data?.type === 'attachmentPreview' && event.data.id === item.id && /^data:image\/(png|jpeg|webp|gif);base64,/.test(event.data.url)) {
				cache.current.set(item.id, event.data.url); setUrl(event.data.url);
			}
		};
		window.addEventListener('message', receive);
		post({ type: 'previewAttachment', id: item.id });
		return () => window.removeEventListener('message', receive);
	}, [item.id, items, initialIndex, initialUrl, post]);
	useEffect(() => {
		const node = stage.current;
		if (!node) { return; }
		const wheel = (event: WheelEvent) => { event.preventDefault(); setZoom(value => clamp(value + (event.deltaY < 0 ? 0.25 : -0.25))); };
		node.addEventListener('wheel', wheel, { passive: false });
		return () => node.removeEventListener('wheel', wheel);
	}, []);
	const scale = Math.min(1, Math.max(1, viewport.width - 32) / natural.width, Math.max(1, viewport.height - 32) / natural.height) * zoom;
	return <dialog className="image-preview" ref={dialog} aria-label={t('Image preview', '图片预览')} onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => {
		if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(value => clamp(value + 0.25)); }
		if (event.key === '-' || event.key === '_') { event.preventDefault(); setZoom(value => clamp(value - 0.25)); }
		if (event.key === '0') { event.preventDefault(); setZoom(1); }
		if (event.key === 'ArrowLeft') { event.preventDefault(); setIndex(value => Math.max(0, value - 1)); }
		if (event.key === 'ArrowRight') { event.preventDefault(); setIndex(value => Math.min(items.length - 1, value + 1)); }
	}}>
		<header className="image-preview-header"><span>{item.name}{items.length > 1 && <small>{index + 1} / {items.length}</small>}</span><button type="button" data-becoder-tooltip={t('Close preview', '关闭预览')} aria-label={t('Close preview', '关闭预览')} onClick={close}><Icon name="close" /></button></header>
		<div className="image-preview-stage" ref={stage} onClick={() => { if (gesture.current?.backdrop && !gesture.current.moved) { close(); } }} onPointerDown={event => {
			if (event.button !== 0) { return; }
			const node = event.currentTarget;
			gesture.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop, moved: false, backdrop: event.target === node || (event.target as HTMLElement).classList.contains('image-preview-canvas') };
			node.setPointerCapture(event.pointerId);
		}} onPointerMove={event => {
			const start = gesture.current;
			if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) { return; }
			const dx = event.clientX - start.x; const dy = event.clientY - start.y;
			start.moved ||= Math.abs(dx) + Math.abs(dy) > 5;
			event.currentTarget.scrollTo(start.left - dx, start.top - dy);
		}} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { event.currentTarget.releasePointerCapture(event.pointerId); } }}>
			{failed ? <p className="image-preview-feedback" role="alert">{t('This image could not be displayed.', '无法显示这张图片。')}</p> : url ? <div className="image-preview-canvas" style={{ width: natural.width * scale + 32, height: natural.height * scale + 32 }}><img className="image-preview-picture" src={url} alt={item.name} draggable={false} style={{ width: natural.width * scale, height: natural.height * scale }} onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailed(true)} /></div> : <p className="image-preview-feedback" role="status">{t('Loading image…', '正在加载图片…')}</p>}
		</div>
		{items.length > 1 && <><button className="image-preview-previous" type="button" disabled={index === 0} data-becoder-tooltip={t('Previous image', '上一张图片')} aria-label={t('Previous image', '上一张图片')} onClick={() => setIndex(value => value - 1)}><Icon name="back" /></button><button className="image-preview-next" type="button" disabled={index === items.length - 1} data-becoder-tooltip={t('Next image', '下一张图片')} aria-label={t('Next image', '下一张图片')} onClick={() => setIndex(value => value + 1)}><Icon name="forward" /></button></>}
		<div className="image-preview-zoom"><button type="button" disabled={zoom <= 0.25} data-becoder-tooltip={t('Zoom out', '缩小')} aria-label={t('Zoom out', '缩小')} onClick={() => setZoom(value => clamp(value - 0.25))}><Icon name="minus" /></button><button type="button" data-becoder-tooltip={t('Fit image to view', '适合窗口')} aria-label={t('Fit image to view', '适合窗口')} onClick={() => setZoom(1)}>{Math.round(scale * 100)}%</button><button type="button" disabled={zoom >= 4} data-becoder-tooltip={t('Zoom in', '放大')} aria-label={t('Zoom in', '放大')} onClick={() => setZoom(value => clamp(value + 0.25))}><Icon name="plus" /></button></div>
	</dialog>;
}

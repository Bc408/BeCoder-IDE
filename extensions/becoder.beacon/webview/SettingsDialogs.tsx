/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ModelDiscovery } from '../src/modelConfiguration';
import { Icon } from './Icon';
import deepseekLogo from '../resources/deepseek.svg';
const t = (en: string, cn: string) => document.documentElement.lang.startsWith('zh') ? cn : en;
export function ProviderSelector() {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const option = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!open) { return; }
		const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); } };
		document.addEventListener('pointerdown', outside);
		return () => document.removeEventListener('pointerdown', outside);
	}, [open]);
	return <div ref={root} className={'settings-provider-picker' + (open ? ' open' : '')} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { setOpen(false); } }} onKeyDown={event => {
		if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
		else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') { event.preventDefault(); setOpen(true); requestAnimationFrame(() => option.current?.focus()); }
	}}><div className="settings-provider-shell"><button ref={trigger} id="settings-provider" type="button" role="combobox" aria-label={t('Provider', '供应商')} aria-expanded={open} aria-controls="settings-providers" aria-haspopup="listbox" onClick={() => setOpen(!open)}><span>DeepSeek</span><Icon name="chevron" /></button><div className="settings-provider-reveal" inert={!open} aria-hidden={!open}><div id="settings-providers" role="listbox" aria-label={t('Providers', '供应商列表')}><button ref={option} type="button" role="option" aria-selected="true" onClick={() => { setOpen(false); trigger.current?.focus(); }}><img src={deepseekLogo} alt="" /><span>DeepSeek</span><Icon name="check" /></button></div></div></div></div>;
}
// Keep settings menus inside the modal layer, outside its scrolling form body.
export function ModelSelect({ label, value, options, disabled, onChange }: { label: string; value: string; options: { value: string; label: string }[]; disabled?: boolean; onChange(value: string): void }) {
	const id = useId();
	const trigger = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number }>();
	const [active, setActive] = useState(0);
	const open = !!position && !disabled;
	const locate = () => {
		const rect = trigger.current!.getBoundingClientRect();
		const height = Math.min(options.length * 32 + 12, 224);
		const below = innerHeight - rect.bottom - 12, above = rect.top - 12;
		const down = below >= height || below >= above;
		const maxHeight = Math.min(height, Math.max(32, down ? below : above));
		return { left: rect.left, top: down ? rect.bottom + 4 : rect.top - maxHeight - 4, width: rect.width, maxHeight };
	};
	const show = () => { setActive(Math.max(0, options.findIndex(option => option.value === value))); setPosition(locate()); };
	const choose = (index: number) => { onChange(options[index].value); setPosition(undefined); trigger.current?.focus(); };
	useEffect(() => {
		if (!open) { if (disabled) { setPosition(undefined); } return; }
		const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) { setPosition(undefined); } };
		const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) {
			const rect = trigger.current!.getBoundingClientRect(), body = trigger.current!.closest('.model-form-body')!.getBoundingClientRect();
			setPosition(rect.bottom <= body.top || rect.top >= body.bottom ? undefined : locate());
		} };
		const resize = () => setPosition(undefined);
		document.addEventListener('pointerdown', outside);
		document.addEventListener('scroll', scroll, true);
		window.addEventListener('resize', resize);
		return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); };
	}, [open, disabled, options.length]);
	return <><button ref={trigger} type="button" className="model-select-trigger" role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled} onClick={() => open ? setPosition(undefined) : show()} onBlur={() => setPosition(undefined)} onKeyDownCapture={event => {
		if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setPosition(undefined); }
		else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
			event.preventDefault();
			if (!open) { show(); }
			else { setActive(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length); }
		} else if ((event.key === 'Enter' || event.key === ' ') && open) { event.preventDefault(); choose(active); }
	}}><span>{options.find(option => option.value === value)?.label}</span><Icon name="chevron" /></button>
	{open && createPortal(<div ref={menu} id={id} role="listbox" aria-label={label} className="model-select-menu" style={position} onPointerDown={event => event.preventDefault()}>{options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value} className={index === active ? 'active' : undefined} onPointerMove={() => setActive(index)} onClick={() => choose(index)}><span>{option.label}</span>{option.value === value && <Icon name="check" />}</div>)}</div>, trigger.current!.closest('.settings-dialog')!)}
	</>;
}
export function SettingsDialog({ title, heading, close, children }: { title: string; heading?: ReactNode; close(): void; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const closeRef = useRef(close); closeRef.current = close;
	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		const root = ref.current!;
		root.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus();
		const key = (event: KeyboardEvent) => {
			if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
			if (event.key !== 'Tab') { return; }
			const items = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(item => item.getClientRects().length);
			const first = items[0], last = items.at(-1);
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
		};
		root.addEventListener('keydown', key);
		return () => { root.removeEventListener('keydown', key); if (previous?.isConnected) { previous.focus(); } };
	}, []);
	return <div className="settings-overlay"><div ref={ref} className="settings-dialog" role="dialog" aria-modal="true" aria-label={title}><header><h2>{heading ?? title}</h2><button className="settings-icon" aria-label={t('Close dialog', '关闭弹窗')} onClick={close}><Icon name="close" /></button></header>{children}</div></div>;
}
export function ModelDiscoveryDialog({ discovery, configuredIds, pending, error, confirm, cancel, setup, retry }: { discovery?: ModelDiscovery; configuredIds: string[]; pending: boolean; error?: string; confirm(ids: string[]): void; cancel(): void; setup?: boolean; retry?(): void }) {
	const [query, setQuery] = useState('');
	const [selected, setSelected] = useState<string[]>([]);
	useEffect(() => { if (discovery) { setSelected(discovery.models.filter(model => configuredIds.includes(model.id)).map(model => model.id)); } }, [discovery?.id]);
	const visible = discovery?.models.filter(model => (model.id + ' ' + (model.name ?? '')).toLowerCase().includes(query.toLowerCase())) ?? [];
	const all = !!visible.length && visible.every(model => selected.includes(model.id));
	return <SettingsDialog title={setup ? t('Choose models', '选择模型') : t('Fetch models', '获取模型')} close={cancel}><div className="settings-dialog-body">
		{error && <p className="settings-warning" role="alert">{error}</p>}
		{!discovery ? <p role="status">{pending ? t('Fetching models…', '正在获取模型…') : t('Could not fetch models. Your saved key is kept.', '未能获取模型，已保存的密钥仍保留。')}</p> : <>
		<div className="discovery-tools"><label className="discovery-search"><Icon name="search" /><input type="search" aria-label={t('Search models', '搜索模型')} placeholder={t('Search models...', '搜索模型...')} value={query} onChange={event => setQuery(event.target.value)} /></label><button disabled={!visible.length} onClick={() => setSelected(all ? selected.filter(id => !visible.some(model => model.id === id)) : [...new Set([...selected, ...visible.map(model => model.id)])])}>{all ? t('Deselect all', '取消全选') : t('Select all', '选择所有')}</button></div>
		<div className="discovery-list">{visible.map(model => <label key={model.id} className="discovery-row"><input type="checkbox" checked={selected.includes(model.id)} onChange={event => setSelected(event.target.checked ? [...selected, model.id] : selected.filter(id => id !== model.id))} /><span><strong>{model.name ?? model.id}</strong><small>{model.id}</small></span></label>)}{!visible.length && <p className="settings-empty">{discovery.models.length ? t('No matching models.', '没有匹配的模型。') : t('The service returned no models.', '服务端未返回模型。')}</p>}</div>
		</>}
	</div><footer><button onClick={cancel}>{t('Cancel', '取消')}</button>{!discovery && !pending && retry && <button onClick={retry}>{t('Retry', '重试')}</button>}<button className="settings-primary" disabled={!discovery || pending} onClick={() => confirm(selected)}>{setup ? t('Add and test', '添加所选模型并检测') : t('Confirm', '确认')}</button></footer></SettingsDialog>;
}

/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ModelDiscovery } from '../src/modelConfiguration';
import { Icon } from './Icon';
const t = (en: string, cn: string) => document.documentElement.lang.startsWith('zh') ? cn : en;
export function SettingsDialog({ title, close, children }: { title: string; close(): void; children: ReactNode }) {
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
	return <div className="settings-overlay"><div ref={ref} className="settings-dialog" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="settings-icon" aria-label={t('Close dialog', '关闭弹窗')} onClick={close}><Icon name="close" /></button></header>{children}</div></div>;
}
export function ModelDiscoveryDialog({ discovery, configuredIds, pending, error, confirm, cancel }: { discovery?: ModelDiscovery; configuredIds: string[]; pending: boolean; error?: string; confirm(ids: string[]): void; cancel(): void }) {
	const [query, setQuery] = useState('');
	const [selected, setSelected] = useState<string[]>([]);
	useEffect(() => { if (discovery) { setSelected(discovery.models.filter(model => configuredIds.includes(model.id)).map(model => model.id)); } }, [discovery?.id]);
	const visible = discovery?.models.filter(model => (model.id + ' ' + (model.name ?? '')).toLowerCase().includes(query.toLowerCase())) ?? [];
	const all = !!visible.length && visible.every(model => selected.includes(model.id));
	const added = selected.filter(id => !configuredIds.includes(id)).length;
	const removed = configuredIds.filter(id => !selected.includes(id)).length;
	return <SettingsDialog title={t('Fetch models', '获取模型')} close={cancel}><div className="settings-dialog-body">
		{error && <p className="settings-warning" role="alert">{error}</p>}<p className="settings-note">{t('DeepSeek. Select the models to keep. Confirmation refreshes capabilities and removes old corrections.', 'DeepSeek。选择要保留的模型。确认后更新能力并清除旧的手动修正。')}</p>
		{!discovery ? <p role="status">{t('Fetching models…', '正在获取模型…')}</p> : <>
		<div className="discovery-tools"><label>{t('Search models', '搜索模型')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label><button onClick={() => setSelected(all ? selected.filter(id => !visible.some(model => model.id === id)) : [...new Set([...selected, ...visible.map(model => model.id)])])}>{all ? t('Deselect results', '取消选择搜索结果') : t('Select results', '选择全部搜索结果')}</button></div>
		<div className="discovery-list">{visible.map(model => <label key={model.id} className="discovery-row"><input type="checkbox" checked={selected.includes(model.id)} onChange={event => setSelected(event.target.checked ? [...selected, model.id] : selected.filter(id => id !== model.id))} /><span><strong>{model.name ?? model.id}</strong><small>{model.id}</small><small>{(['vision', 'reasoning', 'tools'] as const).map(field => ({ vision: t('Vision: ', '视觉：'), reasoning: t('Reasoning: ', '推理：'), tools: t('Tools: ', '工具：') })[field] + (model.capabilities?.[field] === 'supported' ? t('Supported', '支持') : model.capabilities?.[field] === 'unsupported' ? t('Unsupported', '不支持') : t('Unknown', '未知'))).join(' · ')}</small></span></label>)}{!visible.length && <p className="settings-empty">{discovery.models.length ? t('No matching models.', '没有匹配的模型。') : t('The service returned no models.', '服务端未返回模型。')}</p>}</div>
		<p className="settings-note" role="status">{t('Selected: ', '已选择：') + selected.length + t('; added: ', '；新增：') + added + t('; removed: ', '；移除：') + removed}</p>
		{!selected.length && <p className="settings-warning">{t('Confirming removes all models for this provider.', '确认后移除该供应商的全部模型。')}</p>}</>}
	</div><footer><button onClick={cancel}>{t('Cancel', '取消')}</button><button className="settings-primary" disabled={!discovery || pending} onClick={() => confirm(selected)}>{t('Confirm', '确认')}</button></footer></SettingsDialog>;
}

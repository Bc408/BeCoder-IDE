/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useRef, useState } from 'react';
import type { FilePermission } from '../src/fileTools';
import { Icon } from './Icon';

const zh = document.documentElement.lang.startsWith('zh');
const choices: { value: FilePermission; label: string; detail: string; icon: 'shield' | 'folder' | 'computer' }[] = [
	{ value: 'none', label: 'Blackout', detail: zh ? '当前页面与主动提供材料；不读本地文件' : 'Open pages and supplied materials; no local files', icon: 'shield' },
	{ value: 'workspace', label: 'Spot', detail: zh ? '只读当前 Beacon 工作区' : 'Read the current Beacon workspace', icon: 'folder' },
	{ value: 'computer', label: 'Flood', detail: zh ? '只读本机与共享目录' : 'Read local and shared folders', icon: 'computer' }
];

export function Permissions({ permission, ready, usable, busy, post }: { permission: FilePermission; ready: boolean; usable: boolean; busy: boolean; post: (message: unknown) => void }) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!open) { return; }
		const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); } };
		const otherMenu = (event: Event) => { if ((event as CustomEvent<string>).detail !== 'permission') { setOpen(false); } };
		document.addEventListener('pointerdown', close);
		document.addEventListener('beacon-menu-open', otherMenu);
		return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('beacon-menu-open', otherMenu); };
	}, [open]);
	const selected = choices.find(choice => choice.value === permission) ?? choices[0];
	return <div className="permission-control" ref={root} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); event.stopPropagation(); } }}>
		<button ref={trigger} className="permission-trigger" type="button" disabled={!ready || busy} aria-expanded={open} aria-haspopup="dialog" onClick={() => { if (!open) { document.dispatchEvent(new CustomEvent('beacon-menu-open', { detail: 'permission' })); } setOpen(!open); }} data-becoder-tooltip={zh ? '文件读取权限' : 'File access permissions'}><Icon name={selected.icon} /><span>{selected.label}</span><Icon name="chevron" /></button>
		{open && <div className="permission-menu" role="dialog" aria-label={zh ? '文件读取权限' : 'File access permissions'}>
			<div className="permission-menu-heading">{zh ? '文件访问范围' : 'File access'}</div>
			{choices.map(choice => <button type="button" key={choice.value} disabled={busy || (choice.value !== 'none' && !usable)} aria-pressed={permission === choice.value} onClick={() => { post({ type: 'setPermission', permission: choice.value }); setOpen(false); trigger.current?.focus(); }}><Icon name={choice.icon} /><span><strong>{choice.label}</strong><small>{choice.detail.split(zh ? '；' : '; ').map((part, index, parts) => <span key={part}>{part}{index < parts.length - 1 ? zh ? '；' : '; ' : ''}</span>)}</small></span>{permission === choice.value && <Icon name="check" />}</button>)}
			<p className="permission-note"><span>{zh ? '敏感文件与其他会话始终隔离，' : 'Private files and other chats stay isolated. '}</span><span>{zh ? '读取内容会发送给所选模型。' : 'Read content is sent to the selected model.'}</span></p>
		</div>}
	</div>;
}

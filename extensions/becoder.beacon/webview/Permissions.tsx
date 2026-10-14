/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useRef, useState } from 'react';
import type { FilePermission } from '../src/fileTools';
import { Icon } from './Icon';

const zh = document.documentElement.lang.startsWith('zh');
const choices: { value: FilePermission; label: string; detail: string; icon: 'shield' | 'folder' | 'computer' }[] = [
	{ value: 'none', label: 'Blackout', detail: zh ? '无可用工作区时使用；不可自由读取本地文件，主动提供的材料仍可用。' : 'Without a usable workspace. No free local file access; supplied materials remain available.', icon: 'shield' },
	{ value: 'workspace', label: 'Spot', detail: zh ? '读取当前 Beacon 工作区，排除敏感文件及其他会话资产。' : 'Read the selected Beacon workspace, excluding private files and other chat assets.', icon: 'folder' },
	{ value: 'computer', label: 'Flood', detail: zh ? '读取本机及共享文件，仍隔离其他会话资产。读取内容会发送给所选模型服务。' : 'Read local and shared files with chat asset isolation. Read content is sent to the selected model service.', icon: 'computer' }
];

export function Permissions({ permission, ready, usable, post }: { permission: FilePermission; ready: boolean; usable: boolean; post: (message: unknown) => void }) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!open) { return; }
		const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); } };
		document.addEventListener('pointerdown', close);
		return () => document.removeEventListener('pointerdown', close);
	}, [open]);
	const selected = choices.find(choice => choice.value === permission) ?? choices[0];
	return <div className="permission-control" ref={root} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); event.stopPropagation(); } }}>
		<button ref={trigger} className="permission-trigger" type="button" disabled={!ready} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} data-becoder-tooltip={zh ? '文件读取权限' : 'File access permissions'}><Icon name={selected.icon} /><span>{selected.label}</span><Icon name="chevron" /></button>
		{open && <div className="permission-menu" role="dialog" aria-label={zh ? '文件读取权限' : 'File access permissions'}>
			{choices.filter(choice => usable ? choice.value !== 'none' : choice.value === 'none').map(choice => <button type="button" key={choice.value} aria-pressed={permission === choice.value} onClick={() => { post({ type: 'setPermission', permission: choice.value }); setOpen(false); trigger.current?.focus(); }}><Icon name={choice.icon} /><span><strong>{choice.label}</strong><small>{choice.detail}</small></span>{permission === choice.value && <Icon name="check" />}</button>)}
		</div>}
	</div>;
}

/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useRef, useState } from 'react';
import type { FilePermission } from '../src/fileTools';
import { Icon } from './Icon';

const zh = document.documentElement.lang.startsWith('zh');
const choices: { value: FilePermission; label: string; detail: string; icon: 'shield' | 'folder' | 'computer' }[] = [
	{ value: 'none', label: zh ? '不读取文件' : 'No file access', detail: zh ? '仅使用消息和已有会话上下文。' : 'Use messages and existing conversation context only.', icon: 'shield' },
	{ value: 'workspace', label: zh ? '工作区只读' : 'Workspace read-only', detail: zh ? '可读取当前打开的文件夹，排除敏感文件。' : 'Read the open workspace folders, excluding private files.', icon: 'folder' },
	{ value: 'computer', label: zh ? '全机只读' : 'Computer read-only', detail: zh ? '可读取本机和网络共享文件，排除敏感文件。读取内容会发送给所选模型服务。' : 'Read local and network-share files, excluding private files. Read content is sent to the selected model service.', icon: 'computer' }
];

export function Permissions({ permission, ready, post }: { permission: FilePermission; ready: boolean; post: (message: unknown) => void }) {
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
		<button ref={trigger} className="permission-trigger" type="button" disabled={!ready} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} title={zh ? '文件读取权限' : 'File access permissions'}><Icon name={selected.icon} /><span>{selected.label}</span><Icon name="chevron" /></button>
		{open && <div className="permission-menu" role="dialog" aria-label={zh ? '文件读取权限' : 'File access permissions'}>
			{choices.map(choice => <button type="button" key={choice.value} aria-pressed={permission === choice.value} onClick={() => { post({ type: 'setPermission', permission: choice.value }); setOpen(false); trigger.current?.focus(); }}><Icon name={choice.icon} /><span><strong>{choice.label}</strong><small>{choice.detail}</small></span>{permission === choice.value && <Icon name="check" />}</button>)}
		</div>}
	</div>;
}

/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { IBeaconContext } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import { Icon } from './Icon';
import './workspace.css';

const zh = document.documentElement.lang.startsWith('zh');
const label = (en: string, cn: string) => zh ? cn : en;
const normalize = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const folderName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || path;

// The middle shrinks first, keeping the volume/share and final folder recognizable.
function Path({ path }: { path: string }) {
	const volume = path.match(/^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+[\\/]?|\/)/i)?.[0] ?? '';
	const rest = path.slice(volume.length);
	const separator = Math.max(rest.lastIndexOf('/'), rest.lastIndexOf('\\'));
	return <span className="workspace-path" data-becoder-tooltip={path}>
		<span className="workspace-path-volume">{volume}</span>
		{separator >= 0 && <span className="workspace-path-middle">{rest.slice(0, separator)}</span>}
		<span className="workspace-path-end">{separator >= 0 ? rest.slice(separator) : rest}</span>
	</span>;
}

export function Workspace({ context, busy, post }: { context?: IBeaconContext; busy: boolean; post(message: unknown): void }) {
	const [open, setOpen] = useState(false);
	const [hovered, setHovered] = useState(false);
	const [available, setAvailable] = useState(280);
	const container = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const keyboard = useRef(false);
	const positions = useRef(new Map<string, DOMRect>());
	const animations = useRef<Animation[]>([]);
	const current = context?.root;
	const previousRoot = useRef(current);
	const ready = !!context;
	const recent = [...new Map((context?.recent ?? []).filter(path => normalize(path) !== normalize(current ?? '')).map(path => [normalize(path), path])).values()];
	const expanded = hovered || open;
	const disabled = busy || !!context?.busy;
	const close = () => { setOpen(false); setHovered(false); };

	useEffect(() => {
		const measure = () => { if (container.current) { setAvailable(Math.max(80, Math.min(420, container.current.getBoundingClientRect().right - 10))); } };
		measure();
		const observer = new ResizeObserver(measure);
		if (container.current) { observer.observe(container.current); }
		window.addEventListener('resize', measure);
		return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
	}, [ready]);
	useEffect(() => {
		const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) { close(); } };
		const otherMenu = (event: Event) => { if ((event as CustomEvent<string>).detail !== 'workspace') { close(); } };
		document.addEventListener('pointerdown', outside);
		document.addEventListener('beacon-menu-open', otherMenu);
		return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('beacon-menu-open', otherMenu); };
	}, []);
	useEffect(() => () => { animations.current.forEach(animation => animation.cancel()); }, []);
	useEffect(() => {
		if (!open) { return; }
		const escape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') { close(); trigger.current?.focus(); }
		};
		document.addEventListener('keydown', escape);
		return () => document.removeEventListener('keydown', escape);
	}, [open]);
	useLayoutEffect(() => {
		animations.current.forEach(animation => animation.cancel());
		animations.current = [];
		const next = new Map<string, DOMRect>();
		container.current?.querySelectorAll<HTMLElement>('[data-workspace-path]').forEach(element => {
			const path = element.dataset.workspacePath!;
			const rect = element.getBoundingClientRect();
			next.set(path, rect);
			const previous = positions.current.get(path);
			if (open && previous && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				const dy = previous.top - rect.top;
				if (Math.abs(dy) > 1) {
					if (!current && previousRoot.current && path === normalize(previousRoot.current)) {
						// A fixed flight copy crosses the list's scrolling clip; the real row
						// becomes visible only once the confirmed current item arrives.
						const flight = document.createElement('div');
						flight.className = 'workspace-flight';
						flight.setAttribute('aria-hidden', 'true');
						flight.textContent = previousRoot.current;
						Object.assign(flight.style, { left: `${rect.left + 7}px`, top: `${previous.top}px`, width: `${rect.width - 42}px`, height: `${rect.height}px` });
						document.body.append(flight);
						element.style.visibility = 'hidden';
						const animation = flight.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-dy}px)` }], { duration: 190, easing: 'ease-out' });
						const finish = () => { flight.remove(); element.style.visibility = ''; };
						animation.onfinish = finish;
						animation.oncancel = finish;
						animations.current.push(animation);
					} else {
						animations.current.push(element.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 190, easing: 'ease-out' }));
					}
				}
			}
		});
		positions.current = next;
		previousRoot.current = current;
	}, [current, context?.recent, open]);
	if (!context) { return null; }
	const folder = current ? folderName(current) : undefined;
	const status = context.workspaceState === 'unavailable' ? 'error' : current && context.workspaceState === 'blackout' ? 'hidden' : undefined;
	const statusText = status === 'error' ? label('has a problem', '出现问题') : status === 'hidden' ? label('unused', '未使用') : '';
	const title = folder ? status ? `${folder}${zh ? '' : ' '}${statusText}` : current! : label('Choose workspace', '选择工作区');
	const toggle = () => {
		if (!open) { document.dispatchEvent(new CustomEvent('beacon-menu-open', { detail: 'workspace' })); }
		setOpen(!open);
	};
	return <div className={`workspace-picker ${expanded ? 'expanded' : ''} ${open ? 'open' : ''} ${status ?? ''}`} ref={container} style={{ '--workspace-width': `${available}px` } as CSSProperties}
		onPointerEnter={() => setHovered(true)} onPointerLeave={() => { if (!keyboard.current || !container.current?.contains(document.activeElement)) { close(); } }}
		onPointerDown={() => { keyboard.current = false; }}
		onFocus={event => { if (event.target.matches(':focus-visible')) { keyboard.current = true; setHovered(true); } }}
		onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { keyboard.current = false; close(); } }}
		onKeyDown={event => { keyboard.current = true; if (event.key === 'Escape') { close(); trigger.current?.focus(); event.stopPropagation(); } else if (event.key === 'ArrowDown' && !open) { event.preventDefault(); toggle(); } }}>
		<span className="workspace-sizing" aria-hidden="true">{folder ?? label('Choose workspace', '选择工作区')}</span>
		<div className="workspace-picker-shell">
			<div className="workspace-current" data-workspace-path={current ? normalize(current) : undefined}>
				<button ref={trigger} className={`workspace-picker-trigger ${status ?? ''}`} type="button" disabled={disabled} aria-expanded={open} aria-haspopup="dialog" aria-label={title} data-becoder-tooltip={expanded && current ? current : title} onClick={toggle}>
					{status === 'hidden' ? <svg className="workspace-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m5 5 14 14M8 12a4 4 0 0 0 6 3M10 9a4 4 0 0 1 6 3" /></svg> : status === 'error' ? <span className="workspace-error-dot" aria-hidden="true">!</span> : <Icon name="folder" />}
					<span className="workspace-labels">
						<span className="workspace-picker-name">{folder ?? label('Choose workspace', '选择工作区')}</span>
						<span className="workspace-expanded-label">{current ? <Path path={current} /> : <span>{label('Choose workspace', '选择工作区')}</span>}{(status || !current) && <small>{current ? statusText : label('Choose to enable Spot / Flood', '选择后可使用 Spot / Flood')}</small>}</span>
					</span>
					<Icon name="chevron" />
				</button>
				{open && current && <button className="workspace-remove workspace-current-remove" type="button" disabled={disabled} aria-label={label(`Stop using ${current}`, `取消使用当前工作区 ${current}`)} data-becoder-tooltip={label('Stop using this workspace', '取消使用此工作区')} onClick={() => post({ type: 'clearWorkspace' })}><Icon name="close" /></button>}
			</div>
			<div className="workspace-menu-reveal" inert={!open} aria-hidden={!open}>
				<div className="workspace-picker-menu" role="dialog" aria-label={label('Beacon workspaces', 'Beacon 工作区')}>
					<div className="workspace-picker-list">
						{recent.map(path => <div className="workspace-picker-row" key={normalize(path)} data-workspace-path={normalize(path)}>
							<button type="button" disabled={disabled} onClick={() => { close(); post({ type: 'selectWorkspace', root: path }); }}><Path path={path} /></button>
							<button className="workspace-remove" type="button" disabled={disabled} aria-label={label(`Remove ${path} from recent workspaces`, `从最近工作区移除 ${path}`)} data-becoder-tooltip={label('Remove from list', '从列表移除')} onClick={() => post({ type: 'removeRecentWorkspace', root: path })}><Icon name="close" /></button>
						</div>)}
					</div>
					<button className="workspace-add" type="button" disabled={disabled} onClick={() => { close(); post({ type: 'chooseWorkspace' }); }}><Icon name="plus" />{label('Add workspace', '添加新工作区')}</button>
				</div>
			</div>
		</div>
	</div>;
}

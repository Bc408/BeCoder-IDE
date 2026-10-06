/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See ../LICENSE.
 *--------------------------------------------------------------------------------------------*/

import './hover.css';

export interface HoverOptions {
	/** Only product chrome is migrated; document annotations retain their own UI. */
	nativeTitles?: string;
}

const installed = new WeakMap<Document, { dispose(): void }>();

/** Compact plain-text hovers for product Webviews, independent of their UI framework. */
export function installHovers(options: HoverOptions = {}): { dispose(): void } {
	const existing = installed.get(document);
	if (existing) { return existing; }
	const hover = document.createElement('div');
	hover.id = 'becoder-hover';
	hover.className = 'becoder-hover';
	hover.setAttribute('role', 'tooltip');
	hover.setAttribute('popover', 'manual');
	hover.hidden = true;
	document.body.appendChild(hover);
	const listeners: (() => void)[] = [];
	const migrated = new Map<HTMLElement, { title: string; tooltip: string | null; ownsLabel: boolean }>();
	let target: HTMLElement | undefined;
	let described: HTMLElement | undefined;
	let mode: 'pointer' | 'focus' = 'pointer';
	let point = { x: 0, y: 0 };
	let timer: ReturnType<typeof setTimeout> | undefined;
	let leaveTimer: ReturnType<typeof setTimeout> | undefined;
	let dismissed: HTMLElement | undefined;
	let pointerDown = false;
	let disposed = false;

	const content = (element: HTMLElement) => element.getAttribute('data-becoder-tooltip') ?? element.getAttribute('aria-label') ?? '';
	const findTarget = (node: EventTarget | null): HTMLElement | undefined => {
		let element = node instanceof Element ? node.closest<HTMLElement>('[data-becoder-tooltip], button[aria-label]') : null;
		while (element) {
			if (element.hasAttribute('data-becoder-tooltip')) { return content(element).trim() ? element : undefined; }
			if (!element.textContent?.trim() && content(element).trim()) { return element; }
			element = element.parentElement?.closest<HTMLElement>('[data-becoder-tooltip], button[aria-label]') ?? null;
		}
		return;
	};
	const clearDescription = () => {
		if (!described) { return; }
		const ids = (described.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== hover.id);
		if (ids.length) { described.setAttribute('aria-describedby', ids.join(' ')); }
		else { described.removeAttribute('aria-describedby'); }
		described = undefined;
	};
	const hide = (dismiss = false) => {
		if (dismiss) { dismissed = target; }
		if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
		if (leaveTimer !== undefined) { clearTimeout(leaveTimer); leaveTimer = undefined; }
		if (typeof hover.hidePopover === 'function' && hover.matches(':popover-open')) { hover.hidePopover(); }
		hover.hidden = true;
		hover.textContent = '';
		clearDescription();
		target = undefined;
	};
	const cancelLeave = () => { if (leaveTimer !== undefined) { clearTimeout(leaveTimer); leaveTimer = undefined; } };
	const leave = () => { if (leaveTimer === undefined) { leaveTimer = setTimeout(() => hide(), 100); } };
	const position = () => {
		if (!target) { return; }
		const rect = target.getBoundingClientRect();
		const box = hover.getBoundingClientRect();
		const margin = 8;
		let left = mode === 'pointer' ? point.x + 10 : rect.left;
		let top = mode === 'pointer' ? Math.max(point.y + 12, rect.bottom + 2) : rect.bottom + 2;
		if (left + box.width > window.innerWidth - margin && mode === 'pointer') { left = point.x - box.width - 10; }
		if (top + box.height > window.innerHeight - margin) { top = rect.top - box.height - 2; }
		hover.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - box.width - margin))}px`;
		hover.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - box.height - margin))}px`;
	};
	const show = () => {
		timer = undefined;
		if (!target?.isConnected || target.getClientRects().length === 0 || !content(target).trim()) { hide(); return; }
		hover.textContent = content(target);
		hover.hidden = false;
		if (typeof hover.showPopover === 'function') { hover.showPopover(); }
		position();
		described = mode === 'focus' && document.activeElement instanceof HTMLElement && target.contains(document.activeElement) ? document.activeElement : target;
		const ids = new Set((described.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
		ids.add(hover.id); described.setAttribute('aria-describedby', [...ids].join(' '));
	};
	const prepare = (element: HTMLElement | undefined, nextMode: typeof mode, event?: PointerEvent) => {
		if (element === target && nextMode === mode) { return; }
		hide();
		if (!element || element === dismissed) { return; }
		dismissed = undefined;
		target = element; mode = nextMode;
		if (event) { point = { x: event.clientX, y: event.clientY }; }
		const configured = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--becoder-hover-delay'));
		const delay = Number.isFinite(configured) && configured >= 0 ? Math.min(configured, 2147483647) : 500;
		timer = setTimeout(show, delay);
	};
	const listen = <K extends keyof DocumentEventMap>(type: K, listener: (event: DocumentEventMap[K]) => void) => {
		document.addEventListener(type, listener, true);
		listeners.push(() => document.removeEventListener(type, listener, true));
	};
	listen('pointerover', event => {
		if (event.pointerType === 'touch') { return; }
		if (hover.contains(event.target as Node)) { cancelLeave(); return; }
		const element = findTarget(event.target);
		if (!element && target && mode === 'pointer' && !hover.hidden) { leave(); return; }
		cancelLeave();
		if (element !== dismissed) { dismissed = undefined; }
		prepare(element, 'pointer', event);
	});
	listen('pointermove', event => {
		if (timer !== undefined && mode === 'pointer') { point = { x: event.clientX, y: event.clientY }; }
	});
	listen('pointerout', event => {
		const related = event.relatedTarget;
		if (related instanceof Node && (target?.contains(related) || hover.contains(related))) { cancelLeave(); return; }
		if (mode === 'pointer') { if (hover.hidden) { hide(); } else { leave(); } dismissed = undefined; }
	});
	listen('focusin', event => { if (!pointerDown) { dismissed = undefined; prepare(findTarget(event.target), 'focus'); } });
	listen('focusout', event => {
		if (mode === 'focus' && !(event.relatedTarget instanceof Node && target?.contains(event.relatedTarget))) { hide(); }
	});
	listen('pointerdown', () => { pointerDown = true; hide(true); });
	listen('pointerup', () => { pointerDown = false; });
	listen('pointercancel', () => { pointerDown = false; hide(); });
	listen('keydown', () => hide(true));
	listen('scroll', event => { if (event.target !== hover) { hide(true); } });
	listen('visibilitychange', () => { if (document.hidden) { hide(); } });
	const onWindowChange = () => { pointerDown = false; hide(true); };
	window.addEventListener('blur', onWindowChange);
	window.addEventListener('resize', onWindowChange);
	listeners.push(() => { window.removeEventListener('blur', onWindowChange); window.removeEventListener('resize', onWindowChange); });

	const migrate = (element: HTMLElement) => {
		if (!options.nativeTitles || !element.matches(options.nativeTitles)) { return; }
		const title = element.getAttribute('title');
		if (!title?.trim()) { return; }
		let original = migrated.get(element);
		if (!original) {
			original = { title, tooltip: element.getAttribute('data-becoder-tooltip'), ownsLabel: element.matches('button, input, [role="button"]') && !element.textContent?.trim() && !element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby') };
			migrated.set(element, original);
		}
		original.title = title;
		element.setAttribute('data-becoder-tooltip', title);
		element.setAttribute('title', '');
		if (original.ownsLabel) { element.setAttribute('aria-label', title); }
	};
	if (options.nativeTitles) { document.querySelectorAll<HTMLElement>(options.nativeTitles).forEach(migrate); }
	const observer = new MutationObserver(records => {
		if (options.nativeTitles) {
			for (const record of records) {
				if (record.type === 'attributes' && record.attributeName === 'title' && record.target instanceof HTMLElement) { migrate(record.target); }
				for (const node of record.addedNodes) {
					if (!(node instanceof HTMLElement)) { continue; }
					migrate(node); node.querySelectorAll<HTMLElement>(options.nativeTitles).forEach(migrate);
				}
			}
			for (const element of migrated.keys()) { if (!element.isConnected) { migrated.delete(element); } }
		}
		if (!target) { return; }
		if (!target.isConnected || !content(target).trim()) { hide(); return; }
		if (!hover.hidden && hover.textContent !== content(target)) { hover.textContent = content(target); position(); }
	});
	observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'data-becoder-tooltip', 'aria-label'] });

	const dispose = () => {
		if (disposed) { return; }
		disposed = true;
		installed.delete(document);
		observer.disconnect(); hide(); listeners.forEach(remove => remove()); hover.remove();
		for (const [element, original] of migrated) {
			element.setAttribute('title', original.title);
			if (original.tooltip === null) { element.removeAttribute('data-becoder-tooltip'); }
			else { element.setAttribute('data-becoder-tooltip', original.tooltip); }
			if (original.ownsLabel) { element.removeAttribute('aria-label'); }
		}
		migrated.clear(); window.removeEventListener('pagehide', dispose);
	};
	window.addEventListener('pagehide', dispose);
	const controller = { dispose };
	installed.set(document, controller);
	return controller;
}

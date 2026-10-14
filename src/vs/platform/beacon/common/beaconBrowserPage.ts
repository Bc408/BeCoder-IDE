/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../base/common/lifecycle.js';

export const beaconBrowserTextScript = `(() => {
	const text = document.body?.innerText ?? '';
	const inputs = Array.from(document.querySelectorAll('textarea')).filter(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility === 'visible').map(node => node.value);
	return text + (inputs.length ? '\\n\\nVisible text areas:\\n' + inputs.join('\\n\\n') : '');
})()`;

export interface IBeaconLoadedBrowserPage {
	ownerWindowId: number;
	url(): string;
	loading(): boolean;
	closed(): boolean;
	watchChange(listener: () => void): IDisposable;
	read(script: string): Promise<unknown>;
}

/** Loaded DOM access only. The adapter supplies no navigation or network method. */
export async function readBeaconBrowserPage(page: IBeaconLoadedBrowserPage, windowId: number, expectedURL: string, timeoutMs = 15000): Promise<string> {
	if (page.ownerWindowId !== windowId) { throw new Error('beacon-page-owner'); }
	if (page.closed() || page.loading() || page.url() !== expectedURL) { throw new Error('beacon-page-changed'); }
	let changed = false;
	const listener = page.watchChange(() => { changed = true; });
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const text = await Promise.race([
			page.read(beaconBrowserTextScript),
			new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('beacon-page-timeout')), timeoutMs); })
		]);
		if (changed || page.closed() || page.loading() || page.url() !== expectedURL) { throw new Error('beacon-page-changed'); }
		if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 8 * 1024 * 1024) { throw new Error('beacon-page-too-large'); }
		return text;
	} finally { if (timer) { clearTimeout(timer); } listener.dispose(); }
}

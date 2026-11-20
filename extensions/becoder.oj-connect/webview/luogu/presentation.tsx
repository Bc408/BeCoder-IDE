/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2018 引领天下. MIT License.
 *  Tag, Spinner and CphIcon adapted from vscode-luogu v4.20.0.
 *  See ThirdPartyNotices.txt for the original license.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

// Same thresholds and precision as vscode-luogu 4.20.0 stringUtils.ts.
// Preserve decimal/unspecified KB/MB units instead of relabelling them KiB/MiB.
export function resourceText(value: string | undefined, time = false): string | undefined {
	const match = value && /^(\d+(?:\.\d+)?)\s*([a-z]+)$/i.exec(value);
	if (!match) { return value; }
	const scales: Record<string, number> = time ? { ms: 1, s: 1000, sec: 1000, min: 60000, h: 3600000, d: 86400000 } : { B: 1, KiB: 1024, MiB: 1048576, GiB: 1073741824 };
	const scale = scales[match[2]], number = Number(match[1]) * scale;
	if (scale === undefined || !Number.isFinite(number)) { return match[1] + match[2]; }
	if (time) {
		if (number < 1000) { return `${number}ms`; }
		if (number < 60000) { return `${(number / 1000).toFixed(2)}s`; }
		if (number < 3600000) { return `${(number / 60000).toFixed(2)}min`; }
		if (number < 86400000) { return `${(number / 3600000).toFixed(2)}h`; }
		return `${(number / 86400000).toFixed(2)}d`;
	}
	if (number < 1024) { return `${number}B`; }
	if (number < 1048576) { return `${(number / 1024).toFixed(2)}KiB`; }
	if (number < 1073741824) { return `${(number / 1048576).toFixed(2)}MiB`; }
	return `${(number / 1073741824).toFixed(2)}GiB`;
}

export function Tag({ label, color }: { label: string; color?: string }) {
	return <span className={'tag'} style={{ backgroundColor: color ?? '#7f7f7f' }}>{label}</span>;
}

export function Spinner({ label, size = 32 }: { label: string; size?: number }) {
	return <span className={'spinner'} role={'status'} aria-label={label} style={{ height: size, width: size }} />;
}

export function CphIcon() {
	return <svg aria-hidden={'true'} viewBox={'0 0 24 24'} fill={'currentColor'}>
		<path d={'M4.5 7.5C5.328 7.5 6 8.172 6 9v10.5c0 .828-.672 1.5-1.5 1.5h-3C.673 21 0 20.328 0 19.5V9c0-.828.673-1.5 1.5-1.5h3zm9-4.5c.828 0 1.5.672 1.5 1.5v15c0 .828-.672 1.5-1.5 1.5h-3c-.827 0-1.5-.672-1.5-1.5v-15c0-.828.673-1.5 1.5-1.5h3zm9 7.5c.828 0 1.5.672 1.5 1.5v7.5c0 .828-.672 1.5-1.5 1.5h-3c-.828 0-1.5-.672-1.5-1.5V12c0-.828.672-1.5 1.5-1.5h3z'} />
	</svg>;
}

// Font Awesome Free 7.1.0 faPaperPlane, as used by vscode-luogu.
// Copyright (c) 2025 Fonticons, Inc. CC BY 4.0; see ThirdPartyNotices.txt.
export function SubmitIcon() {
	return <svg aria-hidden={'true'} viewBox={'0 0 576 512'} fill={'currentColor'}><path d={'M536.4-26.3c9.8-3.5 20.6-1 28 6.3s9.8 18.2 6.3 28l-178 496.9c-5 13.9-18.1 23.1-32.8 23.1-14.2 0-27-8.6-32.3-21.7l-64.2-158c-4.5-11-2.5-23.6 5.2-32.6l94.5-112.4c5.1-6.1 4.7-15-.9-20.6s-14.6-6-20.6-.9L229.2 276.1c-9.1 7.6-21.6 9.6-32.6 5.2L38.1 216.8c-13.1-5.3-21.7-18.1-21.7-32.3 0-14.7 9.2-27.8 23.1-32.8l496.9-178z'} /></svg>;
}

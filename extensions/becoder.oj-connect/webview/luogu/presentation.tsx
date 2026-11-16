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

// Simple paper-plane silhouette; no additional icon runtime is needed.
export function SubmitIcon() {
	return <svg aria-hidden={'true'} viewBox={'0 0 24 24'} fill={'currentColor'}><path d={'M2 10 22 2 14 22 10 14 2 10Zm9 2 3 6 5-13-8 7Z'} /></svg>;
}

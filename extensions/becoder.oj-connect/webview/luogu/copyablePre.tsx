/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2018 引领天下. MIT License.
 *  Adapted from yltx/vscode-luogu v4.18.2 (dbced7c2cd0aca345cfa6f91de64b59c02806341).
 *  BeCoder changes: shared OJ data/commands, localization, removed peripheral features.
 *  See ThirdPartyNotices.txt for the original license.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useRef } from 'react';
import { installCodeCopyButtons } from './codeCopy';

/** Samples and compiler output share the statement's native copy control. */
export default function CopyablePre({ children }: { children: React.ReactNode }) {
	const pre = useRef<HTMLPreElement>(null);
	useEffect(() => installCodeCopyButtons(pre.current!, window.__OJ_STATE__.labels), []);
	return <pre ref={pre}>{children}</pre>;
}

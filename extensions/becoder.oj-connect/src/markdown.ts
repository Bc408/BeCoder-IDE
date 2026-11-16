/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2018 引领天下. MIT License.
 *  Adapted from yltx/vscode-luogu v4.20.0 (987ca974b5419230a07b59a195ec44026e16f6f4).
 *  BeCoder changes: shared OJ integration and localization. See ThirdPartyNotices.txt.
 *--------------------------------------------------------------------------------------------*/

import { parseMarkdown, parseHtml } from 'becoder-content';
import type { Root } from 'hast';

/** The shared pipeline cleans author HTML once, before generating trusted math. */
export function renderMarkdownTree(markdown: string): Root {
	return parseMarkdown(markdown, { dialect: 'luogu' });
}

export function renderHtmlTree(html: string, baseURL: string): Root {
	return parseHtml(html, baseURL);
}

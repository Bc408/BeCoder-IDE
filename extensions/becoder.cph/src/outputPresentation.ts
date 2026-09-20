/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

/** Bound UI messages without silently presenting a partial output as complete. */
export function displayOutput(text: string, truncatedLabel: string, limit = 100000): string {
	return text.length > limit ? `${truncatedLabel}\n${text.slice(0, limit)}` : text;
}
